"use strict";
(function(global){
  var DB_NAME="sinu-game-vault";
  var DB_VERSION=1;
  var STORE_NAME="records";
  var requestInflight={};
  var diagnosticItems=[];

  function clone(value){
    if(value==null)return value;
    return JSON.parse(JSON.stringify(value));
  }
  function stable(value){
    if(value==null||typeof value!=="object")return JSON.stringify(value);
    if(Array.isArray(value))return "["+value.map(stable).join(",")+"]";
    return "{"+Object.keys(value).sort().map(function(key){
      return JSON.stringify(key)+":"+stable(value[key]);
    }).join(",")+"}";
  }
  function normalize(value){
    var text=String(value||"");
    try{text=text.normalize("NFKD").replace(/\p{M}/gu,"");}catch(e){}
    return text.toLowerCase().replace(/[^a-z0-9]+/g,"").trim();
  }
  function bytesToB64(bytes){
    var value="",view=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    for(var i=0;i<view.length;i++)value+=String.fromCharCode(view[i]);
    return btoa(value);
  }
  function b64ToBytes(value){
    var raw=atob(String(value||"")),out=new Uint8Array(raw.length);
    for(var i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
    return out;
  }
  function randomBytes(length){
    var out=new Uint8Array(length);
    crypto.getRandomValues(out);
    return out;
  }
  function addDiagnostic(scope,error,extra){
    var item={
      at:new Date().toISOString(),
      scope:String(scope||"app"),
      message:String(error&&error.message||error||"Unknown error")
    };
    if(extra&&typeof extra==="object")Object.keys(extra).forEach(function(key){item[key]=extra[key];});
    diagnosticItems.unshift(item);
    diagnosticItems=diagnosticItems.slice(0,100);
    return item;
  }

  var dbPromise=null;
  function openDb(){
    if(!("indexedDB" in global))return Promise.reject(new Error("IndexedDB unavailable"));
    if(dbPromise)return dbPromise;
    dbPromise=new Promise(function(resolve,reject){
      var request=indexedDB.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded=function(){
        var db=request.result;
        if(!db.objectStoreNames.contains(STORE_NAME))db.createObjectStore(STORE_NAME,{keyPath:"key"});
      };
      request.onsuccess=function(){resolve(request.result);};
      request.onerror=function(){reject(request.error||new Error("IndexedDB open failed"));};
    }).catch(function(error){dbPromise=null;addDiagnostic("indexeddb:open",error);throw error;});
    return dbPromise;
  }
  function dbAction(mode,handler){
    return openDb().then(function(db){
      return new Promise(function(resolve,reject){
        var tx=db.transaction(STORE_NAME,mode),store=tx.objectStore(STORE_NAME),result;
        try{result=handler(store);}catch(error){reject(error);return;}
        tx.oncomplete=function(){resolve(result&&result.result!==undefined?result.result:result);};
        tx.onerror=function(){reject(tx.error||new Error("IndexedDB transaction failed"));};
        tx.onabort=function(){reject(tx.error||new Error("IndexedDB transaction aborted"));};
      });
    });
  }
  var storage={
    get:function(key){
      return dbAction("readonly",function(store){return store.get(key);}).then(function(row){return row?row.value:null;})
        .catch(function(error){addDiagnostic("indexeddb:get",error,{key:key});return null;});
    },
    put:function(key,value){
      return dbAction("readwrite",function(store){return store.put({key:key,value:clone(value),savedAt:Date.now()});})
        .catch(function(error){addDiagnostic("indexeddb:put",error,{key:key});return false;});
    },
    remove:function(key){
      return dbAction("readwrite",function(store){return store.delete(key);})
        .catch(function(error){addDiagnostic("indexeddb:remove",error,{key:key});return false;});
    }
  };

  function request(url,options,policy){
    options=options||{};
    policy=policy||{};
    var method=String(options.method||"GET").toUpperCase();
    var key=method==="GET"&&!policy.noDedupe?method+":"+url:"";
    if(key&&requestInflight[key])return requestInflight[key];
    var retries=Math.max(0,policy.retries==null?1:Number(policy.retries)||0);
    var timeout=Math.max(1000,Number(policy.timeout)||15000);
    function attempt(index){
      var controller=typeof AbortController!=="undefined"?new AbortController():null;
      var timer=controller?setTimeout(function(){controller.abort();},timeout):null;
      var opts=Object.assign({},options);
      if(controller)opts.signal=controller.signal;
      return fetch(url,opts).then(function(response){
        if(timer)clearTimeout(timer);
        if(!response.ok&&index<retries&&(response.status===408||response.status===429||response.status>=500)){
          var retryError=new Error("HTTP "+response.status);
          retryError.retryable=true;
          throw retryError;
        }
        return response;
      }).catch(function(error){
        if(timer)clearTimeout(timer);
        if(index>=retries||method!=="GET"){
          addDiagnostic(policy.scope||"request",error,{url:url.split("?")[0],method:method});
          throw error;
        }
        var delay=Math.min(5000,400*Math.pow(2,index))+Math.floor(Math.random()*160);
        return new Promise(function(resolve){setTimeout(resolve,delay);}).then(function(){return attempt(index+1);});
      });
    }
    var promise=attempt(0);
    if(key){
      requestInflight[key]=promise;
      promise.then(function(){delete requestInflight[key];},function(){delete requestInflight[key];});
    }
    return promise;
  }

  function deriveKey(passphrase,salt,usage){
    return crypto.subtle.importKey("raw",new TextEncoder().encode(passphrase),"PBKDF2",false,["deriveKey"]).then(function(base){
      return crypto.subtle.deriveKey(
        {name:"PBKDF2",salt:salt,iterations:210000,hash:"SHA-256"},
        base,
        {name:"AES-GCM",length:256},
        false,
        usage
      );
    });
  }
  function seal(value,passphrase){
    if(!global.crypto||!crypto.subtle)return Promise.reject(new Error("Secure encryption is unavailable"));
    if(String(passphrase||"").length<8)return Promise.reject(new Error("Use at least 8 characters"));
    var salt=randomBytes(16),iv=randomBytes(12);
    return deriveKey(passphrase,salt,["encrypt"]).then(function(key){
      return crypto.subtle.encrypt({name:"AES-GCM",iv:iv},key,new TextEncoder().encode(JSON.stringify(value)));
    }).then(function(cipher){
      return {format:"gamevault-secure-config-v1",kdf:"PBKDF2-SHA256",iterations:210000,salt:bytesToB64(salt),iv:bytesToB64(iv),cipher:bytesToB64(new Uint8Array(cipher)),updatedAt:Date.now()};
    });
  }
  function openSealed(envelope,passphrase){
    if(!envelope||envelope.format!=="gamevault-secure-config-v1")return Promise.reject(new Error("Encrypted configuration is invalid"));
    var salt=b64ToBytes(envelope.salt),iv=b64ToBytes(envelope.iv),cipher=b64ToBytes(envelope.cipher);
    return deriveKey(passphrase,salt,["decrypt"]).then(function(key){
      return crypto.subtle.decrypt({name:"AES-GCM",iv:iv},key,cipher);
    }).then(function(plain){return JSON.parse(new TextDecoder().decode(plain));})
      .catch(function(){throw new Error("The secure-sync passphrase is incorrect");});
  }
  function pinVerifier(pin,salt){
    if(!/^\d{4,12}$/.test(String(pin||"")))return Promise.reject(new Error("Use a 4 to 12 digit PIN"));
    salt=salt||randomBytes(16);
    return crypto.subtle.importKey("raw",new TextEncoder().encode(String(pin)),"PBKDF2",false,["deriveBits"]).then(function(base){
      return crypto.subtle.deriveBits({name:"PBKDF2",salt:salt,iterations:180000,hash:"SHA-256"},base,256);
    }).then(function(bits){return {salt:bytesToB64(salt),hash:bytesToB64(new Uint8Array(bits))};});
  }
  function verifyPin(pin,stored){
    if(!stored||!stored.salt||!stored.hash)return Promise.resolve(false);
    return pinVerifier(pin,b64ToBytes(stored.salt)).then(function(next){
      if(next.hash.length!==stored.hash.length)return false;
      var mismatch=0;
      for(var i=0;i<next.hash.length;i++)mismatch|=next.hash.charCodeAt(i)^stored.hash.charCodeAt(i);
      return mismatch===0;
    }).catch(function(){return false;});
  }

  function recordKey(collection,item){
    if(item==null)return "";
    if(typeof item!=="object")return "value:"+normalize(item);
    if(item.canonicalId)return String(item.canonicalId);
    if(item.key)return String(item.key);
    if(item.tmdbId!=null)return (collection.indexOf("series")>=0?"tmdbtv:":"tmdb:")+item.tmdbId;
    if(item.imdbId)return "imdb:"+item.imdbId;
    if(item.id!=null)return "id:"+item.id;
    return "name:"+normalize(item.name||item.title||item.label||stable(item));
  }
  function ensureSync(vault,collections){
    if(!vault._sync||typeof vault._sync!=="object")vault._sync={version:1,records:{},tombstones:{}};
    if(!vault._sync.records)vault._sync.records={};
    if(!vault._sync.tombstones)vault._sync.tombstones={};
    collections.forEach(function(collection){
      if(!vault._sync.records[collection])vault._sync.records[collection]={};
      if(!vault._sync.tombstones[collection])vault._sync.tombstones[collection]={};
    });
    return vault._sync;
  }
  function collectionSnapshot(vault,collections){
    var out={};
    collections.forEach(function(collection){
      out[collection]={};
      (vault[collection]||[]).forEach(function(item){out[collection][recordKey(collection,item)]=stable(item);});
    });
    return out;
  }
  function trackChanges(vault,previous,collections,at){
    at=Number(at)||Date.now();
    var sync=ensureSync(vault,collections);
    collections.forEach(function(collection){
      var before=previous&&previous[collection]||{},current={};
      (vault[collection]||[]).forEach(function(item){
        var key=recordKey(collection,item);
        if(!key)return;
        var signature=stable(item);
        current[key]=signature;
        if(before[key]!==signature)sync.records[collection][key]=at;
        if(sync.tombstones[collection][key])delete sync.tombstones[collection][key];
      });
      Object.keys(before).forEach(function(key){
        if(!(key in current)){
          sync.tombstones[collection][key]=Math.max(at,Number(sync.tombstones[collection][key])||0);
          delete sync.records[collection][key];
        }
      });
    });
    return collectionSnapshot(vault,collections);
  }
  function mergeVault(local,remote,collections){
    local=clone(local||{});remote=clone(remote||{});
    var localNewer=Number(local.updatedAt||0)>=Number(remote.updatedAt||0);
    var result=clone(localNewer?local:remote);
    var ls=ensureSync(local,collections),rs=ensureSync(remote,collections);
    result._sync={version:1,records:{},tombstones:{}};
    collections.forEach(function(collection){
      var lm={},rm={},keys={};
      (local[collection]||[]).forEach(function(item){var key=recordKey(collection,item);if(key){lm[key]=item;keys[key]=1;}});
      (remote[collection]||[]).forEach(function(item){var key=recordKey(collection,item);if(key){rm[key]=item;keys[key]=1;}});
      Object.keys(ls.tombstones[collection]||{}).forEach(function(key){keys[key]=1;});
      Object.keys(rs.tombstones[collection]||{}).forEach(function(key){keys[key]=1;});
      var merged=[],recordTimes={},tombstones={};
      Object.keys(keys).forEach(function(key){
        var lt=lm[key]?(Number((ls.records[collection]||{})[key])||Number(local.updatedAt)||0):0;
        var rt=rm[key]?(Number((rs.records[collection]||{})[key])||Number(remote.updatedAt)||0):0;
        var ldel=Number((ls.tombstones[collection]||{})[key])||0;
        var rdel=Number((rs.tombstones[collection]||{})[key])||0;
        var deletedAt=Math.max(ldel,rdel);
        var chosen=rt>lt?rm[key]:lm[key]||rm[key];
        var chosenAt=Math.max(lt,rt);
        if(deletedAt>=chosenAt){
          tombstones[key]=deletedAt;
          return;
        }
        if(chosen){merged.push(chosen);recordTimes[key]=chosenAt;}
      });
      result[collection]=merged;
      result._sync.records[collection]=recordTimes;
      result._sync.tombstones[collection]=tombstones;
    });
    result.updatedAt=Math.max(Number(local.updatedAt)||0,Number(remote.updatedAt)||0);
    result.revision=Math.max(Number(local.revision)||0,Number(remote.revision)||0);
    return result;
  }

  function focusSignature(element){
    if(!element||!element.getAttribute)return "";
    if(element.id)return "#"+element.id;
    var act=element.getAttribute("data-act"),id=element.getAttribute("data-id"),name=element.getAttribute("name");
    if(act)return '[data-act="'+String(act).replace(/"/g,'\\"')+'"]'+(id?'[data-id="'+String(id).replace(/"/g,'\\"')+'"]':"");
    if(name)return '[name="'+String(name).replace(/"/g,'\\"')+'"]';
    return "";
  }
  function renderInto(element,html,options){
    if(!element)return false;
    html=String(html==null?"":html);
    if(element.__gameVaultHtml===html||element.innerHTML===html){element.__gameVaultHtml=html;return false;}
    options=options||{};
    var active=document.activeElement,selector=element.contains(active)?focusSignature(active):"";
    var selection=selector&&typeof active.selectionStart==="number"?{start:active.selectionStart,end:active.selectionEnd}:null;
    var pageY=global.scrollY,localTop=element.scrollTop;
    element.innerHTML=html;
    element.__gameVaultHtml=html;
    if(selector){
      var next;
      try{next=element.querySelector(selector);}catch(e){}
      if(next){
        next.focus({preventScroll:true});
        if(selection&&next.setSelectionRange)try{next.setSelectionRange(selection.start,selection.end);}catch(e){}
      }
    }
    if(options.preservePageScroll!==false&&pageY)global.scrollTo(0,pageY);
    if(localTop)element.scrollTop=localTop;
    return true;
  }

  global.GameVaultCore={
    version:1,
    storage:storage,
    request:request,
    diagnostics:{add:addDiagnostic,list:function(){return diagnosticItems.slice();}},
    crypto:{seal:seal,open:openSealed,pinVerifier:pinVerifier,verifyPin:verifyPin,randomBytes:randomBytes,bytesToB64:bytesToB64,b64ToBytes:b64ToBytes},
    sync:{recordKey:recordKey,ensure:ensureSync,snapshot:collectionSnapshot,track:trackChanges,merge:mergeVault},
    renderInto:renderInto,
    stable:stable,
    clone:clone
  };
})(window);
