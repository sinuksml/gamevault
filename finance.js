"use strict";

/* Private finance workspace. Only the AES-GCM envelope in data.finance is
   persisted or synced; financeState exists in memory while the section is
   unlocked. */
var financeTab="financeoverview";
var financeState=null,financeKey=null,financeBusy=false,financePendingImport=null;
var financeSearch="",financeAccountFilter="",financeMerchantFilter="",financeCategoryFilter="",financeKindFilter="",financeMonthFilter="",financeYearFilter="",financeDetailGroup="",financeShowAll=false,financeLockTimer=null;
var FINANCE_FACE_STORE="gamevault-finance-face-v1";
var FINANCE_LOCK_PREF="gamevault-finance-lock-minutes";
var financePinFallback=false,financePinAttempts=0,financePinBlockedUntil=0,financeHiddenAt=0;
var FINANCE_GMAIL_SCOPE="https://www.googleapis.com/auth/gmail.readonly";
var FINANCE_GMAIL_DEFAULT_QUERY='newer_than:5y has:attachment {filename:pdf filename:csv filename:txt} {subject:"credit card statement" subject:"debit card statement" subject:"bank statement" subject:"account statement" subject:"monthly statement" subject:"e-statement" subject:estatement subject:"card bill" subject:"statement ready" subject:"your statement" subject:"monthly bill"} -subject:demat -subject:"mutual fund"';
var financeGmailToken=null,financeGmailTokenClient=null,financeGmailCandidates=[],financeAutoSyncQueued=false,financeGmailAutoBlocked=false,financeGmailSetupRequired=false;
var financeGmailStatus="",financeGmailProgress=null;

function financeDefaults(){return {version:1,transactions:[],loans:[],statements:[],gmail:{query:FINANCE_GMAIL_DEFAULT_QUERY,importedMessageIds:[],importedStatementKeys:[],retryMessageIds:[],lastSyncAt:0,lastSuccessfulSyncAt:0,lastAttemptAt:0,lastResult:"",email:"",authorized:false},updatedAt:Date.now()};}
function financeNormalize(value){
  var f=value&&typeof value==="object"&&!Array.isArray(value)?value:financeDefaults();
  if(!Array.isArray(f.transactions))f.transactions=[];
  if(!Array.isArray(f.loans))f.loans=[];
  if(!Array.isArray(f.statements))f.statements=[];
  if(!f.gmail||typeof f.gmail!=="object"||Array.isArray(f.gmail))f.gmail={};
  f.gmail.query=FINANCE_GMAIL_DEFAULT_QUERY;
  if(!Array.isArray(f.gmail.importedMessageIds))f.gmail.importedMessageIds=[];
  if(!Array.isArray(f.gmail.importedStatementKeys))f.gmail.importedStatementKeys=[];
  if(!Array.isArray(f.gmail.retryMessageIds))f.gmail.retryMessageIds=[];
  if(!Number.isFinite(Number(f.gmail.lastSyncAt)))f.gmail.lastSyncAt=0;
  if(!Number.isFinite(Number(f.gmail.lastSuccessfulSyncAt)))f.gmail.lastSuccessfulSyncAt=Number(f.gmail.lastSyncAt)||0;
  if(!Number.isFinite(Number(f.gmail.lastAttemptAt)))f.gmail.lastAttemptAt=0;
  if(typeof f.gmail.lastResult!=="string")f.gmail.lastResult="";
  if(typeof f.gmail.email!=="string")f.gmail.email="";
  f.gmail.authorized=!!f.gmail.authorized;
  f.version=1;return f;
}
function financeConfigured(){return !!(data&&data.finance&&data.finance.format==="gamevault-finance-v1"&&data.finance.cipher);}
function financeUnlocked(){return !!(financeState&&financeKey);}
function financeLockMinutes(){var value=Number(localStorage.getItem(FINANCE_LOCK_PREF)||5);return [2,5,15].indexOf(value)>-1?value:5;}
function financeTouch(){
  if(!financeUnlocked())return;
  clearTimeout(financeLockTimer);
  var minutes=financeLockMinutes();
  financeLockTimer=setTimeout(function(){if(financeBusy){financeTouch();return;}financeLock();if(section==="finance")render();flash("Finance locked after "+minutes+" minutes of inactivity");},minutes*60*1000);
}
function financeLock(silent){
  clearTimeout(financeLockTimer);financeLockTimer=null;financeState=null;financeKey=null;financePendingImport=null;financeGmailCandidates=[];financeGmailToken=null;financePinFallback=false;
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
  if(Date.now()<financePinBlockedUntil){flash("Wait "+Math.ceil((financePinBlockedUntil-Date.now())/1000)+" seconds before trying again");return;}
  var pin=(document.getElementById("financePin")||{}).value||"";
  if(!/^\d{6}$/.test(pin)){flash("Enter your 6-digit Finance PIN");return;}
  financeBusy=true;render();var envelope=data.finance;
  financeKeyFromPin(pin,b64ToBytes(envelope.salt)).then(function(key){return financeDecrypt(envelope,key).then(function(state){financeKey=key;financeState=state;});}).then(function(){
    financeBusy=false;financePinAttempts=0;financePinBlockedUntil=0;financeTouch();render();flash("Finance unlocked");
  }).catch(function(){financeBusy=false;financeLock(true);financePinFallback=true;financePinAttempts++;if(financePinAttempts>=3)financePinBlockedUntil=Date.now()+Math.min(30000,(financePinAttempts-2)*5000);render();flash(financePinBlockedUntil>Date.now()?"Incorrect PIN. Try again in "+Math.ceil((financePinBlockedUntil-Date.now())/1000)+" seconds":"Incorrect Finance PIN");});
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
function financeFaceAvailable(){return !!(window.PublicKeyCredential&&navigator.credentials);}
function financeShouldAutoUnlock(){return financeConfigured()&&!financeUnlocked()&&!financeBusy&&!!financeFaceConfig()&&financeFaceAvailable();}
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
  financeBusy=true;var prfSalt=financeRandom(32),userId=financeRandom(16),created,createRequest;
  try{createRequest=navigator.credentials.create({publicKey:{challenge:financeRandom(32),rp:{name:"Sinu Game Vault"},user:{id:userId,name:"sinu-finance",displayName:"Sinu Finance"},pubKeyCredParams:[{type:"public-key",alg:-7},{type:"public-key",alg:-257}],authenticatorSelection:{authenticatorAttachment:"platform",residentKey:"preferred",userVerification:"required"},timeout:60000,attestation:"none",extensions:{prf:{eval:{first:prfSalt}}}}});}catch(err){createRequest=Promise.reject(err);}render();
  createRequest.then(function(credential){
    created=credential;var direct=financePrfOutput(credential);return direct||financeGetPrf(financeB64Url(new Uint8Array(credential.rawId)),prfSalt);
  }).then(function(prf){
    return Promise.all([crypto.subtle.importKey("raw",prf,{name:"AES-GCM"},false,["encrypt"]),crypto.subtle.exportKey("raw",financeKey)]);
  }).then(function(parts){
    var iv=financeRandom(12);return crypto.subtle.encrypt({name:"AES-GCM",iv:iv},parts[0],parts[1]).then(function(wrapped){
      var cfg={credentialId:financeB64Url(new Uint8Array(created.rawId)),salt:bytesToB64(prfSalt),iv:bytesToB64(iv),wrappedKey:bytesToB64(new Uint8Array(wrapped)),vaultSalt:data.finance.salt,enabledAt:Date.now()};
      localStorage.setItem(FINANCE_FACE_STORE,JSON.stringify(cfg));financeBusy=false;financeTouch();render();flash("Face ID unlock enabled on this device");
    });
  }).catch(function(err){financeBusy=false;render();flash(err&&err.name==="NotAllowedError"?"Face ID setup was cancelled":"Face ID secure unlock is unavailable here; use the PIN");});
}
function financeUnlockFace(){
  var cfg=financeFaceConfig();if(!cfg){flash("Unlock with PIN, then enable Face ID on this device");return;}
  if(cfg.vaultSalt&&cfg.vaultSalt!==data.finance.salt){localStorage.removeItem(FINANCE_FACE_STORE);financePinFallback=true;render();flash("Finance vault changed. Unlock with PIN and enable Face ID again");return;}
  financeBusy=true;var prfSalt=b64ToBytes(cfg.salt),unlockRequest;try{unlockRequest=financeGetPrf(cfg.credentialId,prfSalt);}catch(err){unlockRequest=Promise.reject(err);}render();
  unlockRequest.then(function(prf){return crypto.subtle.importKey("raw",prf,{name:"AES-GCM"},false,["decrypt"]);}).then(function(wrapKey){
    return crypto.subtle.decrypt({name:"AES-GCM",iv:b64ToBytes(cfg.iv)},wrapKey,b64ToBytes(cfg.wrappedKey));
  }).then(function(rawKey){return crypto.subtle.importKey("raw",rawKey,{name:"AES-GCM"},true,["encrypt","decrypt"]);}).then(function(key){
    return financeDecrypt(data.finance,key).then(function(state){financeKey=key;financeState=state;});
  }).then(function(){financeBusy=false;financePinFallback=false;financePinAttempts=0;financeTouch();render();flash("Finance unlocked with Face ID");}).catch(function(err){financeBusy=false;financeLock(true);financePinFallback=true;render();if(err&&err.name==="NotAllowedError")flash("Face ID was cancelled. Use Face ID again or unlock with PIN");else if(err&&(/not supported|unavailable|extension/i.test(String(err.message||""))||err.name==="NotSupportedError"))flash("Secure Face ID unlock is unavailable in this browser. Use your PIN");else flash("This Face ID credential could not unlock the vault. Use your PIN");});
}
function financeDisableFace(){try{localStorage.removeItem(FINANCE_FACE_STORE);}catch(e){}render();flash("Face ID unlock removed from this device");}

