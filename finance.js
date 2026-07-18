"use strict";

/* Private finance workspace. Only the AES-GCM envelope in data.finance is
   persisted or synced; financeState exists in memory while the section is
   unlocked. */
var financeTab="financeoverview";
var financeState=null,financeKey=null,financeBusy=false,financePendingImport=null;
var financeSearch="",financeAccountFilter="",financeLockTimer=null;
var FINANCE_FACE_STORE="gamevault-finance-face-v1";
var FINANCE_IDLE_MS=5*60*1000;

function financeDefaults(){return {version:1,transactions:[],loans:[],statements:[],updatedAt:Date.now()};}
function financeNormalize(value){
  var f=value&&typeof value==="object"&&!Array.isArray(value)?value:financeDefaults();
  if(!Array.isArray(f.transactions))f.transactions=[];
  if(!Array.isArray(f.loans))f.loans=[];
  if(!Array.isArray(f.statements))f.statements=[];
  f.version=1;return f;
}
function financeConfigured(){return !!(data&&data.finance&&data.finance.format==="gamevault-finance-v1"&&data.finance.cipher);}
function financeUnlocked(){return !!(financeState&&financeKey);}
function financeTouch(){
  if(!financeUnlocked())return;
  clearTimeout(financeLockTimer);
  financeLockTimer=setTimeout(function(){financeLock();if(section==="finance")render();flash("Finance locked after 5 minutes of inactivity");},FINANCE_IDLE_MS);
}
function financeLock(silent){
  clearTimeout(financeLockTimer);financeLockTimer=null;financeState=null;financeKey=null;financePendingImport=null;
  if(!silent&&typeof flash==="function")flash("Finance locked");
}
function financeRandom(n){var out=new Uint8Array(n);crypto.getRandomValues(out);return out;}
function financeKeyFromPin(pin,salt){
  return crypto.subtle.importKey("raw",new TextEncoder().encode(pin),"PBKDF2",false,["deriveKey"]).then(function(base){
    return crypto.subtle.deriveKey({name:"PBKDF2",salt:salt,iterations:310000,hash:"SHA-256"},base,{name:"AES-GCM",length:256},true,["encrypt","decrypt"]);
  });
}
function financeEncrypt(state,key,salt){
  var iv=financeRandom(12),plain=new TextEncoder().encode(JSON.stringify(financeNormalize(state)));
  return crypto.subtle.encrypt({name:"AES-GCM",iv:iv},key,plain).then(function(cipher){
    return {format:"gamevault-finance-v1",version:1,updatedAt:Date.now(),salt:bytesToB64(salt),iv:bytesToB64(iv),cipher:bytesToB64(new Uint8Array(cipher))};
  });
}
function financeDecrypt(envelope,key){
  return crypto.subtle.decrypt({name:"AES-GCM",iv:b64ToBytes(envelope.iv)},key,b64ToBytes(envelope.cipher)).then(function(plain){
    return financeNormalize(JSON.parse(new TextDecoder().decode(plain)));
  });
}
function financeSetup(){
  var pin=(document.getElementById("financePinNew")||{}).value||"",again=(document.getElementById("financePinAgain")||{}).value||"";
  if(!/^\d{6}$/.test(pin)){flash("Choose a 6-digit Finance PIN");return;}
  if(pin!==again){flash("The PIN entries do not match");return;}
  financeBusy=true;render();var salt=financeRandom(16);
  financeKeyFromPin(pin,salt).then(function(key){financeKey=key;financeState=financeDefaults();return financeEncrypt(financeState,key,salt);}).then(function(envelope){
    data.finance=envelope;financeBusy=false;persist();financeTouch();render();flash("Private Finance vault created");
  }).catch(function(){financeBusy=false;financeLock(true);render();flash("Could not create the Finance vault");});
}
function financeUnlockPin(){
  var pin=(document.getElementById("financePin")||{}).value||"";
  if(!/^\d{6}$/.test(pin)){flash("Enter your 6-digit Finance PIN");return;}
  financeBusy=true;render();var envelope=data.finance;
  financeKeyFromPin(pin,b64ToBytes(envelope.salt)).then(function(key){return financeDecrypt(envelope,key).then(function(state){financeKey=key;financeState=state;});}).then(function(){
    financeBusy=false;financeTouch();render();flash("Finance unlocked");
  }).catch(function(){financeBusy=false;financeLock(true);render();flash("Incorrect Finance PIN");});
}
function financeSave(message){
  if(!financeUnlocked())return Promise.reject(new Error("Finance is locked"));
  financeState.updatedAt=Date.now();financeBusy=true;
  return financeEncrypt(financeState,financeKey,b64ToBytes(data.finance.salt)).then(function(envelope){
    data.finance=envelope;financeBusy=false;persist();financeTouch();render();if(message)flash(message);
  }).catch(function(err){financeBusy=false;render();flash("Finance could not be saved");throw err;});
}

