/* ===== STATE: money is stored in cents ===== */
const KEY='simplebank.v1', LOAN=1000000, DAY=864e5;
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY))}catch(e){return null}};
const fresh=()=>({seq:1000,dorm:90,accounts:[],tx:[]});
let db=load()||fresh(), sel='';   // sel = account chosen in the forms / cards
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){}};

/* ===== HELPERS ===== */
const $=id=>document.getElementById(id);
const kes=c=>'KES '+(c/100).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});
const cents=v=>Math.round(parseFloat(v)*100);
const num=id=>cents($(id).value.replace(/,/g,''));            // "1,000.50" -> 100050 (NaN if empty)
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const find=id=>db.accounts.find(a=>a.id===id);
function say(t,bad){const m=$('msg');m.textContent=t;m.className=bad?'bad':'ok'}
const fail=t=>{say(t,true);return false};
const done=t=>{save();fill();say(t);return true};
function post(a,type,amt,note){a.last=Date.now();db.tx.unshift({at:Date.now(),acc:a.id,type,amt,note})}
function setErr(id,m){$(id+'-e').textContent=m;$(id).setAttribute('aria-invalid',!!m)}
const clr=id=>{$(id).value='';setErr(id,'')};

/* ===== TABS ===== */
const tabs=[...document.querySelectorAll('[role=tab]')];
function show(n){tabs.forEach(t=>{const on=t.dataset.tab===n;t.setAttribute('aria-selected',on);t.tabIndex=on?0:-1;$('p-'+t.dataset.tab).hidden=!on})}
tabs.forEach(t=>{t.onclick=()=>show(t.dataset.tab);
  t.onkeydown=e=>{const d={ArrowRight:1,ArrowLeft:-1}[e.key];if(!d)return;
    const x=tabs[(tabs.indexOf(t)+d+tabs.length)%tabs.length];x.focus();show(x.dataset.tab)}});

/* ===== BANKING ACTIONS (amounts arrive already validated, in cents) ===== */
function create(name,c){const a={id:'ACC-'+(++db.seq),name,bal:c,last:Date.now(),loan:null};
  db.accounts.push(a);sel=a.id;post(a,c?'Deposit':'Opened',c,c?'Opening deposit':'Account created');
  return done(`Created ${a.id} for ${name}.`)}
function deposit(id,c){const a=find(id);a.bal+=c;post(a,'Deposit',c,'');return done(`Deposited ${kes(c)} into ${id}.`)}
function withdraw(id,c){const a=find(id);a.bal-=c;post(a,'Withdrawal',c,'');return done(`Withdrew ${kes(c)} from ${id}.`)}
function transfer(f,t,c){const a=find(f),b=find(t);a.bal-=c;b.bal+=c;
  post(a,'Transfer out',c,'To '+t);post(b,'Transfer in',c,'From '+f);return done(`Moved ${kes(c)} from ${f} to ${t}.`)}
function takeLoan(id){const a=find(id);if(!a)return fail('Create or select an account first.');
  if(a.loan)return fail(`${id} already has a loan. Repay it first.`);
  a.loan={id:'LN-'+(++db.seq),principal:LOAN,outstanding:LOAN,at:Date.now()};
  a.bal+=LOAN;post(a,'Loan disbursed',LOAN,'Loan '+a.loan.id);
  return done(`Created loan ${a.loan.id} and disbursed ${kes(LOAN)} to ${id}.`)}
function repay(id,c){const a=find(id),lid=a.loan.id;a.loan.outstanding-=c;a.bal-=c;post(a,'Loan repayment',c,'Loan '+lid);
  if(a.loan.outstanding===0){a.loan=null;return done(`Loan ${lid} fully repaid.`)}
  return done(`Repaid ${kes(c)}. ${kes(a.loan.outstanding)} still owed.`)}
