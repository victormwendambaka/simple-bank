/* =====================================================================
   Simple Bank - app.js
   Sections: 1 State · 2 Helpers · 3 Tabs · 4 Banking actions
             5 Validation · 6 Currency mask · 7 Rendering · 8 Events
   ===================================================================== */


/* ===== 1. STATE ===== */
// All money is stored in cents (KES 10,000 = 1000000) to avoid floating-point errors.
const KEY  = 'simplebank.v1';   // localStorage key
const LOAN = 1000000;           // loan size: 10,000 KES in cents
const DAY  = 864e5;             // milliseconds in one day

// Read saved data; returns null if nothing is saved or storage is blocked
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch (e) {
    return null;
  }
};

// An empty database:
//   seq      = counter used to build account and loan IDs
//   dorm     = dormancy threshold in days
//   accounts = [{ id, name, bal, last, loan }]  (last = time of latest activity)
//   tx       = transaction log, newest first
const fresh = () => ({ seq: 1000, dorm: 90, accounts: [], tx: [] });

let db  = load() || fresh();
let sel = '';   // ID of the account selected in the forms and cards

// Write the current state back to the browser
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (e) {
    // storage unavailable: the app keeps working in memory
  }
};


/* ===== 2. HELPERS ===== */
const $ = id => document.getElementById(id);   // shortcut for getElementById

// cents -> "KES 1,000.00"
const kes = c => 'KES ' + (c / 100).toLocaleString('en-KE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const cents = v => Math.round(parseFloat(v) * 100);        // "12.50" -> 1250
const num   = id => cents($(id).value.replace(/,/g, ''));  // "1,000.50" in a field -> 100050 (NaN if empty)

// Escape text before putting it into HTML (stops names injecting markup)
const esc = s => String(s).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const find = id => db.accounts.find(a => a.id === id);     // look up an account by ID

// Show a message at the top (red if bad is true)
function say(text, bad) {
  const m = $('msg');
  m.textContent = text;
  m.className = bad ? 'bad' : 'ok';
}

// fail() shows a red error and returns false; done() saves, redraws, shows a green message, returns true
const fail = text => { say(text, true); return false; };
const done = text => { save(); fill(); say(text); return true; };

// Add a transaction to the log and refresh the account's "last activity" time (used for dormancy)
function post(a, type, amt, note) {
  a.last = Date.now();
  db.tx.unshift({ at: Date.now(), acc: a.id, type, amt, note });
}

// Show (or clear, with '') the error text under a field
function setErr(id, message) {
  $(id + '-e').textContent = message;
  $(id).setAttribute('aria-invalid', !!message);
}

// Empty a field and clear its error
const clr = id => { $(id).value = ''; setErr(id, ''); };


/* ===== 3. TABS ===== */
const tabs = [...document.querySelectorAll('[role=tab]')];

// Show one panel, hide the rest, and update the tab buttons
function show(name) {
  tabs.forEach(t => {
    const on = t.dataset.tab === name;
    t.setAttribute('aria-selected', on);
    t.tabIndex = on ? 0 : -1;
    $('p-' + t.dataset.tab).hidden = !on;
  });
}

tabs.forEach(t => {
  t.onclick = () => show(t.dataset.tab);

  // Left/Right arrow keys move between tabs
  t.onkeydown = e => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    const next = tabs[(tabs.indexOf(t) + step + tabs.length) % tabs.length];
    next.focus();
    show(next.dataset.tab);
  };
});


/* ===== 4. BANKING ACTIONS =====
   Amounts arrive already validated and in cents (see section 5). */

// Create an account, with an optional opening deposit
function create(name, c) {
  const a = { id: 'ACC-' + (++db.seq), name, bal: c, last: Date.now(), loan: null };
  db.accounts.push(a);
  sel = a.id;
  post(a, c ? 'Deposit' : 'Opened', c, c ? 'Opening deposit' : 'Account created');
  return done(`Created ${a.id} for ${name}.`);
}

// Deposit funds into an account
function deposit(id, c) {
  const a = find(id);
  a.bal += c;
  post(a, 'Deposit', c, '');
  return done(`Deposited ${kes(c)} into ${id}.`);
}

// Withdraw funds from an account
function withdraw(id, c) {
  const a = find(id);
  a.bal -= c;
  post(a, 'Withdrawal', c, '');
  return done(`Withdrew ${kes(c)} from ${id}.`);
}

