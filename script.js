
/* ========== SETTINGS AND STORAGE ========== */
// KEY is the localStorage name; LOAN is 10,000 KES in cents (money is stored as whole cents to avoid float errors)
const KEY='simplebank.v1', LOAN=1000000;

// Read saved data from the browser; returns null if nothing is saved or storage is blocked
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY))}catch(e){return null}};

// db is the whole app state:
//   seq      = counter used to build account and loan IDs
//   dorm     = dormancy threshold in days
//   accounts = [{id, name, bal, last, loan}]  (last = time of latest activity, loan = null or loan object)
//   tx       = transaction log, newest first
let db=load()||{seq:1000,dorm:90,accounts:[],tx:[]};

// Write the current state back to the browser
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){}};

/* ========== SMALL HELPERS ========== */
const $=id=>document.getElementById(id);                       // shortcut for getElementById
const kes=c=>'KES '+(c/100).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2}); // cents -> "KES 1,000.00"
const cents=v=>Math.round(parseFloat(v)*100);                  // "12.50" -> 1250
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); // stops names from injecting HTML
const find=id=>db.accounts.find(a=>a.id===id);                 // look up an account by its ID
const fail=t=>{say(t,true);return false};                      // show a red error, return false (action failed)
const done=t=>{save();render();say(t);return true};            // save, redraw the page, show a green message, return true

// Show a message in the status area at the top
function say(t,bad){const m=$('msg');m.textContent=t;m.className=bad?'bad':'ok'}

// Add a transaction to the log and refresh the account's "last activity" time (used for dormancy)
function post(a,type,amt,note){a.last=Date.now();db.tx.unshift({at:Date.now(),acc:a.id,type,amt,note})}

// Convert an input value to cents; returns null unless the amount is above 0
function pos(v){const c=cents(v);return c>0?c:null}

/* ========== BANKING FUNCTIONS ========== */

// 1. Create a bank account, with an optional opening deposit
function create(name,open){
  name=name.trim(); if(!name) return fail("Enter the account holder's name.");
  const c=open===''?0:cents(open); if(isNaN(c)||c<0) return fail('Opening deposit must be 0 or more.');
  const a={id:'ACC-'+(++db.seq),name,bal:c,last:Date.now(),loan:null};
  db.accounts.push(a); post(a,c>0?'Deposit':'Opened',c,c>0?'Opening deposit':'Account created');
  return done(`Created ${a.id} for ${name}.`);
}

// 2. Deposit funds into an account
function deposit(id,v){
  const a=find(id),c=pos(v); if(!a||!c) return fail('Choose an account and enter an amount above 0.');
  a.bal+=c; post(a,'Deposit',c,''); return done(`Deposited ${kes(c)} into ${a.id}.`);
}

// 3. Withdraw funds (rejected if the balance is too low)
function withdraw(id,v){
  const a=find(id),c=pos(v); if(!a||!c) return fail('Choose an account and enter an amount above 0.');
  if(c>a.bal) return fail(`Insufficient funds. ${a.id} has ${kes(a.bal)}.`);
  a.bal-=c; post(a,'Withdrawal',c,''); return done(`Withdrew ${kes(c)} from ${a.id}.`);
}

// 4. Transfer funds between two different accounts (logs one entry on each side)
function transfer(f,t,v){
  const a=find(f),b=find(t),c=pos(v);
  if(!a||!b||a===b) return fail('Pick two different accounts.');
  if(!c) return fail('Enter an amount above 0.');
  if(c>a.bal) return fail(`Insufficient funds. ${a.id} has ${kes(a.bal)}.`);
  a.bal-=c; b.bal+=c; post(a,'Transfer out',c,'To '+b.id); post(b,'Transfer in',c,'From '+a.id);
  return done(`Moved ${kes(c)} from ${a.id} to ${b.id}.`);
}

// Bonus: create a loan account linked to the bank account and disburse 10,000 KES into it (one loan per account)
function takeLoan(id){
  const a=find(id); if(!a) return false;
  if(a.loan) return fail(`${a.id} already has a loan.`);
  a.loan={id:'LN-'+(++db.seq),principal:LOAN,outstanding:LOAN,at:Date.now()};
  a.bal+=LOAN; post(a,'Loan disbursed',LOAN,'Loan '+a.loan.id);
  return done(`Created loan account ${a.loan.id} and disbursed ${kes(LOAN)} to ${a.id}.`);
}