function financeMoney(value){return fmtMoney(Math.round((Number(value)||0)*100)/100);}
function financeMonthKey(date){return String(date||"").slice(0,7);}
function financeCurrentMonth(){var d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");}
function financeMonthLabel(key){if(!/^\d{4}-\d{2}$/.test(key||""))return "All months";return new Date(Number(key.slice(0,4)),Number(key.slice(5))-1,1).toLocaleDateString("en-IN",{month:"long",year:"numeric"});}
function financePreviousMonth(key){var d=new Date(Number(key.slice(0,4)),Number(key.slice(5))-2,1);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");}
function financeCategories(){return ["Petrol","Groceries","Shopping","Dining","Bills & Utilities","Subscriptions","Travel","Healthcare","EMI & Loans","Insurance","Rent","Education","Entertainment","Transfers","Other"];}
function financeCategory(description){
  var d=String(description||"").toLowerCase();
  var rules=[
    ["EMI & Loans",/\b(emi|loan instal|loan installment|bajaj fin|credila|home loan|personal loan)\b/],["Subscriptions",/\b(subscription|netflix|prime video|hotstar|jiohotstar|sony ?liv|zee5|spotify|youtube premium|icloud|google one|adobe)\b/],
    ["Petrol",/\b(fuel|petrol|diesel|indian oil|bharat petroleum|hpcl|shell)\b/],["Groceries",/\b(supermarket|grocery|groceries|bigbasket|blinkit|zepto|jiomart|dmart|lulu hyper|reliance fresh)\b/],
    ["Dining",/\b(swiggy|zomato|restaurant|cafe|coffee|bakery|food delivery|dining)\b/],["Bills & Utilities",/\b(electricity|water bill|gas bill|broadband|internet bill|mobile bill|recharge|utility|kseb|bsnl|jio fiber|airtel)\b/],
    ["Travel",/\b(uber|ola|rapido|metro|railway|irctc|flight|airways|airlines|hotel|booking\.com|makemytrip|toll|fastag)\b/],["Shopping",/\b(amazon|flipkart|myntra|ajio|shopping|store|retail|meesho|nykaa)\b/],
    ["Healthcare",/\b(hospital|clinic|pharmacy|medical|apollo|doctor|diagnostic|laboratory|medplus|netmeds|1mg)\b/],["Insurance",/\b(insurance|lic premium|policy premium)\b/],
    ["Rent",/\b(rent|house lease|maintenance charge)\b/],["Education",/\b(school|college|course|tuition|udemy|coursera)\b/],["Entertainment",/\b(cinema|bookmyshow|playstation|steam|xbox|theatre)\b/],
    ["Transfers",/\b(neft|imps|upi transfer|fund transfer|self transfer|credit card payment|card payment)\b/]
  ];
  for(var i=0;i<rules.length;i++)if(rules[i][1].test(d))return rules[i][0];return "Other";
}
function financeKind(t){
  if(t.kind)return t.kind;var d=String((t.description||"")+" "+(t.status||"")).toLowerCase();
  if(/failed|declined|unsuccessful|cancelled/.test(d))return "failed";
  if(/reversal|reversed/.test(d))return "reversal";
  if(/refund|refunded|cashback/.test(d))return "refund";
  if(t.category==="Transfer"||t.category==="Transfers"||/credit card payment|card bill payment|self transfer|own account|fund transfer/.test(d))return "transfer";
  return t.type==="income"?"income":"expense";
}
function financeMerchant(value){
  var d=String(value||"").replace(/\b(?:upi|neft|imps|pos|debit card|credit card|txn|transaction|payment|purchase|paid|debited|credited|ref|reference)\b/ig," ").replace(/[\d*Xx]{4,}/g," ").replace(/[^A-Za-z0-9 &'._-]+/g," ").replace(/\s+/g," ").trim();
  return (d||"Unknown merchant").slice(0,48);
}
function financeNormalizeTransaction(t){t=t||{};var category=t.category||financeCategory(t.description),legacy={"Food":"Dining","Housing":"Bills & Utilities","Transport":"Travel","Health":"Healthcare","Loan / EMI":"EMI & Loans","Transfer":"Transfers"};return {id:t.id,date:t.date||"",description:t.description||"Transaction",amount:Math.abs(Number(t.amount)||0),type:t.type||"expense",kind:financeKind(t),category:legacy[category]||category,merchant:t.merchant||financeMerchant(t.description),account:t.account||"Unknown account",reference:t.reference||"",source:t.source||"",createdAt:t.createdAt||0,gmailMessageId:t.gmailMessageId||""};}
function financeTransactionKey(t){t=financeNormalizeTransaction(t);return t.reference?"ref|"+String(t.reference).toLowerCase():[t.date,t.merchant.toLowerCase(),t.amount.toFixed(2),t.kind,t.account.toLowerCase()].join("|");}
function financeMonthStats(month){
  var out={month:month,credits:0,spent:0,refunds:0,netSpent:0,net:0,categories:{},merchants:{},merchantCount:{},count:0,ignored:0};
  (financeState.transactions||[]).forEach(function(raw){var t=financeNormalizeTransaction(raw);if(financeMonthKey(t.date)!==month)return;if(t.kind==="failed"||t.kind==="transfer"){out.ignored++;return;}if(t.kind==="income")out.credits+=t.amount;else if(t.kind==="refund"||t.kind==="reversal")out.refunds+=t.amount;else{out.spent+=t.amount;out.categories[t.category]=(out.categories[t.category]||0)+t.amount;out.merchants[t.merchant]=(out.merchants[t.merchant]||0)+t.amount;out.merchantCount[t.merchant]=(out.merchantCount[t.merchant]||0)+1;}out.count++;});
  out.netSpent=Math.max(0,out.spent-out.refunds);out.net=out.credits-out.netSpent;return out;
}
function financeTop(map){var rows=Object.keys(map||{}).map(function(k){return [k,map[k]];}).sort(function(a,b){return b[1]-a[1];});return rows[0]||["None",0];}
function financeSelectedMonth(){return financeMonthFilter||financeCurrentMonth();}
function financeSummary(){var month=financeSelectedMonth(),s=financeMonthStats(month),p=financeMonthStats(financePreviousMonth(month)),topCategory=financeTop(s.categories),topMerchant=financeTop(s.merchants),change=p.netSpent?((s.netSpent-p.netSpent)/p.netSpent*100):(s.netSpent?100:0),active=(financeState.loans||[]).filter(function(x){return x.status!=="closed";}),emi=active.reduce(function(a,x){return a+(Number(x.emi)||0);},0),balance=active.reduce(function(a,x){return a+(Number(x.balance)||0);},0);s.previous=p; s.change=change;s.topCategory=topCategory;s.topMerchant=topMerchant;s.emi=emi;s.balance=balance;return s;}
function financeMonths(count){var keys=[],now=new Date();for(var i=count-1;i>=0;i--){var d=new Date(now.getFullYear(),now.getMonth()-i,1);keys.push(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"));}return keys;}
function financeMonthlyChart(){
  var keys=financeMonths(12),stats=keys.map(financeMonthStats),max=Math.max.apply(null,stats.map(function(x){return Math.max(x.netSpent,x.credits);}).concat([1]));
  return '<div class="finance-comparison-chart" aria-label="Credits and spending by month">'+stats.map(function(s){var spent=Math.max(2,Math.round(s.netSpent/max*100)),credit=Math.max(2,Math.round(s.credits/max*100)),label=new Date(Number(s.month.slice(0,4)),Number(s.month.slice(5))-1,1).toLocaleDateString("en-GB",{month:"short"});return '<button data-act="finance-select-month" data-id="'+s.month+'" title="'+esc(financeMonthLabel(s.month))+': spent '+esc(financeMoney(s.netSpent))+', credited '+esc(financeMoney(s.credits))+'"><span><i class="spent" style="height:'+spent+'%"></i><i class="credit" style="height:'+credit+'%"></i></span><b>'+label+'</b></button>';}).join("")+'</div><div class="finance-chart-key"><span><i class="spent"></i>Spent</span><span><i class="credit"></i>Credited</span></div>';
}
function financeCategoryChart(month){
  var stats=financeMonthStats(month),rows=Object.keys(stats.categories).map(function(k){return [k,stats.categories[k]];}).sort(function(a,b){return b[1]-a[1];}),max=rows.length?rows[0][1]:1;
  if(!rows.length)return '<div class="finance-empty">No counted expenses were found for this month.</div>';
  return rows.slice(0,9).map(function(row){return '<button class="finance-category-row" data-act="finance-open-category" data-id="'+esc(row[0])+'"><div><span>'+esc(row[0])+'</span><b>'+financeMoney(row[1])+'</b></div><i><span style="width:'+Math.round(row[1]/max*100)+'%"></span></i></button>';}).join("");
}
function financeRecurring(){
  var groups={};(financeState.transactions||[]).forEach(function(raw){var t=financeNormalizeTransaction(raw);if(t.kind!=="expense")return;var key=t.merchant.toLowerCase();(groups[key]||(groups[key]={merchant:t.merchant,category:t.category,items:[]})).items.push(t);});
  return Object.keys(groups).map(function(k){var g=groups[k],months={};g.items.forEach(function(t){months[financeMonthKey(t.date)]=1;});if(Object.keys(months).length<2)return null;g.items.sort(function(a,b){return String(a.date).localeCompare(String(b.date));});var latest=g.items[g.items.length-1],prior=g.items.slice(0,-1),avg=prior.length?prior.reduce(function(a,t){return a+t.amount;},0)/prior.length:latest.amount,next=new Date(latest.date+"T00:00:00");next.setDate(next.getDate()+30);g.amount=latest.amount;g.average=avg;g.increased=prior.length&&latest.amount>avg*1.1;g.nextDate=localISO(next);g.count=g.items.length;return g;}).filter(Boolean).sort(function(a,b){return String(a.nextDate).localeCompare(String(b.nextDate));});
}
function financeUnusual(month){var items=(financeState.transactions||[]).map(financeNormalizeTransaction).filter(function(t){return financeMonthKey(t.date)===month&&t.kind==="expense";}),avg=items.length?items.reduce(function(a,t){return a+t.amount;},0)/items.length:0;return items.filter(function(t){return t.amount>=Math.max(avg*2.5,10000);}).sort(function(a,b){return b.amount-a.amount;}).slice(0,5);}
function financeLockScreen(){
  var configured=financeConfigured(),face=financeFaceConfig(),showPin=!face||financePinFallback;
  if(!configured)return '<section class="finance-auth"><span class="finance-lock-icon">&#8377;</span><h2>Create private Finance vault</h2><p>Your statements, transactions and loans are encrypted before they enter local storage or Google Drive. Create a six-digit recovery PIN.</p><div class="finance-pin-row"><input id="financePinNew" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="6-digit PIN"><input id="financePinAgain" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="Confirm PIN"><button class="btn blue" data-act="finance-setup"'+(financeBusy?' disabled':'')+'>'+(financeBusy?'Creating...':'Create vault')+'</button></div><small>Do not forget this PIN. GameVault cannot recover encrypted finance data without it.</small></section>';
  return '<section class="finance-auth"><span class="finance-lock-icon">&#128274;</span><h2>Finance is locked</h2><p>Unlock the encrypted vault to view statements, expenses and loans.</p>'+(face?'<button class="btn blue finance-face-btn" data-act="finance-face-unlock"'+(financeBusy?' disabled':'')+'>'+(financeBusy?'Checking Face ID...':'Unlock with Face ID')+'</button>':'')+(face&&!showPin?'<button class="btn finance-pin-fallback" data-act="finance-pin-show">Use recovery PIN instead</button>':'')+(showPin?'<div class="finance-pin-row"><input id="financePin" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password" placeholder="6-digit PIN"><button class="btn blue" data-act="finance-unlock"'+(financeBusy?' disabled':'')+'>'+(financeBusy?'Unlocking...':'Unlock')+'</button></div>':'')+'<small>Encrypted finance data is synced with your normal GameVault backup. The PIN and biometric data are never stored or uploaded.</small></section>';
}
function financeOverview(){
  var s=financeSummary(),month=financeSelectedMonth(),change=(s.change>0?"+":"")+s.change.toFixed(1)+"%",frequent=financeTop(s.merchantCount),unusual=financeUnusual(month),recurring=financeRecurring().slice(0,4),last=(financeState.gmail&&financeState.gmail.lastSyncAt)?new Date(financeState.gmail.lastSyncAt).toLocaleString("en-IN"):"Never";
  return '<div class="finance-dashboard-toolbar"><div><label>Month<input id="financeOverviewMonth" type="month" value="'+esc(month)+'"></label><span>Gmail updated '+esc(last)+'</span></div><button class="btn blue" data-act="finance-gmail-sync"'+(financeBusy?' disabled':'')+'>'+(financeBusy?'Refreshing...':'Refresh Gmail')+'</button></div><section class="finance-summary finance-summary-rich">'+
    '<button data-act="finance-open-kind" data-id="income"><span>Total credited</span><strong class="positive">'+financeMoney(s.credits)+'</strong><small>'+s.count+' accepted records</small></button>'+
    '<button data-act="finance-open-kind" data-id="expense"><span>Total spent</span><strong>'+financeMoney(s.netSpent)+'</strong><small>'+financeMoney(s.refunds)+' refunds deducted</small></button>'+
    '<button data-act="finance-open-kind" data-id="net"><span>Net cash flow</span><strong class="'+(s.net>=0?'positive':'negative')+'">'+(s.net>=0?'+':'-')+financeMoney(Math.abs(s.net))+'</strong><small>credits minus spending</small></button>'+
    '<button data-act="finance-select-month" data-id="'+financePreviousMonth(month)+'"><span>Previous month</span><strong class="'+(s.change<=0?'positive':'negative')+'">'+esc(change)+'</strong><small>'+financeMoney(s.previous.netSpent)+' spent</small></button>'+
    '<button data-act="finance-open-category" data-id="'+esc(s.topCategory[0])+'"><span>Highest category</span><strong>'+esc(s.topCategory[0])+'</strong><small>'+financeMoney(s.topCategory[1])+'</small></button>'+
    '<button data-act="finance-open-merchant" data-id="'+esc(s.topMerchant[0])+'"><span>Top merchant</span><strong>'+esc(s.topMerchant[0])+'</strong><small>'+financeMoney(s.topMerchant[1])+'</small></button>'+
    '<button data-act="finance-open-emi"><span>EMI this month</span><strong>'+financeMoney(s.emi)+'</strong><small>'+financeMoney(s.balance)+' remaining</small></button>'+
    '<button data-act="finance-open-merchant" data-id="'+esc(frequent[0])+'"><span>Most used merchant</span><strong>'+esc(frequent[0])+'</strong><small>'+frequent[1]+' transactions</small></button></section>'+
    '<div class="finance-grid"><section class="finance-panel finance-wide"><div class="finance-panel-head"><div><span>12-MONTH VIEW</span><h3>Credits versus spending</h3></div><b>'+esc(financeMonthLabel(month))+'</b></div>'+financeMonthlyChart()+'</section>'+
    '<section class="finance-panel"><div class="finance-panel-head"><div><span>WHERE IT WENT</span><h3>Category spending</h3></div></div>'+financeCategoryChart(month)+'</section>'+
    '<section class="finance-panel"><div class="finance-panel-head"><div><span>WATCHLIST</span><h3>Large transactions</h3></div></div>'+(unusual.length?unusual.map(function(t){return '<button class="finance-mini-row" data-act="finance-show-transaction" data-id="'+esc(t.id)+'"><div><strong>'+esc(t.merchant)+'</strong><span>'+esc(t.date)+'</span></div><b>'+financeMoney(t.amount)+'</b></button>';}).join(""):'<div class="finance-empty">No unusually large expenses this month.</div>')+'</section>'+
    '<section class="finance-panel finance-wide"><div class="finance-panel-head"><div><span>RECURRING</span><h3>Upcoming and changed payments</h3></div><button class="btn" data-act="finance-open-emi">View all</button></div><div class="finance-recurring-strip">'+(recurring.length?recurring.map(function(r){return '<article class="'+(r.increased?'warning':'')+'"><span>'+esc(r.category)+'</span><strong>'+esc(r.merchant)+'</strong><b>'+financeMoney(r.amount)+'</b><small>'+(r.increased?'Amount increased':'Expected around '+esc(r.nextDate))+'</small></article>';}).join(""):'<div class="finance-empty">Recurring payments appear after two monthly occurrences.</div>')+'</div></section></div>';
}
function financeFilteredTransactions(){
  var q=String(financeSearch||"").toLowerCase();return financeState.transactions.map(financeNormalizeTransaction).filter(function(t){return (!q||[t.description,t.category,t.account,t.merchant,t.date].join(" ").toLowerCase().indexOf(q)>-1)&&(!financeAccountFilter||t.account===financeAccountFilter)&&(!financeMerchantFilter||t.merchant===financeMerchantFilter)&&(!financeCategoryFilter||t.category===financeCategoryFilter)&&(!financeKindFilter||t.kind===financeKindFilter)&&(!financeMonthFilter||financeMonthKey(t.date)===financeMonthFilter)&&(!financeYearFilter||String(t.date).slice(0,4)===financeYearFilter);}).sort(function(a,b){return String(b.date).localeCompare(String(a.date))||Number(b.createdAt||0)-Number(a.createdAt||0);});
}
function financeOptions(values,selected,allLabel){return '<option value="">'+esc(allLabel)+'</option>'+values.map(function(x){return '<option'+(x===selected?' selected':'')+'>'+esc(x)+'</option>';}).join("");}
function financeTransactions(){
  var items=financeFilteredTransactions(),accounts={},merchants={},years={},groups={};financeState.transactions.map(financeNormalizeTransaction).forEach(function(t){accounts[t.account]=1;merchants[t.merchant]=1;if(t.date)years[String(t.date).slice(0,4)]=1;});items.forEach(function(t){var key=t.category;(groups[key]||(groups[key]={amount:0,items:[]})).items.push(t);if(t.kind==="expense")groups[key].amount+=t.amount;else if(t.kind==="refund"||t.kind==="reversal")groups[key].amount-=t.amount;});
  function row(t){var sign=t.kind==="income"||t.kind==="refund"||t.kind==="reversal"?"+":"-";return '<tr><td>'+esc(t.date)+'</td><td><strong>'+esc(t.merchant)+'</strong><small>'+esc(t.description)+' · '+esc(t.account)+'</small></td><td><span class="finance-cat">'+esc(t.category)+'</span><small>'+esc(t.kind.replace(/_/g," "))+'</small></td><td class="finance-amount '+(sign==="+"?'income':'expense')+'">'+sign+financeMoney(t.amount)+'</td><td><button class="iconbtn finance-delete" data-act="finance-delete-transaction" data-id="'+esc(t.id)+'" title="Delete imported record" aria-label="Delete imported record">&times;</button></td></tr>';}
  var cards=Object.keys(groups).sort(function(a,b){return groups[b].amount-groups[a].amount;}).map(function(name){var g=groups[name],open=financeShowAll||financeDetailGroup===name;return '<article class="finance-detail-group '+(open?'open':'')+'"><button data-act="finance-toggle-detail" data-id="'+esc(name)+'"><span><strong>'+esc(name)+'</strong><small>'+g.items.length+' transaction'+(g.items.length===1?'':'s')+'</small></span><b>'+financeMoney(Math.max(0,g.amount))+'</b><i>'+ (open?'Hide':'View details')+'</i></button>'+(open?'<div class="finance-table-wrap"><table class="finance-table"><tbody>'+g.items.map(row).join("")+'</tbody></table></div>':'')+'</article>';}).join("");
  return '<div class="finance-filter-bar"><div class="searchwrap"><span class="sic">&#8981;</span><input id="financeSearch" value="'+esc(financeSearch)+'" placeholder="Search merchant or description"></div><input id="financeMonthFilter" type="month" value="'+esc(financeMonthFilter)+'"><select id="financeYearFilter">'+financeOptions(Object.keys(years).sort().reverse(),financeYearFilter,"All years")+'</select><select id="financeAccountFilter">'+financeOptions(Object.keys(accounts).sort(),financeAccountFilter,"All accounts / cards")+'</select><select id="financeMerchantFilter">'+financeOptions(Object.keys(merchants).sort(),financeMerchantFilter,"All merchants")+'</select><select id="financeCategoryFilter">'+financeOptions(financeCategories(),financeCategoryFilter,"All categories")+'</select><select id="financeKindFilter">'+financeOptions(["expense","income","refund","reversal","transfer","failed"],financeKindFilter,"All statuses")+'</select><button class="btn" data-act="finance-clear-filters">Clear filters</button></div><div class="finance-details-head"><div><span>STATEMENT RECORDS</span><h3>Monthly details</h3><p>Transactions extracted from statements stay collapsed until you open a category.</p></div><button class="btn" data-act="finance-toggle-all-details">'+(financeShowAll?'Collapse all':'Show all transactions')+'</button></div><section class="finance-detail-list">'+(cards||'<div class="finance-empty">No statement transactions match these filters.</div>')+'</section>';
}
function financeLoans(){
  var todayKey=localISO(today()),cards=financeState.loans.slice().sort(function(a,b){return (a.status==="closed")-(b.status==="closed");}).map(function(x){var original=Number(x.principal)||0,balance=Number(x.balance)||0,paid=Number(x.paidInstallments)||0,total=Number(x.totalInstallments)||0,pending=Number(x.pendingInstallments)||(total?Math.max(0,total-paid):0),pct=total?Math.round(paid/total*100):(original?Math.round((original-balance)/original*100):0),due=x.nextDueDate||((x.dueDay||"")+" of each month");return '<article class="finance-loan '+(x.status==="closed"?'closed':'')+'"><div class="finance-loan-head"><div><span>'+esc(x.lender||"Detected loan")+'</span><h3>'+esc(x.name||"EMI payment")+'</h3></div><span class="finance-auto-badge">Gmail</span></div><strong>'+financeMoney(x.emi)+'</strong><small>per instalment</small><div class="finance-loan-track"><i style="width:'+Math.max(0,Math.min(100,pct))+'%"></i></div><div class="finance-loan-meta"><span>Remaining <b>'+financeMoney(balance)+'</b></span><span>Paid <b>'+paid+(total?' / '+total:'')+'</b></span><span>Pending <b>'+pending+'</b></span><span>Next due <b>'+esc(String(due||"Not detected"))+'</b></span><span>Completion <b>'+esc(x.completionDate||"Not detected")+'</b></span><span>Last paid <b>'+esc(x.lastPaymentDate||"Not detected")+'</b></span></div></article>';}).join(""),recurring=financeRecurring();
  return '<div class="finance-section-intro"><div><span>AUTOMATIC TRACKING</span><h3>EMI and recurring payments</h3><p>Built from credit-card and bank statement transactions. No manual liability entry is required.</p></div><button class="btn blue" data-act="finance-gmail-sync">Refresh statements</button></div><div class="finance-loan-grid">'+(cards||'<div class="finance-empty">No EMI schedule has been detected yet.</div>')+'</div><section class="finance-panel"><div class="finance-panel-head"><div><span>RECURRING EXPENSES</span><h3>Subscriptions, bills, insurance and rent</h3></div></div><div class="finance-recurring-list">'+(recurring.length?recurring.map(function(r){var due=r.nextDate>=todayKey&&r.nextDate<=localISO(new Date(Date.now()+7*86400000));return '<article class="'+(r.increased?'warning ':'')+(due?'due':'')+'"><div><span>'+esc(r.category)+'</span><strong>'+esc(r.merchant)+'</strong><small>'+r.count+' detected payments</small></div><b>'+financeMoney(r.amount)+'</b><span>'+(r.increased?'Increased from '+financeMoney(r.average):'Expected '+esc(r.nextDate))+'</span></article>';}).join(""):'<div class="finance-empty">Recurring expenses appear after the same merchant is detected in at least two months.</div>')+'</div></section>';
}
function financeGmailConnected(){return !!(financeGmailToken&&financeGmailToken.access_token&&Date.now()<financeGmailToken.expiresAt-60000);}
function financeGmailSetupUrl(){var project=String(gdClientId()||"").split("-")[0];return "https://console.cloud.google.com/apis/library/gmail.googleapis.com"+(project?"?project="+encodeURIComponent(project):"");}
function financeGmailPanel(){
  var g=financeState.gmail||{},connected=financeGmailConnected(),last=g.lastSuccessfulSyncAt?new Date(g.lastSuccessfulSyncAt).toLocaleString("en-IN"):"Never",attempt=g.lastAttemptAt?new Date(g.lastAttemptAt).toLocaleString("en-IN"):"Never";
  var state=connected?"Connected for this browser session":(g.authorized?"Previously authorized - tap Sync Gmail to reconnect":"Not connected");
  var progress=financeGmailProgress?'<div class="finance-gmail-progress" role="status"><div><span>'+esc(financeGmailProgress.stage)+'</span><b>'+financeGmailProgress.done+' / '+financeGmailProgress.total+'</b></div><i><span style="width:'+Math.round(financeGmailProgress.done/Math.max(1,financeGmailProgress.total)*100)+'%"></span></i></div>':'';
  return '<section class="finance-panel finance-gmail"><div class="finance-panel-head"><div><span>STATEMENT-ONLY DATA SOURCE</span><h3>Gmail statement synchronization</h3></div><span class="finance-gmail-state '+(connected?'on':'')+'">'+esc(state)+'</span></div><p>GameVault imports only attached credit-card statements and bank/debit-account statements. Individual debit, UPI, wallet, shopping and transaction-alert emails are ignored.</p>'+(financeGmailSetupRequired?'<div class="finance-gmail-setup"><div><strong>Gmail API setup required</strong><span>Enable Gmail API for Google Cloud project 898110284062, wait a few minutes, then refresh statements.</span></div><a class="btn blue" href="'+esc(financeGmailSetupUrl())+'" target="_blank" rel="noopener">Enable Gmail API</a></div>':'')+'<div class="finance-gmail-query"><span>Automatic statement search</span><strong>'+(g.lastSuccessfulSyncAt?'Incremental scan with a seven-day safety overlap':'Initial PDF, CSV and TXT scan from the last five years')+'</strong></div><div class="finance-actions"><button class="btn blue" data-act="finance-gmail-sync"'+(financeBusy?' disabled':'')+'>'+(financeBusy?'Checking statements...':(connected?'Refresh statements now':'Connect Gmail & scan statements'))+'</button>'+(connected?'<button class="btn" data-act="finance-gmail-disconnect">Disconnect Gmail</button>':'')+'</div>'+progress+'<div class="finance-gmail-meta"><span>Account: '+esc(g.email||"shown after connection")+'</span><span>Last successful sync: '+esc(last)+'</span><span>Last attempt: '+esc(attempt)+'</span></div>'+(financeGmailStatus?'<div class="finance-gmail-result">'+esc(financeGmailStatus)+'</div>':'')+'<details><summary>Privacy and one-time Google setup</summary><p>Enable the Gmail API in the same Google Cloud project used by GameVault. Add the Gmail read-only scope to the OAuth consent screen and, while the app is in Testing, add your Google account as a test user.</p><p>Access tokens stay only in memory and expire quickly. Raw emails and statement attachments are never saved to local storage or Drive. Only transactions extracted from statements, EMI details and Gmail message IDs enter your encrypted Finance vault.</p><p>Password-protected PDF statements cannot be read in the browser and remain available for a later retry.</p></details></section>';
}
function financeStatements(){
  var pending="";
  if(financePendingImport){var emiCount=(financePendingImport.emis||[]).length,unreadable=Number(financePendingImport.unreadableCount||0),meta=(financePendingImport.metadata||[]).map(function(m){return '<span>'+esc(m.subject)+(m.account?' · '+esc(m.account):'')+(m.period?' · '+esc(m.period):'')+(m.dueDate?' · due '+esc(m.dueDate):'')+(m.readable?'':' · retry needed')+'</span>';}).join("");pending='<section class="finance-panel"><div class="finance-panel-head"><div><span>REVIEW BEFORE IMPORT</span><h3>'+esc(financePendingImport.name)+'</h3></div><b>'+financePendingImport.items.length+' transactions'+(emiCount?' · '+emiCount+' EMI updates':'')+'</b></div>'+(meta?'<div class="finance-statement-meta">'+meta+'</div>':'')+(unreadable?'<div class="finance-gmail-result">'+unreadable+' statement attachment'+(unreadable===1?' could':'s could')+' not be read and will remain in the encrypted retry queue. Password-protected PDFs must be replaced with an unlocked PDF, CSV or TXT statement.</div>':'')+'<div class="finance-import-preview">'+financePendingImport.items.slice(0,20).map(function(t){var kind=financeKind(t),positive=kind==="income"||kind==="refund"||kind==="reversal";return '<div><span>'+esc(t.date)+'</span><strong>'+esc(t.description)+'<small>'+esc(kind.replace(/_/g," "))+'</small></strong><b class="'+(positive?'income':'expense')+'">'+(positive?'+':'-')+financeMoney(t.amount)+'</b></div>';}).join("")+(emiCount?'<div class="finance-import-emi">'+emiCount+' EMI schedule update'+(emiCount===1?'':'s')+' will be merged automatically.</div>':'')+'</div><div class="finance-actions"><button class="btn blue" data-act="finance-import-confirm">Approve and update dashboard</button><button class="btn" data-act="finance-import-cancel">Review later</button></div></section>';}
  var history=financeState.statements.slice().sort(function(a,b){return b.importedAt-a.importedAt;}).map(function(s){return '<div class="finance-statement"><div><strong>'+esc(s.name)+'</strong><span>'+new Date(s.importedAt).toLocaleString("en-IN")+' - '+s.count+' imported'+(s.skipped?' - '+s.skipped+' duplicates skipped':'')+'</span></div><button class="iconbtn finance-delete" data-act="finance-delete-statement" data-id="'+esc(s.id)+'" aria-label="Delete statement record">&times;</button></div>';}).join("");
  return financeGmailPanel()+pending+'<section class="finance-panel"><div class="finance-panel-head"><div><span>SECURE IMPORT LOG</span><h3>Statement synchronizations</h3></div></div>'+(history||'<div class="finance-empty">No Gmail statements imported yet.</div>')+'</section>';
}
function renderFinance(){
  if(!financeUnlocked())return financeLockScreen();
  financeTouch();
  if(financeGmailConnected()&&financeState.gmail&&Date.now()-Number(financeState.gmail.lastSyncAt||0)>15*60*1000&&!financeAutoSyncQueued&&!financeBusy&&!financeGmailAutoBlocked){financeAutoSyncQueued=true;setTimeout(function(){if(section==="finance"&&financeUnlocked()&&financeGmailConnected())financeGmailSync(true);else financeAutoSyncQueued=false;},400);}
  var body=financeTab==="financetransactions"?financeTransactions():financeTab==="financeloans"?financeLoans():financeTab==="financestatements"?financeStatements():financeOverview();
  var face=financeFaceConfig(),enabled=face&&face.enabledAt?new Date(face.enabledAt).toLocaleDateString("en-IN"):"";
  return '<div class="finance-private-note"><span>&#128274; Encrypted vault unlocked</span><div><details class="finance-security-menu"><summary class="btn">Security</summary><div><label>Auto-lock<select id="financeLockMinutes"><option value="2"'+(financeLockMinutes()===2?' selected':'')+'>After 2 minutes</option><option value="5"'+(financeLockMinutes()===5?' selected':'')+'>After 5 minutes</option><option value="15"'+(financeLockMinutes()===15?' selected':'')+'>After 15 minutes</option></select></label>'+(face?'<span>Face ID enabled'+(enabled?' '+esc(enabled):'')+'</span><button class="btn blue" data-act="finance-face-enable">Re-enroll Face ID</button><button class="btn" data-act="finance-face-disable">Remove Face ID</button>':'<button class="btn blue" data-act="finance-face-enable">Enable Face ID</button>')+'</div></details><button class="btn" data-act="finance-lock"'+(financeBusy?' disabled':'')+'>Lock now</button></div></div>'+body;
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
function financeGmailAuthorize(){
  if(financeGmailConnected())return Promise.resolve(financeGmailToken.access_token);
  if(typeof gdClientId!=="function"||!gdClientId())return Promise.reject(new Error("Google OAuth Client ID is not configured in Settings"));
  return gdLoadGoogleIdentity().then(function(){
    return new Promise(function(resolve,reject){
      financeGmailTokenClient=google.accounts.oauth2.initTokenClient({client_id:gdClientId(),scope:FINANCE_GMAIL_SCOPE,callback:function(resp){
        if(!resp||!resp.access_token){reject(new Error((resp&&resp.error)||"Gmail authorization failed"));return;}
        if(!google.accounts.oauth2.hasGrantedAllScopes(resp,FINANCE_GMAIL_SCOPE)){reject(new Error("Gmail read-only access was not granted"));return;}
        financeGmailToken={access_token:resp.access_token,expiresAt:Date.now()+(Number(resp.expires_in)||3600)*1000};resolve(resp.access_token);
      },error_callback:function(err){reject(new Error((err&&err.type)||"Gmail authorization was cancelled"));}});
      try{financeGmailTokenClient.requestAccessToken({prompt:financeState.gmail.authorized?"":"consent"});}catch(err){reject(err);}
    });
  });
}
function financeGmailApi(path,token){
  return fetch("https://gmail.googleapis.com/gmail/v1/users/me/"+path,{headers:{Authorization:"Bearer "+token}}).then(function(response){
    if(response.status===401){financeGmailToken=null;throw new Error("Gmail session expired - tap Sync Gmail again");}
    return response.json().then(function(json){if(!response.ok)throw new Error((json.error&&json.error.message)||("Gmail HTTP "+response.status));return json;});
  });
}
function financeGmailListMessages(query,token,pageToken,all){
  all=all||[];var path="messages?q="+encodeURIComponent(query)+"&maxResults=100"+(pageToken?"&pageToken="+encodeURIComponent(pageToken):"");
  return financeGmailApi(path,token).then(function(list){all=all.concat(list.messages||[]);if(list.nextPageToken&&all.length<2000)return financeGmailListMessages(query,token,list.nextPageToken,all);return {messages:all,resultSizeEstimate:list.resultSizeEstimate||all.length,truncated:!!list.nextPageToken};});
}
function financeGmailQuery(){
  var last=Number(financeState.gmail.lastSuccessfulSyncAt||0);if(!last)return FINANCE_GMAIL_DEFAULT_QUERY;
  var overlap=new Date(Math.max(0,last-7*86400000)),after=overlap.getFullYear()+"/"+String(overlap.getMonth()+1).padStart(2,"0")+"/"+String(overlap.getDate()).padStart(2,"0");
  return FINANCE_GMAIL_DEFAULT_QUERY.replace("newer_than:5y","after:"+after);
}
function financeMapLimit(items,limit,worker,progress){
  var next=0,done=0,out=new Array(items.length);function run(){var index=next++;if(index>=items.length)return Promise.resolve();return worker(items[index],index).then(function(value){out[index]=value;}).catch(function(err){out[index]={error:String(err&&err.message||err),id:items[index]&&items[index].id};}).then(function(){done++;if(progress)progress(done,items.length);return run();});}
  var runners=[];for(var i=0;i<Math.min(limit,items.length);i++)runners.push(run());return Promise.all(runners).then(function(){return out;});
}
function financeStatementMeta(text,meta,files){
  var all=(String(meta.subject||"")+" "+String(text||"")).replace(/\s+/g," "),account=all.match(/(?:card|account|a\/c)(?:\s+(?:number|ending|no\.?))?\s*[:*x-]*\s*([A-Za-z0-9*Xx-]{4,24})/i),period=all.match(/(?:statement|billing)\s+(?:period|month)\s*[:\-]?\s*([A-Za-z]+\s+20\d{2}|\d{1,2}[\/-]20\d{2})/i),due=all.match(/(?:payment due|due date|pay by)\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i);
  return {account:account?"ending "+account[1].replace(/[^A-Za-z0-9]/g,"").slice(-4):"",period:period?period[1]:"",dueDate:due?financeParseDate(due[1]):"",files:(files||[]).map(function(f){return f.name;})};
}
function financeStatementKey(candidate){var period=candidate.meta&&candidate.meta.period;if(!period)return "";return [candidate.from,candidate.subject,(candidate.meta&&candidate.meta.account)||"",period,(candidate.meta&&candidate.meta.files||[]).join("|")].join("|").toLowerCase().replace(/\s+/g," ").trim();}
function financeGmailDecode(value){
  var text=String(value||"").replace(/-/g,"+").replace(/_/g,"/");while(text.length%4)text+="=";
  var raw=atob(text),bytes=new Uint8Array(raw.length);for(var i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes;
}
function financeGmailHeaders(payload){
  var out={};((payload&&payload.headers)||[]).forEach(function(h){out[String(h.name||"").toLowerCase()]=h.value||"";});return out;
}
function financeGmailParts(part,messageId,token,files,textParts){
  if(!part)return Promise.resolve();
  var tasks=[];if(Array.isArray(part.parts))part.parts.forEach(function(child){tasks.push(financeGmailParts(child,messageId,token,files,textParts));});
  var body=part.body||{},filename=String(part.filename||""),mime=String(part.mimeType||"").toLowerCase();
  if(filename&&/\.(csv|txt|pdf)$/i.test(filename)&&Number(body.size||0)<=15*1024*1024){
    var bytesPromise=body.data?Promise.resolve(financeGmailDecode(body.data)):body.attachmentId?financeGmailApi("messages/"+encodeURIComponent(messageId)+"/attachments/"+encodeURIComponent(body.attachmentId),token).then(function(a){return financeGmailDecode(a.data);}):Promise.resolve(null);
    tasks.push(bytesPromise.then(function(bytes){if(bytes)files.push(new File([bytes],filename,{type:mime||"application/octet-stream"}));}));
  }else if(!filename&&body.data&&(mime==="text/plain"||mime==="text/html")){
    try{textParts.push({mime:mime,text:new TextDecoder().decode(financeGmailDecode(body.data))});}catch(e){}
  }
  return Promise.all(tasks).then(function(){});
}
function financeGmailPlainText(parts){
  var plain=parts.filter(function(x){return x.mime==="text/plain";}).map(function(x){return x.text;}).join("\n");
  if(plain)return plain;var html=parts.map(function(x){return x.text;}).join("\n");
  try{return new DOMParser().parseFromString(html,"text/html").body.textContent||"";}catch(e){return html.replace(/<[^>]+>/g," ");}
}
function financeGmailIsStatement(meta,files){return files.length>0&&/(?:credit card|debit card|bank|account|monthly|e[- ]?)?statement|estatement/i.test(meta.subject||"");}
function financeGmailAlertTransactionLegacy(text,meta){
  var all=(meta.subject+"\n"+text).replace(/\s+/g," ");
  if(/statement|invoice|bill summary/i.test(meta.subject)||!/debited|spent|purchase|paid|transaction|credited|received|deposited/i.test(all))return null;
  var amount=all.match(/(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);if(!amount)return null;
  var value=Math.abs(financeNumber(amount[1]));if(!value)return null;
  var income=/credited|received|deposited/i.test(all)&&!/debited|spent|purchase|paid/i.test(all),merchant=all.match(/(?:\bat\b|\bto\b|\bfor\b)\s+([A-Za-z0-9][A-Za-z0-9 &.'_-]{2,55})/i);
  var description=(merchant&&merchant[1]?merchant[1]:meta.subject).replace(/\s+/g," ").trim().slice(0,90)||"Gmail transaction alert";
  var d=new Date(Number(meta.internalDate)||Date.parse(meta.date)||Date.now());
  return {id:uid(),date:localISO(d),description:description,amount:value,type:income?"income":"expense",category:financeCategory(description),account:meta.from||"Gmail alert",source:"Gmail: "+meta.subject,createdAt:Date.now(),gmailMessageId:meta.id};
}
function financeGmailAlertTransaction(text,meta){
  var all=(meta.subject+"\n"+text).replace(/\s+/g," ");
  if(/statement available|monthly statement/i.test(meta.subject)||!/debited|spent|purchase|paid|transaction|credited|received|deposited|refund|reversal|failed|declined|emi/i.test(all))return null;
  var amount=all.match(/(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);if(!amount)return null;
  var value=Math.abs(financeNumber(amount[1]));if(!value)return null;
  var kind=/failed|declined|unsuccessful/i.test(all)?"failed":/reversal|reversed/i.test(all)?"reversal":/refund|refunded|cashback/i.test(all)?"refund":/credit card (?:bill )?payment|card payment|self transfer|own account/i.test(all)?"transfer":/credited|received|deposited/i.test(all)&&!/debited|spent|purchase/i.test(all)?"income":"expense";
  var merchantMatch=all.match(/(?:\bat\b|\bto\b|\bfor\b|merchant[:\s]+|towards[:\s]+)\s*([A-Za-z0-9][A-Za-z0-9 &.'_-]{2,55}?)(?=\s+(?:on|using|via|ref|reference|txn|transaction|from|card|account|UPI)\b|[.,]|$)/i),description=(merchantMatch&&merchantMatch[1]?merchantMatch[1]:meta.subject).replace(/\s+/g," ").trim().slice(0,100)||"Gmail transaction alert";
  var accountMatch=all.match(/(?:account|a\/c|card)(?:\s+(?:number|ending|no\.?))?\s*[:*x-]*\s*([A-Za-z0-9*Xx-]{4,24})/i),reference=all.match(/(?:UPI\s*(?:ref|reference)|UTR|RRN|txn(?:action)?\s*(?:id|ref)|reference)\s*(?:no\.?|number|id)?\s*[:#-]?\s*([A-Za-z0-9-]{6,40})/i),dateMatch=all.match(/\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/),d=new Date(Number(meta.internalDate)||Date.parse(meta.date)||Date.now()),date=dateMatch?financeParseDate(dateMatch[1]):localISO(d),merchant=financeMerchant(description);
  return {id:uid(),date:date,description:description,merchant:merchant,amount:value,type:kind==="income"?"income":"expense",kind:kind,category:financeCategory(description+" "+all.slice(0,240)),account:accountMatch?"…"+accountMatch[1].replace(/[^A-Za-z0-9]/g,"").slice(-4):(meta.from||"Gmail alert"),reference:reference?reference[1]:"",source:"Gmail: "+meta.subject,createdAt:Date.now(),gmailMessageId:meta.id};
}
function financeGmailEmi(text,meta,transaction){
  var all=(meta.subject+" "+text).replace(/\s+/g," ");if(!/\b(emi|instalment|installment|loan repayment)\b/i.test(all))return null;
  var parts=all.match(/(?:instalment|installment|emi)\s*(?:no\.?|number)?\s*(\d{1,3})\s*(?:of|\/|out of)\s*(\d{1,3})/i),remaining=all.match(/(?:remaining|outstanding|balance)\s*(?:amount)?\s*[:\-]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i),due=all.match(/(?:due (?:on|date)|payment date)\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i),lender=String(meta.from||meta.subject||"Loan provider").replace(/<[^>]+>/g,"").replace(/\b(?:noreply|no-reply|alerts?|notification)\b/ig," ").replace(/\s+/g," ").trim().slice(0,60),paid=parts?Number(parts[1]):0,total=parts?Number(parts[2]):0,pending=total?Math.max(0,total-paid):0,completion="";
  if(pending){var end=new Date((due&&financeParseDate(due[1])||transaction&&transaction.date||localISO(today()))+"T00:00:00");end.setMonth(end.getMonth()+pending);completion=localISO(end);}
  return {id:uid(),name:(meta.subject||"EMI").replace(/\s+/g," ").trim().slice(0,70),lender:lender,emi:transaction?transaction.amount:0,balance:remaining?Math.abs(financeNumber(remaining[1])):0,principal:0,paidInstallments:paid,totalInstallments:total,pendingInstallments:pending,lastPaymentDate:transaction&&transaction.kind!=="failed"?transaction.date:"",nextDueDate:due?financeParseDate(due[1]):"",completionDate:completion,status:pending===0&&total?"closed":"active",source:"gmail",gmailMessageId:meta.id,createdAt:Date.now()};
}
function financeGmailParseFile(file){
  if(/\.pdf$/i.test(file.name))return financeReadPdf(file).then(function(lines){return financePdfTransactions(lines,file.name);});
  return file.text().then(function(text){return financeRowsToTransactions(financeCsvRows(text),file.name);});
}
function financeGmailReadMessage(message,token){
  var headers=financeGmailHeaders(message.payload),meta={id:message.id,subject:headers.subject||"Gmail message",from:headers.from||"",date:headers.date||"",internalDate:message.internalDate||0},files=[],texts=[];
  return financeGmailParts(message.payload,message.id,token,files,texts).then(function(){
    return Promise.all(files.map(function(file){return financeGmailParseFile(file).catch(function(){return [];});}));
  }).then(function(groups){
    var isStatement=financeGmailIsStatement(meta,files);
    if(!isStatement)return {id:message.id,subject:meta.subject,from:meta.from,items:[],emis:[],attachments:files.length,isStatement:false};
    var items=[].concat.apply([],groups);items.forEach(function(t){t.gmailMessageId=message.id;t.source="Gmail statement: "+meta.subject+" / "+t.source;});
    var plain=financeGmailPlainText(texts);
    var emi=financeGmailEmi(plain,meta,items[0]||null);
    var statementMeta=financeStatementMeta(plain,meta,files);if(statementMeta.account)items.forEach(function(t){if(!t.account||/\.pdf$|\.csv$|\.txt$/i.test(t.account))t.account=statementMeta.account;});
    var result={id:message.id,subject:meta.subject,from:meta.from,items:items,emis:emi?[emi]:[],attachments:files.length,isStatement:true,meta:statementMeta};result.statementKey=financeStatementKey(result);return result;
  });
}
function financeGmailSync(automatic){
  if(financeBusy)return;var query=financeGmailQuery();financeState.gmail.query=query;financeState.gmail.lastAttemptAt=Date.now();financeBusy=true;financeGmailProgress=null;financeGmailStatus="Opening Google authorization...";render();
  var token,profile,listed;
  financeGmailAuthorize().then(function(t){token=t;financeGmailStatus="Searching Gmail for attached card and bank statements...";render();return Promise.all([financeGmailApi("profile",token),financeGmailListMessages(query,token)]);}).then(function(results){
    profile=results[0];listed=results[1];var imported={},queued={};financeState.gmail.importedMessageIds.forEach(function(id){imported[id]=1;});var messages=[];(financeState.gmail.retryMessageIds||[]).forEach(function(id){if(!imported[id]&&!queued[id]){queued[id]=1;messages.push({id:id});}});(listed.messages||[]).forEach(function(m){if(!imported[m.id]&&!queued[m.id]){queued[m.id]=1;messages.push(m);}});messages=messages.slice(0,200);
    if(!messages.length){financeGmailCandidates=[];financeState.gmail.email=profile.emailAddress||financeState.gmail.email;financeState.gmail.authorized=true;financeState.gmail.lastSyncAt=Date.now();financeState.gmail.lastSuccessfulSyncAt=Date.now();financeState.gmail.lastResult="No new statements";financeBusy=false;financeGmailStatus=(listed.resultSizeEstimate||0)?"All matching statements were already reviewed.":"No attached credit-card or bank statements were found.";return financeSave();}
    financeGmailStatus="Reading "+messages.length+" new statement email"+(messages.length===1?"":"s")+"...";render();
    financeGmailProgress={stage:"Reading statements",done:0,total:messages.length};render();
    return financeMapLimit(messages,4,function(m){return financeGmailApi("messages/"+encodeURIComponent(m.id)+"?format=full",token).then(function(full){return financeGmailReadMessage(full,token);});},function(done,total){financeGmailProgress={stage:"Reading statements",done:done,total:total};if(done===total||done%4===0)render();}).then(function(candidates){
      var failed=candidates.filter(function(c){return c&&c.error;}),known={},duplicateIds=[];financeState.gmail.importedStatementKeys.forEach(function(key){known[key]=1;});candidates=candidates.filter(function(c){if(!c||!c.isStatement)return false;if(c.statementKey&&known[c.statementKey]){duplicateIds.push(c.id);return false;}return true;});financeGmailCandidates=candidates;var readable=candidates.filter(function(c){return c.items.length||(c.emis||[]).length;}),items=[].concat.apply([],readable.map(function(c){return c.items;})),emis=[].concat.apply([],readable.map(function(c){return c.emis||[];})),unreadable=candidates.filter(function(c){return !c.items.length&&!(c.emis||[]).length;});
      var marked={};financeState.gmail.importedMessageIds.forEach(function(id){marked[id]=1;});duplicateIds.forEach(function(id){if(id&&!marked[id]){marked[id]=1;financeState.gmail.importedMessageIds.push(id);}});financeState.gmail.email=profile.emailAddress||financeState.gmail.email;financeState.gmail.authorized=true;financeState.gmail.lastSyncAt=Date.now();financeState.gmail.lastResult="Checked "+candidates.length+" statements";financeState.gmail.retryMessageIds=unreadable.map(function(c){return c.id;}).concat(failed.map(function(c){return c.id;})).filter(Boolean).slice(-100);financeBusy=false;financeGmailProgress=null;
      financeGmailStatus="Checked "+candidates.length+" statement"+(candidates.length===1?"":"s")+"; "+items.length+" transaction"+(items.length===1?"":"s")+" extracted"+(unreadable.length?"; "+unreadable.length+" attachment"+(unreadable.length===1?" was":"s were")+" not readable":"")+(failed.length?"; "+failed.length+" message"+(failed.length===1?" will":"s will")+" retry automatically":"")+".";
      if(candidates.length)financePendingImport={id:uid(),name:"Gmail statements - "+candidates.length,items:items,emis:emis,messageIds:readable.map(function(c){return c.id;}),statementKeys:readable.map(function(c){return c.statementKey;}),unreadableIds:unreadable.map(function(c){return c.id;}).concat(failed.map(function(c){return c.id;})).filter(Boolean),metadata:candidates.map(function(c){return {subject:c.subject,account:c.meta&&c.meta.account,period:c.meta&&c.meta.period,dueDate:c.meta&&c.meta.dueDate,readable:!!(c.items.length||(c.emis||[]).length)};}),source:"gmail",statementCount:candidates.length,unreadableCount:unreadable.length+failed.length};
      return financeSave();
    });
  }).then(function(value){financeAutoSyncQueued=false;financeGmailAutoBlocked=false;financeGmailSetupRequired=false;return value;}).catch(function(err){var message=String(err&&err.message||"Try again"),setup=/has not been used|is disabled|accessnotconfigured/i.test(message);financeAutoSyncQueued=false;financeBusy=false;financeGmailProgress=null;financeGmailAutoBlocked=true;financeGmailSetupRequired=setup;if(financeState&&financeState.gmail)financeState.gmail.lastResult="Failed: "+message;financeGmailStatus=setup?"Gmail API is disabled for this Google Cloud project. Enable it once, wait a few minutes, then refresh statements.":"Gmail synchronization stopped: "+message;render();if(!setup&&!automatic)flash("Gmail synchronization failed - "+message);});
}
function financeGmailDisconnect(){
  financeGmailToken=null;financeGmailTokenClient=null;financeGmailCandidates=[];financeGmailAutoBlocked=false;financeGmailSetupRequired=false;financeGmailStatus="Gmail disconnected from this browser session.";
  if(financeState&&financeState.gmail){financeState.gmail.authorized=false;financeSave("Gmail disconnected; Drive sync remains connected");}else render();
}
function financeConfirmImport(){
  if(!financePendingImport)return;var existing={};financeState.transactions.forEach(function(t){existing[financeTransactionKey(t)]=1;});var added=0,skipped=0;
  financePendingImport.items.forEach(function(t){var key=financeTransactionKey(t);if(existing[key]){skipped++;return;}existing[key]=1;financeState.transactions.push(t);added++;});
  (financePendingImport.emis||[]).forEach(function(emi){var key=String(emi.lender||emi.name||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim(),current=financeState.loans.filter(function(x){var other=String(x.lender||x.name||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();return key&&other&&(key.indexOf(other)>-1||other.indexOf(key)>-1);})[0];if(!current){financeState.loans.push(emi);return;}["name","lender","emi","balance","principal","paidInstallments","totalInstallments","pendingInstallments","lastPaymentDate","nextDueDate","completionDate","status","gmailMessageId"].forEach(function(field){if(emi[field]!==""&&emi[field]!==0)current[field]=emi[field];});});
  if(financePendingImport.source==="gmail"){
    var seen={};financeState.gmail.importedMessageIds.forEach(function(id){seen[id]=1;});(financePendingImport.messageIds||[]).forEach(function(id){if(!seen[id]){seen[id]=1;financeState.gmail.importedMessageIds.push(id);}});
    if(financeState.gmail.importedMessageIds.length>2000)financeState.gmail.importedMessageIds=financeState.gmail.importedMessageIds.slice(-2000);
    var keys={};financeState.gmail.importedStatementKeys.forEach(function(key){keys[key]=1;});(financePendingImport.statementKeys||[]).forEach(function(key){if(key&&!keys[key]){keys[key]=1;financeState.gmail.importedStatementKeys.push(key);}});if(financeState.gmail.importedStatementKeys.length>2000)financeState.gmail.importedStatementKeys=financeState.gmail.importedStatementKeys.slice(-2000);
    financeState.gmail.retryMessageIds=(financePendingImport.unreadableIds||[]).slice(-100);financeState.gmail.lastSuccessfulSyncAt=Date.now();financeState.gmail.lastSyncAt=Date.now();
  }
  financeState.statements.unshift({id:financePendingImport.id,name:financePendingImport.name,source:financePendingImport.source||"gmail",importedAt:Date.now(),count:added,skipped:skipped,statementCount:financePendingImport.statementCount||0,unreadableCount:financePendingImport.unreadableCount||0,metadata:financePendingImport.metadata||[]});var emiCount=(financePendingImport.emis||[]).length;financePendingImport=null;financeSave(added+" transactions imported"+(emiCount?"; "+emiCount+" EMI updates":"")+(skipped?"; "+skipped+" duplicates skipped":""));
}
function financeHandleAction(act,id){
  if(act==="finance-setup"){financeSetup();return true;}if(act==="finance-unlock"){financeUnlockPin();return true;}if(act==="finance-lock"){financeLock();render();return true;}
  if(act==="finance-pin-show"){financePinFallback=true;render();setTimeout(function(){var pin=document.getElementById("financePin");if(pin)pin.focus();},0);return true;}
  if(act==="finance-face-enable"){financeEnableFace();return true;}if(act==="finance-face-unlock"){financeUnlockFace();return true;}if(act==="finance-face-disable"){confirmDestructive("Remove Face ID unlock from this device? Your Finance PIN will still work.","Remove Face ID",financeDisableFace);return true;}
  if(!financeUnlocked())return false;financeTouch();
  if(act==="finance-gmail-sync"){financeGmailAutoBlocked=false;financeGmailSetupRequired=false;financeGmailSync(false);return true;}if(act==="finance-gmail-disconnect"){financeGmailDisconnect();return true;}
  if(act==="finance-select-month"){financeMonthFilter=id;render();return true;}
  if(act==="finance-open-category"){financeCategoryFilter=id;financeMerchantFilter="";financeKindFilter="";financeDetailGroup=id;financeShowAll=false;financeTab="financetransactions";render();return true;}
  if(act==="finance-open-merchant"){financeMerchantFilter=id;financeCategoryFilter="";financeKindFilter="";financeTab="financetransactions";render();return true;}
  if(act==="finance-open-kind"){financeKindFilter=id==="net"?"":id;financeCategoryFilter="";financeMerchantFilter="";financeTab="financetransactions";render();return true;}
  if(act==="finance-clear-filters"){financeSearch="";financeAccountFilter="";financeMerchantFilter="";financeCategoryFilter="";financeKindFilter="";financeMonthFilter="";financeYearFilter="";financeDetailGroup="";financeShowAll=false;render();return true;}
  if(act==="finance-open-emi"){financeTab="financeloans";render();return true;}
  if(act==="finance-toggle-detail"){financeDetailGroup=financeDetailGroup===id?"":id;render();return true;}
  if(act==="finance-toggle-all-details"){financeShowAll=!financeShowAll;financeDetailGroup="";render();return true;}
  if(act==="finance-show-transaction"){var selected=financeState.transactions.map(financeNormalizeTransaction).filter(function(t){return t.id===id;})[0];if(selected){financeMonthFilter=financeMonthKey(selected.date);financeCategoryFilter=selected.category;financeDetailGroup=selected.category;financeTab="financetransactions";render();}return true;}
  if(act==="finance-import-confirm"){financeConfirmImport();return true;}if(act==="finance-import-cancel"){financePendingImport=null;render();return true;}
  if(act==="finance-delete-transaction"){var tx=financeState.transactions.filter(function(x){return x.id===id;})[0];confirmDestructive('Delete "'+(tx?tx.description:"this transaction")+'"?','Delete transaction',function(){financeState.transactions=financeState.transactions.filter(function(x){return x.id!==id;});financeSave("Transaction deleted");});return true;}
  if(act==="finance-delete-loan"){var loan=financeState.loans.filter(function(x){return x.id===id;})[0];confirmDestructive('Delete the loan record "'+(loan?loan.name:"this loan")+'"?','Delete loan',function(){financeState.loans=financeState.loans.filter(function(x){return x.id!==id;});financeSave("Loan deleted");});return true;}
  if(act==="finance-toggle-loan"){var toggle=financeState.loans.filter(function(x){return x.id===id;})[0];if(toggle){toggle.status=toggle.status==="closed"?"active":"closed";if(toggle.status==="closed")toggle.balance=0;financeSave(toggle.status==="closed"?"Loan marked paid off":"Loan reopened");}return true;}
  if(act==="finance-delete-statement"){var statement=financeState.statements.filter(function(x){return x.id===id;})[0];confirmDestructive('Delete the import record for "'+(statement?statement.name:"this statement")+'"? Imported transactions will remain.','Delete statement record',function(){financeState.statements=financeState.statements.filter(function(x){return x.id!==id;});financeSave("Statement record deleted");});return true;}
  return false;
}
function financeHandleInput(target){if(target.id==="financeSearch"){financeSearch=target.value;var pos=target.selectionStart;render();var next=document.getElementById("financeSearch");if(next){next.focus();try{next.setSelectionRange(pos,pos);}catch(e){}}return true;}return false;}
function financeHandleChange(target){
  if(target.id==="financeLockMinutes"){localStorage.setItem(FINANCE_LOCK_PREF,target.value);financeTouch();render();flash("Finance auto-lock updated");return true;}
  if(target.id==="financeOverviewMonth"){financeMonthFilter=target.value;render();return true;}
  if(target.id==="financeMonthFilter"){financeMonthFilter=target.value;if(target.value)financeYearFilter="";render();return true;}
  if(target.id==="financeYearFilter"){financeYearFilter=target.value;if(target.value)financeMonthFilter="";render();return true;}
  if(target.id==="financeAccountFilter"){financeAccountFilter=target.value;render();return true;}
  if(target.id==="financeMerchantFilter"){financeMerchantFilter=target.value;render();return true;}
  if(target.id==="financeCategoryFilter"){financeCategoryFilter=target.value;financeDetailGroup=target.value;render();return true;}
  if(target.id==="financeKindFilter"){financeKindFilter=target.value;render();return true;}
  return false;
}

document.addEventListener("pointerdown",function(){if(section==="finance"&&financeUnlocked())financeTouch();},{passive:true});
document.addEventListener("keydown",function(){if(section==="finance"&&financeUnlocked())financeTouch();},{passive:true});
document.addEventListener("visibilitychange",function(){
  if(document.visibilityState==="hidden"){financeHiddenAt=Date.now();return;}
  if(!financeHiddenAt||!financeUnlocked())return;
  if(financeBusy){financeHiddenAt=0;financeTouch();return;}
  if(Date.now()-financeHiddenAt>60000){financeLock(true);if(section==="finance")render();}
  else financeTouch();
  financeHiddenAt=0;
});