// Transfer funds between two accounts (one log entry on each side)
function transfer(fromId, toId, c) {
  const a = find(fromId), b = find(toId);
  a.bal -= c;
  b.bal += c;
  post(a, 'Transfer out', c, 'To ' + toId);
  post(b, 'Transfer in', c, 'From ' + fromId);
  return done(`Moved ${kes(c)} from ${fromId} to ${toId}.`);
}

// Bonus: create a loan account linked to the account and disburse 10,000 KES (one loan at a time)
function takeLoan(id) {
  const a = find(id);
  if (!a) return fail('Create or select an account first.');
  if (a.loan) return fail(`${id} already has a loan. Repay it first.`);

  a.loan = { id: 'LN-' + (++db.seq), principal: LOAN, outstanding: LOAN, at: Date.now() };
  a.bal += LOAN;
  post(a, 'Loan disbursed', LOAN, 'Loan ' + a.loan.id);
  return done(`Created loan ${a.loan.id} and disbursed ${kes(LOAN)} to ${id}.`);
}

// Repay part or all of a loan from the account balance
function repay(id, c) {
  const a = find(id);
  const loanId = a.loan.id;

  a.loan.outstanding -= c;
  a.bal -= c;
  post(a, 'Loan repayment', c, 'Loan ' + loanId);

  // Fully repaid: clear the loan so the account can be deleted or take a new one
  if (a.loan.outstanding === 0) {
    a.loan = null;
    return done(`Loan ${loanId} fully repaid.`);
  }
  return done(`Repaid ${kes(c)}. ${kes(a.loan.outstanding)} still owed.`);
}

// Delete a dormant account. Three checks must pass:
//   (a) no activity for db.dorm days  (b) zero balance  (c) no outstanding loan
function remove(id) {
  const a = find(id);
  if (!a) return fail('Create or select an account first.');

  const days = (Date.now() - a.last) / DAY;
  if (days < db.dorm) return fail(`${id} is not dormant: last activity ${Math.floor(days)} days ago, needs ${db.dorm}.`);
  if (a.bal !== 0)    return fail(`Withdraw or transfer the ${kes(a.bal)} balance before deleting ${id}.`);
  if (a.loan)         return fail(`Repay the ${kes(a.loan.outstanding)} loan before deleting ${id}.`);
  if (!confirm(`Delete ${id} (${a.name})? This cannot be undone.`)) return false;

  db.accounts = db.accounts.filter(x => x !== a);
  db.tx.unshift({ at: Date.now(), acc: id, type: 'Deleted', amt: 0, note: 'Dormant account removed' });
  return done(`Deleted ${id}.`);
}

// Replace all data with three sample accounts (ACC-1003 is already dormant)
function seed() {
  if (db.accounts.length && !confirm('Replace current data with sample accounts?')) return;

  const now = Date.now();
  db = {
    seq: 1003,
    dorm: 90,
    tx: [],
    accounts: [
      { id: 'ACC-1001', name: 'Amina Otieno',  bal: 2500000, last: now,             loan: null },
      { id: 'ACC-1002', name: 'Brian Kamau',   bal: 1200000, last: now,             loan: null },
      { id: 'ACC-1003', name: 'Grace Wanjiku', bal: 0,       last: now - 120 * DAY, loan: null }
    ]
  };
  db.accounts.forEach(a => db.tx.push({ at: a.last, acc: a.id, type: 'Opened', amt: a.bal, note: 'Sample account' }));

  sel = 'ACC-1001';
  done('Sample accounts loaded. ACC-1003 is dormant and can be deleted.');
}


/* ===== 5. INLINE VALIDATION =====
   Checks an amount field and shows the error under it.
   kind: 'dep' deposit, 'wd' withdraw, 'tr' transfer, 'rp' repay.
   live = true while typing, so an empty field is not flagged yet.
   Returns the amount in cents, or null if invalid. */