function remove(id){const a=find(id);if(!a)return fail('Create or select an account first.');
  const days=(Date.now()-a.last)/DAY;
  if(days<db.dorm)return fail(`${id} is not dormant: last activity ${Math.floor(days)} days ago, needs ${db.dorm}.`);
  if(a.bal!==0)return fail(`Withdraw or transfer the ${kes(a.bal)} balance before deleting ${id}.`);
  if(a.loan)return fail(`Repay the ${kes(a.loan.outstanding)} loan before deleting ${id}.`);
  if(!confirm(`Delete ${id} (${a.name})? This cannot be undone.`))return false;
  db.accounts=db.accounts.filter(x=>x!==a);
  db.tx.unshift({at:Date.now(),acc:id,type:'Deleted',amt:0,note:'Dormant account removed'});
  return done(`Deleted ${id}.`)}
function seed(){if(db.accounts.length&&!confirm('Replace current data with sample accounts?'))return;
  const n=Date.now();db={seq:1003,dorm:90,tx:[],accounts:[
    {id:'ACC-1001',name:'Amina Otieno',bal:2500000,last:n,loan:null},
    {id:'ACC-1002',name:'Brian Kamau',bal:1200000,last:n,loan:null},
    {id:'ACC-1003',name:'Grace Wanjiku',bal:0,last:n-120*DAY,loan:null}]};   // 1003 is already dormant
  db.accounts.forEach(a=>db.tx.push({at:a.last,acc:a.id,type:'Opened',amt:a.bal,note:'Sample account'}));
  sel='ACC-1001';done('Sample accounts loaded. ACC-1003 is dormant and can be deleted.')}

/* ===== INLINE VALIDATION (live = don't complain about an empty field yet) ===== */
function chkAmt(id,accId,kind,live){
  const raw=$(id).value,c=num(id),a=find($(accId).value);let m='';
  if(live&&raw==='')m='';
  else if(!a)m='Create an account first.';
  else if(raw==='')m='Enter an amount.';
  else if(!(c>0))m='Enter an amount above 0.';
  else if((kind==='wd'||kind==='tr')&&c>a.bal)m=`Insufficient balance. Available: ${kes(a.bal)}.`;
  else if(kind==='rp'){
    if(!a.loan)m='This account has no active loan.';
    else if(c>a.loan.outstanding)m=`Repay at most ${kes(a.loan.outstanding)}.`;
    else if(c>a.bal)m=`Insufficient balance. Available: ${kes(a.bal)}.`}
  setErr(id,m);return m?null:c}
const same=()=>{const s=$('tF').value&&$('tF').value===$('tT').value;setErr('tT',s?'Choose a different account.':'');return !s};

/* ===== CURRENCY MASK: typing 1234.5 shows 1,234.5 ===== */
function mask(el){const[i,...r]=el.value.replace(/[^\d.]/g,'').split('.');
  el.value=(i?Number(i).toLocaleString('en-US'):r.length?'0':'')+(r.length?'.'+r.join('').slice(0,2):'')}
document.addEventListener('input',e=>{if(e.target.classList.contains('money'))mask(e.target)});