function financeB64Url(bytes){return bytesToB64(bytes).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
function financeFromB64Url(value){var s=value.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";return b64ToBytes(s);}
function financeFaceConfig(){try{return JSON.parse(localStorage.getItem(FINANCE_FACE_STORE)||"null");}catch(e){return null;}}
function financePrfOutput(credential){
  try{var ext=credential.getClientExtensionResults(),out=ext&&ext.prf&&ext.prf.results&&ext.prf.results.first;return out?new Uint8Array(out):null;}catch(e){return null;}
}
function financeGetPrf(credentialId,salt){
  return navigator.credentials.get({publicKey:{challenge:financeRandom(32),allowCredentials:[{type:"public-key",id:financeFromB64Url(credentialId)}],userVerification:"required",timeout:60000,extensions:{prf:{eval:{first:salt}}}}}).then(function(credential){
    var out=financePrfOutput(credential);if(!out)throw new Error("This browser does not provide the WebAuthn encryption extension");return out;
  });
}
function financeEnableFace(){
  if(!financeUnlocked()){flash("Unlock with your PIN first");return;}
  if(!window.PublicKeyCredential||!navigator.credentials){flash("Face ID unlock is not supported by this browser");return;}
  financeBusy=true;render();var prfSalt=financeRandom(32),userId=financeRandom(16),created;
  navigator.credentials.create({publicKey:{challenge:financeRandom(32),rp:{name:"Sinu Game Vault"},user:{id:userId,name:"sinu-finance",displayName:"Sinu Finance"},pubKeyCredParams:[{type:"public-key",alg:-7},{type:"public-key",alg:-257}],authenticatorSelection:{authenticatorAttachment:"platform",residentKey:"preferred",userVerification:"required"},timeout:60000,attestation:"none",extensions:{prf:{eval:{first:prfSalt}}}}}).then(function(credential){
    created=credential;var direct=financePrfOutput(credential);return direct||financeGetPrf(financeB64Url(new Uint8Array(credential.rawId)),prfSalt);
  }).then(function(prf){
    return Promise.all([crypto.subtle.importKey("raw",prf,{name:"AES-GCM"},false,["encrypt"]),crypto.subtle.exportKey("raw",financeKey)]);
  }).then(function(parts){
    var iv=financeRandom(12);return crypto.subtle.encrypt({name:"AES-GCM",iv:iv},parts[0],parts[1]).then(function(wrapped){
      var cfg={credentialId:financeB64Url(new Uint8Array(created.rawId)),salt:bytesToB64(prfSalt),iv:bytesToB64(iv),wrappedKey:bytesToB64(new Uint8Array(wrapped))};
      localStorage.setItem(FINANCE_FACE_STORE,JSON.stringify(cfg));financeBusy=false;financeTouch();render();flash("Face ID unlock enabled on this device");
    });
  }).catch(function(err){financeBusy=false;render();flash(err&&err.name==="NotAllowedError"?"Face ID setup was cancelled":"Face ID secure unlock is unavailable here; use the PIN");});
}
function financeUnlockFace(){
  var cfg=financeFaceConfig();if(!cfg){flash("Unlock with PIN, then enable Face ID on this device");return;}
  financeBusy=true;render();var prfSalt=b64ToBytes(cfg.salt);
  financeGetPrf(cfg.credentialId,prfSalt).then(function(prf){return crypto.subtle.importKey("raw",prf,{name:"AES-GCM"},false,["decrypt"]);}).then(function(wrapKey){
    return crypto.subtle.decrypt({name:"AES-GCM",iv:b64ToBytes(cfg.iv)},wrapKey,b64ToBytes(cfg.wrappedKey));
  }).then(function(rawKey){return crypto.subtle.importKey("raw",rawKey,{name:"AES-GCM"},true,["encrypt","decrypt"]);}).then(function(key){
    return financeDecrypt(data.finance,key).then(function(state){financeKey=key;financeState=state;});
  }).then(function(){financeBusy=false;financeTouch();render();flash("Finance unlocked with Face ID");}).catch(function(){financeBusy=false;financeLock(true);render();flash("Face ID unlock failed; use your PIN");});
}
function financeDisableFace(){try{localStorage.removeItem(FINANCE_FACE_STORE);}catch(e){}render();flash("Face ID unlock removed from this device");}

function financeMoney(value){return fmtMoney(Math.round((Number(value)||0)*100)/100);}
function financeMonthKey(date){return String(date||"").slice(0,7);}
function financeCurrentMonth(){var d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");}
function financeCategory(description){
  var d=String(description||"").toLowerCase();
  var rules=[
    ["Loan / EMI",/\b(emi|loan|bajaj fin|hdfc credila)\b/],["Housing",/\b(rent|maintenance|electricity|water bill|gas bill)\b/],
    ["Food",/\b(swiggy|zomato|restaurant|cafe|hotel|bakery|food|supermarket|grocery|mart)\b/],["Transport",/\b(uber|ola|rapido|fuel|petrol|diesel|metro|railway|irctc|toll)\b/],
    ["Shopping",/\b(amazon|flipkart|myntra|shopping|store|retail)\b/],["Entertainment",/\b(netflix|prime video|hotstar|sony liv|zee5|cinema|bookmyshow|playstation|steam)\b/],
    ["Health",/\b(hospital|clinic|pharmacy|medical|apollo|doctor|lab)\b/],["Insurance",/\b(insurance|lic premium)\b/],["Education",/\b(school|college|course|tuition)\b/],
    ["Transfer",/\b(neft|imps|upi transfer|fund transfer|payment received)\b/]
  ];
  for(var i=0;i<rules.length;i++)if(rules[i][1].test(d))return rules[i][0];return "Other";
}
function financeTransactionKey(t){return [t.date,String(t.description||"").toLowerCase().replace(/\s+/g," ").trim(),Number(t.amount).toFixed(2),t.type,t.account||""].join("|");}
function financeSummary(){
  var month=financeCurrentMonth(),expense=0,income=0;
  (financeState.transactions||[]).forEach(function(t){if(financeMonthKey(t.date)!==month)return;if(t.type==="income")income+=Number(t.amount)||0;else expense+=Number(t.amount)||0;});
  var emi=(financeState.loans||[]).filter(function(x){return x.status!=="closed";}).reduce(function(a,x){return a+(Number(x.emi)||0);},0);
  var balance=(financeState.loans||[]).filter(function(x){return x.status!=="closed";}).reduce(function(a,x){return a+(Number(x.balance)||0);},0);
  return {expense:expense,income:income,emi:emi,balance:balance};
}
function financeMonthlyChart(){
  var keys=[],totals={},now=new Date();for(var i=7;i>=0;i--){var d=new Date(now.getFullYear(),now.getMonth()-i,1),k=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");keys.push(k);totals[k]=0;}
  financeState.transactions.forEach(function(t){var k=financeMonthKey(t.date);if(k in totals&&t.type!=="income")totals[k]+=Number(t.amount)||0;});
  var max=Math.max.apply(null,keys.map(function(k){return totals[k];}).concat([1]));
  return '<div class="finance-bars" aria-label="Monthly expenses">'+keys.map(function(k){var pct=Math.max(2,Math.round(totals[k]/max*100)),label=new Date(Number(k.slice(0,4)),Number(k.slice(5))-1,1).toLocaleDateString("en-GB",{month:"short"});return '<div class="finance-bar"><span class="finance-bar-value">'+(totals[k]?financeMoney(totals[k]):"")+'</span><i style="height:'+pct+'%"></i><b>'+label+'</b></div>';}).join("")+'</div>';
}
function financeCategoryChart(){
  var month=financeCurrentMonth(),groups={};financeState.transactions.forEach(function(t){if(financeMonthKey(t.date)!==month||t.type==="income")return;groups[t.category||"Other"]=(groups[t.category||"Other"]||0)+(Number(t.amount)||0);});
  var rows=Object.keys(groups).map(function(k){return [k,groups[k]];}).sort(function(a,b){return b[1]-a[1];}),max=rows.length?rows[0][1]:1;
  if(!rows.length)return '<div class="finance-empty">Import a statement or add a transaction to see category insights.</div>';
  return rows.slice(0,8).map(function(row){return '<div class="finance-category-row"><div><span>'+esc(row[0])+'</span><b>'+financeMoney(row[1])+'</b></div><i><span style="width:'+Math.round(row[1]/max*100)+'%"></span></i></div>';}).join("");
}
function financeLockScreen(){
  var configured=financeConfigured(),face=financeFaceConfig(),phone=phoneUi();
  if(!configured)return '<section class="finance-auth"><span class="finance-lock-icon">&#8377;</span><h2>Create private Finance vault</h2><p>Your statements, transactions and loans are encrypted before they enter local storage or Google Drive. Create a six-digit recovery PIN.</p><div class="finance-pin-row"><input id="financePinNew" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="6-digit PIN"><input id="financePinAgain" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="Confirm PIN"><button class="btn blue" data-act="finance-setup"'+(financeBusy?' disabled':'')+'>'+(financeBusy?'Creating...':'Create vault')+'</button></div><small>Do not forget this PIN. GameVault cannot recover encrypted finance data without it.</small></section>';
  return '<section class="finance-auth"><span class="finance-lock-icon">&#128274;</span><h2>Finance is locked</h2><p>Unlock the encrypted vault to view statements, expenses and loans.</p>'+(phone&&face?'<button class="btn blue finance-face-btn" data-act="finance-face-unlock"'+(financeBusy?' disabled':'')+'>Unlock with Face ID</button><div class="finance-or">or use recovery PIN</div>':'')+'<div class="finance-pin-row"><input id="financePin" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password" placeholder="6-digit PIN"><button class="btn blue" data-act="finance-unlock"'+(financeBusy?' disabled':'')+'>'+(financeBusy?'Unlocking...':'Unlock')+'</button></div><small>Encrypted finance data is synced with your normal GameVault backup. The PIN is never stored or uploaded.</small></section>';
}
function financeOverview(){
  var s=financeSummary(),month=new Date().toLocaleDateString("en-IN",{month:"long",year:"numeric"});
  var nextLoans=financeState.loans.filter(function(x){return x.status!=="closed";}).sort(function(a,b){return (Number(a.dueDay)||32)-(Number(b.dueDay)||32);}).slice(0,4);
  return '<section class="finance-summary"><div><span>'+esc(month)+' expenses</span><strong>'+financeMoney(s.expense)+'</strong></div><div><span>Income</span><strong class="positive">'+financeMoney(s.income)+'</strong></div><div><span>Monthly EMI</span><strong>'+financeMoney(s.emi)+'</strong></div><div><span>Outstanding loans</span><strong>'+financeMoney(s.balance)+'</strong></div></section><div class="finance-grid"><section class="finance-panel finance-wide"><div class="finance-panel-head"><div><span>SPENDING TREND</span><h3>Last 8 months</h3></div></div>'+financeMonthlyChart()+'</section><section class="finance-panel"><div class="finance-panel-head"><div><span>THIS MONTH</span><h3>Top categories</h3></div></div>'+financeCategoryChart()+'</section><section class="finance-panel"><div class="finance-panel-head"><div><span>UPCOMING</span><h3>Loan payments</h3></div></div>'+(nextLoans.length?nextLoans.map(function(x){return '<div class="finance-mini-row"><div><strong>'+esc(x.name)+'</strong><span>Due day '+esc(String(x.dueDay||"-"))+'</span></div><b>'+financeMoney(x.emi)+'</b></div>';}).join(""):'<div class="finance-empty">No active loans recorded.</div>')+'</section></div>';
}
function financeFilteredTransactions(){
  var q=String(financeSearch||"").toLowerCase();return financeState.transactions.filter(function(t){return (!q||[t.description,t.category,t.account,t.date].join(" ").toLowerCase().indexOf(q)>-1)&&(!financeAccountFilter||t.account===financeAccountFilter);}).sort(function(a,b){return String(b.date).localeCompare(String(a.date))||Number(b.createdAt||0)-Number(a.createdAt||0);});
}
function financeCategoryOptions(selected){return ["Food","Housing","Transport","Shopping","Entertainment","Health","Insurance","Education","Loan / EMI","Transfer","Other"].map(function(x){return '<option'+(x===selected?' selected':'')+'>'+x+'</option>';}).join("");}
function financeTransactions(){
  var items=financeFilteredTransactions(),accounts={};financeState.transactions.forEach(function(t){if(t.account)accounts[t.account]=1;});
  var rows=items.map(function(t){return '<tr><td>'+esc(t.date)+'</td><td><strong>'+esc(t.description)+'</strong><small>'+esc(t.account||"Manual")+'</small></td><td><span class="finance-cat">'+esc(t.category||"Other")+'</span></td><td class="finance-amount '+(t.type==="income"?'income':'expense')+'">'+(t.type==="income"?'+':'-')+financeMoney(t.amount)+'</td><td><button class="iconbtn finance-delete" data-act="finance-delete-transaction" data-id="'+esc(t.id)+'" title="Delete transaction" aria-label="Delete transaction">&times;</button></td></tr>';}).join("");
  return '<section class="finance-panel"><div class="finance-panel-head"><div><span>ADD ENTRY</span><h3>Manual transaction</h3></div></div><div class="finance-entry-form"><input id="financeTxDate" type="date" value="'+localISO(today())+'"><input id="financeTxDescription" placeholder="Description"><input id="financeTxAmount" type="number" min="0" step="0.01" placeholder="Amount"><select id="financeTxType"><option value="expense">Expense</option><option value="income">Income</option></select><select id="financeTxCategory">'+financeCategoryOptions("Other")+'</select><input id="financeTxAccount" placeholder="Account / card"><button class="btn blue" data-act="finance-add-transaction">Add</button></div></section><div class="finance-toolbar"><div class="searchwrap"><span class="sic">&#8981;</span><input id="financeSearch" value="'+esc(financeSearch)+'" placeholder="Search transactions..."></div><select id="financeAccountFilter"><option value="">All accounts</option>'+Object.keys(accounts).sort().map(function(x){return '<option'+(x===financeAccountFilter?' selected':'')+'>'+esc(x)+'</option>';}).join("")+'</select><span>'+items.length+' transactions</span></div><section class="finance-panel finance-table-wrap"><table class="finance-table"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>'+(items.length?'':'<div class="finance-empty">No transactions match this view.</div>')+'</section>';
}
function financeLoans(){
  var cards=financeState.loans.slice().sort(function(a,b){return (a.status==="closed")-(b.status==="closed");}).map(function(x){var original=Number(x.principal)||0,balance=Number(x.balance)||0,pct=original?Math.max(0,Math.min(100,Math.round((original-balance)/original*100))):0;return '<article class="finance-loan '+(x.status==="closed"?'closed':'')+'"><div class="finance-loan-head"><div><span>'+esc(x.lender||"Loan")+'</span><h3>'+esc(x.name)+'</h3></div><button class="iconbtn finance-delete" data-act="finance-delete-loan" data-id="'+esc(x.id)+'" aria-label="Delete loan">&times;</button></div><strong>'+financeMoney(balance)+'</strong><small>outstanding of '+financeMoney(original)+'</small><div class="finance-loan-track"><i style="width:'+pct+'%"></i></div><div class="finance-loan-meta"><span>EMI <b>'+financeMoney(x.emi)+'</b></span><span>Rate <b>'+esc(String(x.rate||0))+'%</b></span><span>Due <b>day '+esc(String(x.dueDay||"-"))+'</b></span></div><button class="btn" data-act="finance-toggle-loan" data-id="'+esc(x.id)+'">'+(x.status==="closed"?'Reopen loan':'Mark paid off')+'</button></article>';}).join("");
  return '<section class="finance-panel"><div class="finance-panel-head"><div><span>ADD LIABILITY</span><h3>Loan or EMI</h3></div></div><div class="finance-loan-form"><input id="financeLoanName" placeholder="Loan name"><input id="financeLoanLender" placeholder="Lender"><input id="financeLoanPrincipal" type="number" min="0" step="0.01" placeholder="Original amount"><input id="financeLoanBalance" type="number" min="0" step="0.01" placeholder="Current balance"><input id="financeLoanEmi" type="number" min="0" step="0.01" placeholder="Monthly EMI"><input id="financeLoanRate" type="number" min="0" step="0.01" placeholder="Interest %"><input id="financeLoanDue" type="number" min="1" max="31" placeholder="Due day"><button class="btn blue" data-act="finance-add-loan">Add loan</button></div></section><div class="finance-loan-grid">'+(cards||'<div class="finance-empty">No loans recorded.</div>')+'</div>';
}
function financeStatements(){
  var pending="";
  if(financePendingImport){pending='<section class="finance-panel"><div class="finance-panel-head"><div><span>REVIEW BEFORE IMPORT</span><h3>'+esc(financePendingImport.name)+'</h3></div><b>'+financePendingImport.items.length+' detected</b></div><div class="finance-import-preview">'+financePendingImport.items.slice(0,20).map(function(t){return '<div><span>'+esc(t.date)+'</span><strong>'+esc(t.description)+'</strong><b class="'+(t.type==="income"?'income':'expense')+'">'+(t.type==="income"?'+':'-')+financeMoney(t.amount)+'</b></div>';}).join("")+'</div><div class="finance-actions"><button class="btn blue" data-act="finance-import-confirm">Import transactions</button><button class="btn" data-act="finance-import-cancel">Cancel</button></div></section>';}
  var history=financeState.statements.slice().sort(function(a,b){return b.importedAt-a.importedAt;}).map(function(s){return '<div class="finance-statement"><div><strong>'+esc(s.name)+'</strong><span>'+new Date(s.importedAt).toLocaleString("en-IN")+' - '+s.count+' imported'+(s.skipped?' - '+s.skipped+' duplicates skipped':'')+'</span></div><button class="iconbtn finance-delete" data-act="finance-delete-statement" data-id="'+esc(s.id)+'" aria-label="Delete statement record">&times;</button></div>';}).join("");
  return '<section class="finance-upload"><span aria-hidden="true">&#8682;</span><h3>Import bank or card statement</h3><p>Upload CSV, TXT or a text-based PDF. GameVault detects dates, descriptions, debit/credit amounts and categories locally in your browser. Review the detected entries before importing.</p><button class="btn blue" data-act="finance-pick-statement">Choose statement</button><input id="financeStatementFile" type="file" accept=".csv,.txt,.pdf,text/csv,text/plain,application/pdf" hidden><small>Scanned-image PDFs cannot be read. Export CSV from your bank whenever possible for the most reliable result.</small></section>'+pending+'<section class="finance-panel"><div class="finance-panel-head"><div><span>IMPORT LOG</span><h3>Statements</h3></div></div>'+(history||'<div class="finance-empty">No statements imported yet.</div>')+'</section>';
}
function renderFinance(){
  if(!financeUnlocked())return financeLockScreen();
  financeTouch();
  var body=financeTab==="financetransactions"?financeTransactions():financeTab==="financeloans"?financeLoans():financeTab==="financestatements"?financeStatements():financeOverview();
  return '<div class="finance-private-note"><span>&#128274; Encrypted vault unlocked</span><div>'+(phoneUi()?(financeFaceConfig()?'<button class="btn" data-act="finance-face-disable">Remove Face ID</button>':'<button class="btn" data-act="finance-face-enable">Enable Face ID</button>'):'')+'<button class="btn" data-act="finance-lock">Lock now</button></div></div>'+body;
}

function financeAddTransaction(){
  var date=(document.getElementById("financeTxDate")||{}).value||localISO(today()),description=((document.getElementById("financeTxDescription")||{}).value||"").trim(),amount=Number((document.getElementById("financeTxAmount")||{}).value)||0,type=(document.getElementById("financeTxType")||{}).value||"expense",category=(document.getElementById("financeTxCategory")||{}).value||"Other",account=((document.getElementById("financeTxAccount")||{}).value||"").trim();
  if(!description||amount<=0){flash("Enter a description and amount");return;}
  financeState.transactions.unshift({id:uid(),date:date,description:description,amount:amount,type:type,category:category,account:account||"Manual",source:"manual",createdAt:Date.now()});financeSave("Transaction added");
}
function financeAddLoan(){
  function val(id){return Number((document.getElementById(id)||{}).value)||0;}var name=((document.getElementById("financeLoanName")||{}).value||"").trim();
  if(!name){flash("Enter a loan name");return;}var principal=val("financeLoanPrincipal"),balance=val("financeLoanBalance")||principal;
  financeState.loans.unshift({id:uid(),name:name,lender:((document.getElementById("financeLoanLender")||{}).value||"").trim(),principal:principal,balance:balance,emi:val("financeLoanEmi"),rate:val("financeLoanRate"),dueDay:val("financeLoanDue"),status:"active",createdAt:Date.now()});financeSave("Loan added");
}
function financeParseDate(value){
  var s=String(value||"").trim().replace(/\./g,"/").replace(/-/g,"/");if(!s)return "";
  var m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(m){var y=Number(m[3]);if(y<100)y+=2000;return y+"-"+String(m[2]).padStart(2,"0")+"-"+String(m[1]).padStart(2,"0");}
  var d=new Date(value);return isNaN(d.getTime())?"":d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function financeCsvRows(text){
  var first=(text.split(/\r?\n/)[0]||""),delimiter=(first.match(/\t/g)||[]).length>(first.match(/,/g)||[]).length?"\t":",";
  var rows=[],row=[],field="",quoted=false;for(var i=0;i<text.length;i++){var ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(ch===delimiter&&!quoted){row.push(field.trim());field="";}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(field.trim());if(row.some(Boolean))rows.push(row);row=[];field="";}else field+=ch;}row.push(field.trim());if(row.some(Boolean))rows.push(row);return rows;
}
function financeNumber(value){var s=String(value||"").replace(/[₹$,\s]/g,"").replace(/\(([^)]+)\)/,"-$1");var n=Number(s);return Number.isFinite(n)?n:0;}
function financeRowsToTransactions(rows,name){
  if(rows.length<2)return [];
  var headers=rows[0].map(function(x){return String(x).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();});
  function col(pattern){for(var i=0;i<headers.length;i++)if(pattern.test(headers[i]))return i;return -1;}
  var di=col(/^(transaction )?date$|value date|posting date/),desc=col(/description|narration|details|particular|merchant|remarks/),debit=col(/debit|withdrawal|spent/),credit=col(/credit|deposit|received/),amount=col(/^amount$|transaction amount/),type=col(/^type$|dr cr/),account=col(/account|card/);
  if(di<0)di=0;if(desc<0)desc=Math.min(1,headers.length-1);
  return rows.slice(1).map(function(r){var date=financeParseDate(r[di]),description=String(r[desc]||"").trim(),debitValue=debit>=0?Math.abs(financeNumber(r[debit])):0,creditValue=credit>=0?Math.abs(financeNumber(r[credit])):0,generic=amount>=0?financeNumber(r[amount]):0,t=creditValue>0?"income":"expense",value=creditValue||debitValue||Math.abs(generic);if(type>=0&&/cr|credit|income/i.test(r[type]))t="income";else if(generic<0)t="expense";if(!date||!description||!value)return null;return {id:uid(),date:date,description:description,amount:value,type:t,category:financeCategory(description),account:account>=0&&r[account]?r[account]:name.replace(/\.[^.]+$/, ""),source:name,createdAt:Date.now()};}).filter(Boolean);
}
function financePdfTransactions(lines,name){
  var out=[];lines.forEach(function(line){var match=line.match(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\s+(.+?)\s+((?:Rs\.?|INR|\$)?\s*[\d,]+(?:\.\d{1,2})?)\s*(CR|DR)?$/i);if(!match)return;var date=financeParseDate(match[1]),description=match[2].trim(),amount=Math.abs(financeNumber(match[3])),type=/CR/i.test(match[4]||"")?"income":"expense";if(date&&description&&amount)out.push({id:uid(),date:date,description:description,amount:amount,type:type,category:financeCategory(description),account:name.replace(/\.[^.]+$/, ""),source:name,createdAt:Date.now()});});return out;
}
function financeReadPdf(file){
  return import("https://mozilla.github.io/pdf.js/build/pdf.mjs").then(function(pdfjs){pdfjs.GlobalWorkerOptions.workerSrc="https://mozilla.github.io/pdf.js/build/pdf.worker.mjs";return file.arrayBuffer().then(function(buffer){return pdfjs.getDocument({data:new Uint8Array(buffer)}).promise;}).then(async function(pdf){var lines=[];for(var p=1;p<=pdf.numPages;p++){var page=await pdf.getPage(p),content=await page.getTextContent(),groups={};content.items.forEach(function(item){var y=Math.round(item.transform[5]/3)*3;(groups[y]||(groups[y]=[])).push(item);});Object.keys(groups).sort(function(a,b){return Number(b)-Number(a);}).forEach(function(y){lines.push(groups[y].sort(function(a,b){return a.transform[4]-b.transform[4];}).map(function(x){return x.str;}).join(" ").replace(/\s+/g," ").trim());});}return lines;});});
}
function financeReadStatement(file){
  if(!file)return;financeBusy=true;render();var promise=/\.pdf$/i.test(file.name)?financeReadPdf(file).then(function(lines){return financePdfTransactions(lines,file.name);}):file.text().then(function(text){return financeRowsToTransactions(financeCsvRows(text),file.name);});
  promise.then(function(items){financeBusy=false;if(!items.length){render();flash("No transactions were detected. Try a CSV export or a text-based PDF");return;}financePendingImport={id:uid(),name:file.name,items:items};financeTab="financestatements";render();flash(items.length+" transactions detected - review before importing");}).catch(function(){financeBusy=false;render();flash("Could not read this statement. CSV is the most reliable format");});
}
function financeConfirmImport(){
  if(!financePendingImport)return;var existing={};financeState.transactions.forEach(function(t){existing[financeTransactionKey(t)]=1;});var added=0,skipped=0;
  financePendingImport.items.forEach(function(t){var key=financeTransactionKey(t);if(existing[key]){skipped++;return;}existing[key]=1;financeState.transactions.push(t);added++;});
  financeState.statements.unshift({id:financePendingImport.id,name:financePendingImport.name,importedAt:Date.now(),count:added,skipped:skipped});financePendingImport=null;financeSave(added+" transactions imported"+(skipped?"; "+skipped+" duplicates skipped":""));
}
function financeHandleAction(act,id){
  if(act==="finance-setup"){financeSetup();return true;}if(act==="finance-unlock"){financeUnlockPin();return true;}if(act==="finance-lock"){financeLock();render();return true;}
  if(act==="finance-face-enable"){financeEnableFace();return true;}if(act==="finance-face-unlock"){financeUnlockFace();return true;}if(act==="finance-face-disable"){confirmDestructive("Remove Face ID unlock from this device? Your Finance PIN will still work.","Remove Face ID",financeDisableFace);return true;}
  if(!financeUnlocked())return false;financeTouch();
  if(act==="finance-add-transaction"){financeAddTransaction();return true;}if(act==="finance-add-loan"){financeAddLoan();return true;}
  if(act==="finance-pick-statement"){var input=document.getElementById("financeStatementFile");if(input)input.click();return true;}
  if(act==="finance-import-confirm"){financeConfirmImport();return true;}if(act==="finance-import-cancel"){financePendingImport=null;render();return true;}
  if(act==="finance-delete-transaction"){var tx=financeState.transactions.filter(function(x){return x.id===id;})[0];confirmDestructive('Delete "'+(tx?tx.description:"this transaction")+'"?','Delete transaction',function(){financeState.transactions=financeState.transactions.filter(function(x){return x.id!==id;});financeSave("Transaction deleted");});return true;}
  if(act==="finance-delete-loan"){var loan=financeState.loans.filter(function(x){return x.id===id;})[0];confirmDestructive('Delete the loan record "'+(loan?loan.name:"this loan")+'"?','Delete loan',function(){financeState.loans=financeState.loans.filter(function(x){return x.id!==id;});financeSave("Loan deleted");});return true;}
  if(act==="finance-toggle-loan"){var toggle=financeState.loans.filter(function(x){return x.id===id;})[0];if(toggle){toggle.status=toggle.status==="closed"?"active":"closed";if(toggle.status==="closed")toggle.balance=0;financeSave(toggle.status==="closed"?"Loan marked paid off":"Loan reopened");}return true;}
  if(act==="finance-delete-statement"){var statement=financeState.statements.filter(function(x){return x.id===id;})[0];confirmDestructive('Delete the import record for "'+(statement?statement.name:"this statement")+'"? Imported transactions will remain.','Delete statement record',function(){financeState.statements=financeState.statements.filter(function(x){return x.id!==id;});financeSave("Statement record deleted");});return true;}
  return false;
}
function financeHandleInput(target){if(target.id==="financeSearch"){financeSearch=target.value;var pos=target.selectionStart;render();var next=document.getElementById("financeSearch");if(next){next.focus();try{next.setSelectionRange(pos,pos);}catch(e){}}return true;}return false;}
function financeHandleChange(target){
  if(target.id==="financeStatementFile"){financeReadStatement(target.files&&target.files[0]);return true;}
  if(target.id==="financeAccountFilter"){financeAccountFilter=target.value;render();return true;}
  return false;
}

document.addEventListener("pointerdown",function(){if(section==="finance"&&financeUnlocked())financeTouch();},{passive:true});
document.addEventListener("keydown",function(){if(section==="finance"&&financeUnlocked())financeTouch();},{passive:true});