function chkAmt(id, accId, kind, live) {
  const raw = $(id).value;
  const c   = num(id);
  const a   = find($(accId).value);
  let m = '';

  if (live && raw === '') {
    m = '';
  } else if (!a) {
    m = 'Create an account first.';
  } else if (raw === '') {
    m = 'Enter an amount.';
  } else if (!(c > 0)) {
    m = 'Enter an amount above 0.';
  } else if ((kind === 'wd' || kind === 'tr') && c > a.bal) {
    m = `Insufficient balance. Available: ${kes(a.bal)}.`;
  } else if (kind === 'rp') {
    if (!a.loan) {
      m = 'This account has no active loan.';
    } else if (c > a.loan.outstanding) {
      m = `Repay at most ${kes(a.loan.outstanding)}.`;
    } else if (c > a.bal) {
      m = `Insufficient balance. Available: ${kes(a.bal)}.`;
    }
  }

  setErr(id, m);
  return m ? null : c;
}

// Transfer only: "From" and "To" must be different accounts
function same() {
  const clash = $('tF').value && $('tF').value === $('tT').value;
  setErr('tT', clash ? 'Choose a different account.' : '');
  return !clash;
}


/* ===== 6. CURRENCY MASK: typing 1234.5 shows 1,234.5 ===== */
function mask(el) {
  const [intPart, ...rest] = el.value.replace(/[^\d.]/g, '').split('.');
  const hasDot   = rest.length > 0;
  const whole    = intPart ? Number(intPart).toLocaleString('en-US') : (hasDot ? '0' : '');
  const decimals = hasDot ? '.' + rest.join('').slice(0, 2) : '';   // max 2 decimals
  el.value = whole + decimals;
}

// One listener covers every field with class "money"
document.addEventListener('input', e => {
  if (e.target.classList.contains('money')) mask(e.target);
});


/* ===== 7. RENDERING ===== */

// Overview tab: totals, account cards, and the loan hint in the repay form
function cards() {
  const A     = db.accounts;
  const total = A.reduce((sum, a) => sum + a.bal, 0);
  const owed  = A.reduce((sum, a) => sum + (a.loan ? a.loan.outstanding : 0), 0);

  $('stats').innerHTML =
    `<div><dt>Total balance</dt><dd>${kes(total)}</dd></div>` +
    `<div><dt>Accounts</dt><dd>${A.length}</dd></div>` +
    `<div><dt>Loans outstanding</dt><dd>${kes(owed)}</dd></div>`;

  // One button per account; data-sel carries the ID, aria-pressed marks the selected one
  $('cards').innerHTML = A.map(a => `
    <button class="card" data-sel="${a.id}" aria-pressed="${a.id === sel}">
      <b>${kes(a.bal)}</b>${esc(a.name)}<br>
      <span class="tag">${a.id}${a.loan ? ` · owes ${kes(a.loan.outstanding)}` : ''}</span>
    </button>`).join('')
    || '<p class="tag">No accounts yet. Create one in the Manage tab.</p>';

  const a = find(sel);
  $('rH').textContent = a && a.loan
    ? `Outstanding on ${a.loan.id}: ${kes(a.loan.outstanding)}`
    : 'This account has no active loan.';
}

// Activity tab: apply the search and filters, then draw up to 100 rows
function logView() {
  const q  = $('fQ').value.toLowerCase();
  const fa = $('fA').value;      // account filter
  const ft = $('fT').value;      // type filter
  const d1 = $('fD1').value;     // from date
  const d2 = $('fD2').value;     // to date (inclusive)
  const t1 = d1 ? new Date(d1).getTime() : 0;
  const t2 = d2 ? new Date(d2).getTime() + DAY : Infinity;

  const rows = db.tx.filter(t =>
    (!fa || t.acc === fa) &&
    (!ft || t.type === ft) &&
    t.at >= t1 && t.at < t2 &&
    (!q || (t.acc + ' ' + t.type + ' ' + t.note).toLowerCase().includes(q))
  );

  $('cnt').textContent = `Showing ${Math.min(rows.length, 100)} of ${rows.length} matching (${db.tx.length} total)`;

  $('log').innerHTML = rows.slice(0, 100).map(t => `
    <tr>
      <td>${new Date(t.at).toLocaleString()}</td>
      <td>${t.acc}</td>
      <td>${t.type}</td>
      <td>${t.amt ? kes(t.amt) : ''}</td>
      <td>${esc(t.note)}</td>
    </tr>`).join('')
    || '<tr><td colspan="5" class="tag">No matching activity.</td></tr>';
}