/* ===== RENDERING ===== */
function cards(){
  const A=db.accounts,tot=A.reduce((s,a)=>s+a.bal,0),lo=A.reduce((s,a)=>s+(a.loan?a.loan.outstanding:0),0);
  $('stats').innerHTML=`<div><dt>Total balance</dt><dd>${kes(tot)}</dd></div><div><dt>Accounts</dt><dd>${A.length}</dd></div><div><dt>Loans outstanding</dt><dd>${kes(lo)}</dd></div>`;
  $('cards').innerHTML=A.map(a=>`<button class="card" data-sel="${a.id}" aria-pressed="${a.id===sel}"><b>${kes(a.bal)}</b>${esc(a.name)}<br><span class="tag">${a.id}${a.loan?` · owes ${kes(a.loan.outstanding)}`:''}</span></button>`).join('')
    ||'<p class="tag">No accounts yet. Create one in the Manage tab.</p>';
  const a=find(sel);$('rH').textContent=a&&a.loan?`Outstanding on ${a.loan.id}: ${kes(a.loan.outstanding)}`:'This account has no active loan.';
}
function logView(){
  const q=$('fQ').value.toLowerCase(),fa=$('fA').value,ft=$('fT').value,d1=$('fD1').value,d2=$('fD2').value;
  const t1=d1?new Date(d1).getTime():0,t2=d2?new Date(d2).getTime()+DAY:Infinity;
  const rows=db.tx.filter(t=>(!fa||t.acc===fa)&&(!ft||t.type===ft)&&t.at>=t1&&t.at<t2&&(!q||(t.acc+' '+t.type+' '+t.note).toLowerCase().includes(q)));
  $('cnt').textContent=`Showing ${Math.min(rows.length,100)} of ${rows.length} matching (${db.tx.length} total)`;
  $('log').innerHTML=rows.slice(0,100).map(t=>`<tr><td>${new Date(t.at).toLocaleString()}</td><td>${t.acc}</td><td>${t.type}</td><td>${t.amt?kes(t.amt):''}</td><td>${esc(t.note)}</td></tr>`).join('')
    ||'<tr><td colspan="5" class="tag">No matching activity.</td></tr>';
}
function fill(){   // rebuild everything from db
  if(!find(sel))sel=db.accounts[0]?db.accounts[0].id:'';
  const o=db.accounts.map(a=>`<option value="${a.id}">${a.id} · ${esc(a.name)} (${kes(a.bal)})</option>`).join('')||'<option value="">No accounts yet</option>';
  document.querySelectorAll('.acc').forEach(s=>{s.innerHTML=o;s.value=sel});
  const to=$('tT'),tv=to.value;to.innerHTML=o;
  to.value=find(tv)?tv:(db.accounts.find(a=>a.id!==sel)||{id:''}).id;
  const fa=$('fA'),fv=fa.value;
  fa.innerHTML='<option value="">All accounts</option>'+[...new Set(db.tx.map(t=>t.acc))].map(i=>`<option>${i}</option>`).join('');fa.value=fv;
  $('dorm').value=db.dorm;cards();logView();
}

/* ===== EVENTS ===== */
// Choosing an account in any dropdown syncs all the others and the cards
document.addEventListener('change',e=>{if(e.target.classList.contains('acc')){
  sel=e.target.value;document.querySelectorAll('.acc').forEach(s=>s.value=sel);cards()}});
// Clicking a card selects it and jumps to Transact
$('cards').onclick=e=>{const b=e.target.closest('[data-sel]');if(!b)return;
  sel=b.dataset.sel;fill();show('transact');$('dM').focus();say(`${sel} selected for transactions.`)};

[['fDep','dM','dA','dep',deposit],['fWd','wM','wA','wd',withdraw],['fRp','rM','rA','rp',repay]].forEach(([f,m,a,k,fn])=>{
  $(f).onsubmit=e=>{e.preventDefault();const c=chkAmt(m,a,k);if(c!=null&&fn($(a).value,c))clr(m)};
  $(f).addEventListener('input',()=>chkAmt(m,a,k,1))});
$('fTr').onsubmit=e=>{e.preventDefault();const c=chkAmt('tM','tF','tr'),ok=same();
  if(c!=null&&ok&&transfer($('tF').value,$('tT').value,c))clr('tM')};
$('fTr').addEventListener('input',()=>{chkAmt('tM','tF','tr',1);same()});

$('fNew').onsubmit=e=>{e.preventDefault();const n=$('nN').value.trim(),c=$('nO').value?num('nO'):0;
  if(!n)return setErr('nN',"Enter the account holder's name.");setErr('nN','');
  if(!(c>=0))return setErr('nO','Enter 0 or more.');setErr('nO','');
  create(n,c);e.target.reset()};
$('fNew').addEventListener('input',()=>{setErr('nN','');setErr('nO','')});

$('bLoan').onclick=()=>takeLoan(sel);
$('bDel').onclick=()=>remove(sel);
$('bSeed').onclick=seed;
$('bReset').onclick=()=>{if(confirm('Erase all accounts and activity?')){db=fresh();sel='';done('All data cleared.')}};
$('dorm').onchange=e=>{db.dorm=Math.max(0,parseInt(e.target.value)||0);save();say(`Accounts are dormant after ${db.dorm} days without activity.`)};

['fQ','fA','fT','fD1','fD2'].forEach(i=>$(i).addEventListener('input',logView));
$('fX').onclick=()=>{document.querySelectorAll('#filters input,#filters select').forEach(x=>x.value='');logView()};

show('overview');fill();