// 5. Delete a dormant account. Three checks must pass:
//    (a) no activity for db.dorm days, (b) zero balance, (c) no outstanding loan
function remove(id){
  const a=find(id); if(!a) return false;
  const days=(Date.now()-a.last)/864e5;   // 864e5 = milliseconds in one day
  if(days<db.dorm) return fail(`${a.id} is not dormant. It needs ${db.dorm} days without activity; last activity was ${Math.floor(days)} days ago.`);
  if(a.bal!==0) return fail(`Withdraw or transfer the ${kes(a.bal)} balance before deleting ${a.id}.`);
  if(a.loan&&a.loan.outstanding>0) return fail(`${a.id} has an outstanding loan of ${kes(a.loan.outstanding)}.`);
  if(!confirm(`Delete ${a.id} (${a.name})? This cannot be undone.`)) return false;
  db.accounts=db.accounts.filter(x=>x!==a);
  db.tx.unshift({at:Date.now(),acc:a.id,type:'Deleted',amt:0,note:'Dormant account removed'});
  return done(`Deleted ${a.id}.`);
}

/* ========== DRAWING THE PAGE ========== */
// Rebuilds the dropdowns, account list and activity table from db. Called after every change.
function render(){
  // Dropdown options shared by the deposit, withdraw and transfer forms
  const opts=db.accounts.map(a=>`<option value="${a.id}">${a.id} · ${esc(a.name)} (${kes(a.bal)})</option>`).join('')||'<option value="">No accounts yet</option>';
  // Refill each dropdown but keep the current selection if that account still exists
  ['dAcc','wAcc','tFrom','tTo'].forEach(id=>{const s=$(id),v=s.value;s.innerHTML=opts;if(v&&find(v))s.value=v});

  // Account rows, each with the loan button (hidden once a loan exists) and a delete button
  $('list').innerHTML=db.accounts.map(a=>`<div class="acct">
    <div><strong>${esc(a.name)}</strong><div class="tag">${a.id}${a.loan?` · Loan ${a.loan.id}: ${kes(a.loan.outstanding)} outstanding`:''}</div></div>
    <div class="bal">${kes(a.bal)}</div>
    <div class="acts">${a.loan?'':`<button class="ghost" data-loan="${a.id}">Take 10,000 KES loan</button>`}<button class="danger" data-del="${a.id}">Delete</button></div></div>`).join('')
    ||'<p class="tag">No accounts yet. Create one above.</p>';

  $('dorm').value=db.dorm;   // show the current dormancy threshold

  // Activity table: the 30 most recent transactions
  $('log').innerHTML=db.tx.slice(0,30).map(t=>`<tr><td>${new Date(t.at).toLocaleString()}</td><td>${t.acc}</td><td>${t.type}</td><td>${t.amt?kes(t.amt):''}</td><td>${esc(t.note)}</td></tr>`).join('')
    ||'<tr><td colspan="5" class="tag">No activity yet.</td></tr>';
}

/* ========== EVENT WIRING ========== */
// Each form calls its function; on success the amount field is cleared (or the whole form for "Create")
$('fNew').onsubmit=e=>{e.preventDefault();create($('nName').value,$('nOpen').value)&&e.target.reset()};
$('fDep').onsubmit=e=>{e.preventDefault();deposit($('dAcc').value,$('dAmt').value)&&($('dAmt').value='')};
$('fWd').onsubmit=e=>{e.preventDefault();withdraw($('wAcc').value,$('wAmt').value)&&($('wAmt').value='')};
$('fTr').onsubmit=e=>{e.preventDefault();transfer($('tFrom').value,$('tTo').value,$('tAmt').value)&&($('tAmt').value='')};

// Changing the dormancy threshold saves it right away
$('dorm').onchange=e=>{db.dorm=Math.max(0,parseInt(e.target.value)||0);save();say(`Accounts are dormant after ${db.dorm} days without activity.`)};

// One click listener for the whole account list: the buttons carry data-loan / data-del attributes with the account ID
$('list').onclick=e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.loan)takeLoan(b.dataset.loan); else if(b.dataset.del)remove(b.dataset.del)};

// Draw the page for the first time when it loads
render();