// Rebuild everything from db. Called after every change.
function fill() {
  // Keep the selection valid (default to the first account)
  if (!find(sel)) sel = db.accounts[0] ? db.accounts[0].id : '';

  // Options shared by every account dropdown
  const options = db.accounts
    .map(a => `<option value="${a.id}">${a.id} · ${esc(a.name)} (${kes(a.bal)})</option>`)
    .join('') || '<option value="">No accounts yet</option>';

  document.querySelectorAll('.acc').forEach(s => {
    s.innerHTML = options;
    s.value = sel;
  });

  // Transfer "To": keep the current choice if it still exists, else pick another account
  const to = $('tT');
  const toValue = to.value;
  to.innerHTML = options;
  to.value = find(toValue) ? toValue : (db.accounts.find(a => a.id !== sel) || { id: '' }).id;

  // Activity account filter: every account that appears in the log (including deleted ones)
  const fa = $('fA');
  const faValue = fa.value;
  fa.innerHTML = '<option value="">All accounts</option>' +
    [...new Set(db.tx.map(t => t.acc))].map(i => `<option>${i}</option>`).join('');
  fa.value = faValue;

  $('dorm').value = db.dorm;
  cards();
  logView();
}


/* ===== 8. EVENTS ===== */

// Choosing an account in any dropdown syncs all the other dropdowns and the cards
document.addEventListener('change', e => {
  if (!e.target.classList.contains('acc')) return;
  sel = e.target.value;
  document.querySelectorAll('.acc').forEach(s => { s.value = sel; });
  cards();
});

// Clicking an account card selects it and jumps to the Transact tab
$('cards').onclick = e => {
  const b = e.target.closest('[data-sel]');
  if (!b) return;
  sel = b.dataset.sel;
  fill();
  show('transact');
  $('dM').focus();
  say(`${sel} selected for transactions.`);
};

// Deposit, withdraw and repay share one pattern:
//   [form id, amount field, account dropdown, validation kind, action]
[
  ['fDep', 'dM', 'dA', 'dep', deposit],
  ['fWd',  'wM', 'wA', 'wd',  withdraw],
  ['fRp',  'rM', 'rA', 'rp',  repay]
].forEach(([formId, amountId, accId, kind, action]) => {
  // On submit: validate, run the action, and clear the amount if it worked
  $(formId).onsubmit = e => {
    e.preventDefault();
    const c = chkAmt(amountId, accId, kind);
    if (c != null && action($(accId).value, c)) clr(amountId);
  };
  // While typing: show errors live
  $(formId).addEventListener('input', () => chkAmt(amountId, accId, kind, true));
});

// Transfer has its own handler because it also checks From vs To
$('fTr').onsubmit = e => {
  e.preventDefault();
  const c = chkAmt('tM', 'tF', 'tr');
  const different = same();
  if (c != null && different && transfer($('tF').value, $('tT').value, c)) clr('tM');
};
$('fTr').addEventListener('input', () => {
  chkAmt('tM', 'tF', 'tr', true);
  same();
});

// Create account: validate name and opening deposit, then create
$('fNew').onsubmit = e => {
  e.preventDefault();
  const name = $('nN').value.trim();
  const c = $('nO').value ? num('nO') : 0;

  if (!name) return setErr('nN', "Enter the account holder's name.");
  setErr('nN', '');
  if (!(c >= 0)) return setErr('nO', 'Enter 0 or more.');
  setErr('nO', '');

  create(name, c);
  e.target.reset();
};
$('fNew').addEventListener('input', () => { setErr('nN', ''); setErr('nO', ''); });

// Manage tab buttons
$('bLoan').onclick = () => takeLoan(sel);
$('bDel').onclick  = () => remove(sel);
$('bSeed').onclick = seed;
$('bReset').onclick = () => {
  if (confirm('Erase all accounts and activity?')) {
    db = fresh();
    sel = '';
    done('All data cleared.');
  }
};

// Dormancy threshold saves as soon as it changes
$('dorm').onchange = e => {
  db.dorm = Math.max(0, parseInt(e.target.value) || 0);
  save();
  say(`Accounts are dormant after ${db.dorm} days without activity.`);
};

// Activity filters re-run the table on every change
['fQ', 'fA', 'fT', 'fD1', 'fD2'].forEach(id => $(id).addEventListener('input', logView));
$('fX').onclick = () => {
  document.querySelectorAll('#filters input, #filters select').forEach(x => { x.value = ''; });
  logView();
};


/* ===== START ===== */
show('overview');   // open on the Overview tab
fill();             // draw the page for the first time
