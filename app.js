"use strict";
var APP_VERSION = "1.28.0";
var APP_BUILD_DATE = "2026-07-24";
var APP_RELEASE_CHANNEL = "Stable";

if(/iPhone|iPad|iPod/i.test(navigator.userAgent)){
  ["gesturestart","gesturechange","gestureend"].forEach(function(type){
    document.addEventListener(type,function(event){ event.preventDefault(); },{passive:false});
  });
}
function applyAppVersion(){
  var badge=document.getElementById("appVersionBadge");
  if(badge){ badge.textContent="v"+APP_VERSION; badge.title=APP_RELEASE_CHANNEL+" build "+APP_BUILD_DATE; }
  var rail=document.getElementById("desktopRailVersion"); if(rail) rail.textContent="v"+APP_VERSION;
  document.documentElement.setAttribute("data-app-version",APP_VERSION);
}
applyAppVersion();
/* The Android TV experience now lives in the native Shield app. */
var DENSITY_KEY="gamevault-density";
var uiDensity="comfortable";
try{ uiDensity=localStorage.getItem(DENSITY_KEY)||"comfortable"; }catch(e){}
function applyDensity(){ document.documentElement.classList.toggle("density-compact",uiDensity==="compact"); }
applyDensity();
var DESKTOP_RAIL_KEY="gamevault-desktop-rail-collapsed";
function desktopMode(){ return window.matchMedia && window.matchMedia("(min-width:900px)").matches; }
function desktopRailCollapsed(){ try{return localStorage.getItem(DESKTOP_RAIL_KEY)==="1";}catch(e){return false;} }
function applyDesktopShell(){
  var desktop=desktopMode(),collapsed=desktop&&desktopRailCollapsed();
  document.documentElement.classList.toggle("desktop-workspace",desktop);
  document.documentElement.classList.toggle("desktop-nav-collapsed",collapsed);
  if(!desktop){
    var palette=document.getElementById("commandPalette");
    if(palette) palette.hidden=true;
    document.body.classList.remove("command-open");
  }
  var btn=document.getElementById("desktopRailBtn");
  if(btn){btn.setAttribute("aria-expanded",collapsed?"false":"true");btn.title=collapsed?"Expand navigation":"Collapse navigation";}
}
applyDesktopShell();
window.addEventListener("resize",applyDesktopShell,{passive:true});
var STORE_KEY = "ps5-tracker-v1";
var RECOVERY_STORE = "gamevault-recovery-v1";
var DEVICE_STORE = "gamevault-device-id";
var MAX_RECOVERY_SNAPSHOTS = 8;
var KEY_STORE = "ps5-rawg-key";
var PLOTS_KEY = "ps5-plots-v2";
var STATUSES = ["Finished","Playing","Dropped","Platinum"];
/* display labels — "Playing" files under Resume Later, "Dropped" under On Hold */
var STATUS_LABEL = {Finished:"Finished", Playing:"↺ Resume Later", Dropped:"⏸ On Hold", Platinum:"Platinum"};
var PS5_LAUNCH = "2020-11-12";
var tab = "rentals";
var showImport = false;
var sugGenre = "All";
var sugTier = "All";
var rentVendor = "All";
var busy = false;
var searchQ = {};      // per-tab search text
var formOpen = {};     // per-tab "add" form visibility
var expandedId = null; // selected game/details item in the Games section
var GAME_VIEW_KEY="gamevault-game-view";
var gameView="grid";
try{ gameView=localStorage.getItem(GAME_VIEW_KEY)||"grid"; }catch(e){}
var runtimeErrors=[];
function reportError(scope,error){
  runtimeErrors.unshift({at:new Date().toISOString(),scope:String(scope||"app"),message:String(error&&error.message||error||"Unknown error")});
  runtimeErrors=runtimeErrors.slice(0,40);
  if(window.GameVaultCore)GameVaultCore.diagnostics.add(scope,error);
  try{ console.error("[GameVault] "+scope,error); }catch(e){}
}

function uid(){ return Math.random().toString(36).slice(2,10); }
function today(){ var d=new Date(); return new Date(d.getFullYear(),d.getMonth(),d.getDate()); }
function parseD(s){ if(!s) return null; var p=s.split("-").map(Number); return new Date(p[0],p[1]-1,p[2]); }
function fmt(s){ var d=parseD(s); if(!d) return "TBC"; return d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}); }
function daysBetween(a,b){ return Math.round((b-a)/86400000); }
function localISO(d){ d=d||new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function norm(s){
  var value=String(s||"").normalize?String(s||"").normalize("NFKD"):String(s||"");
  try{ return value.replace(/\p{M}/gu,"").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,""); }
  catch(e){ return value.toLowerCase().replace(/[^a-z0-9]/g,""); }
}
function urgency(left){ return left<=0 ? "#8B96AC" : left<=3 ? "#F05A5A" : left<=10 ? "#F2B84B" : "#2D7FF9"; }
function scoreColor(s){ return !s ? "#8B96AC" : s>=90 ? "#3ECF8E" : s>=84 ? "#2D7FF9" : "#F2B84B"; }

/* Upcoming releases come from RAWG. Avoid shipping dated entries that become stale. */
var SEED_UPCOMING = [];

/* Curated released PS5 AAA catalog for suggestions (2020 – mid 2026) */
var BUILTIN_CATALOG = [
  ["Elden Ring",2022,96,"RPG","FromSoftware's open-world masterpiece"],
  ["Baldur's Gate 3",2023,96,"RPG","GOTY 2023 — deepest RPG of the generation"],
  ["God of War Ragnarök",2022,94,"Action","Kratos & Atreus vs the Norse apocalypse"],
  ["Astro Bot",2024,94,"Platformer","GOTY 2024 — pure PS5 joy"],
  ["Metaphor: ReFantazio",2024,94,"RPG","Fantasy epic from the Persona team"],
  ["Resident Evil 4",2023,93,"Horror","Remake of the all-time classic","Remake"],
  ["Demon's Souls",2020,92,"Action","Stunning Bluepoint remake","Remake"],
  ["Final Fantasy VII Rebirth",2024,92,"RPG","Part 2 of the remake trilogy","Remake"],
  ["Clair Obscur: Expedition 33",2025,92,"RPG","Turn-based stunner — 2025's surprise hit"],
  ["Split Fiction",2025,91,"Co-op","Hazelight co-op hit — grab a friend"],
  ["Marvel's Spider-Man 2",2023,90,"Action","Venom, symbiote suit, two Spider-Men"],
  ["Ghost of Yōtei",2025,90,"Action","Sucker Punch's follow-up to Tsushima"],
  ["Resident Evil Requiem",2026,90,"Horror","RE9 — this year's big horror release"],
  ["Death Stranding 2: On the Beach",2025,89,"Adventure","Kojima's strand sequel"],
  ["Ghost of Tsushima Director's Cut",2021,89,"Action","Samurai open world + Iki Island","Remaster"],
  ["Dead Space",2023,89,"Horror","Ground-up remake of the sci-fi horror classic","Remake"],
  ["The Last of Us Part II Remastered",2024,90,"Adventure","Definitive PS5 version + No Return mode","Remaster"],
  ["Alan Wake 2",2023,89,"Horror","Remedy's survival-horror masterpiece"],
  ["Horizon Forbidden West",2022,88,"Action","Aloy vs machines in the forbidden west"],
  ["Ratchet & Clank: Rift Apart",2021,88,"Platformer","The PS5 SSD showcase"],
  ["Monster Hunter Wilds",2025,88,"Action","Capcom's massive hunting sandbox"],
  ["Kingdom Come: Deliverance II",2025,88,"RPG","Hardcore medieval realism"],
  ["The Last of Us Part I",2022,88,"Adventure","Full ground-up PS5 remake","Remake"],
  ["Persona 3 Reload",2024,87,"RPG","Full remake of the beloved JRPG","Remake"],
  ["Horizon Zero Dawn Remastered",2024,85,"Action","Aloy's origin story rebuilt for PS5","Remaster"],
  ["Final Fantasy XVI",2023,87,"RPG","Dark fantasy with real-time combat"],
  ["Gran Turismo 7",2022,87,"Racing","The definitive sim racer"],
  ["Silent Hill 2",2024,87,"Horror","Bloober's acclaimed remake","Remake"],
  ["The Elder Scrolls IV: Oblivion Remastered",2025,82,"RPG","Cyrodiil reborn in Unreal 5","Remaster"],
  ["Metal Gear Solid Delta: Snake Eater",2025,75,"Action","Faithful remake of MGS3","Remake"],
  ["Dragon's Dogma 2",2024,87,"RPG","Emergent open-world chaos"],
  ["Cyberpunk 2077",2022,86,"RPG","With Phantom Liberty it's essential"],
  ["Armored Core VI: Fires of Rubicon",2023,86,"Action","FromSoftware does mechs"],
  ["Returnal",2021,86,"Shooter","Roguelike bullet-hell — brutal, brilliant"],
  ["Doom: The Dark Ages",2025,85,"Shooter","Medieval demon slaying"],
  ["Star Wars Jedi: Survivor",2023,85,"Action","Cal Kestis returns"],
  ["Marvel's Spider-Man: Miles Morales",2020,85,"Action","Compact and electric"],
  ["Nioh 3",2026,85,"Action","Team Ninja's yokai soulslike"],
  ["007 First Light",2026,85,"Action","IO Interactive's young James Bond"],
  ["Hogwarts Legacy",2023,84,"RPG","Open-world Hogwarts"],
  ["Lies of P",2023,84,"Action","Pinocchio soulslike — surprisingly great"],
  ["Resident Evil Village",2021,84,"Horror","Ethan Winters vs Lady Dimitrescu"],
  ["Helldivers 2",2024,82,"Shooter","Co-op chaos for managed democracy"],
  ["Stellar Blade",2024,81,"Action","Stylish character action"],
  ["Black Myth: Wukong",2024,81,"Action","Chinese mythology epic"],
  ["Assassin's Creed Shadows",2025,81,"Action","Feudal Japan, dual protagonists"]
].map(function(g){ return {name:g[0], year:g[1], score:g[2], genre:g[3], note:g[4], rem:g[5]||""}; });

/* ---------- storage ---------- */
var VAULT_ARRAY_FIELDS = ["rentals","upcoming","played","dismissed","catalogExtra","vendors","queue","rentalHistory","playing","upcomingRemoved","watchedMovies","movieWatchlist","watchingMovies","hiddenMovies","watchedSeries","seriesWatchlist","watchingSeries","hiddenSeries","biglyHistory"];
var VAULT_OBJECT_FIELDS = ["covers","dismissedNames","fandom","hubkeys","keys","seriesRatings","aiChats","health","finance","secureConfig","_sync"];
var HEALTH_SYNC_STORE="gamevault-sync-health-v1";
function healthDefaults(){
  return {
    foodLog:[],
    labs:[],
    targets:{plantMeals:10,fishMeals:2,redMeatMeals:1,friedMeals:1,sugaryItems:2,fruitServings:14,vegetableServings:21,wholeGrainMeals:7,activityMinutes:150,strengthDays:2},
    doctorNotes:""
  };
}
function normalizeHealth(h){
  var base=healthDefaults();
  h=(h&&typeof h==="object"&&!Array.isArray(h))?h:{};
  if(!Array.isArray(h.foodLog))h.foodLog=[];
  if(!Array.isArray(h.labs))h.labs=base.labs;
  if(!h.targets||typeof h.targets!=="object"||Array.isArray(h.targets))h.targets={};
  Object.keys(base.targets).forEach(function(k){if(!Number.isFinite(Number(h.targets[k])))h.targets[k]=base.targets[k];});
  if(typeof h.doctorNotes!=="string")h.doctorNotes=base.doctorNotes;
  return h;
}
function healthCloudSyncEnabled(){
  try{return localStorage.getItem(HEALTH_SYNC_STORE)==="1";}catch(e){return false;}
}
function setHealthCloudSyncEnabled(enabled){
  try{localStorage.setItem(HEALTH_SYNC_STORE,enabled?"1":"0");}catch(e){}
}
function healthHasUserData(h){
  if(!h||typeof h!=="object")return false;
  if((h.foodLog||[]).length||(h.labs||[]).length||(h.doctorNotes||"").trim())return true;
  var defaults=healthDefaults().targets,targets=h.targets||{};
  return Object.keys(defaults).some(function(k){return Number(targets[k])!==Number(defaults[k]);});
}
function deviceId(){
  try{
    var id=localStorage.getItem(DEVICE_STORE);
    if(!id){ id="device-"+uid()+"-"+Date.now().toString(36); localStorage.setItem(DEVICE_STORE,id); }
    return id;
  }catch(e){ return "unknown-device"; }
}
function validateVault(d){
  var errors=[],warnings=[];
  if(!d || typeof d!=="object" || Array.isArray(d)) errors.push("Backup is not a valid GameVault object.");
  if(errors.length) return {ok:false,errors:errors,warnings:warnings};
  VAULT_ARRAY_FIELDS.forEach(function(k){ if(k in d && !Array.isArray(d[k])) errors.push(k+" must be a list."); });
  VAULT_OBJECT_FIELDS.forEach(function(k){ if(k in d && (!d[k] || typeof d[k]!=="object" || Array.isArray(d[k]))) errors.push(k+" must be an object."); });
  if(d.updatedAt!=null && !Number.isFinite(Number(d.updatedAt))) errors.push("updatedAt is invalid.");
  if(!("played" in d) && !("rentals" in d) && !("queue" in d)) warnings.push("This backup has no recognizable library collections.");
  return {ok:errors.length===0,errors:errors,warnings:warnings};
}
function readRecoverySnapshots(){
  try{ var a=JSON.parse(localStorage.getItem(RECOVERY_STORE)||"[]"); return Array.isArray(a)?a:[]; }catch(e){ return []; }
}
function createRecoverySnapshot(reason,source){
  source=source||data;
  if(!source || !vaultSize(source)) return false;
  try{
    var list=readRecoverySnapshots(),raw=JSON.stringify(source);
    if(list[0] && list[0].raw===raw) return true;
    if(raw.length>1800000) return false;
    list.unshift({createdAt:Date.now(),reason:reason||"Manual snapshot",size:vaultSize(source),raw:raw});
    list=list.slice(0,MAX_RECOVERY_SNAPSHOTS);
    while(list.length>1 && JSON.stringify(list).length>2000000) list.pop();
    localStorage.setItem(RECOVERY_STORE,JSON.stringify(list));
    return true;
  }catch(e){ return false; }
}
function addAudit(action,detail){
  if(!data) return;
  if(!Array.isArray(data.audit)) data.audit=[];
  data.audit.unshift({at:Date.now(),action:String(action||"change"),detail:String(detail||""),device:deviceId()});
  data.audit=data.audit.slice(0,200);
}
function adoptVault(incoming,reason,options){
  var checked=validateVault(incoming);
  if(!checked.ok) throw new Error("Backup rejected: "+checked.errors.join(" "));
  var previousHealth=data&&data.health?JSON.parse(JSON.stringify(data.health)):null;
  if(data && vaultSize(data)) createRecoverySnapshot("Before "+(reason||"data restore"),data);
  data=migrate(incoming);
  syncShadow=window.GameVaultCore?GameVaultCore.sync.snapshot(data,SYNC_COLLECTIONS):{};
  if(typeof financeLock==="function") financeLock(true);
  if(options&&options.preserveLocalHealth&&healthHasUserData(previousHealth)) data.health=normalizeHealth(previousHealth);
  applyKeysFromData();
  addAudit("vault-restored",reason||"Cloud/import restore");
  persistSilent();
  return data;
}
function restoreRecoverySnapshot(index){
  var snap=readRecoverySnapshots()[Number(index)||0];
  if(!snap) throw new Error("Recovery snapshot not found");
  var incoming=JSON.parse(snap.raw),checked=validateVault(incoming);
  if(!checked.ok) throw new Error(checked.errors.join(" "));
  createRecoverySnapshot("Before recovery restore",data);
  data=migrate(incoming);
  syncShadow=window.GameVaultCore?GameVaultCore.sync.snapshot(data,SYNC_COLLECTIONS):{};
  if(typeof financeLock==="function") financeLock(true);
  data.updatedAt=Date.now();
  addAudit("recovery-restored",snap.reason||"Recovery snapshot");
  persistSilent(); scheduleAutoPush(); render();
}
function load(){
  var d = null;
  try { var raw = localStorage.getItem(STORE_KEY); if(raw) d = JSON.parse(raw); } catch(e){}
  var fresh = !d;
  if(!d) d = { rentals:[], upcoming:SEED_UPCOMING, played:[] };
  d = migrate(d);
  // A brand-new or cache-wiped device must NEVER look newer than the cloud
  // backup — stamp it as the oldest possible data so any cloud copy wins.
  if(fresh) d.updatedAt = 0;
  return d;
}
/* how much real user data a vault holds — the guard against empty overwrites */
function vaultSize(d){
  return ((d&&d.played)||[]).length + ((d&&d.rentals)||[]).length +
         ((d&&d.rentalHistory)||[]).length + ((d&&d.queue)||[]).length +
         ((d&&d.playing)||[]).length + ((d&&d.movieWatchlist)||[]).length + ((d&&d.watchingMovies)||[]).length +
         ((d&&d.watchedMovies)||[]).length + ((d&&d.hiddenMovies)||[]).length +
         ((d&&d.seriesWatchlist)||[]).length + ((d&&d.watchingSeries)||[]).length + ((d&&d.watchedSeries)||[]).length +
         ((d&&d.hiddenSeries)||[]).length + ((d&&d.biglyHistory)||[]).length +
         ((((d&&d.health)||{}).foodLog)||[]).length + ((d&&d.finance&&d.finance.cipher)?1:0);
}
/* Schema migrations: bump SCHEMA_VERSION when structure changes and add an
   upgrade step below. Old data is always upgraded in place, never recreated. */
var SCHEMA_VERSION = 11;
var SYNC_COLLECTIONS=VAULT_ARRAY_FIELDS.slice();
function mediaCanonicalId(item,kind){
  if(!item)return "";
  if(item.canonicalId)return item.canonicalId;
  if(kind==="film"){
    if(item.tmdbId!=null||item.id!=null)return "tmdb:movie:"+(item.tmdbId!=null?item.tmdbId:item.id);
    if(item.imdbId)return "imdb:"+item.imdbId;
    return "movie:title:"+norm(item.title||item.name)+"|"+String(item.year||"");
  }
  if(kind==="series"){
    if(item.tmdbId!=null||item.id!=null)return "tmdb:tv:"+(item.tmdbId!=null?item.tmdbId:item.id);
    if(item.imdbId)return "imdb:"+item.imdbId;
    return "series:title:"+norm(item.title||item.name)+"|"+String(item.year||"");
  }
  if(item.rawgId!=null)return "rawg:"+item.rawgId;
  return "game:title:"+norm(item.name||item.title)+"|"+String(item.year||"");
}
function normalizedReleases(item,kind){
  var current=item&&item.releases&&typeof item.releases==="object"?item.releases:{};
  var out=Object.assign({},current);
  if(kind==="film"){
    if(item.date&&!out.theatrical)out.theatrical={date:item.date,region:item.releaseRegion||"US",source:item.releaseSource||"TMDB"};
    if(item.ottDate&&!out.digital)out.digital={date:item.ottDate,region:"IN",provider:(item.providers||[])[0]||"",source:item.releaseSource||"TMDB"};
    if(item.blurayDate&&!out.physical)out.physical={date:item.blurayDate,region:"US",source:item.releaseSource||"TMDB"};
  }else if(kind==="series"){
    if(item.date&&!out.firstAir)out.firstAir={date:item.date,region:item.releaseRegion||"",source:item.releaseSource||"TMDB"};
    if(item.ottDate&&!out.digital)out.digital={date:item.ottDate,region:"IN",provider:(item.providers||[])[0]||"",source:item.releaseSource||"TMDB"};
    if(item.latestDate&&!out.latestEpisode)out.latestEpisode={date:item.latestDate,source:"TMDB"};
    if(item.nextEpisode&&item.nextEpisode.date&&!out.nextEpisode)out.nextEpisode={date:item.nextEpisode.date,source:"TMDB"};
  }else if(item.date&&!out.launch){
    out.launch={date:item.date,platform:"PS5",region:item.releaseRegion||"",source:item.src==="seed"?"Curated":item.releaseSource||"RAWG"};
  }
  return out;
}
function normalizeStoredRecord(item,kind){
  if(!item||typeof item!=="object")return item;
  item.canonicalId=mediaCanonicalId(item,kind);
  item.releases=normalizedReleases(item,kind);
  return item;
}
function normalizeStoredLibrary(d){
  ["rentals","upcoming","played","queue","rentalHistory","playing","upcomingRemoved","catalogExtra"].forEach(function(k){
    (d[k]||[]).forEach(function(item){normalizeStoredRecord(item,"game");});
  });
  ["watchedMovies","movieWatchlist","watchingMovies","hiddenMovies"].forEach(function(k){
    (d[k]||[]).forEach(function(item){normalizeStoredRecord(item,"film");});
  });
  ["watchedSeries","seriesWatchlist","watchingSeries","hiddenSeries"].forEach(function(k){
    (d[k]||[]).forEach(function(item){normalizeStoredRecord(item,"series");});
  });
}
function migrate(d){
  if(!d || typeof d!=="object" || Array.isArray(d)) d={};
  VAULT_ARRAY_FIELDS.forEach(function(k){ if(!Array.isArray(d[k])) d[k]=[]; });
  VAULT_OBJECT_FIELDS.forEach(function(k){ if(!d[k] || typeof d[k]!=="object" || Array.isArray(d[k])) d[k]={}; });
  if(!d.dismissed) d.dismissed = [];
  if(!d.catalogExtra) d.catalogExtra = [];
  if(!("lastUpcomingSync" in d)) d.lastUpcomingSync = null;
  if(!("lastCatalogSync" in d)) d.lastCatalogSync = null;
  var v = d.version || 1;
  if(v < 2){ // v2: expenses, remarks, vendors
    if(!d.vendors) d.vendors = [];
    d.rentals.forEach(function(r){ if(!("cost" in r)) r.cost=0; if(!("note" in r)) r.note=""; if(!("vendor" in r)) r.vendor=""; });
    d.played.forEach(function(p){ if(!("cost" in p)) p.cost=0; if(!("note" in p)) p.note=""; if(!("vendor" in p)) p.vendor=""; });
  }
  if(v < 3){ // v3: rental queue / wishlist with priority order
    if(!d.queue) d.queue = [];
  }
  // v4: rental history, current-playing list, shared cover cache
  if(!d.vendors) d.vendors = [];
  if(!d.queue) d.queue = [];
  if(!d.rentalHistory) d.rentalHistory = [];
  if(!d.playing) d.playing = [];
  if(!d.covers) d.covers = {};
  if(!d.dismissedNames) d.dismissedNames = {};
  if(!d.fandom) d.fandom = {}; // per-game saved Fandom reading spot (URL, keyed by norm name)
  if(!d.hubkeys) d.hubkeys = {}; // The Game Hub SKU cache (norm name → {sku,url,title})
  if(!d.upcomingRemoved) d.upcomingRemoved = []; // games removed from Upcoming — never re-added by refresh
  if(!d.keys) d.keys = {}; // synced API keys (rawg, tmdb, omdb) — travel to every device via the cloud backup
  if(!d.watchedMovies) d.watchedMovies = []; // films marked Watched — hidden from lists forever, synced
  if(!d.movieWatchlist) d.movieWatchlist = []; // personal movie watchlist, synced
  if(!d.watchingMovies) d.watchingMovies = []; // movies currently being watched, synced
  if(!d.hiddenMovies) d.hiddenMovies = []; // films marked Not Interested, synced
  if(!d.watchedSeries) d.watchedSeries = []; // TV series marked Watched, synced
  if(!d.seriesWatchlist) d.seriesWatchlist = []; // personal TV series watchlist, synced
  if(!d.watchingSeries) d.watchingSeries = []; // TV shows currently being watched, synced
  if(!d.seriesRatings) d.seriesRatings = {}; // per-series preference ratings, synced
  if(!d.hiddenSeries) d.hiddenSeries = []; // TV series marked Not Interested, synced
  if(!d.aiChats) d.aiChats = {}; // saved AI assistant conversation links by title/service, synced
  if(!d.biglyHistory) d.biglyHistory = []; // completed and manually removed torrents, synced
  if(!d.finance || typeof d.finance!=="object" || Array.isArray(d.finance)) d.finance={}; // encrypted finance envelope only
  d.health=normalizeHealth(d.health);
  // v5: a game appears at most once per library — merge accidental duplicates
  d.played = dedupeList(d.played);
  d.playing = dedupeList(d.playing);
  if(!Array.isArray(d.audit)) d.audit=[];
  d.revision=Math.max(0,Number(d.revision)||0);
  if(!d.updatedAt) d.updatedAt = Date.now();
  normalizeStoredLibrary(d);
  if(window.GameVaultCore)GameVaultCore.sync.ensure(d,SYNC_COLLECTIONS);
  d.version = SCHEMA_VERSION;
  return d;
}
/* keep the newest entry per game name, folding missing details in from the duplicates */
function dedupeList(arr){
  var seen={}, out=[];
  (arr||[]).forEach(function(x){
    if(!x||!x.name) return;
    var n=norm(x.name);
    var first=seen[n];
    if(!first){ seen[n]=x; out.push(x); return; }
    if(!first.rating && x.rating) first.rating=x.rating;
    if(!first.note && x.note) first.note=x.note;
    if(!first.vendor && x.vendor) first.vendor=x.vendor;
    if(!Number(first.cost) && Number(x.cost)) first.cost=x.cost;
    if(!first.score && x.score) first.score=x.score;
    if(!first.rrating && x.rrating) first.rrating=x.rrating;
    if(!first.img && x.img) first.img=x.img;
    if(first.status!=="Platinum" && x.status==="Platinum") first.status="Platinum";
  });
  return out;
}
var data = load();
var syncShadow=window.GameVaultCore?GameVaultCore.sync.snapshot(data,SYNC_COLLECTIONS):{};
function vaultCopyForExport(){
  var copy=JSON.parse(JSON.stringify(data));
  delete copy.keys;
  return copy;
}
function vaultCopyForCloud(){
  var copy=vaultCopyForExport();
  if(!healthCloudSyncEnabled()) delete copy.health;
  copy.nativeTvCatalog=nativeTvCatalogSnapshot();
  delete copy.trustedDeviceConfig;
  copy.cloudPrivacy={apiKeysExcluded:true,encryptedCredentials:!!(copy.secureConfig&&copy.secureConfig.cipher),healthIncluded:healthCloudSyncEnabled()};
  return copy;
}
function trustedDeviceConfigSnapshot(){
  function local(key){try{return localStorage.getItem(key)||"";}catch(e){return "";}}
  var plexUrl="",plexKey="",biglyUrl="",biglyToken="";
  try{plexUrl=typeof plexServerUrl==="function"?plexServerUrl():local("gamevault-plex-url");}catch(e){}
  try{plexKey=typeof plexToken==="function"?plexToken():local("gamevault-plex-token");}catch(e){}
  try{biglyUrl=typeof biglyProxyUrl==="function"?biglyProxyUrl():local("gamevault-biglybt-proxy");}catch(e){}
  try{biglyToken=local("gamevault-biglybt-native-token");}catch(e){}
  return {
    version:1,
    updatedAt:Date.now(),
    api:{rawg:getKey(),tmdb:local("ps5-tmdb-key"),omdb:local("ps5-omdb-key")},
    plex:{url:plexUrl,token:plexKey},
    bigly:{url:biglyUrl,token:biglyToken}
  };
}
var SECURE_CONFIG_SESSION="gamevault-secure-config-pass-v1";
function applySecureConfigPayload(cfg){
  if(!cfg||typeof cfg!=="object")return false;
  function put(key,value){if(typeof value!=="string"||!value)return;try{localStorage.setItem(key,value);}catch(e){}}
  var api=cfg.api||{},plex=cfg.plex||{},bigly=cfg.bigly||{};
  put(KEY_STORE,api.rawg||"");put("ps5-tmdb-key",api.tmdb||"");put("ps5-omdb-key",api.omdb||"");
  put("gamevault-plex-url",plex.url||"");put("gamevault-plex-token",plex.token||"");
  put("gamevault-biglybt-proxy",bigly.url||"");put("gamevault-biglybt-native-token",bigly.token||"");
  return true;
}
function secureConfigSetStatus(message,error){
  var el=document.getElementById("secureConfigStatus");
  if(el){el.textContent=message||"";el.style.color=error?"var(--danger)":"var(--success)";}
}
function secureConfigPassphrase(){
  var input=document.getElementById("secureConfigPass"),value=input&&input.value||"";
  if(value)return value;
  try{return sessionStorage.getItem(SECURE_CONFIG_SESSION)||"";}catch(e){return "";}
}
function secureConfigEncrypt(){
  if(!window.GameVaultCore)return;
  var pass=secureConfigPassphrase();
  secureConfigSetStatus("Encrypting credentials…");
  GameVaultCore.crypto.seal(trustedDeviceConfigSnapshot(),pass).then(function(envelope){
    data.secureConfig=envelope;
    delete data.trustedDeviceConfig;
    try{sessionStorage.setItem(SECURE_CONFIG_SESSION,pass);}catch(e){}
    persist();
    secureConfigSetStatus("Encrypted credentials are included in Drive sync.");
    flash("Credentials encrypted and queued for secure sync");
  }).catch(function(error){secureConfigSetStatus(error.message,true);});
}
function secureConfigUnlock(){
  if(!window.GameVaultCore||!data.secureConfig||!data.secureConfig.cipher){secureConfigSetStatus("No encrypted credential copy is stored yet.",true);return;}
  var pass=secureConfigPassphrase();
  secureConfigSetStatus("Unlocking credentials…");
  GameVaultCore.crypto.open(data.secureConfig,pass).then(function(cfg){
    applySecureConfigPayload(cfg);
    try{sessionStorage.setItem(SECURE_CONFIG_SESSION,pass);}catch(e){}
    secureConfigSetStatus("Synced credentials unlocked on this device.");
    render();refreshRecoveryUi();
    if(getKey())scheduleGameWarmup(tab);
    if(tmdbKey()){ensureFilms(filmTab);ensureSeries(seriesTab);}
  }).catch(function(error){secureConfigSetStatus(error.message,true);});
}
function secureConfigAutoUnlock(){
  var pass="";try{pass=sessionStorage.getItem(SECURE_CONFIG_SESSION)||"";}catch(e){}
  if(!pass||!data.secureConfig||!data.secureConfig.cipher||!window.GameVaultCore)return;
  GameVaultCore.crypto.open(data.secureConfig,pass).then(applySecureConfigPayload).catch(function(){});
}
function nativeTvCatalogSnapshot(){
  function snapshot(cache,keys){
    var out={};
    keys.forEach(function(key){
      var items=cache&&cache[key]&&Array.isArray(cache[key].items)?cache[key].items:[];
      out[key]=items.slice(0,80);
    });
    return out;
  }
  return {
    generatedAt:Date.now(),
    movies:snapshot(typeof filmCache!=="undefined"?filmCache:null,["uphw","bluray","mlott","relhw"]),
    series:snapshot(typeof seriesCache!=="undefined"?seriesCache:null,["seriesnew","seriesupcoming","enseries","mlseries","taseries","hiseries"])
  };
}
function cloudVaultJson(){return JSON.stringify(vaultCopyForCloud());}
function cloudNeedsPrivacyScrub(incoming){
  if(!incoming||typeof incoming!=="object")return false;
  if(incoming.keys&&Object.keys(incoming.keys).length)return true;
  if(incoming.trustedDeviceConfig&&Object.keys(incoming.trustedDeviceConfig).length)return true;
  return !healthCloudSyncEnabled()&&Object.prototype.hasOwnProperty.call(incoming,"health");
}
function vaultFingerprint(d){
  return ["rentals","rentalHistory","playing","queue","played","movieWatchlist","watchingMovies","watchedMovies","seriesWatchlist","watchingSeries","watchedSeries","biglyHistory"].map(function(k){ return k+":"+((d[k]||[]).length); }).join(", ")+", health:"+((((d.health||{}).foodLog)||[]).length)+", finance:"+((d.finance&&d.finance.updatedAt)||0);
}
var lastAuditFingerprint=vaultFingerprint(data);
function getKey(){ try { return localStorage.getItem(KEY_STORE) || ""; } catch(e){ return ""; } }
function persist(){
  var changedAt=Date.now();
  normalizeStoredLibrary(data);
  if(window.GameVaultCore)syncShadow=GameVaultCore.sync.track(data,syncShadow,SYNC_COLLECTIONS,changedAt);
  data.updatedAt = changedAt;
  data.revision=(Number(data.revision)||0)+1;
  data.lastDevice=deviceId();
  var fingerprint=vaultFingerprint(data);
  if(fingerprint!==lastAuditFingerprint){ addAudit("library-counts-changed",fingerprint); lastAuditFingerprint=fingerprint; }
  var snaps=readRecoverySnapshots();
  if(vaultSize(data) && (!snaps.length || Date.now()-snaps[0].createdAt>21600000)) createRecoverySnapshot("Automatic checkpoint",data);
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(data)); }catch(e){ flash("Local storage is full - export a backup now"); }
  if(window.GameVaultCore)GameVaultCore.storage.put("vault",data);
  scheduleAutoPush();
}
function save(){ persist(); render(); }
/* Save derived data (covers, fetched scores) WITHOUT bumping updatedAt, so an
   idle device backfilling artwork can never out-timestamp real edits made on
   another device and roll them back via cloud sync */
function persistSilent(){
  normalizeStoredLibrary(data);
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(data)); }catch(e){}
  if(window.GameVaultCore)GameVaultCore.storage.put("vault",data);
}

/* ---------- device-local API keys (RAWG / TMDB / OMDb) ----------
   API keys stay in localStorage and are excluded from Drive and portable
   backups. Legacy backups may still contain data.keys; the
   helpers below import those values once on the current device, then scrub
   them from the next cloud upload. */
var SYNCED_KEYS={rawg:KEY_STORE, tmdb:"ps5-tmdb-key", omdb:"ps5-omdb-key"};
function setSyncedKey(which, val){
  var s=SYNCED_KEYS[which]; if(!s) return;
  try{ localStorage.setItem(s, val); }catch(e){}
  data.keys={};
  persistSilent();
}
/* legacy cloud/local vault → device-local storage */
function applyKeysFromData(){
  var k=data.keys||{};
  var hadLegacyKeys=Object.keys(k).length>0;
  for(var w in SYNCED_KEYS){
    var local="";try{local=localStorage.getItem(SYNCED_KEYS[w])||"";}catch(e){}
    if(!local&&typeof k[w]==="string"&&k[w]){try{localStorage.setItem(SYNCED_KEYS[w],k[w]);}catch(e){}}
  }
  data.keys={};
  if(hadLegacyKeys)persistSilent();
  applyTrustedDeviceConfig();
}
function applyTrustedDeviceConfig(){
  var cfg=data&&data.trustedDeviceConfig;if(!cfg||typeof cfg!=="object")return;
  applySecureConfigPayload(cfg);
  delete data.trustedDeviceConfig;
  persistSilent();
}
function backfillKeysToData(){
  if(data.keys&&Object.keys(data.keys).length){data.keys={};persistSilent();}
}
/* Import keys from a legacy cloud backup once, then request a sanitized push. */
function reconcileKeys(cloudData){
  var ck=(cloudData&&cloudData.keys)||{};
  var res={changed:false,push:false};
  for(var w in SYNCED_KEYS){
    var local=""; try{ local=localStorage.getItem(SYNCED_KEYS[w])||""; }catch(e){}
    var cloud=ck[w]||"";
    if(cloud){res.push=true;if(!local){try{localStorage.setItem(SYNCED_KEYS[w],cloud);}catch(e){}res.changed=true;}}
  }
  data.keys={};
  return res;
}

var toastTimer = null, undoFn = null;
function flash(msg, undoCb){
  var t=document.getElementById("toast");
  undoFn=undoCb||null;
  t.innerHTML=esc(msg)+(undoCb?'&nbsp; <b id="undoBtn" style="cursor:pointer;text-decoration:underline">UNDO</b>':'');
  t.style.display="none";
  void t.offsetWidth; t.style.display="block";
  clearTimeout(toastTimer);
  toastTimer=setTimeout(function(){ t.style.display="none"; undoFn=null; }, undoCb?6000:2600);
}
document.getElementById("toast").addEventListener("click",function(e){
  if(e.target.id==="undoBtn" && undoFn){
    var f=undoFn; undoFn=null;
    this.style.display="none";
    f();
  }
});

/* ---------- fetch helper ---------- */
function fetchWithPolicy(url,options,policy){
  if(window.GameVaultCore)return GameVaultCore.request(url,options,policy);
  options=options||{}; policy=policy||{};
  var attempts=Math.max(1,(policy.retries==null?1:policy.retries)+1);
  var timeout=Math.max(1000,policy.timeout||15000);
  function run(n){
    var controller=typeof AbortController!=="undefined"?new AbortController():null;
    var timer=controller?setTimeout(function(){ controller.abort(); },timeout):null;
    var opts=Object.assign({},options);
    if(controller) opts.signal=controller.signal;
    return fetch(url,opts).then(function(res){
      if(timer) clearTimeout(timer);
      if(!res.ok && n+1<attempts && (res.status>=500 || res.status===429)) throw new Error("RETRY_HTTP_"+res.status);
      return res;
    }).catch(function(err){
      if(timer) clearTimeout(timer);
      if(n+1>=attempts || (options.method && options.method!=="GET")) throw err;
      return new Promise(function(resolve){ setTimeout(resolve,350*(n+1)); }).then(function(){ return run(n+1); });
    });
  }
  return run(0);
}
function rawgFetch(url){
  return fetchWithPolicy(url,{}, {timeout:15000,retries:1}).then(function(res){
    if(!res.ok) throw new Error("HTTP "+res.status);
    return res.json();
  });
}

/* ---------- automatic sync engine ---------- */
/* Every signed-in device converges on the same Drive backup automatically. */
var lastSyncedAt = 0;
var autoPushTimer = null;
function setSyncStatus(s){
  var el=document.getElementById("syncStatus"); if(el) el.textContent=s?(" · "+s):"";
  var pill=document.getElementById("desktopSyncPill");
  if(pill){
    var text=s||((typeof cloudMode==="function"&&cloudMode())?"Cloud ready":"Local data");
    pill.textContent=text;
    pill.title=text;
    pill.classList.toggle("saving",/saving|checking/i.test(text));
    pill.classList.toggle("error",/fail|error|retry/i.test(text));
    pill.classList.toggle("ok",/synced|up to date|ready/i.test(text));
  }
  var rail=document.getElementById("desktopRailSync"),railText=document.getElementById("desktopRailSyncText");
  if(rail){
    var railValue=s||((typeof cloudMode==="function"&&cloudMode())?"Cloud ready":"Local data");
    if(railText) railText.textContent=railValue;
    rail.title=railValue+" — click to sync";
    rail.classList.toggle("saving",/saving|checking/i.test(railValue));
    rail.classList.toggle("error",/fail|error|retry/i.test(railValue));
    rail.classList.toggle("ok",/synced|up to date|ready/i.test(railValue));
  }
}

function scheduleAutoPush(){
  if(!cloudMode()) return; // nothing to sync to yet
  clearTimeout(autoPushTimer);
  setSyncStatus("Saving…");
  autoPushTimer=setTimeout(function(){ silentPush(); }, 2500);
}
function prepareCloudVault(incoming){
  var copy=JSON.parse(JSON.stringify(incoming||{}));
  delete copy.nativeTvCatalog;
  delete copy.cloudPrivacy;
  return migrate(copy);
}
function mergeAutomaticCloud(incoming,reason){
  var remote=prepareCloudVault(incoming);
  var localSize=vaultSize(data),remoteSize=vaultSize(remote);
  if(remoteSize===0&&localSize>0)return {changedLocal:false,needsPush:true};
  if(localSize===0&&remoteSize>0){
    adoptVault(remote,reason,{preserveLocalHealth:!healthCloudSyncEnabled()});
    return {changedLocal:true,needsPush:false};
  }
  if(!window.GameVaultCore){
    if(Number(remote.updatedAt||0)>Number(data.updatedAt||0)){
      adoptVault(remote,reason,{preserveLocalHealth:!healthCloudSyncEnabled()});
      return {changedLocal:true,needsPush:false};
    }
    return {changedLocal:false,needsPush:Number(data.updatedAt||0)>Number(remote.updatedAt||0)};
  }
  var localBefore=GameVaultCore.stable(data),remoteBefore=GameVaultCore.stable(remote);
  var merged=GameVaultCore.sync.merge(data,remote,SYNC_COLLECTIONS);
  if(!healthCloudSyncEnabled()&&healthHasUserData(data.health))merged.health=JSON.parse(JSON.stringify(data.health));
  var changedLocal=GameVaultCore.stable(merged)!==localBefore;
  var needsPush=GameVaultCore.stable(merged)!==remoteBefore;
  if(changedLocal){
    adoptVault(merged,reason,{preserveLocalHealth:!healthCloudSyncEnabled()});
    syncShadow=GameVaultCore.sync.snapshot(data,SYNC_COLLECTIONS);
  }
  return {changedLocal:changedLocal,needsPush:needsPush};
}
/* ---------- Google Drive sync (primary) ----------
   Browser-only OAuth via Google Identity Services (loaded from CDN in <head>).
   The whole vault lives as one JSON file (SinuGameVault.json) created by this
   app in the user's Drive under the non-sensitive drive.file scope — the app
   can always find its own file again after a sign-in, so clearing the cache
   loses nothing. */
var GD_CLIENT_STORE="ps5-gd-client", GD_TOKEN_STORE="ps5-gd-token", GD_FILE_STORE="ps5-gd-file";
var GD_HISTORY_STORE="ps5-gd-history-at", GD_HISTORY_PREFIX="game-vault-history-";
var GD_FILENAME="game-vault-backup.json";
var GD_SCOPE="https://www.googleapis.com/auth/drive.file";
var gdTokenClient=null, gdRefreshing=false, gdStoredBytes=0, gdStoredFiles=0;
/* Baked-in Google OAuth Client ID (public by design — its security is the
   Authorized JavaScript origins list, not secrecy). Lets a fresh/wiped device
   connect Drive and pull everything back with no manual entry. A value saved
   in Settings still overrides it. */
var GD_CLIENT_DEFAULT="898110284062-76km1uptkth506kgaecoafohu15js0rh.apps.googleusercontent.com";
function gdClientId(){ try{ return localStorage.getItem(GD_CLIENT_STORE)||GD_CLIENT_DEFAULT; }catch(e){ return GD_CLIENT_DEFAULT; } }
function gdTok(){ try{ return JSON.parse(localStorage.getItem(GD_TOKEN_STORE)||"null"); }catch(e){ return null; } }
function gdSaveTok(t){ try{ if(t) localStorage.setItem(GD_TOKEN_STORE,JSON.stringify(t)); else localStorage.removeItem(GD_TOKEN_STORE); }catch(e){} }
function gdConnected(){ return !!(gdClientId() && gdTok()); }
function cloudMode(){ return gdConnected() ? "drive" : ""; }

var gdLibPromise=null;
function gdOauthReady(){
  return !!(window.google && google.accounts && google.accounts.oauth2);
}
function gdLoadGoogleIdentity(){
  if(gdOauthReady()) return Promise.resolve();
  if(gdLibPromise) return gdLibPromise;
  gdLibPromise=new Promise(function(resolve,reject){
    var done=false;
    function finish(err){
      if(done) return;
      if(err){ done=true; gdLibPromise=null; reject(err); return; }
      if(gdOauthReady()){ done=true; resolve(); }
    }
    var existing=document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    var s=existing||document.createElement("script");
    if(!existing){
      s.src="https://accounts.google.com/gsi/client";
      s.async=true;
      s.defer=true;
      document.head.appendChild(s);
    }
    var timer=setInterval(function(){ finish(); },250);
    var timeout=setTimeout(function(){
      clearInterval(timer);
      finish(new Error("Google sign-in library could not load. Check the TV browser internet/privacy settings, then retry."));
    },15000);
    s.addEventListener("load",function(){ clearTimeout(timeout); clearInterval(timer); finish(); },{once:true});
    s.addEventListener("error",function(){
      clearTimeout(timeout); clearInterval(timer);
      finish(new Error("Google sign-in library was blocked by the browser."));
    },{once:true});
  });
  return gdLibPromise;
}
function gdEnsureClient(){
  if(gdTokenClient) return gdTokenClient;
  var cid=gdClientId();
  if(!cid || !gdOauthReady()) return null;
  gdTokenClient=google.accounts.oauth2.initTokenClient({client_id:cid, scope:GD_SCOPE, callback:function(){}});
  return gdTokenClient;
}
function gdToken(){
  var t=gdTok();
  if(t && t.access_token && Date.now()<(t.exp||0)-60000) return Promise.resolve(t.access_token);
  if(!gdClientId()) return Promise.reject(new Error("No Client ID saved"));
  return gdLoadGoogleIdentity().then(function(){
    var readyClient=gdEnsureClient();
    if(!readyClient) throw new Error("Google sign-in library still loading - try again");
    return new Promise(function(resolve,reject){
      readyClient.callback=function(resp){
        if(resp && resp.access_token){
          gdSaveTok({access_token:resp.access_token, exp:Date.now()+(Number(resp.expires_in)||3600)*1000});
          gdSetStatus();
          resolve(resp.access_token);
        } else reject(new Error((resp&&resp.error)||"Sign-in failed"));
      };
      readyClient.error_callback=function(err){ reject(new Error((err&&err.type)||"Sign-in failed")); };
      try{ readyClient.requestAccessToken({prompt:""}); }catch(e){ reject(e); }
    });
  });
}
function gdApi(url,opts,tok){
  opts=opts||{}; opts.headers=opts.headers||{};
  opts.headers.Authorization="Bearer "+tok;
  return fetchWithPolicy(url,opts,{scope:"drive:api",timeout:20000,retries:opts.method&&opts.method!=="GET"?0:1}).then(function(r){
    if(r.status===401){ gdSaveTok(null); gdSetStatus(); throw new Error("Google session expired — sign in again"); }
    if(!r.ok) throw new Error("Drive HTTP "+r.status);
    return r;
  });
}
function gdFind(tok){
  // Always re-list (never trust a cached id): if two devices ever raced and
  // each created its own backup file, every device converges on the newest
  // one and the older duplicates are moved to trash — self-healing.
  var q=encodeURIComponent("name='"+GD_FILENAME+"' and trashed=false");
  return gdApi("https://www.googleapis.com/drive/v3/files?q="+q+"&fields=files(id,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=10",{},tok)
  .then(function(r){ return r.json(); })
  .then(function(j){
    var files=j.files||[];
    if(!files.length) return "";
    var keep=files[0].id;
    try{ localStorage.setItem(GD_FILE_STORE,keep); }catch(e){}
    files.slice(1).forEach(function(f){
      gdApi("https://www.googleapis.com/drive/v3/files/"+f.id,
        {method:"PATCH",headers:{"Content-Type":"application/json"},body:'{"trashed":true}'},tok)
      .catch(function(){});
    });
    return keep;
  });
}
var gdUploadQueue=Promise.resolve();
function gdUpload(keepalive){
  function runUpload(){
    var body="",uploadedAt=0;
    return gdToken().then(function(tok){
      return gdFind(tok).then(function(fid){
        var reconcile=fid?gdApi("https://www.googleapis.com/drive/v3/files/"+fid+"?alt=media",{},tok)
          .then(function(response){return response.json();})
          .then(function(remote){
            if(remote&&remote.rentals&&remote.upcoming&&remote.played&&remote.lastDevice!==deviceId()){
              var result=mergeAutomaticCloud(remote,"Google Drive pre-upload merge");
              if(result.changedLocal)render();
            }
          }).catch(function(error){reportError("drive:pre-upload-merge",error);}):Promise.resolve();
        return reconcile.then(function(){
          body=cloudVaultJson();uploadedAt=Number(data.updatedAt)||0;
        if(fid){
          return gdApi("https://www.googleapis.com/upload/drive/v3/files/"+fid+"?uploadType=media",
            {method:"PATCH",headers:{"Content-Type":"application/json"},body:body,keepalive:!!keepalive},tok);
        }
        var boundary="gv"+Date.now();
        var mp="--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+
          JSON.stringify({name:GD_FILENAME,mimeType:"application/json"})+
          "\r\n--"+boundary+"\r\nContent-Type: application/json\r\n\r\n"+body+"\r\n--"+boundary+"--";
        return gdApi("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
          {method:"POST",headers:{"Content-Type":"multipart/related; boundary="+boundary},body:mp},tok)
        .then(function(r){ return r.json(); })
        .then(function(j){ try{ localStorage.setItem(GD_FILE_STORE,j.id); }catch(e){} });
        });
      }).then(function(){ return gdMaybeHistory(tok,body); })
      .then(function(){ return gdRefreshUsage(tok); })
      .then(function(){ return uploadedAt; });
    });
  }
  gdUploadQueue=gdUploadQueue.catch(function(){}).then(runUpload);
  return gdUploadQueue;
}
function gdDownload(){
  return gdToken().then(function(tok){
    return gdFind(tok).then(function(fid){
      if(!fid) return null;
      return gdApi("https://www.googleapis.com/drive/v3/files/"+fid+"?alt=media",{},tok)
      .then(function(r){ return r.json(); });
    });
  });
}
function gdSetStatus(){
  var el=document.getElementById("gdStatus");
  var usage=document.getElementById("gdUsage");
  var out=document.getElementById("gdSignOutBtn");
  var inn=document.getElementById("gdSignInBtn");
  if(!el) return;
  if(!gdClientId()){ el.textContent="Paste your Client ID above, then sign in."; if(usage)usage.textContent="GameVault Drive storage: not connected."; out.style.display="none"; inn.style.display=""; return; }
  var t=gdTok();
  if(!t){ el.textContent="Not connected."; if(usage)usage.textContent="GameVault Drive storage: not connected."; out.style.display="none"; inn.style.display=""; return; }
  el.textContent = Date.now()<(t.exp||0)-60000 ? "✓ Connected — auto-sync to Drive is on." : "✓ Connected — session renews on your next tap.";
  if(usage)usage.textContent="GameVault Drive storage: "+formatStorageBytes(gdStoredBytes||new Blob([cloudVaultJson()]).size)+(gdStoredFiles?" across "+gdStoredFiles+" backup file"+(gdStoredFiles===1?"":"s"):" estimated current backup");
  out.style.display=""; inn.style.display="none";
}
function formatStorageBytes(n){n=Math.max(0,Number(n)||0);if(n<1024)return n+" B";if(n<1048576)return (n/1024).toFixed(n<10240?1:0)+" KB";return (n/1048576).toFixed(n<10485760?2:1)+" MB";}
function gdRefreshUsage(tok){
  if(!tok)return Promise.resolve();
  var q=encodeURIComponent("(name='"+GD_FILENAME+"' or name contains '"+GD_HISTORY_PREFIX+"') and trashed=false");
  return gdApi("https://www.googleapis.com/drive/v3/files?q="+q+"&fields=files(id,size)&pageSize=100",{},tok).then(function(r){return r.json();}).then(function(j){var files=j.files||[];gdStoredFiles=files.length;gdStoredBytes=files.reduce(function(n,f){return n+(Number(f.size)||0);},0);gdSetStatus();}).catch(function(){});
}
function gdSignIn(){
  if(!gdClientId()){ flash("Paste your Google OAuth Client ID first"); return; }
  var el=document.getElementById("gdStatus");
  if(el) el.textContent="Loading Google sign-in...";
  gdToken().then(function(){
    flash("Google Drive connected — it is now your primary sync");
    gdSetStatus(); gdToken().then(gdRefreshUsage).catch(function(){}); silentPullOnLoad();
  }).catch(function(e){ flash("Google sign-in failed — "+e.message); });
}
function gdSignOut(){
  var t=gdTok();
  try{ if(t && t.access_token && window.google && google.accounts && google.accounts.oauth2) google.accounts.oauth2.revoke(t.access_token,function(){}); }catch(e){}
  gdSaveTok(null);
  try{ localStorage.removeItem(GD_FILE_STORE); }catch(e){}
  gdSetStatus(); setSyncStatus("");
  flash("Google Drive disconnected");
}
/* while the tab is open and idle, look for changes from the other device */
setInterval(function(){
  if(document.visibilityState!=="visible") return;
  if(cloudMode()!=="drive") return;
  if(data.updatedAt>lastSyncedAt) return; // local edits pending — push wins first
  silentPullOnLoad();
},120000);

/* access tokens last ~1h and renewing needs a user gesture — piggyback on taps */
document.addEventListener("click",function(){
  if(gdRefreshing || !gdClientId()) return;
  var t=gdTok(); if(!t) return;
  if(Date.now()<(t.exp||0)-10*60000) return;
  gdRefreshing=true;
  gdToken().catch(function(){}).then(function(){ gdRefreshing=false; });
},true);

/* ---------- Google Drive cloud dispatch ---------- */
var cloudChecked=false; // true once this session has compared against the cloud copy
function silentPush(keepalive){
  // never auto-push an empty vault before we've seen what the cloud holds —
  // a cache-wiped device must pull the backup, not overwrite it
  if(vaultSize(data)===0 && !cloudChecked){ silentPullOnLoad(); return; }
  if(!gdConnected())return;
  gdUpload(keepalive).then(function(uploadedAt){
    lastSyncedAt=Math.max(lastSyncedAt,uploadedAt||0);
    setSyncStatus("Synced to Drive just now");
    if((data.updatedAt||0)>(uploadedAt||0)) schedulePush();
  }).catch(function(){ setSyncStatus("Drive sync failed — will retry on next change"); });
}
function silentPullOnLoad(){
  if(!gdConnected())return;
  setSyncStatus("Checking Google Drive…");
  gdDownload().then(function(d){
    cloudChecked=true;
    if(!d){ silentPush(); return; } // no backup file yet — seed Drive from this device
    if(!d.rentals||!d.upcoming||!d.played){ setSyncStatus(""); return; }
    var cloudTime=d.updatedAt||0, localTime=data.updatedAt||0,privacyScrub=cloudNeedsPrivacyScrub(d);
    // A cache-wiped device must adopt a populated cloud copy, never overwrite it.
    var mustAdopt = vaultSize(data)===0 && vaultSize(d)>0;
    var different=cloudTime!==localTime||(window.GameVaultCore&&GameVaultCore.stable(prepareCloudVault(d))!==GameVaultCore.stable(data));
    if(different || mustAdopt){
      var mergeResult=mergeAutomaticCloud(d,"Google Drive automatic merge"),rkA=reconcileKeys(d);
      lastSyncedAt=data.updatedAt;
      if(mergeResult.changedLocal){render();setSyncStatus("Merged updates from Google Drive");flash("Merged newer data from Google Drive");setTimeout(backfillImages,800);}
      if(mergeResult.needsPush||rkA.push||privacyScrub)persist();else setSyncStatus("Up to date");
    } else {
      lastSyncedAt=cloudTime;
      var rkC=reconcileKeys(d);
      if(rkC.changed) render();
      if(rkC.push||privacyScrub){ persist(); setSyncStatus("Refreshing private Drive backup"); }
      else setSyncStatus("Up to date");
    }
  }).catch(function(){ setSyncStatus("Drive check failed — tap ↻ to retry"); });
}

/* ---------- RAWG live updates ---------- */
function refreshUpcoming(silent){
  var key=getKey();
  if(!key){ if(!silent){flash("Add your free RAWG API key in Settings first");toggleSettings(true);} return Promise.resolve(false); }
  if(busy) return Promise.resolve(false); busy=true; if(!silent)render();
  var t=today(); var end=new Date(t); end.setFullYear(end.getFullYear()+1);
  var url="https://api.rawg.io/api/games?key="+encodeURIComponent(key)+
    "&platforms=187&dates="+localISO(t)+","+localISO(end)+
    "&ordering=-added&page_size=30";
  return rawgFetch(url).then(function(json){
    var fetched=(json.results||[]).filter(function(g){ return g && g.name; }).map(function(g){
      return {
        id:uid(), name:g.name, date:g.released||null,
        note:(g.genres||[]).slice(0,3).map(function(x){return x.name;}).join(" · ")||"Upcoming PS5 release",
        want:false, src:"auto", img:g.background_image||""
      };
    });
    // keep: starred entries, manual entries, seeds the user hasn't removed; replace old auto entries
    var kept=data.upcoming.filter(function(g){ return g.want || g.src!=="auto"; });
    var have={}; kept.forEach(function(g){ have[norm(g.name)]=1; });
    // never re-add games the user explicitly removed
    (data.upcomingRemoved||[]).forEach(function(g){ have[norm(g.name)]=1; });
    var added=0;
    fetched.forEach(function(g){
      if(g.img) data.covers[norm(g.name)]=g.img;
      if(!have[norm(g.name)]){ kept.push(g); have[norm(g.name)]=1; added++; }
    });
    data.upcoming=kept;
    data.lastUpcomingSync=new Date().toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
    data.lastUpcomingSyncAt=Date.now();
    busy=false; persist();
    if(section==="games"&&tab==="upcoming")render();
    if(!silent)flash("Watchlist updated — "+added+" new release"+(added===1?"":"s")+" from the internet");
    return true;
  }).catch(function(err){
    busy=false;if(section==="games"&&tab==="upcoming")render();
    if(!silent)flash("Update failed — check internet connection and API key");
    return false;
  });
}

function refreshCatalog(silent){
  var key=getKey();
  if(!key){ if(!silent){flash("Add your free RAWG API key in Settings first");toggleSettings(true);} return Promise.resolve(false); }
  if(busy) return Promise.resolve(false); busy=true; if(!silent)render();
  var url="https://api.rawg.io/api/games?key="+encodeURIComponent(key)+
    "&platforms=187&dates="+PS5_LAUNCH+","+localISO(today())+
    "&ordering=-metacritic&metacritic=80,100&page_size=40";
  return rawgFetch(url).then(function(json){
    var have={}; BUILTIN_CATALOG.forEach(function(g){ have[norm(g.name)]=1; });
    var extra=[]; var added=0;
    (json.results||[]).forEach(function(g){
      if(!g || !g.name) return;
      if(g.background_image) data.covers[norm(g.name)]=g.background_image;
      if(have[norm(g.name)]) return;
      extra.push({
        name:g.name,
        year:g.released?Number(g.released.slice(0,4)):null,
        score:g.metacritic||null,
        rating:g.rating||null,
        date:g.released||null,
        playtime:g.playtime||0,
        genre:(g.genres&&g.genres[0]&&g.genres[0].name)||"Other",
        note:(g.genres||[]).slice(0,3).map(function(x){return x.name;}).join(" · "),
        img:g.background_image||"",
        tier:(g.added>=8000?"AAA":g.added>=2500?"AA":"Indie")
      });
      have[norm(g.name)]=1; added++;
    });
    data.catalogExtra=extra;
    data.lastCatalogSync=new Date().toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
    data.lastCatalogSyncAt=Date.now();
    busy=false; persist();
    if(section==="games"&&tab==="suggest")render();
    if(!silent)flash("Suggestions catalog updated — "+added+" extra top-rated games added");
    return true;
  }).catch(function(err){
    busy=false;if(section==="games"&&tab==="suggest")render();
    if(!silent)flash("Update failed — check internet connection and API key");
    return false;
  });
}
function scheduleGameWarmup(currentTab){
  if(!getKey()||navigator.onLine===false||document.visibilityState==="hidden") return;
  if(navigator.connection&&navigator.connection.saveData) return;
  mediaIdle(function(){
    var first=currentTab==="suggest"?"catalog":"upcoming";
    var tasks=first==="catalog"?[
      function(){return Date.now()-Number(data.lastCatalogSyncAt||0)>12*3600*1000?refreshCatalog(true):false;},
      function(){return Date.now()-Number(data.lastUpcomingSyncAt||0)>6*3600*1000?refreshUpcoming(true):false;}
    ]:[
      function(){return Date.now()-Number(data.lastUpcomingSyncAt||0)>6*3600*1000?refreshUpcoming(true):false;},
      function(){return Date.now()-Number(data.lastCatalogSyncAt||0)>12*3600*1000?refreshCatalog(true):false;}
    ];
    Promise.resolve(tasks[0]()).then(function(){mediaIdle(function(){tasks[1]();},2200);});
  },1500);
}

/* ---------- expenses & score enrichment ---------- */
function fmtMoney(n){ return "₹"+Number(n||0).toLocaleString("en-IN"); }
function totalSpent(){
  var t=0;
  data.rentals.forEach(function(r){ t+=Number(r.cost)||0; });
  data.rentalHistory.forEach(function(h){ t+=Number(h.cost)||0; });
  data.played.forEach(function(p){ t+=Number(p.cost)||0; });
  return t;
}
function scoreBits(x){
  var s="";
  if(x.score) s+=' · <span style="color:'+scoreColor(x.score)+';font-weight:700">Critic '+x.score+'</span>';
  if(x.rrating) s+=' · '+x.rrating+'★';
  return s;
}
function enrichScore(list,id){
  var key=getKey(); if(!key) return;
  var item=byId(data[list],id); if(!item || (item.score && ("img" in item))) return;
  rawgFetch("https://api.rawg.io/api/games?key="+encodeURIComponent(key)+"&search="+encodeURIComponent(item.name)+"&page_size=1")
  .then(function(json){
    var g=(json.results||[])[0]; if(!g) return;
    var it=byId(data[list],id); if(!it) return;
    if(g.metacritic) it.score=g.metacritic;
    if(g.rating) it.rrating=Math.round(g.rating*10)/10;
    if(g.genres&&g.genres[0]&&g.genres[0].name) it.genre=g.genres[0].name;
    if(g.released&&!it.date) it.date=g.released;
    if(g.playtime) it.playtime=g.playtime;
    it.img=g.background_image||"";
    if(it.img) data.covers[norm(it.name)]=it.img;
    persistSilent(); maybeRender();
  }).catch(function(){});
}

/* ---------- cover images ---------- */
function thumb(u){ return u ? u.replace("/media/","/media/resize/200/-/") : u; }
function coverUrl(x){ return (x&&x.img) || data.covers[norm(x.name)] || ""; }
function coverImg(x,cls){
  var u=coverUrl(x);
  var name=(x&&x.name)||"Game";
  if(u) return '<img class="cover'+(cls?" "+cls:"")+'" src="'+esc(thumb(u))+'" onerror="this.onerror=null;this.src=\'icon.png\';this.classList.add(\'fallback-art\')" alt="'+esc(name)+' cover" loading="lazy">';
  return '<img class="cover fallback-art'+(cls?" "+cls:"")+'" src="icon.png" alt="Cover unavailable for '+esc(name)+'" loading="lazy">';
}
function gameCoverHero(x){
  var u=coverUrl(x);
  var name=(x&&x.name)||"Game";
  return u?'<img src="'+esc(thumb(u))+'" onerror="this.onerror=null;this.src=\'icon.png\';this.classList.add(\'fallback-art\')" alt="'+esc(name)+' cover" loading="lazy">':'<img class="fallback-art" src="icon.png" alt="Cover unavailable for '+esc(name)+'" loading="lazy">';
}
function gameViewToggle(){
  return '<div class="viewbar"><span class="viewlbl">View</span>'+
    '<button class="gchip '+(gameView==="grid"?"on":"")+'" data-act="game-view" data-view="grid">Grid View</button>'+
    '<button class="gchip '+(gameView==="list"?"on":"")+'" data-act="game-view" data-view="list">List View</button>'+
  '</div>';
}
function gameTileState(x,id,sub){
  if(tab==="rentals") return byId(data.rentals,id)?["ACTIVE RENTAL","rental"]:["HISTORY","history"];
  if(tab==="playing"){
    if(x.status==="Dropped"||sub==="On Hold") return ["ON HOLD","hold"];
    if(x.status==="Playing"||sub==="Resume") return ["RESUME LATER","resume"];
    return ["PLAYING","playing"];
  }
  if(tab==="queue") return ["QUEUE","queue"];
  if(tab==="upcoming") return ["UPCOMING","upcoming"];
  if(tab==="suggest") return ["DISCOVER","discover"];
  if(tab==="played") return ["COMPLETED","completed"];
  return null;
}
function gameTilePrimary(x,id){
  var sid=esc(String(id));
  if(tab==="rentals"){
    if(byId(data.rentals,id)) return '<button class="btn blue game-primary" data-act="return-played" data-id="'+sid+'">&#10003; Return &amp; complete</button>';
    return '<button class="btn game-primary" data-act="hist-again" data-id="'+sid+'">Rent again</button>';
  }
  if(tab==="playing"){
    if(byId(data.rentals,id)) return '<button class="btn blue game-primary" data-act="return-played" data-id="'+sid+'">&#10003; Finish game</button>';
    if(byId(data.playing,id)) return '<button class="btn blue game-primary" data-act="pl-played" data-id="'+sid+'">&#10003; Finish game</button>';
    return '<button class="btn game-primary" data-act="played-now" data-id="'+sid+'">Play now</button>';
  }
  if(tab==="queue") return '<button class="btn blue game-primary" data-act="q-rent" data-id="'+sid+'">Start rental</button>';
  if(tab==="upcoming") return '<button class="btn blue game-primary" data-act="up-queue" data-id="'+sid+'">+ Rental Queue</button>';
  if(tab==="suggest") return '<button class="btn blue game-primary" data-act="sug-queue" data-name="'+esc(x.name)+'">+ Rental Queue</button>';
  if(tab==="played") return '<button class="btn game-primary" data-act="played-resume" data-id="'+sid+'">Resume later</button>';
  return "";
}
function gameTile(x,id,sub,detailHtml){
  var score=x&&x.rating?("Your rating "+Math.round(x.rating*10)/10+" / 5"):(x&&x.score?("Metacritic "+x.score):(x&&x.rrating?("RAWG "+x.rrating+" / 5"):"Rating unavailable"));
  var state=gameTileState(x,id,sub);
  return '<div class="card game-tile">'+(state?'<span class="title-state state-game-'+state[1]+'">'+state[0]+'</span>':'')+'<div class="game-tile-main" role="button" tabindex="0" data-act="game-open" data-id="'+esc(String(id))+'">'+
    '<div class="game-cover-wrap">'+gameCoverHero(x)+'</div>'+
    '<div class="game-tile-info"><div class="game-tile-title" title="'+esc(x.name)+'">'+esc(x.name)+'</div>'+
    '<div class="game-tile-meta"><span class="game-pill">'+esc(score)+'</span><span class="game-pill">'+esc(x.genre||tierFor(x.name)||"PS5")+'</span>'+(sub?'<span class="game-pill">'+sub+'</span>':'')+'</div>'+
    (detailHtml?'<div class="game-tile-detail">'+detailHtml+'</div>':'')+gameReleaseMeta(x)+'</div>'+
  '</div><div class="game-card-actions">'+gameTilePrimary(x,id)+'</div></div>';
}
function rentalDaysChip(left){
  var label=left<=0?"Expired":left+" day"+(left===1?"":"s")+" left";
  return '<span class="rent-days" style="color:'+urgency(left)+'">'+esc(label)+'</span>';
}
function gameFindById(id){
  var lists=[data.rentals,data.rentalHistory,data.playing,data.queue,data.upcoming,data.played,fullCatalog(),webResults.items||[]];
  for(var li=0; li<lists.length; li++){
    for(var i=0;i<(lists[li]||[]).length;i++){
      var x=lists[li][i];
      if(!x) continue;
      if(String(x.id)===String(id)) return x;
      if(String(id).indexOf("name:")===0 && norm(x.name)===id.slice(5)) return x;
    }
  }
  return null;
}
function gamePage(x,actionsHtml,extraHtml){
  var cinematic=coverUrl(x);
  var release=x.date?fmt(x.date):(x.year||"Not listed");
  var community=x.rating?(Math.round(Number(x.rating)*10)/10+" / 5"):(x.rrating?(Math.round(Number(x.rrating)*10)/10+" / 5"):"Not rated");
  var context={rentals:"RENTAL",playing:"NOW PLAYING",queue:"RENTAL QUEUE",upcoming:"UPCOMING RELEASE",suggest:"DISCOVER",played:"COMPLETED"}[tab]||"GAME";
  return '<div class="game-page">'+detailToolbar("game",x)+(cinematic?'<div class="phone-detail-backdrop landscape" style="background-image:url(&quot;'+esc(cinematic)+'&quot;)"></div>':'')+
    '<div class="game-page-head"><div class="game-page-cover">'+gameCoverHero(x)+'</div>'+
    '<div class="game-page-info"><div class="game-page-kicker"><span>PLAYSTATION 5</span><span>'+context+'</span></div>'+
    '<div class="game-page-title">'+esc(x.name)+'</div>'+
    '<div class="game-page-sub game-page-badges">'+badges(x.name)+(x.genre?'<span class="game-pill">'+esc(x.genre)+'</span>':'')+'</div>'+
    '<div class="game-fact-grid">'+
      '<div class="game-fact"><span>Release</span><b>'+esc(String(release))+'</b></div>'+
      '<div class="game-fact"><span>Genre</span><b>'+esc(x.genre||"Not listed")+'</b></div>'+
      '<div class="game-fact"><span>Metacritic</span><b>'+(x.score?esc(String(x.score))+" / 100":"Not rated")+'</b></div>'+
      '<div class="game-fact"><span>'+(x.rating?"Your rating":"RAWG community")+'</span><b>'+esc(community)+'</b></div>'+
    '</div>'+
    gameReleaseMeta(x)+
    (x.note?'<div class="game-page-overview"><span>Overview</span><p>'+esc(x.note)+'</p></div>':'')+'</div></div>'+
    gameLibraryDetails(x)+'<div class="detail-section-label">Actions &amp; links</div><div class="actions detail-actionbar">'+(actionsHtml||"")+linkBtns(x.name)+'</div>'+
    (tab==="playing"?plotBlock(x.name):"")+(extraHtml||"")+'</div>';
}
function gameLibraryDetails(x){
  var items=[];
  if(tab==="rentals"){
    if(x.start)items.push(["Rented",fmt(x.start)]);
    if(x.start&&x.days){var due=parseD(x.start);due.setDate(due.getDate()+Number(x.days));items.push(["Return date",fmt(localISO(due))]);}
    if(x.vendor)items.push(["Vendor",x.vendor]);if(Number(x.cost))items.push(["Rental cost",fmtMoney(x.cost)]);
  }else if(tab==="queue"){
    if(x.avail)items.push(["Available from",fmt(x.avail)]);items.push(["Queue position",String(qIndex(x.id)+1)]);
  }else if(tab==="upcoming"){
    if(x.date){var left=daysBetween(today(),parseD(x.date));items.push(["Countdown",left<0?"Available now":left===0?"Releases today":left+" days left"]);}
  }else if(tab==="playing"){
    if(x.start)items.push(["Started / rented",fmt(x.start)]);if(x.status)items.push(["Playing status",STATUS_LABEL[x.status]||x.status]);
  }else if(tab==="played"){
    if(x.status)items.push(["Library status",STATUS_LABEL[x.status]||x.status]);if(x.added)items.push(["Added",fmt(x.added)]);
  }
  if(x.playtime)items.push(["Typical playtime",x.playtime+" hours"]);
  if(!items.length)return "";
  return '<section class="title-library-panel"><div class="detail-section-label">Your library</div><div class="title-library-grid">'+items.map(function(it){return mediaFact(it[0],it[1]);}).join("")+'</div></section>';
}
function gameDetailActions(x){
  var id=String(expandedId||x.id||("name:"+norm(x.name)));
  if(tab==="rentals"){
    var active=byId(data.rentals,id), hist=byId(data.rentalHistory,id);
    if(active) return '<button class="btn blue" data-act="return-played" data-id="'+esc(id)+'">Return → Played</button><button class="btn" data-act="return-only" data-id="'+esc(id)+'">Return</button><button class="btn ghost danger" data-act="remove-rental" data-id="'+esc(id)+'">Delete</button>';
    if(hist) return '<button class="btn" data-act="hist-again" data-id="'+esc(id)+'">Rent again</button><button class="btn ghost danger" data-act="hist-del" data-id="'+esc(id)+'">Delete record</button>';
  }
  if(tab==="playing"){
    if(byId(data.rentals,id)) return fandomBtn(x.name)+'<button class="btn blue" data-act="return-played" data-id="'+esc(id)+'">Finished → Played</button><button class="btn" data-act="goto" data-dest="rentals">Manage in Rentals</button>';
    if(byId(data.playing,id)) return fandomBtn(x.name)+'<button class="btn blue" data-act="pl-played" data-id="'+esc(id)+'">Finished → Played</button><button class="btn" data-act="pl-resume" data-id="'+esc(id)+'">Resume Later</button><button class="btn ghost danger" data-act="pl-del" data-id="'+esc(id)+'">Remove</button>';
    return fandomBtn(x.name)+'<select class="selectmini status-sel" data-id="'+esc(id)+'">'+STATUSES.map(function(s){return '<option value="'+s+'"'+(s===x.status?" selected":"")+'>'+(STATUS_LABEL[s]||s)+'</option>';}).join("")+'</select>';
  }
  if(tab==="queue") return '<button class="btn blue" data-act="q-rent" data-id="'+esc(id)+'">Start rental</button><button class="btn" data-act="q-avail-check" data-id="'+esc(id)+'">Availability</button><button class="btn" data-act="ai-open" data-ai-type="game" data-id="'+esc(id)+'">AI Assistant</button><button class="btn ghost danger" data-act="q-del" data-id="'+esc(id)+'">Remove</button>';
  if(tab==="upcoming") return '<button class="btn" data-act="up-queue" data-id="'+esc(id)+'">Add to queue</button><button class="btn blue" data-act="to-played" data-id="'+esc(id)+'">Playing it → Played</button><button class="btn ghost danger" data-act="del-upcoming" data-id="'+esc(id)+'">Remove</button>';
  if(tab==="suggest") return '<button class="btn blue" data-act="sug-queue" data-name="'+esc(x.name)+'">Add to queue</button><button class="btn" data-act="sug-played" data-name="'+esc(x.name)+'">Played it</button><button class="btn ghost danger" data-act="sug-hide" data-name="'+esc(x.name)+'">Not interested</button>';
  if(tab==="played"){
    var dots=""; for(var n=1;n<=5;n++) dots+='<button class="dot '+(x.rating>=n?"on":"")+'" data-act="rate" data-id="'+esc(id)+'" data-n="'+n+'">●</button>';
    return '<div class="dots">'+dots+'</div><select class="selectmini status-sel" data-id="'+esc(id)+'">'+STATUSES.map(function(s){return '<option value="'+s+'"'+(s===x.status?" selected":"")+'>'+(STATUS_LABEL[s]||s)+'</option>';}).join("")+'<option value="__nowplaying__">▶ Now Playing</option></select><button class="btn ghost danger" data-act="del-played" data-id="'+esc(id)+'">Remove</button>';
  }
  return "";
}
function renderGameDetail(){
  var x=gameFindById(expandedId);
  if(!x) { expandedId=null; return ""; }
  var extra="";
  if(tab==="rentals"){
    var ar=byId(data.rentals,String(expandedId||""));
    var hr=byId(data.rentalHistory,String(expandedId||""));
    if(ar){
      var due=parseD(ar.start); due.setDate(due.getDate()+ar.days);
      extra='<div class="plot"><b>Return date:</b> '+fmt(localISO(due))+'<br><b>Rental date:</b> '+fmt(ar.start)+'<br><b>Rental duration:</b> '+ar.days+' days'+
        (ar.vendor?'<br><b>Vendor:</b> '+esc(ar.vendor):'')+
        (Number(ar.cost)?'<br><b>Rental cost:</b> '+fmtMoney(ar.cost):'')+
        (ar.note?'<br><b>Remarks:</b> '+esc(ar.note):'')+'</div>';
    } else if(hr){
      extra='<div class="plot"><b>Return date:</b> '+fmt(hr.end)+'<br><b>Rental date:</b> '+fmt(hr.start)+'<br><b>Rental duration:</b> '+(Number(hr.days)||daysBetween(parseD(hr.start),parseD(hr.end))||0)+' days'+
        (hr.vendor?'<br><b>Vendor:</b> '+esc(hr.vendor):'')+
        (Number(hr.cost)?'<br><b>Rental cost:</b> '+fmtMoney(hr.cost):'')+
        (hr.note?'<br><b>Remarks:</b> '+esc(hr.note):'')+'</div>';
    }
  }
  if(tab==="queue"){ extra=aiPanel("game",x)+availHtml(x); }
  if(tab==="playing"){ extra=fandomEditor(x.name); }
  if(tab==="played"){ extra='<input class="note-inp" data-id="'+esc(String(x.id))+'" placeholder="Add a note" value="'+esc(x.note||"")+'">'; }
  return gamePage(x,gameDetailActions(x),extra);
}
/* Don't yank the DOM out from under the user mid-typing */
function maybeRender(){
  var ae=document.activeElement;
  if(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
  render();
}
/* Fetch missing covers, one at a time, for everything the app shows */
var backfillBusy=false;
var triedCovers={};
function coverCandidate(){
  var lists=[data.rentals,data.playing,data.queue,data.played,data.upcoming,data.rentalHistory,fullCatalog()];
  for(var li=0; li<lists.length; li++){
    var arr=lists[li];
    for(var i=0;i<arr.length;i++){
      var x=arr[i];
      if(!x||!x.name) continue;
      if(coverUrl(x)) continue;
      if(x.img==="") continue;            // looked up before, RAWG has no image
      if(triedCovers[norm(x.name)]) continue;
      return x.name;
    }
  }
  return null;
}
function backfillImages(){
  if(backfillBusy) return;
  var key=getKey(); if(!key) return;
  var name=coverCandidate();
  if(!name) return;
  triedCovers[norm(name)]=1;
  backfillBusy=true;
  rawgFetch("https://api.rawg.io/api/games?key="+encodeURIComponent(key)+"&search="+encodeURIComponent(name)+"&page_size=1")
  .then(function(json){
    var g=(json.results||[])[0];
    if(g&&g.background_image){
      data.covers[norm(name)]=g.background_image;
      persistSilent(); maybeRender();
    }
    backfillBusy=false;
    setTimeout(backfillImages,450);
  }).catch(function(){ backfillBusy=false; });
}

/* ---------- game tier classification (AAA / AA / Indie) ---------- */
/* Curated overrides for well-known AA titles in the built-in catalog;
   everything else in the catalog is AAA. Fetched games are classified by
   how widely tracked they are on RAWG (a budget proxy, imperfect but useful). */
var TIER_AA = ["clairobscurexpedition33","splitfiction","liesofp","helldivers2","persona3reload"];
function tierFor(name){
  var n=norm(name);
  if(TIER_AA.indexOf(n)>-1) return "AA";
  for(var i=0;i<BUILTIN_CATALOG.length;i++) if(norm(BUILTIN_CATALOG[i].name)===n) return "AAA";
  var ce=data.catalogExtra||[];
  for(var j=0;j<ce.length;j++) if(norm(ce[j].name)===n) return ce[j].tier||"";
  for(var k=0;k<data.upcoming.length;k++) if(norm(data.upcoming[k].name)===n && data.upcoming[k].src==="seed") return "AAA";
  return "";
}
function tierRank(name){ var t=tierFor(name); return t==="AAA"?0:t==="AA"?1:t==="Indie"?2:1.5; }
function tierChip(name){
  var t=tierFor(name); if(!t) return "";
  return '<span class="chip t-'+t.toLowerCase()+'">'+t+'</span> ';
}

/* Officially PS5 Pro Enhanced titles (curated) */
var PS5PRO = [
  "Marvel's Spider-Man 2","Marvel's Spider-Man: Miles Morales","God of War Ragnarök",
  "Horizon Forbidden West","Horizon Zero Dawn Remastered","The Last of Us Part I",
  "The Last of Us Part II Remastered","Demon's Souls","Ratchet & Clank: Rift Apart",
  "Gran Turismo 7","Ghost of Tsushima Director's Cut","Ghost of Yōtei","Astro Bot",
  "Alan Wake 2","Final Fantasy VII Rebirth","Final Fantasy XVI","Dragon's Dogma 2",
  "Resident Evil 4","Resident Evil Village","Silent Hill 2","Star Wars Jedi: Survivor",
  "Hogwarts Legacy","Stellar Blade","Black Myth: Wukong","Cyberpunk 2077",
  "Kingdom Come: Deliverance II","Monster Hunter Wilds","Assassin's Creed Shadows",
  "Death Stranding 2: On the Beach","Doom: The Dark Ages","Clair Obscur: Expedition 33",
  "Lies of P","Dead Space"
].map(norm);
function remFor(name){
  var n=norm(name);
  var all=BUILTIN_CATALOG.concat(data.catalogExtra||[]);
  for(var i=0;i<all.length;i++) if(norm(all[i].name)===n) return all[i].rem||"";
  return "";
}
/* One badge strip per game: tier + PS5 Pro + Remake/Remaster */
function badges(name){
  var b=tierChip(name);
  if(PS5PRO.indexOf(norm(name))>-1) b+='<span class="chip pro">PS5 Pro</span> ';
  var r=remFor(name);
  if(r) b+='<span class="chip rem">'+r+'</span> ';
  return b;
}
/* Google + YouTube trailer buttons — plain https links, so on iPhone the
   YouTube universal link opens the app when installed */
function linkBtns(name){
  return '<a class="btn" href="https://www.google.com/search?q='+encodeURIComponent(name+" PS5")+'" target="_blank" rel="noopener">⌕ Google</a>'+
         '<a class="btn" href="https://www.youtube.com/results?search_query='+encodeURIComponent(name+" PS5 trailer")+'" target="_blank" rel="noopener">▶ Trailer</a>'+
         '<a class="btn" href="https://www.youtube.com/results?search_query='+encodeURIComponent(name+" review IGN")+'" target="_blank" rel="noopener">★ IGN Review</a>';
}
/* Fandom button + per-game reading-spot editor (shared by all Playing sections) */
function fandomBtn(name){
  var fsaved=data.fandom[norm(name)]||"";
  var fhref=fsaved||("https://www.fandom.com/?s="+encodeURIComponent(name+" wiki"));
  return '<a class="btn'+(fsaved?' blue':'')+'" href="'+esc(fhref)+'" target="_blank" rel="noopener">'+(fsaved?"▷ Continue on Fandom":"▷ Fandom")+'</a>';
}
function fandomEditor(name){
  var fk=norm(name), fsaved=data.fandom[fk]||"";
  var fanchor="";
  if(fsaved && fsaved.indexOf("#")>-1){
    try{ fanchor=decodeURIComponent(fsaved.split("#")[1]).replace(/_/g," "); }
    catch(e2){ fanchor=fsaved.split("#")[1]; }
  }
  return '<div class="inline-edit">'+
    '<input class="note-inp fd-link" data-key="'+fk+'" placeholder="Paste the Fandom page link (with #section) where you stopped reading" value="'+esc(fsaved)+'">'+
  '</div>'+
  '<div class="meta" style="margin-top:6px">'+
    (fsaved
      ? (fanchor?'Saved reading spot: <b style="color:var(--text)">'+esc(fanchor)+'</b> — the Fandom button jumps straight there.':'Saved page — the Fandom button reopens it directly.')
      : 'Tip: on the Fandom page, tap the section you’re reading in its table of contents, copy the address (it ends with #Section) and paste it above. The button will then take you back to that exact spot.')+
  '</div>';
}

/* ---------- dynamic backdrop: next big AAA release ---------- */
function nextBigGame(){
  var t0=localISO(today());
  var cands=data.upcoming.filter(function(g){
    var t=tierFor(g.name);
    return g.date && g.date>=t0 && coverUrl(g) && t!=="AA" && t!=="Indie";
  });
  cands.sort(function(a,b){
    if(a.date!==b.date) return a.date<b.date?-1:1;
    return (b.want?1:0)-(a.want?1:0);
  });
  return cands[0]||null;
}
function tmdbBackdropUrl(url){
  url=String(url||"");
  if(!url) return "";
  if(/image\.tmdb\.org\/t\/p\//.test(url)) return url.replace(/\/t\/p\/(?:w\d+|original)\//,"/t/p/"+(window.innerWidth>=900?"original":"w1280")+"/");
  return url;
}
function mediaBgUrl(x){
  if(!x) return "";
  if(x.backdrop) return tmdbBackdropUrl(x.backdrop);
  return window.innerWidth<900?(x.poster||""):"";
}
function nextBigFilm(){
  var t0=localISO(today()), pool=[];
  function add(list, upcoming){
    (list||[]).forEach(function(m){
      if(!m || !mediaBgUrl(m)) return;
      if(upcoming && (!m.date || m.date<t0)) return;
      pool.push(m);
    });
  }
  add(filmCache.uphw&&filmCache.uphw.items, true);
  add(filmCache.mlup&&filmCache.mlup.items, true);
  if(!pool.length) add(movieSearchItems, false);
  if(!pool.length) add(data.movieWatchlist, false);
  if(!pool.length) add(filmCache.relhw&&filmCache.relhw.items, false);
  pool.sort(function(a,b){
    var ad=a.date||"9999-12-31", bd=b.date||"9999-12-31";
    if(ad!==bd) return ad<bd?-1:1;
    return ((b.imdb||b.tmdb||0)-(a.imdb||a.tmdb||0)) || ((b.popularity||0)-(a.popularity||0));
  });
  return pool[0]||null;
}
function featuredSeries(){
  var pool=[];
  function add(list){ (list||[]).forEach(function(s){ if(s&&mediaBgUrl(s)) pool.push(s); }); }
  var currentSeriesCache=seriesCacheEntry(seriesTab);
  add(currentSeriesCache&&currentSeriesCache.items);
  if(!pool.length&&(seriesTab==="serieswatching"||seriesTab==="seriesnew")) add(data.watchingSeries);
  if(!pool.length) add(seriesCache.seriesdiscover&&seriesCache.seriesdiscover.items);
  if(!pool.length) add(seriesCache.enseries&&seriesCache.enseries.items);
  if(!pool.length) add(seriesSearchItems);
  if(!pool.length) add(data.seriesWatchlist);
  pool.sort(function(a,b){
    return ((b.imdb||b.tmdb||0)-(a.imdb||a.tmdb||0)) ||
      ((b.popularity||0)-(a.popularity||0)) ||
      ((b.votes||0)-(a.votes||0));
  });
  return pool[0]||null;
}
var BIGLY_BG_KEY="gamevault-biglybt-bluray-bg", biglyBluRay=null, biglyBluRayBusy=false, biglyBluRayCheckedAt=0;
try{
  var savedBiglyBg=JSON.parse(localStorage.getItem(BIGLY_BG_KEY)||"null");
  if(savedBiglyBg){ biglyBluRayCheckedAt=savedBiglyBg.at||0; if(savedBiglyBg.item&&(Date.now()-savedBiglyBg.at)<24*60*60*1000) biglyBluRay=savedBiglyBg.item; }
}catch(e){}
function ensureBiglyBluRayBackground(){
  if(biglyBluRay||biglyBluRayBusy||!tmdbKey()||(Date.now()-biglyBluRayCheckedAt)<6*60*60*1000) return;
  biglyBluRayCheckedAt=Date.now();
  biglyBluRayBusy=true;
  tmdbGet("/discover/movie",{
    region:"US",with_release_type:"5",with_original_language:"en",
    "release_date.gte":daysAgoISO(120),"release_date.lte":localISO(today()),
    "vote_count.gte":"80",sort_by:"release_date.desc",page:"1",include_adult:"false"
  }).then(function(j){
    var items=(j.results||[]).map(mapMovie).filter(function(m){return !!mediaBgUrl(m);});
    biglyBluRay=items[0]||null;
    try{localStorage.setItem(BIGLY_BG_KEY,JSON.stringify({at:biglyBluRayCheckedAt,item:biglyBluRay}));}catch(e){}
    if(section==="biglybt") applyBackground();
  }).catch(function(){}).then(function(){biglyBluRayBusy=false;});
}
var bgShown="", bgRequest=0;
function setAppBackground(el,url){
  if(url===bgShown) return;
  var request=++bgRequest;
  if(!url){ bgShown=""; el.classList.remove("bg-changing"); el.style.backgroundImage="none"; return; }
  el.classList.add("bg-changing");
  var img=new Image();
  img.onload=function(){
    if(request!==bgRequest) return;
    bgShown=url;
    el.style.backgroundImage='url("'+url.replace(/"/g,"%22")+'")';
    requestAnimationFrame(function(){ if(request===bgRequest) el.classList.remove("bg-changing"); });
  };
  img.onerror=function(){ if(request===bgRequest) el.classList.remove("bg-changing"); };
  img.src=url;
}
function applyBackground(){
  var el=document.getElementById("bg"); if(!el) return;
  el.setAttribute("data-section",section);
  var hero=document.getElementById("hero");
  var g=null, u="", label="Coming up next", title="", detail="", extra="";
  if(section==="library"){
    g=nextBigFilm()||featuredSeries()||nextBigGame();
    u=g?(g.title?mediaBgUrl(g):coverUrl(g)):"";
  } else if(section==="films"){
    g=nextBigFilm(); u=mediaBgUrl(g); title=(g&&g.title)||"";
    label=(g&&g.date&&g.date>=localISO(today()))?"Next big movie":"Featured movie";
    detail=g?(g.date?fmt(g.date):(g.year||"Date TBA")):"";
    if(g&&(g.imdb||g.tmdb)) extra='<span class="chip">'+(g.imdb?"IMDb "+g.imdb.toFixed(1):"TMDB "+g.tmdb.toFixed(1))+'</span>';
  } else if(section==="series"){
    g=featuredSeries(); u=mediaBgUrl(g); title=(g&&g.title)||"";
    label="Featured TV show";
    detail=g?(g.year?("Started "+g.year):"TV Show"):"";
    if(g&&(g.imdb||g.tmdb)) extra='<span class="chip">'+(g.imdb?"IMDb "+g.imdb.toFixed(1):"TMDB "+g.tmdb.toFixed(1))+'</span>';
  } else if(section==="biglybt"){
    ensureBiglyBluRayBackground();
    g=biglyBluRay||((filmCache.relhw&&filmCache.relhw.items||[]).filter(function(m){return !!mediaBgUrl(m);})[0]||null);
    u=mediaBgUrl(g); title=(g&&g.title)||"";
    label=biglyBluRay?"Latest Hollywood Blu-ray release":"Featured Hollywood release";
    detail=g?(g.date?fmt(g.date):(g.year||"Release date TBA")):"";
    if(g&&(g.imdb||g.tmdb)) extra='<span class="chip">'+(g.imdb?"IMDb "+g.imdb.toFixed(1):"TMDB "+g.tmdb.toFixed(1))+'</span>';
  } else {
    g=nextBigGame(); u=g?coverUrl(g):""; title=(g&&g.name)||"";
    if(g){
      var dl=g.date?daysBetween(today(),parseD(g.date)):null;
      detail=g.date?fmt(g.date)+(dl!==null&&dl>=0?' - in '+dl+' day'+(dl===1?"":"s"):''):"Date TBC";
      extra=badges(g.name);
    }
  }
  setAppBackground(el,u);
  if(!hero) return;
  if(section==="library"){hero.className="";hero.innerHTML="";return;}
  if(section==="biglybt"){
    var biglyHead=document.querySelector("#content .sechead");
    if(biglyHead) biglyHead.innerHTML='BiglyBT'+(title?' <span style="color:var(--muted);font-weight:600">· Blu-ray backdrop: '+esc(title)+'</span>':'');
  }
  if(g&&u){
    hero.className="show";
    hero.innerHTML=
      '<div class="art" style="background-image:url(\''+esc(u)+'\')"></div><div class="scrim"></div>'+
      '<div class="txt">'+
        '<div class="lbl">'+esc(label)+'</div>'+
        '<div class="ttl">'+esc(title)+'</div>'+
        '<div class="dt">'+esc(detail)+'</div>'+
        '<div class="badges">'+extra+'</div>'+
      '</div>';
  } else {
    hero.className="";
    hero.innerHTML="";
  }
}

/* ---------- plot summaries (Wikipedia) ---------- */
var plotCache={};
try{ plotCache=JSON.parse(localStorage.getItem(PLOTS_KEY)||"{}")||{}; }catch(e){ plotCache={}; }
var plotPending={};
var plotErr={};
function savePlots(){
  if(window.GameVaultCore){
    GameVaultCore.storage.put("plots",plotCache).then(function(result){if(result!==false)try{localStorage.removeItem(PLOTS_KEY);}catch(e){}});
    return;
  }
  try{localStorage.setItem(PLOTS_KEY,JSON.stringify(plotCache));}catch(e){}
}
function plotKey(name, kind){ return (kind==="film"?"f:":kind==="TV series"?"tv:":"")+norm(name); }
function pickWikiHit(results, name, kind){
  results=results||[];
  if(kind!=="film" && kind!=="TV series") return results[0]||null;
  var yr=(String(name).match(/\b(19|20)\d{2}\b/)||[])[0]||"";
  var clean=norm(String(name).replace(/\b(19|20)\d{2}\b/g,""));
  var filtered=results.filter(function(h){
    var t=h.title||"", nt=norm(t);
    if(clean && nt.indexOf(clean)<0) return false;
    var ty=t.match(/\b(19|20)\d{2}\b/g)||[];
    if(yr && ty.length && ty.indexOf(yr)<0) return false;
    return true;
  });
  if(!filtered.length) return null;
  filtered.sort(function(a,b){
    function score(h){
      var t=h.title||"", lt=t.toLowerCase(), s=0;
      if(yr && t.indexOf(yr)>-1) s+=8;
      if(kind==="film" && lt.indexOf("film")>-1) s+=4;
      if(kind==="TV series" && (lt.indexOf("tv series")>-1||lt.indexOf("television series")>-1)) s+=4;
      if(t.indexOf("(")>-1) s+=1;
      return -s;
    }
    return score(a)-score(b);
  });
  return filtered[0]||null;
}
function ensurePlot(name, kind){
  kind=kind||"video game";
  var k=plotKey(name,kind);
  if((k in plotCache) || plotPending[k] || plotErr[k]) return;
  plotPending[k]=1;
  var api="https://en.wikipedia.org/w/api.php";
  var articleTitle="";
  var timer=new Promise(function(_,rej){ setTimeout(function(){ rej(new Error("timeout")); },15000); });
  var chain=rawgFetch(api+"?action=query&list=search&format=json&origin=*&srlimit=6&srsearch="+encodeURIComponent(name+" "+kind))
  .then(function(j){
    var hit=pickWikiHit(j.query&&j.query.search,name,kind);
    if(!hit) throw new Error("no article");
    articleTitle=hit.title;
    return rawgFetch(api+"?action=query&prop=extracts&explaintext=1&redirects=1&format=json&origin=*&titles="+encodeURIComponent(hit.title));
  })
  .then(function(j){
    var pages=(j.query&&j.query.pages)||{}; var text="";
    for(var pid in pages){ if(pages[pid]&&pages[pid].extract){ text=pages[pid].extract; break; } }
    var plot="", anchor="";
    var m=text.match(/==\s*(Plot|Synopsis|Story|Premise|Narrative|Setting)\s*==\n?([\s\S]*?)(\n==[^=]|$)/);
    if(m){ anchor=m[1]; plot=m[2]; }
    else plot=text;
    // keep the FULL section; turn sub-headings into separators instead of dropping text
    plot=plot.replace(/\n?===\s*([^=]*?)\s*===\n?/g,"\n— $1 —\n").trim();
    plotCache[k]={p:plot, t:articleTitle, a:anchor};
    savePlots();
  });
  Promise.race([chain,timer])
  .then(function(){ delete plotPending[k]; maybeRender(); })
  .catch(function(err){
    delete plotPending[k];
    if(err && err.message==="no article"){
      // Wikipedia genuinely has nothing — cache that so we don't retry forever
      plotCache[k]={p:"", t:articleTitle, a:""}; savePlots();
    } else {
      // network hiccup / timeout — do NOT poison the cache; offer a retry
      plotErr[k]=1;
    }
    maybeRender();
  });
}
function plotLinks(name, entry, kind){
  var out='<div class="src">Read more: ';
  if(entry && entry.t){
    var u="https://en.wikipedia.org/wiki/"+encodeURIComponent(entry.t.replace(/ /g,"_"))+(entry.a?("#"+encodeURIComponent(entry.a)):"");
    out+='<a href="'+u+'" target="_blank" rel="noopener">Wikipedia'+(entry.a?(kind==="film"?" plot section":" story section"):"")+' ↗</a> · ';
  }
  if(kind==="film"){
    out+='<a href="https://www.google.com/search?q='+encodeURIComponent(name+" film plot")+'" target="_blank" rel="noopener">Google ↗</a></div>';
  } else if(kind==="TV series"){
    out+='<a href="https://www.google.com/search?q='+encodeURIComponent(name+" TV series plot")+'" target="_blank" rel="noopener">Google</a></div>';
  } else {
    out+='<a href="https://www.fandom.com/?s='+encodeURIComponent(name)+'" target="_blank" rel="noopener">Fandom ↗</a> · '+
         '<a href="https://gamefaqs.gamespot.com/search?game='+encodeURIComponent(name)+'" target="_blank" rel="noopener">GameFAQs ↗</a></div>';
  }
  return out;
}
function plotBlock(name, kind){
  kind=kind||"video game";
  var k=plotKey(name,kind);
  if(plotErr[k]) return '<div class="plot">Couldn’t reach Wikipedia — check your connection.<div class="actions" style="margin-top:8px"><button class="btn" data-act="plot-retry" data-name="'+esc(name)+'" data-kind="'+kind+'">↻ Try again</button></div></div>';
  if(plotPending[k] || !(k in plotCache)){ ensurePlot(name,kind); return '<div class="plot">Fetching the '+(kind==="film"?"plot":"story")+' from Wikipedia…</div>'; }
  var entry=plotCache[k];
  if(typeof entry==="string") entry={p:entry,t:"",a:""};
  if(!entry.p) return '<div class="plot">No '+(kind==="film"?"plot":"story")+' section found on Wikipedia for this '+(kind==="film"?"film":"game")+' — try the sources below.'+plotLinks(name,entry,kind)+'</div>';
  return '<div class="plot">'+esc(entry.p)+plotLinks(name,entry,kind)+'</div>';
}

function episodePlotKey(s,seasonNo,epNo){ return "tvep:"+String(s&&s.id||norm(s&&s.title||""))+":s"+seasonNo+":e"+epNo; }
function cleanWikiEpisodeText(text){
  return String(text||"").replace(/\[\s*\d+\s*\]/g,"").replace(/\s*\[edit\]\s*/gi," ").replace(/\s+/g," ").trim();
}
function episodeSynopsisFromWiki(html,ep){
  var doc=new DOMParser().parseFromString(html||"","text/html"), wanted=norm(ep.title||"");
  var rows=Array.prototype.slice.call(doc.querySelectorAll("tr")), best="";
  rows.some(function(row){
    var titleEl=row.querySelector(".summary"), rowTitle=norm(titleEl&&titleEl.textContent||"");
    if(!rowTitle || (wanted && rowTitle!==wanted && rowTitle.indexOf(wanted)<0 && wanted.indexOf(rowTitle)<0)) return false;
    var desc=row.querySelector(".description");
    if(!desc && row.nextElementSibling) desc=row.nextElementSibling.querySelector(".description");
    var text=cleanWikiEpisodeText(desc&&desc.textContent||"");
    if(text.length>35){ best=text; return true; }
    return false;
  });
  if(best) return best;
  Array.prototype.slice.call(doc.querySelectorAll("h2,h3,h4,h5")).some(function(h){
    var heading=norm(h.textContent||"");
    if(!wanted || (heading!==wanted && heading.indexOf(wanted)<0)) return false;
    var parts=[], node=h.parentElement&&h.parentElement.nextElementSibling;
    while(node && !/^H[1-5]$/.test(node.tagName||"")){
      if(node.matches&&node.matches("p")) parts.push(node.textContent||"");
      node=node.nextElementSibling;
    }
    best=cleanWikiEpisodeText(parts.join(" "));
    return best.length>35;
  });
  return best;
}
function ensureEpisodePlot(s,seasonNo,ep){
  if(!s||!ep) return;
  var k=episodePlotKey(s,seasonNo,ep.n);
  if((k in plotCache)||plotPending[k]||plotErr[k]) return;
  plotPending[k]=1;
  var api="https://en.wikipedia.org/w/api.php", articleTitle="";
  var searches=[s.title+" season "+seasonNo+" episodes", "List of "+s.title+" episodes"];
  var timer=new Promise(function(_,rej){ setTimeout(function(){ rej(new Error("timeout")); },18000); });
  var chain=Promise.all(searches.map(function(q){
    return rawgFetch(api+"?action=query&list=search&format=json&origin=*&srlimit=8&srsearch="+encodeURIComponent(q)).catch(function(){ return {query:{search:[]}}; });
  })).then(function(all){
    var seen={}, hits=[];
    all.forEach(function(j){ (j.query&&j.query.search||[]).forEach(function(h){ if(!seen[h.title]){seen[h.title]=1;hits.push(h);} }); });
    var show=norm(s.title), seasonText="season "+seasonNo;
    hits=hits.filter(function(h){ return norm(h.title).indexOf(show)>-1; }).sort(function(a,b){
      function score(h){var t=norm(h.title),n=0;if(t.indexOf(seasonText)>-1)n+=12;if(t.indexOf("episodes")>-1)n+=7;if(t.indexOf("list of")>-1)n+=4;return n;}
      return score(b)-score(a);
    }).slice(0,6);
    function tryHit(i){
      if(i>=hits.length) throw new Error("no episode synopsis");
      var title=hits[i].title;
      return rawgFetch(api+"?action=parse&format=json&origin=*&prop=text&redirects=1&page="+encodeURIComponent(title)).then(function(j){
        var synopsis=episodeSynopsisFromWiki(j.parse&&j.parse.text&&j.parse.text["*"]||"",ep);
        if(!synopsis) return tryHit(i+1);
        articleTitle=title;
        return synopsis;
      }).catch(function(err){ if(err&&err.message==="no episode synopsis") throw err; return tryHit(i+1); });
    }
    return tryHit(0);
  }).then(function(synopsis){ plotCache[k]={p:synopsis,t:articleTitle,a:""}; savePlots(); });
  Promise.race([chain,timer]).then(function(){ delete plotPending[k]; maybeRender(); }).catch(function(err){
    delete plotPending[k];
    if(err&&err.message==="no episode synopsis"){ plotCache[k]={p:"",t:articleTitle,a:""}; savePlots(); }
    else plotErr[k]=1;
    maybeRender();
  });
}
function episodePlotBlock(s,seasonNo,ep){
  var k=episodePlotKey(s,seasonNo,ep.n), entry=plotCache[k];
  if(plotErr[k]) return '<div class="plot">Couldn’t reach Wikipedia for this episode.<div class="actions" style="margin-top:8px"><button class="btn" data-act="episode-plot-retry" data-id="'+esc(String(s.id))+'" data-season="'+esc(String(seasonNo))+'" data-episode="'+esc(String(ep.n))+'">↻ Try again</button></div></div>';
  if(plotPending[k]||!(k in plotCache)){ ensureEpisodePlot(s,seasonNo,ep); return '<div class="plot">Fetching the selected episode story from Wikipedia…</div>'; }
  if(typeof entry==="string") entry={p:entry,t:"",a:""};
  var wiki=entry.t?'<a href="https://en.wikipedia.org/wiki/'+encodeURIComponent(entry.t.replace(/ /g,"_"))+'" target="_blank" rel="noopener">Wikipedia episode page ↗</a> · ':'';
  var more='<div class="src">Read more: '+wiki+'<a href="https://www.google.com/search?q='+encodeURIComponent(s.title+" season "+seasonNo+" episode "+ep.n+" "+ep.title+" plot")+'" target="_blank" rel="noopener">Google ↗</a></div>';
  if(!entry.p) return '<div class="plot">Wikipedia does not currently provide a separate synopsis for this episode. The TMDB episode overview is shown above.'+more+'</div>';
  return '<div class="plot"><b>Wikipedia episode story</b><br>'+esc(entry.p)+more+'</div>';
}

/* ---------- AI assistant launchers ---------- */
var aiOpen=null;
var AI_SERVICES=[
  {id:"chatgpt", name:"ChatGPT", url:function(p){ return "https://chatgpt.com/?q="+encodeURIComponent(p); }},
  {id:"claude", name:"Claude", url:function(p){ return "https://claude.ai/new?q="+encodeURIComponent(p); }},
  {id:"grok", name:"Grok", url:function(p){ return "https://grok.com/?q="+encodeURIComponent(p); }},
  {id:"deepseek", name:"DeepSeek", url:function(p){ return deepSeekLaunchUrl(p); }}
];
function deepSeekWebUrl(p){ return "https://chat.deepseek.com/?q="+encodeURIComponent(p); }
function deepSeekLaunchUrl(p){
  var web=deepSeekWebUrl(p);
  var ua=navigator.userAgent||"";
  if(/Android/i.test(ua)){
    return "intent://chat.deepseek.com/?q="+encodeURIComponent(p)+"#Intent;scheme=https;package=com.deepseek.chat;S.browser_fallback_url="+encodeURIComponent(web)+";end";
  }
  if(/iPhone|iPad|iPod/i.test(ua)){
    return "deepseek://chat?q="+encodeURIComponent(p);
  }
  return web;
}
function aiTitle(x){ return (x&&((x.title||x.name)+" "+(x.year?("("+x.year+")"):""))).trim(); }
function aiKey(type,x){ return type+":"+(x&&x.id!=null?x.id:norm(aiTitle(x))); }
function aiPrompt(type,x){
  var t=aiTitle(x);
  if(type==="game"){
    return "I am planning to play "+t+". No spoilers for this game. What should I know before playing it? Should I play any previous games first? Is there important lore, story context, or a recap of previous games I should know? If this is a sequel, explain the prequel story so far, but do not spoil "+t+".";
  }
  var label=type==="series"?"TV series":"film";
  return "I am planning to watch the "+label+" "+t+". No spoilers for this "+label+". What should I know before watching it? Are there any previous movies, series, seasons, or lore I should know first? Is it based on a true story or real events? If this is a sequel or a new season, explain the prequel story so far, but do not spoil "+t+".";
}
function aiSaved(key, service){ return data.aiChats && data.aiChats[key] && data.aiChats[key][service]; }
function aiPanel(type,x){
  var key=aiKey(type,x);
  if(aiOpen!==key) return "";
  var h='<div class="plot" style="white-space:normal"><b style="color:var(--text)">AI Assistant</b><div class="actions" style="margin-top:10px">';
  AI_SERVICES.forEach(function(s){
    var saved=aiSaved(key,s.id);
    h+='<button class="btn '+(saved?'blue':'')+'" data-act="ai-launch" data-ai-type="'+type+'" data-id="'+esc(String(x.id))+'" data-service="'+s.id+'">'+(saved?'Continue ':'')+s.name+'</button>'+
       '<button class="btn ghost" data-act="ai-save" data-ai-type="'+type+'" data-id="'+esc(String(x.id))+'" data-service="'+s.id+'">Save '+s.name+' link</button>';
  });
  h+='</div><div class="meta" style="margin-top:8px">First launch opens a prepared prompt. Save the chat link once to continue the same conversation later.</div></div>';
  return h;
}
function aiFindItem(type,id){
  if(type==="film") return findMovieAny(id);
  if(type==="series") return findSeriesAny(id);
  if(type==="game") return byId(data.queue,id);
  return null;
}
function aiLaunch(type,id,service){
  var x=aiFindItem(type,id); if(!x) return;
  var key=aiKey(type,x), saved=aiSaved(key,service);
  var svc=AI_SERVICES.filter(function(s){ return s.id===service; })[0];
  if(!svc) return;
  var promptText=aiPrompt(type,x);
  var target=saved||svc.url(promptText);
  if(service==="deepseek" && !saved && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent||"")){
    window.location.href=target;
    if(/iPhone|iPad|iPod/i.test(navigator.userAgent||"")){
      setTimeout(function(){ window.open(deepSeekWebUrl(promptText),"_blank","noopener"); },900);
    }
    return;
  }
  window.open(target,"_blank","noopener");
}
function aiSaveLink(type,id,service){
  var x=aiFindItem(type,id); if(!x) return;
  var key=aiKey(type,x), cur=aiSaved(key,service)||"";
  var url=prompt("Paste the "+service+" conversation link for "+aiTitle(x)+":", cur);
  if(url===null) return;
  url=url.trim();
  if(!data.aiChats) data.aiChats={};
  if(!data.aiChats[key]) data.aiChats[key]={};
  if(url) data.aiChats[key][service]=url; else delete data.aiChats[key][service];
  save(); flash(url?"AI conversation link saved":"AI conversation link cleared");
}

/* ---------- shared render helpers ---------- */
function q(){ return searchQ[tab]||""; }
function matchQ(name){ var s=norm(q()); if(!s) return true; return norm(name).indexOf(s)>-1; }
function toolbar(addLabel, searchPh){
  return '<div class="toolbar">'+
    '<button class="btn '+(formOpen[tab]?'':'blue')+'" data-act="toggle-form">'+(formOpen[tab]?"✕ Close":"+ "+addLabel)+'</button>'+
    '<div class="searchwrap"><span class="sic">⌕</span>'+
    '<input class="tab-search" id="tabSearch" placeholder="'+esc(searchPh)+'" value="'+esc(q())+'" autocomplete="off">'+
    (q()?'<button class="sclear" data-act="clear-search" title="Clear">✕</button>':'')+
    '</div></div>'+gameViewToggle();
}
function noMatch(){ return '<div class="empty">No games match “'+esc(q())+'” in this tab.</div>'; }
function loadingSkeletons(kind,count){
  count=count||6;
  var cls=kind==="game"?"game-grid":"media-grid",out='<div class="'+cls+' skeleton-grid" aria-label="Loading content">';
  for(var i=0;i<count;i++) out+='<div class="skeleton-card"><div class="skeleton-art"></div><div class="skeleton-line wide"></div><div class="skeleton-line"></div></div>';
  return out+'</div>';
}
/* find a game by name (norm-equal) in any list — the duplicate gate */
function inList(list,name){
  var n=norm(name);
  for(var i=0;i<(list||[]).length;i++){ if(list[i]&&list[i].name&&norm(list[i].name)===n) return list[i]; }
  return null;
}

function renderStats(){
  var t0=today();
  var active=data.rentals.filter(function(r){ return r.days-daysBetween(parseD(r.start),t0)>0; }).length;
  var urgent=data.rentals.some(function(r){ var l=r.days-daysBetween(parseD(r.start),t0); return l>0&&l<=3; });
  var totalRented=data.rentals.length+data.rentalHistory.length;
  function tile(value,label,dest,color){ return '<div class="stat" data-tab="'+dest+'" role="button" tabindex="0" title="Open '+esc(label)+'"><div class="v"'+(color?' style="color:'+color+'"':'')+'>'+esc(String(value))+'</div><div class="k">'+esc(label)+'</div></div>'; }
  var html="";
  if(tab==="rentals"){
    var due=data.rentals.map(function(r){ return r.days-daysBetween(parseD(r.start),t0); }).filter(function(n){ return n>=0; }).sort(function(a,b){return a-b;})[0];
    html=tile(active,"Active rentals","rentals",urgent?"var(--danger)":"var(--text)")+tile(due==null?"-":due+"d","Nearest return","rentals",due!=null&&due<=3?"var(--danger)":"var(--text)")+tile(totalRented,"Total rented","rentals")+tile(fmtMoney(totalSpent()),"Total spent","rentals","var(--warning)");
  }else if(tab==="playing"){
    var resume=data.played.filter(function(x){return x.status==="Playing";}).length;
    var hold=data.played.filter(function(x){return x.status==="Dropped";}).length;
    html=tile(active,"Active rentals","rentals")+tile(data.playing.length,"Playing now","playing","var(--success)")+tile(resume,"Resume later","playing")+tile(hold,"On hold","playing","var(--warning)");
  }else if(tab==="queue"){
    var dated=data.queue.filter(function(x){return !!x.availableFrom;}).length;
    html=tile(data.queue.length,"Queued","queue")+tile(dated,"Dates tracked","queue","var(--accent)")+tile(data.queue.length?1:0,"Top priority","queue")+tile(active,"Active rentals","rentals");
  }else if(tab==="upcoming"){
    var soon=data.upcoming.filter(function(x){var d=parseD(x.date);return d&&daysBetween(t0,d)>=0&&daysBetween(t0,d)<=30;}).length;
    var wanted=data.upcoming.filter(function(x){return !!x.want;}).length;
    html=tile(data.upcoming.length,"Upcoming","upcoming")+tile(soon,"Next 30 days","upcoming","var(--warning)")+tile(wanted,"Wanted","upcoming","var(--success)")+tile((data.upcomingRemoved||[]).length,"Removed","upcoming");
  }else if(tab==="suggest"){
    var rated=data.played.filter(function(x){return Number(x.rating)>0;}).length;
    html=tile(fullCatalog().length,"Curated titles","suggest")+tile(rated,"Ratings used","played","var(--success)")+tile((data.dismissed||[]).length,"Hidden","suggest")+tile(data.queue.length,"In queue","queue");
  }else{
    var ratings=data.played.map(function(x){return Number(x.rating)||0;}).filter(Boolean);
    var avg=ratings.length?(ratings.reduce(function(a,b){return a+b;},0)/ratings.length).toFixed(1):"-";
    html=tile(data.played.length,"Played","played")+tile(avg,"Average rating","played","var(--warning)")+tile(data.played.filter(function(x){return x.status==="Platinum";}).length,"Platinum","played","var(--success)")+tile(data.played.filter(function(x){return x.status==="Dropped";}).length,"On hold","playing");
  }
  document.getElementById("stats").innerHTML=html;
}

/* Per-tab scroll memory: leaving a tab saves its position, returning restores it */
var tabScroll={};
function switchTab(next){
  tabScroll[tab]=window.scrollY;
  tab=next; expandedId=null;
  render();
  window.scrollTo(0, tabScroll[next]||0);
  scheduleGameWarmup(next);
}

function centerActiveTab(){
  var strip=document.getElementById("tabs");
  if(!strip) return;
  var active=strip.querySelector(".tab.on");
  if(!active) return;
  var left=active.offsetLeft-(strip.clientWidth-active.offsetWidth)/2;
  if(Math.abs(strip.scrollLeft-left)>4) strip.scrollTo({left:Math.max(0,left),behavior:"smooth"});
}
function finishTabRender(){
  [].forEach.call(document.querySelectorAll("#tabs .tab"),function(b){
    if(b.classList.contains("on")) b.setAttribute("aria-current","page");
    else b.removeAttribute("aria-current");
  });
  requestAnimationFrame(centerActiveTab);
}
function tabCount(kind,key){
  if(kind==="game"){
    if(key==="rentals") return (data.rentals||[]).length;
    if(key==="playing") return (data.rentals||[]).length+(data.playing||[]).length+(data.played||[]).filter(function(x){return x.status==="Playing"||x.status==="Dropped";}).length;
    if(key==="queue") return (data.queue||[]).length;
    if(key==="upcoming") return (data.upcoming||[]).length;
    if(key==="played") return (data.played||[]).filter(function(x){return x.status!=="Playing"&&x.status!=="Dropped";}).length;
    return 0;
  }
  if(kind==="film"){
    if(key==="watchlist") return (data.movieWatchlist||[]).length;
    if(key==="watching") return (data.watchingMovies||[]).length;
    if(key==="watched") return (data.watchedMovies||[]).length;
    return ((filmCacheEntry(key)||{}).items||[]).length;
  }
  if(kind==="series"){
    if(key==="serieswatchlist") return (data.seriesWatchlist||[]).length;
    if(key==="serieswatching") return (data.watchingSeries||[]).length;
    if(key==="serieswatched") return (data.watchedSeries||[]).length;
    return ((seriesCacheEntry(key)||{}).items||[]).length;
  }
  return 0;
}
function tabCountHtml(kind,key){
  var n=tabCount(kind,key);
  return n?'<span class="tab-count">'+n+'</span>':'';
}

function renderTabs(){
  if(section==="biglybt"||section==="library"||section==="home"){
    document.getElementById("tabs").innerHTML="";
    return;
  }
  if(section==="finance"){
    var findefs=[["financeoverview","&#9636;","Monthly Summary"],["financetransactions","&#8645;","Details"],["financeloans","&#8377;","EMI & Recurring"],["financestatements","&#8682;","Gmail Sync"]];
    document.getElementById("tabs").innerHTML=findefs.map(function(d){return '<button class="tab '+(financeTab===d[0]?"on":"")+'" data-fin-tab="'+d[0]+'"><span class="shp">'+d[1]+'</span>'+d[2]+'</button>';}).join("");
    finishTabRender();return;
  }
  if(section==="health"){
    var hd=[["healthoverview","&#9829;","Overview"],["healthfood","&#9783;","Food & Activity"],["healthlabs","&#8599;","Lab Trends"]];
    document.getElementById("tabs").innerHTML=hd.map(function(d){return '<button class="tab '+(healthTab===d[0]?"on":"")+'" data-htab="'+d[0]+'"><span class="shp">'+d[1]+'</span>'+d[2]+'</button>';}).join("");
    finishTabRender();return;
  }
  if(section==="plex"){
    var pd=[["home","⌂","Home"],["continue","▶","Continue Watching"],["movies","●","Movies"],["shows","▣","TV Shows"],["recent","+","Recently Added"]];
    document.getElementById("tabs").innerHTML=pd.map(function(d){
      return '<button class="tab '+(plexTab===d[0]?"on":"")+'" data-ptab="'+d[0]+'"><span class="shp">'+d[1]+'</span>'+d[2]+'</button>';
    }).join("");
    finishTabRender();
    return;
  }
  if(section==="series"){
    var sd=[["serieswatchlist","♡","My Watchlist"],["serieswatching","▶","Watching"],["seriesnew","!","New Episodes"],["seriesupcoming","△","Upcoming"],["enseries","EN","English"],["mlseries","ML","Malayalam"],["taseries","TA","Tamil"],["hiseries","HI","Hindi"],["serieswatched","✓","Watched"]];
    if(phoneUi()){
      var primary=sd.slice(0,4),active=sd.filter(function(d){return d[0]===seriesTab;})[0];
      if(active&&!primary.some(function(d){return d[0]===active[0];}))primary.push(active);
      document.getElementById("tabs").innerHTML=primary.map(function(d){
        return '<button class="tab '+(seriesTab===d[0]?"on":"")+'" data-stab="'+d[0]+'"><span class="shp">'+d[1]+'</span>'+d[2]+tabCountHtml("series",d[0])+'</button>';
      }).join("")+'<button class="tab phone-tabs-more" data-phone-series-tabs="1"><span class="shp">&#8943;</span>More</button>';
      finishTabRender();return;
    }
    document.getElementById("tabs").innerHTML = sd.map(function(d){
      return '<button class="tab '+(seriesTab===d[0]?"on":"")+'" data-stab="'+d[0]+'"><span class="shp">'+d[1]+'</span>'+d[2]+tabCountHtml("series",d[0])+'</button>';
    }).join("");
    finishTabRender();
    return;
  }
  if(section==="health"){
    u=""; title="";
  } else if(section==="films"){
    var fd=[["watchlist","♥","My Watchlist"],["watching","▶","Watching"],["uphw","△","Coming Soon"],["bluray","◉","New on Blu-ray"],["relhw","★","Discover"],["mlott","▶","Malayalam OTT"],["watched","✓","Watched"]];
    document.getElementById("tabs").innerHTML = fd.map(function(d){
      return '<button class="tab '+(filmTab===d[0]?"on":"")+'" data-ftab="'+d[0]+'"><span class="shp">'+d[1]+'</span>'+d[2]+tabCountHtml("film",d[0])+'</button>';
    }).join("");
    finishTabRender();
    return;
  }
  var defs=[["rentals","✕","Rentals"],["playing","▶","Now Playing"],["queue","◇","Rental Queue"],["upcoming","△","Upcoming Releases"],["suggest","○","Discover"],["played","□","Completed"]];
  document.getElementById("tabs").innerHTML = defs.map(function(d){
    return '<button class="tab '+(tab===d[0]?"on":"")+'" data-tab="'+d[0]+'"><span class="shp">'+d[1]+'</span>'+d[2]+tabCountHtml("game",d[0])+'</button>';
  }).join("");
  finishTabRender();
}

function vendorOptions(sel){
  var o='<option value="">Vendor…</option>';
  (data.vendors||[]).forEach(function(v){ o+='<option'+(v===sel?' selected':'')+'>'+esc(v)+'</option>'; });
  o+='<option value="__new__">+ Add new vendor</option>';
  return o;
}

/* ---------- Rentals tab (active + history) ---------- */
function vendorName(x){ return (x.vendor||"").trim()||"(no vendor)"; }
function vendorMatch(x){ return rentVendor==="All" || vendorName(x)===rentVendor; }
function vendorStats(){
  var m={};
  function addV(x){
    var v=vendorName(x);
    if(!m[v]) m[v]={n:0,cost:0};
    m[v].n++; m[v].cost+=Number(x.cost)||0;
  }
  data.rentals.forEach(addV);
  data.rentalHistory.forEach(addV);
  // old-format returns live only in Played and still carry their rental cost
  data.played.forEach(function(p){ if(Number(p.cost)>0) addV(p); });
  return m;
}
/* ---------- Home dashboard (desktop): today across the whole vault ---------- */
function homeGoBtn(label,sec,tb){
  return '<button class="btn" data-act="home-goto" data-sec="'+sec+'"'+(tb?' data-tab="'+tb+'"':'')+'>'+label+'</button>';
}
function renderHome(){
  var t0=today();
  var overdue=(data.rentals||[]).filter(function(r){return r.days-daysBetween(parseD(r.start),t0)<0;}).length;
  var continuing=(data.playing||[]).length+(data.watchingMovies||[]).length+(data.watchingSeries||[]).length;
  var activeDownloads=(typeof biglyItems!=="undefined"?biglyItems:[]).filter(function(t){var p=Number(t.progress)||0;return p<1&&p<100;}).length;
  var nearDue=(data.rentals||[]).map(function(r){return {name:r.name,left:r.days-daysBetween(parseD(r.start),t0)};}).filter(function(r){return r.left>=0&&r.left<=3;}).sort(function(a,b){return a.left-b.left;});
  var nearestGame=(data.upcoming||[]).map(function(g){return {name:g.name,left:g.date?daysBetween(t0,parseD(g.date)):9999};}).filter(function(g){return g.left>=0&&g.left<=7;}).sort(function(a,b){return a.left-b.left;})[0];
  var priority=overdue
    ? {tone:"danger",title:overdue+" overdue rental"+(overdue===1?"":"s"),copy:"Return or update these rentals first.",label:"Review rentals",sec:"games",tab:"rentals"}
    : nearDue.length
      ? {tone:"warning",title:nearDue[0].left===0?nearDue[0].name+" is due today":nearDue[0].name+" is due in "+nearDue[0].left+" days",copy:"Your next rental deadline is approaching.",label:"Open rentals",sec:"games",tab:"rentals"}
      : nearestGame
        ? {tone:"accent",title:nearestGame.name+" releases "+(nearestGame.left===0?"today":"in "+nearestGame.left+" days"),copy:"A saved upcoming game is almost here.",label:"View releases",sec:"games",tab:"upcoming"}
        : {tone:"clear",title:"You are all caught up",copy:"No urgent rentals or saved releases in the next seven days.",label:"Continue watching",sec:"home",tab:""};
  var html='<section class="home-overview" aria-label="Today at a glance"><div><span>Today</span><strong>'+t0.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})+'</strong></div>'+
    '<div class="home-overview-stat '+(overdue?'alert':'')+'"><b>'+overdue+'</b><span>overdue rental'+(overdue===1?'':'s')+'</span></div>'+
    '<div class="home-overview-stat"><b>'+continuing+'</b><span>in progress</span></div>'+
    '<div class="home-overview-stat"><b>'+activeDownloads+'</b><span>active downloads</span></div></section>'+
    '<section class="card home-priority '+priority.tone+'" aria-label="Priority"><div><span class="eyebrow">NEXT UP</span><div class="home-title">'+esc(priority.title)+'</div><p>'+esc(priority.copy)+'</p></div>'+homeGoBtn(priority.label,priority.sec,priority.tab)+'</section><div class="home-grid">';

  // rentals expiring within 7 days
  var due=(data.rentals||[]).map(function(r){
    return {name:r.name, left:r.days-daysBetween(parseD(r.start),t0)};
  }).filter(function(r){ return r.left<=7; }).sort(function(a,b){ return a.left-b.left; });
  html+='<div class="card home-card home-card-rentals"><div class="home-title">⏳ Rentals due soon</div>';
  if(due.length) due.slice(0,5).forEach(function(r){
    var dueText=r.left<0?Math.abs(r.left)+'d overdue':r.left===0?'Due today':r.left+'d';
    html+='<div class="home-row"><span class="grow">'+esc(r.name)+'</span><b style="color:'+(r.left<=0?'var(--danger)':urgency(r.left))+'">'+dueText+'</b></div>';
  });
  else html+='<div class="meta">Nothing due in the next 7 days.</div>';
  html+='<div class="home-foot">'+homeGoBtn("Open Rentals","games","rentals")+'</div></div>';

  // next in queue
  var nq=(data.queue||[])[0];
  html+='<div class="card home-card home-card-queue"><div class="home-title">◇ Next rental pick</div>';
  html+= nq ? '<div class="home-row"><span class="grow" style="font-weight:700">'+esc(nq.name)+'</span></div><div class="meta">#1 of '+data.queue.length+' in your queue'+(nq.availableFrom?' · Available '+fmt(nq.availableFrom):'')+'</div>'
            : '<div class="meta">Your queue is empty.</div>';
  html+='<div class="home-foot">'+homeGoBtn("Open Queue","games","queue")+'</div></div>';

  // current games, films and series in one useful continuation list
  var resume=[];
  (data.playing||[]).forEach(function(x){resume.push({title:x.name,kind:"Game",sec:"games",tab:"playing"});});
  (data.watchingMovies||[]).forEach(function(x){resume.push({title:x.title,kind:"Movie",sec:"films",tab:"watching"});});
  (data.watchingSeries||[]).forEach(function(x){resume.push({title:x.title,kind:"Series",sec:"series",tab:"serieswatching"});});
  html+='<div class="card home-card home-card-wide home-card-continue"><div class="home-title">▶ Continue</div>';
  if(resume.length) resume.slice(0,6).forEach(function(x){html+='<button class="home-row home-row-link" data-act="home-goto" data-sec="'+x.sec+'" data-tab="'+x.tab+'"><span class="grow">'+esc(x.title)+'</span><span class="meta">'+x.kind+'</span><b>Open</b></button>';});
  else html+='<div class="meta">Nothing is currently marked Playing or Watching.</div>';
  html+='<div class="home-foot">'+homeGoBtn("Playing Games","games","playing")+homeGoBtn("Watching Movies","films","watching")+homeGoBtn("Watching TV","series","serieswatching")+'</div></div>';

  // releases within 7 days (starred games + upcoming films cache)
  var rel=[];
  (data.upcoming||[]).forEach(function(g){
    if(!g.date) return;
    var dl=daysBetween(t0,parseD(g.date));
    if(dl>=0&&dl<=7) rel.push({name:g.name, dl:dl, kind:"Game"});
  });
  try{
    ((filmCache.uphw||{}).items||[]).forEach(function(m){
      if(!m.date) return;
      var dl=daysBetween(t0,parseD(String(m.date).slice(0,10)));
      if(dl>=0&&dl<=7) rel.push({name:m.title, dl:dl, kind:"Film"});
    });
  }catch(e){}
  rel.sort(function(a,b){ return a.dl-b.dl; });
  html+='<div class="card home-card home-card-releases"><div class="home-title">△ Releasing this week</div>';
  if(rel.length) rel.slice(0,6).forEach(function(x){
    html+='<div class="home-row"><span class="grow">'+esc(x.name)+'</span><span class="meta" style="margin:0">'+x.kind+'</span><b style="color:#2D7FF9">'+(x.dl===0?"Today":x.dl+"d")+'</b></div>';
  });
  else html+='<div class="meta">No confirmed releases in the next 7 days.</div>';
  html+='<div class="home-foot">'+homeGoBtn("Games","games","upcoming")+homeGoBtn("Movies","films","uphw")+'</div></div>';

  // downloads
  html+='<div class="card home-card home-card-downloads"><div class="home-title">⇩ Downloads</div>';
  if(typeof biglyItems!=="undefined" && biglyItems.length){
    biglyItems.slice(0,5).forEach(function(t){
      var pct=Math.round(((t.progress>1?t.progress:(t.progress||0)*100)));
      html+='<div class="home-row"><span class="grow">'+esc(t.name||"")+'</span><b>'+Math.min(100,pct)+'%</b></div>';
    });
  } else html+='<div class="meta">Open the BiglyBT tab to load live torrent status.</div>';
  html+='<div class="home-foot">'+homeGoBtn("Open BiglyBT","biglybt")+'</div></div>';

  // watchlist films now streaming (last 14 days)
  var outNow=(data.movieWatchlist||[]).map(function(m){
    var d=String(m.ottDate||m.date||"").slice(0,10);
    return d ? {title:m.title, dl:daysBetween(parseD(d),t0)} : null;
  }).filter(function(x){ return x && x.dl>=0 && x.dl<=14; });
  html+='<div class="card home-card home-card-watchlist"><div class="home-title">♥ Watchlist, out now</div>';
  if(outNow.length) outNow.slice(0,5).forEach(function(x){
    html+='<div class="home-row"><span class="grow">'+esc(x.title||"")+'</span><b style="color:#3ECF8E">Out</b></div>';
  });
  else html+='<div class="meta">Nothing from your watchlist released recently.</div>';
  html+='<div class="home-foot">'+homeGoBtn("Movie Watchlist","films","watchlist")+homeGoBtn("TV Watchlist","series","serieswatchlist")+'</div></div>';

  // vault at a glance
  html+='<div class="card home-card home-card-vault"><div class="home-title">▦ Vault at a glance</div>'+
    '<div class="home-row"><span class="grow">Active rentals</span><b>'+(data.rentals||[]).length+'</b></div>'+
    '<div class="home-row"><span class="grow">Queue</span><b>'+(data.queue||[]).length+'</b></div>'+
    '<div class="home-row"><span class="grow">Completed games</span><b>'+(data.played||[]).length+'</b></div>'+
    '<div class="home-row"><span class="grow">Movie watchlist</span><b>'+(data.movieWatchlist||[]).length+'</b></div>'+
    '<div class="home-row"><span class="grow">Total spent</span><b style="color:#F2B84B">'+fmtMoney(totalSpent())+'</b></div>'+
    '<div class="home-foot">'+homeGoBtn("Completed","games","played")+homeGoBtn("Discover","games","suggest")+'</div></div>';

  // private finance snapshot - no values are exposed while the vault is locked
  html+='<div class="card home-card home-card-finance"><div class="home-title">&#8377; Private finance</div>';
  if(typeof financeUnlocked==="function"&&financeUnlocked()){
    var financeHome=financeSummary();
    html+='<div class="home-row"><span class="grow">This month</span><b>'+financeMoney(financeHome.expense)+'</b></div><div class="home-row"><span class="grow">Monthly EMI</span><b>'+financeMoney(financeHome.emi)+'</b></div><div class="home-row"><span class="grow">Outstanding loans</span><b>'+financeMoney(financeHome.balance)+'</b></div>';
  }else html+='<div class="meta">Encrypted and locked. Open Finance to review expenses, statements and loans.</div>';
  html+='<div class="home-foot">'+homeGoBtn("Open Finance","finance")+'</div></div>';

  html+='</div>';
  return html;
}

function renderRentals(){
  var t0=today();
  var list=data.rentals.map(function(r){
    var used=daysBetween(parseD(r.start),t0);
    return Object.assign({},r,{used:used,left:r.days-used});
  }).filter(function(r){ return matchQ(r.name) && vendorMatch(r); })
    .sort(function(a,b){ return a.start<b.start?1:a.start>b.start?-1:0; }); // latest rented first

  var html = toolbar("Add rental","Search rentals & history…");
  if(formOpen[tab]){
    html+=
    '<div class="form"><h3>Add a rental</h3><div class="fields">'+
    '<div class="ac-wrap f-name"><input id="rName" class="ac-input" placeholder="Game name — start typing for suggestions" autocomplete="off"><div class="ac-drop"></div></div>'+
    '<input class="f-sm" id="rStart" type="date" value="'+localISO()+'">'+
    '<input class="f-sm" id="rDays" type="number" min="1" value="30" title="Rental days">'+
    '<input class="f-sm" id="rCost" type="number" min="0" placeholder="Cost ₹">'+
    '<select class="f-sm" id="rVendor">'+vendorOptions("")+'</select>'+
    '<button class="btn blue" data-act="add-rental">Add rental</button>'+
    '</div></div>';
  }

  // vendor filter chips
  var vs=vendorStats();
  var vnames=Object.keys(vs).sort();
  if(rentVendor!=="All" && vnames.indexOf(rentVendor)<0) rentVendor="All";
  if(vnames.length>1 || (vnames.length===1 && vnames[0]!=="(no vendor)")){
    html+='<div class="chipbar">'+["All"].concat(vnames).map(function(v){
      return '<button class="gchip '+(v===rentVendor?"on":"")+'" data-vendor="'+esc(v)+'">'+esc(v)+
        (v!=="All"?' · '+fmtMoney(vs[v].cost):'')+'</button>';
    }).join("")+'</div>';
  }

  if(!list.length && !q() && rentVendor==="All") html+='<div class="empty">No active rentals. Press <b>+ Add rental</b> when you rent a game — the countdown starts automatically.</div>';

  if(gameView==="grid"){
    html+='<div class="game-grid">';
    list.forEach(function(r){
      html+=gameTile(r,r.id,rentalDaysChip(r.left));
    });
    html+='</div>';
    if(data.rentalHistory.length){
      var histGrid=data.rentalHistory.filter(function(h){ return matchQ(h.name) && vendorMatch(h); });
      html+='<div class="sechead">Rental history · '+data.rentalHistory.length+'</div><div class="game-grid">';
      histGrid.forEach(function(h){
        html+=gameTile(h,h.id,"History");
      });
      html+='</div>';
    }
    return html;
  }
  html+='<div class="cards">';
  list.forEach(function(r){
    var c=urgency(r.left);
    var due=parseD(r.start); due.setDate(due.getDate()+r.days);
    var segs=Math.min(r.days,40);
    var usedFrac=Math.min(1,Math.max(0,r.used/r.days));
    var ticks="";
    for(var i=0;i<segs;i++){
      var on=((i+1)/segs)<=usedFrac;
      ticks+='<div class="tick"'+(on?' style="background:'+c+'"':'')+'></div>';
    }
    html+=
    '<div class="card"'+(r.left<=0?' style="opacity:.65"':'')+'>'+
      '<div class="row">'+coverImg(r)+'<div class="grow">'+
        '<div class="gname">'+esc(r.name)+'</div>'+
        '<div class="meta">'+badges(r.name)+'Rented '+fmt(r.start)+' · '+r.days+'-day period · due '+fmt(localISO(due))+
        (r.vendor?' · <span style="color:var(--vendor)">'+esc(r.vendor)+'</span>':'')+
        (Number(r.cost)?' · <span style="color:#F2B84B;font-weight:700">'+fmtMoney(r.cost)+'</span>':'')+
        scoreBits(r)+'</div>'+gameReleaseMeta(r)+
      '</div><div>'+
        '<div class="bignum" style="color:'+c+'">'+(r.left>0?r.left:0)+'</div>'+
        '<div class="biglabel">'+(r.left<=0?"Expired":(r.left===1?"Day left":"Days left"))+'</div>'+
      '</div></div>'+
      '<div class="ticks">'+ticks+'</div>'+
      '<div class="actions">'+
        '<button class="btn" data-act="extend" data-id="'+r.id+'" data-n="7">+7 days</button>'+
        '<button class="btn" data-act="extend" data-id="'+r.id+'" data-n="30">+30 days</button>'+
        '<button class="btn blue" data-act="return-played" data-id="'+r.id+'">Return → Played</button>'+
        '<button class="btn" data-act="return-only" data-id="'+r.id+'">↩ Return</button>'+
        linkBtns(r.name)+
        '<button class="btn ghost danger" data-act="remove-rental" data-id="'+r.id+'">Delete</button>'+
      '</div>'+
      '<div class="inline-edit">'+
        '<input class="note-inp r-note" data-id="'+r.id+'" placeholder="Remark — deposit, return reminder, disc condition…" value="'+esc(r.note||"")+'">'+
        '<input class="note-inp r-cost" data-id="'+r.id+'" type="number" min="0" placeholder="Cost ₹" value="'+(Number(r.cost)?Number(r.cost):"")+'">'+
        '<label class="dateedit">Return date <input class="r-end" data-id="'+r.id+'" type="date" value="'+localISO(due)+'"></label>'+
        '<select class="note-inp r-vendor" data-id="'+r.id+'">'+vendorOptions(r.vendor||"")+'</select>'+
      '</div>'+
    '</div>';
  });
  html+='</div>';

  // ---- rental history (fully editable) ----
  var hist=data.rentalHistory.filter(function(h){ return matchQ(h.name) && vendorMatch(h); });
  if(data.rentalHistory.length){
    html+='<div class="sechead">Rental history · '+data.rentalHistory.length+'</div>';
    if(!hist.length) html+=noMatch();
    html+='<div class="cards">';
    hist.forEach(function(h){
      html+=
      '<div class="card hist"><div class="row">'+coverImg(h)+'<div class="grow">'+
        '<div class="gname">'+esc(h.name)+'</div>'+
        '<div class="meta">'+badges(h.name)+fmt(h.start)+' → '+fmt(h.end)+' · '+
        (h.used===1?"1 day":h.used+" days")+' used of '+h.days+
        (h.vendor?' · <span style="color:var(--vendor)">'+esc(h.vendor)+'</span>':'')+
        (Number(h.cost)?' · <span style="color:#F2B84B;font-weight:700">'+fmtMoney(h.cost)+'</span>':'')+
        (h.note?'<br>“'+esc(h.note)+'”':'')+'</div>'+gameReleaseMeta(h)+
      '</div></div>'+
      '<div class="actions">'+
        '<button class="btn" data-act="hist-again" data-id="'+h.id+'">↻ Rent again</button>'+
        linkBtns(h.name)+
        '<button class="btn ghost danger" data-act="hist-del" data-id="'+h.id+'">Delete record</button>'+
      '</div>'+
      '<div class="inline-edit">'+
        '<input class="note-inp h-note r-note-w" data-id="'+h.id+'" placeholder="Remark — condition, deposit refunded…" value="'+esc(h.note||"")+'" style="flex:3 1 160px">'+
        '<input class="note-inp h-cost" data-id="'+h.id+'" type="number" min="0" placeholder="Cost ₹" value="'+(Number(h.cost)?Number(h.cost):"")+'" style="flex:1 1 84px">'+
        '<select class="note-inp h-vendor" data-id="'+h.id+'">'+vendorOptions(h.vendor||"")+'</select>'+
      '</div>'+
      '<div class="inline-edit">'+
        '<span class="syncnote" style="align-self:center">Rented:</span>'+
        '<input class="note-inp h-start" data-id="'+h.id+'" type="date" value="'+esc(h.start||"")+'" style="flex:0 1 140px">'+
        '<span class="syncnote" style="align-self:center">Returned:</span>'+
        '<input class="note-inp h-end" data-id="'+h.id+'" type="date" value="'+esc(h.end||"")+'" style="flex:0 1 140px">'+
        '<input class="note-inp h-days" data-id="'+h.id+'" type="number" min="1" value="'+(Number(h.days)||30)+'" title="Rental period (days)" style="flex:0 1 74px">'+
      '</div>'+
      '</div>';
    });
    html+='</div>';
  }
  if(!list.length && q() && !hist.length) html+=noMatch();

  // ---- spend by vendor ----
  if(vnames.length){
    html+='<div class="sechead">Spend by vendor</div><div class="card">'+
      vnames.map(function(v){
        return '<div class="row" style="padding:5px 0">'+
          '<div class="grow" style="font-weight:600">'+esc(v)+'</div>'+
          '<div class="meta" style="margin:0">'+vs[v].n+' rental'+(vs[v].n===1?"":"s")+'</div>'+
          '<div style="color:#F2B84B;font-weight:700;min-width:88px;text-align:right">'+fmtMoney(vs[v].cost)+'</div>'+
        '</div>';
      }).join("")+
      '<div class="row" style="padding:9px 0 2px;margin-top:4px;border-top:1px solid var(--border)">'+
        '<div class="grow" style="font-weight:700">Total</div>'+
        '<div style="color:#F2B84B;font-weight:800">'+fmtMoney(totalSpent())+'</div>'+
      '</div>'+
    '</div>';
  }

  return html;
}

/* Return a rental: archive it in history (and optionally copy to Played) */
function endRental(id, toPlayed){
  var r=byId(data.rentals,id); if(!r) return;
  data.rentals=data.rentals.filter(function(x){ return x.id!==id; });
  var used=daysBetween(parseD(r.start),today()); if(used<0) used=0;
  data.rentalHistory.unshift({
    id:uid(), name:r.name, start:r.start, end:localISO(), days:r.days, used:used,
    vendor:r.vendor||"", cost:Number(r.cost)||0, note:r.note||"", date:r.date||gameKnownReleaseDate(r)||null, img:coverUrl(r)||""
  });
  if(toPlayed){
    var exP=inList(data.played,r.name);
    if(exP){
      exP.status="Finished";
      if(!exP.vendor) exP.vendor=r.vendor||"";
      if(!exP.score && r.score) exP.score=r.score;
      if(!exP.rrating && r.rrating) exP.rrating=r.rrating;
      if(!exP.date) exP.date=r.date||gameKnownReleaseDate(r)||null;
      save(); flash("Returned — history saved, existing Played entry updated");
    } else {
      var pid=uid();
      data.played.unshift({id:pid,name:r.name,rating:0,status:"Finished",added:localISO(),cost:0,vendor:r.vendor||"",note:"",score:r.score||null,rrating:r.rrating||null,date:r.date||gameKnownReleaseDate(r)||null,img:coverUrl(r)||undefined});
      save(); flash("Returned — saved to history and added to Played");
      enrichScore("played",pid);
    }
  } else {
    save(); flash("Returned — saved to rental history");
  }
}

/* ---------- Current Playing tab ---------- */
function renderPlaying(){
  var t0=today();
  var live=data.rentals.map(function(r){
    var left=r.days-daysBetween(parseD(r.start),t0);
    return Object.assign({},r,{left:left,_rental:true});
  }).filter(function(r){ return r.left>0 && matchQ(r.name); });
  var manual=data.playing.filter(function(p){ return matchQ(p.name); });
  var resume=data.played.filter(function(p){ return p.status==="Playing" && matchQ(p.name); });
  var hold=data.played.filter(function(p){ return p.status==="Dropped" && matchQ(p.name); });

  var html = toolbar("Add game","Search playing…");
  if(formOpen[tab]){
    html+=
    '<div class="form"><h3>Add a game you’re playing (not rented)</h3><div class="fields">'+
    '<div class="ac-wrap f-name"><input id="plName" class="ac-input" placeholder="Game name — start typing for suggestions" autocomplete="off"><div class="ac-drop"></div></div>'+
    '<button class="btn blue" data-act="add-playing">Add</button>'+
    '</div></div>';
  }
  html+='<div class="meta" style="margin-bottom:12px">Active rentals show up here automatically. Tap a game to read what it’s about.</div>';

  if(!live.length && !manual.length && !resume.length && !hold.length){
    html+= q() ? noMatch() : '<div class="empty">Nothing on the go right now. Active rentals appear here automatically, or press <b>+ Add game</b> for anything else you’re playing.</div>';
    return html;
  }

  if(gameView==="grid"){
    if(live.length||manual.length){
      html+='<div class="game-grid">';
      live.forEach(function(r){ html+=gameTile(r,r.id,(r.left>0?r.left+" left":"Rental")); });
      manual.forEach(function(p){ html+=gameTile(p,p.id,"Playing"); });
      html+='</div>';
    }
    if(resume.length){ html+='<div class="sechead">Resume Later · '+resume.length+'</div><div class="game-grid">'; resume.forEach(function(p){ html+=gameTile(p,p.id,"Resume"); }); html+='</div>'; }
    if(hold.length){ html+='<div class="sechead">On Hold · '+hold.length+'</div><div class="game-grid">'; hold.forEach(function(p){ html+=gameTile(p,p.id,"On Hold"); }); html+='</div>'; }
    return html;
  }
  function playCard(x, sub, actionsHtml){
    var open = expandedId===x.id;
    var h=
    '<div class="card">'+
      '<div class="row clickrow" data-act="pl-toggle" data-id="'+x.id+'">'+coverImg(x)+
        '<div class="grow"><div class="gname">'+esc(x.name)+'</div><div class="meta">'+badges(x.name)+sub+scoreBits(x)+'</div>'+gameReleaseMeta(x)+'</div>'+
        '<span style="color:var(--dim);font-size:12px;flex-shrink:0">'+(open?"▲":"▼")+'</span>'+
      '</div>';
    if(open){
      var u=coverUrl(x);
      if(u) h+='<img class="cover lg" src="'+esc(u)+'" alt="" loading="lazy">';
      h+=plotBlock(x.name);
      h+='<div class="actions">'+fandomBtn(x.name)+actionsHtml+linkBtns(x.name)+'</div>';
      h+=fandomEditor(x.name);
    }
    h+='</div>';
    return h;
  }

  if(live.length||manual.length){
    html+='<div class="cards">';
    live.forEach(function(r){
      var c=urgency(r.left);
      var sub='<span style="color:'+c+';font-weight:700">'+r.left+' day'+(r.left===1?"":"s")+' left</span> on rental'+
        (r.vendor?' · <span style="color:var(--vendor)">'+esc(r.vendor)+'</span>':'');
      html+=playCard(r, sub,
        '<button class="btn blue" data-act="return-played" data-id="'+r.id+'">Finished → Played</button>'+
        '<button class="btn" data-act="goto" data-dest="rentals">Manage in Rentals</button>');
    });
    manual.forEach(function(p){
      var sub='Playing since '+fmt(p.added);
      html+=playCard(p, sub,
        '<button class="btn blue" data-act="pl-played" data-id="'+p.id+'">Finished → Played</button>'+
        '<button class="btn" data-act="pl-resume" data-id="'+p.id+'">↺ Resume Later</button>'+
        '<button class="btn ghost danger" data-act="pl-del" data-id="'+p.id+'">Remove</button>');
    });
    html+='</div>';
  }

  if(resume.length){
    html+='<div class="sechead">↺ Resume Later · '+resume.length+'</div>';
    html+='<div class="meta" style="margin-bottom:8px">Games from your library you’ve picked back up. Set them to Finished or Platinum when you’re done to send them back to Played.</div>';
    html+='<div class="cards">';
    resume.forEach(function(p){ html+=playedCard(p,true); });
    html+='</div>';
  }
  if(hold.length){
    html+='<div class="sechead">⏸ On Hold · '+hold.length+'</div>';
    html+='<div class="meta" style="margin-bottom:8px">Dropped or paused games, kept here so you can pick them up again anytime.</div>';
    html+='<div class="cards">';
    hold.forEach(function(p){ html+=playedCard(p,true); });
    html+='</div>';
  }
  return html;
}

/* ---------- rental availability: The Game Hub + Gamer Planet ---------- */
var AVAIL_TTL=6*3600*1000;               // re-check after 6 hours
var GP_STORE="bb9cd9c8-a958-457b-9037-32736c74d6dd"; // gamerplanet.in Dukaan store
/* thegamehub.in pages send no CORS headers, so route them via public proxies
   (fallback chain — allorigins rate-limits bursts); the availability API and
   the whole Gamer Planet API allow our origin directly, no proxy needed */
var PROXIES=["https://api.allorigins.win/raw?url=","https://corsproxy.io/?url="];
function proxyFetch(url,pi){
  pi=pi||0;
  if(pi>=PROXIES.length) return Promise.reject(new Error("all proxies failed"));
  return fetchWithPolicy(PROXIES[pi]+encodeURIComponent(url),{},{scope:"availability:proxy",timeout:12000,retries:1})
    .then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.text(); })
    .then(function(t){ if(t.length<500) throw new Error("stub response"); return t; })
    .catch(function(){ return proxyFetch(url,pi+1); });
}
var availBusy={};
/* accent-folding name key: "God of War Ragnarök" and "god-of-war-ragnarok" both → godofwarragnarok */
function foldName(s){
  s=String(s||"").toLowerCase();
  try{ s=s.normalize("NFD").replace(/[̀-ͯ]/g,""); }catch(e){}
  return s.replace(/&/g,"and").replace(/[^a-z0-9]+/g,"");
}
function availFresh(it){ return it.shops && (Date.now()-it.shops.t)<AVAIL_TTL; }
function checkAvailability(id,force){
  var it=byId(data.queue,id); if(!it) return;
  if(availBusy[id]) return;
  if(!force && availFresh(it)) return;
  availBusy[id]=1; maybeRender();
  var hub={err:1}, gp={err:1};
  var pHub=hubCheck(it.name).then(function(r){hub=r;}).catch(function(){});
  var pGp=gpCheck(it.name).then(function(r){gp=r;}).catch(function(){});
  Promise.all([pHub,pGp]).then(function(){
    delete availBusy[id];
    var it2=byId(data.queue,id); if(!it2) return;
    it2.shops={t:Date.now(),hub:hub,gp:gp};
    persistSilent(); maybeRender();
    setTimeout(scheduleAvailChain,400);
  });
}
/* check stale queue items one at a time while the Queue tab is open */
function scheduleAvailChain(){
  if(tab!=="queue") return;
  for(var k in availBusy) return;
  var cand=data.queue.filter(function(x){ return !availFresh(x); })[0];
  if(cand) checkAvailability(cand.id);
}
function gpCheck(name){
  var u="https://api.mydukaan.io/api/product/buyer/"+GP_STORE+"/product-list/v2/?search="+encodeURIComponent(name)+"&pop_fields=category_data";
  return fetchWithPolicy(u,{},{scope:"availability:hub",timeout:12000,retries:1}).then(function(r){ return r.json(); }).then(function(j){
    var q=foldName(name);
    var cands=(j.results||[]).filter(function(p){
      if(!p||!p.name) return false;
      if(/\(pc\)|steam|epic|gamestick|controller|console &/i.test(p.name)) return false;
      var n=foldName(p.name);
      return n.indexOf(q)>-1 || q.indexOf(n)>-1;
    }).sort(function(a,b){
      var pa=/ps5/i.test(a.name)?0:1, pb=/ps5/i.test(b.name)?0:1;
      if(pa!==pb) return pa-pb;
      return a.name.length-b.name.length;
    });
    if(!cands.length) return {found:false};
    var p=cands[0], rent=null;
    (p.skus||[]).forEach(function(s){
      var at=(s.attributes||[]).map(function(a){ return String(a.value||""); }).join(" ").toLowerCase();
      if(at.indexOf("rent")>-1 && (rent===null||s.selling_price<rent)) rent=s.selling_price;
    });
    if(rent===null && p.skus && p.skus.length) rent=p.skus[0].selling_price;
    return {found:true,name:p.name,stock:!!p.in_stock,rent:rent,pre:/pre.?book/i.test(p.name)?1:0,url:p.web_url||""};
  });
}
function hubCheck(name){
  var kk=norm(name);
  var cached=(data.hubkeys||{})[kk];
  if(cached && cached.sku) return hubRows(cached.sku, cached.url, cached.title||name);
  var sUrl="https://thegamehub.in/?s="+encodeURIComponent(name)+"&post_type=product";
  return proxyFetch(sUrl).then(function(html){
    var re=/href="https:\/\/thegamehub\.in\/product\/([a-z0-9-]+)\//g,m,seen={},slugs=[];
    while((m=re.exec(html))){ if(!seen[m[1]]){ seen[m[1]]=1; slugs.push(m[1]); } }
    var q=foldName(name), best=null;
    slugs.forEach(function(s){
      var n=foldName(s);
      if(n.indexOf(q)>-1 || q.indexOf(n)>-1){ if(!best||s.length<best.length) best=s; }
    });
    if(!best) return {found:false};
    var url="https://thegamehub.in/product/"+best+"/";
    return proxyFetch(url).then(function(ph){
      var doc=new DOMParser().parseFromString(ph,"text/html");
      var form=doc.querySelector("[data-product_variations]");
      var sku=null;
      if(form){
        try{
          var vs=JSON.parse(form.getAttribute("data-product_variations"))||[];
          for(var i=0;i<vs.length;i++){ if(vs[i]&&vs[i].sku){ sku=vs[i].sku; break; } }
        }catch(e){}
      }
      var title=best.replace(/-/g," ").replace(/\b\w/g,function(c){ return c.toUpperCase(); });
      if(!sku) return {found:true,name:title,url:url};
      // remember the SKU so future re-checks hit only the CORS-open API, no proxy
      if(!data.hubkeys) data.hubkeys={};
      data.hubkeys[kk]={sku:sku,url:url,title:title};
      persistSilent();
      return hubRows(sku,url,title);
    });
  });
}
function hubRows(sku,url,title){
  return fetchWithPolicy("https://n8n.thegamehub.in/webhook/availability?internal_game_key="+encodeURIComponent(sku),{},{scope:"availability:game-hub",timeout:12000,retries:1})
  .then(function(r){ return r.text(); })
  .then(function(tx){
    var rows=[]; try{ rows=JSON.parse(tx); }catch(e){}
    if(!Array.isArray(rows)) rows=[];
    return {found:true,name:title,url:url,primary:slotStatus(rows,"primaryps5"),secondary:slotStatus(rows,"secondaryps5")};
  });
}
/* one Game Hub slot (Primary/Secondary PS5): available now > earliest future date > blocked */
function slotStatus(rows,slotKey){
  var seen=false,availPrice=null,avail=false,next=null;
  rows.forEach(function(r){
    if(foldName(r["Slot"])!==slotKey) return;
    seen=true;
    if(String(r["Remarks (Pre-booking)"]||"").trim().toLowerCase()==="booked") return;
    var a=String(r["Availability"]||"").trim().toLowerCase();
    var nx=String(r["Next Available on or After"]||"").trim();
    var pr=Number(String(r["Price (INR) Per Month"]||"").replace(/[^\d.]/g,""))||null;
    if(a==="available"){ avail=true; if(pr&&(!availPrice||pr<availPrice)) availPrice=pr; return; }
    if(nx && nx.toUpperCase()!=="BOOKED"){
      var d=new Date(nx.replace(/^(\d{1,2}) (\w+) (\d{4})$/,"$2 $1, $3"));
      if(!isNaN(d.getTime()) && d.getTime()>Date.now()){ if(!next||d.getTime()<next.d) next={d:d.getTime(),s:nx,p:pr}; }
    }
  });
  if(!seen) return null;
  if(avail) return {now:1,price:availPrice};
  if(next) return {next:next.s,price:next.p};
  return {no:1};
}
function slotHtml(st){
  if(!st) return '<span style="color:var(--dim)">—</span>';
  var pr=st.price?' <span style="color:var(--muted)">₹'+st.price+'/mo</span>':'';
  if(st.now) return '<span style="color:#2BD46B;font-weight:700">Available now</span>'+pr;
  if(st.next) return '<span style="color:#F2B84B;font-weight:700">Next: '+esc(st.next)+'</span>'+pr;
  return '<span style="color:#F05A5A">Not available</span>';
}
/* WhatsApp deep links — wa.me opens the app directly on iPhone */
var WA_HUB="918595235976", WA_GP="919428298882";
function waLink(num,game){
  return 'https://wa.me/'+num+'?text='+encodeURIComponent("Hi! Is "+game+" available for rent?");
}
function availHtml(q1){
  var h='<div class="meta" style="margin-top:7px;line-height:1.75">';
  if(availBusy[q1.id]) return h+'⏳ Checking The Game Hub &amp; Gamer Planet…</div>';
  var av=q1.shops;
  if(!av) return h+'<span style="color:var(--dim)">Rental availability not checked yet — tap ⟳ Availability.</span></div>';
  var hub=av.hub||{}, gp=av.gp||{};
  h+='<a href="'+waLink(WA_HUB,q1.name)+'" target="_blank" rel="noopener" title="Chat with The Game Hub on WhatsApp" style="color:var(--text2);font-weight:700;text-decoration:none">✆ Game Hub</a>: ';
  if(hub.err) h+='<span style="color:var(--dim)">check failed — tap ⟳</span>';
  else if(!hub.found) h+='<span style="color:var(--dim)">not listed</span>';
  else if(!("primary" in hub)) h+='<a href="'+esc(hub.url)+'" target="_blank" rel="noopener">listed — check site ↗</a>';
  else h+='Primary '+slotHtml(hub.primary)+' · Secondary '+slotHtml(hub.secondary)+(hub.url?' <a href="'+esc(hub.url)+'" target="_blank" rel="noopener">↗</a>':'');
  h+='<br><a href="'+waLink(WA_GP,q1.name)+'" target="_blank" rel="noopener" title="Chat with Gamer Planet on WhatsApp" style="color:var(--text2);font-weight:700;text-decoration:none">✆ Gamer Planet</a>: ';
  if(gp.err) h+='<span style="color:var(--dim)">check failed — tap ⟳</span>';
  else if(!gp.found) h+='<span style="color:var(--dim)">not listed</span>';
  else{
    h+= gp.stock ? '<span style="color:#2BD46B;font-weight:700">Available now</span>' : '<span style="color:#F05A5A">Out of stock</span>';
    if(gp.pre) h+=' <span style="color:#F2B84B">(pre-booking)</span>';
    if(gp.rent) h+=' · Rent ₹'+esc(String(gp.rent))+'/mo';
    if(gp.url) h+=' <a href="'+esc(gp.url)+'" target="_blank" rel="noopener">↗</a>';
  }
  h+='<br><span style="color:var(--faint)">Checked '+new Date(av.t).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})+'</span>';
  return h+'</div>';
}

/* ---------- Queue tab ---------- */
function renderQueue(){
  var t0=today();
  var html = toolbar("Add to queue","Search queue…");
  if(formOpen[tab]){
    html+=
    '<div class="form"><h3>Add to queue</h3><div class="fields">'+
    '<div class="ac-wrap f-name"><input id="qName" class="ac-input" placeholder="Game name — start typing for suggestions" autocomplete="off"><div class="ac-drop"></div></div>'+
    '<input class="f-sm" id="qAvail" type="date" title="Available from vendor (optional)">'+
    '<button class="btn blue" data-act="add-queue">Add</button>'+
    '</div><div class="meta" style="margin-top:8px">The date is optional — set it when the vendor tells you when the game will be available.</div></div>';
  }
  html+='<div class="meta" style="margin-bottom:12px">Your rental wishlist in priority order — <b style="color:var(--text)">#1 is what you rent next</b>. Reorder with the arrows.</div>';

  var shown=data.queue.filter(function(x){ return matchQ(x.name); });
  if(!data.queue.length) html+='<div class="empty">Your queue is empty. Add the games you plan to rent next — from the △ Upcoming and ○ For You tabs, or press + above.</div>';
  else if(!shown.length) html+=noMatch();

  if(gameView==="grid"){
    html+='<div class="game-grid">';
    shown.forEach(function(q1){ var i=qIndex(q1.id); html+=gameTile(q1,q1.id,"#"+(i+1)); });
    html+='</div>';
    setTimeout(scheduleAvailChain,300);
    return html;
  }
  var last=data.queue.length-1;
  html+='<div class="cards">';
  shown.forEach(function(q1){
    var i=qIndex(q1.id);
    var availBits="";
    if(q1.avail){
      var ad=parseD(q1.avail); var dl=daysBetween(t0,ad);
      availBits = dl>0
        ? '<br><span style="color:#F2B84B;font-weight:700">Available from '+fmt(q1.avail)+' · in '+dl+' day'+(dl===1?"":"s")+'</span>'
        : '<br><span style="color:#3ECF8E;font-weight:700">Available now · since '+fmt(q1.avail)+'</span>';
    }
    html+=
    '<div class="card"><div class="row">'+
      '<div class="scorebadge"><div class="s1" style="color:'+(i===0?"#3ECF8E":"#2D7FF9")+'">#'+(i+1)+'</div><div class="s2">'+(i===0?"Next up":"Priority")+'</div></div>'+
      coverImg(q1)+
      '<div class="grow">'+
        '<div class="gname">'+esc(q1.name)+'</div>'+
        '<div class="meta">'+badges(q1.name)+'Queued '+fmt(q1.added)+scoreBits(q1)+(q1.note?' · '+esc(q1.note):'')+availBits+'</div>'+gameReleaseMeta(q1)+
      '</div>'+
    '</div><div class="actions">'+
      (i>0?'<button class="btn" data-act="q-top" data-id="'+q1.id+'" title="Move to top">⤒ Top</button>':'')+
      (i>0?'<button class="btn" data-act="q-up" data-id="'+q1.id+'">↑</button>':'')+
      (i<last?'<button class="btn" data-act="q-down" data-id="'+q1.id+'">↓</button>':'')+
      (i<last?'<button class="btn" data-act="q-bottom" data-id="'+q1.id+'" title="Move to bottom">⤓ Bottom</button>':'')+
      '<button class="btn blue" data-act="q-rent" data-id="'+q1.id+'">Start rental →</button>'+
      '<button class="btn" data-act="q-avail-check" data-id="'+q1.id+'">⟳ Availability</button>'+
      '<button class="btn" data-act="ai-open" data-ai-type="game" data-id="'+q1.id+'">AI Assistant</button>'+
      linkBtns(q1.name)+
      '<button class="btn ghost danger" data-act="q-del" data-id="'+q1.id+'">Remove</button>'+
    '</div>'+
    aiPanel("game",q1)+
    availHtml(q1)+
    '<div class="inline-edit"><span class="syncnote" style="align-self:center">Available from:</span>'+
    '<input class="note-inp q-avail" data-id="'+q1.id+'" type="date" value="'+esc(q1.avail||"")+'" style="flex:0 1 150px">'+
    '</div></div>';
  });
  html+='</div>';
  setTimeout(scheduleAvailChain,300);
  return html;
}
function qIndex(id){ for(var i=0;i<data.queue.length;i++) if(data.queue[i].id===id) return i; return -1; }
function addToQueue(name, note, score, rrating, avail, releaseDate){
  if(!name) return;
  var n=norm(name);
  for(var i=0;i<data.queue.length;i++){
    if(norm(data.queue[i].name)===n){ flash("Already in your queue at #"+(i+1)); return; }
  }
  var qid=uid();
  var known=releaseDate||gameKnownReleaseDate({name:name});
  data.queue.push({id:qid, name:name, note:note||"", score:score||null, rrating:rrating||null, avail:avail||null, date:known||null, added:localISO()});
  save(); flash("Added to rental queue at #"+data.queue.length);
  enrichScore("queue",qid);
  setTimeout(function(){ checkAvailability(qid); },150); // auto-check both rental shops
}

/* ---------- Upcoming tab ---------- */
function renderUpcoming(){
  var t0=today();
  var list=data.upcoming.filter(function(g){ return matchQ(g.name); }).sort(function(a,b){
    if(!a.date&&!b.date) return a.name.localeCompare(b.name);
    if(!a.date) return 1; if(!b.date) return -1;
    return a.date<b.date?-1:1;
  });
  var html = toolbar("Watch a release","Search upcoming…");
  if(formOpen[tab]){
    html+=
    '<div class="form"><h3>Watch a new release</h3><div class="fields">'+
    '<div class="ac-wrap f-name"><input id="uName" class="ac-input" placeholder="Game name — start typing for suggestions" autocomplete="off"><div class="ac-drop"></div></div>'+
    '<input class="f-sm" id="uDate" type="date">'+
    '<input class="f-name" id="uNote" placeholder="Note (optional)">'+
    '<button class="btn blue" data-act="add-upcoming">Add</button>'+
    '</div></div>';
  }
  html+=
    '<div class="syncbar">'+
    '<button class="btn blue" data-act="sync-upcoming"'+(busy?' disabled':'')+'>'+(busy?"Updating…":"↻ Refresh from internet")+'</button>'+
    '<span class="syncnote">'+(data.lastUpcomingSync?("Last updated "+esc(data.lastUpcomingSync)):"Needs free API key — see Settings")+'</span>'+
    '</div>';

  if(!list.length) html+= q()?noMatch():'<div class="empty">Nothing on the watchlist.</div>';
  if(gameView==="grid"){
    html+='<div class="game-grid">';
    list.forEach(function(g){
      html+=gameTile(g,g.id,"");
    });
    html+='</div>';
    if((data.upcomingRemoved||[]).length) html+='<div class="sechead">Removed games · '+data.upcomingRemoved.length+'</div>';
    return html;
  }

  html+='<div class="cards">';
  list.forEach(function(g){
    var d=g.date?parseD(g.date):null;
    var dleft=d?daysBetween(t0,d):null;
    var out=dleft!==null&&dleft<0;
    html+=
    '<div class="card"><div class="row">'+
      coverImg(g)+
      '<div class="grow"><div class="gname">'+esc(g.name)+'</div><div class="meta">'+badges(g.name)+(g.note?esc(g.note):'')+'</div>'+gameReleaseMeta(g)+'</div>'+
      '<button class="star '+(g.want?"on":"")+'" data-act="want" data-id="'+g.id+'" title="I want this">★</button>'+
    '</div><div class="actions">'+
      '<button class="btn" data-act="up-queue" data-id="'+g.id+'">◇ Add to queue</button>'+
      (out?'<button class="btn blue" data-act="to-played" data-id="'+g.id+'">Playing it → Played</button>':'')+
      linkBtns(g.name)+
      '<button class="btn ghost danger" data-act="del-upcoming" data-id="'+g.id+'">Remove</button>'+
    '</div></div>';
  });
  html+='</div>';

  // ---- removed games (kept out of internet refresh, restorable) ----
  var rem=(data.upcomingRemoved||[]).filter(function(g){ return matchQ(g.name); });
  if(rem.length){
    html+='<div class="sechead">✕ Removed games · '+rem.length+'</div>';
    html+='<div class="meta" style="margin-bottom:8px">Hidden from the watchlist and skipped by internet refreshes. Restore any time.</div>';
    html+='<div class="cards">';
    rem.forEach(function(g){
      html+='<div class="card hist"><div class="row">'+coverImg(g)+
        '<div class="grow"><div class="gname">'+esc(g.name)+'</div><div class="meta">'+badges(g.name)+(g.date?fmt(g.date):"Date TBC")+(g.note?' · '+esc(g.note):'')+'</div></div>'+
      '</div><div class="actions">'+
        '<button class="btn blue" data-act="up-restore" data-id="'+g.id+'">↩ Restore</button>'+
        '<button class="btn ghost danger" data-act="up-purge" data-id="'+g.id+'">Delete for good</button>'+
      '</div></div>';
    });
    html+='</div>';
  }
  return html;
}

/* ---------- For You (suggestions) ---------- */
function fullCatalog(){
  var have={}; var out=[];
  BUILTIN_CATALOG.concat(data.catalogExtra||[]).forEach(function(g){
    var n=norm(g.name);
    if(!have[n]){ have[n]=1; out.push(g); }
  });
  return out;
}
function ownedSet(){
  var s=[];
  data.played.forEach(function(p){ s.push(norm(p.name)); });
  data.rentals.forEach(function(r){ s.push(norm(r.name)); });
  data.rentalHistory.forEach(function(h){ s.push(norm(h.name)); });
  data.playing.forEach(function(p){ s.push(norm(p.name)); });
  return s;
}
function isOwned(name, owned){
  var n=norm(name);
  for(var i=0;i<owned.length;i++){
    var o=owned[i];
    if(!o) continue;
    if(o===n) return true;
    if(o.length>=5 && n.length>=5 && (n.indexOf(o)>-1 || o.indexOf(n)>-1)) return true;
  }
  return false;
}
/* Learn taste from Played ratings: loved genres score high, disliked ones sink.
   Higher ratings carry the most weight (5★ ≫ 4★ ≫ neutral 3★ ≫ low). */
var RATING_INFL={1:-2,2:-1,3:0,4:2,5:4};
function genrePrefs(){
  var pref={}, byName={};
  fullCatalog().forEach(function(g){ byName[norm(g.name)]=g; });
  data.played.forEach(function(p){
    if(!p.rating) return;
    var g=byName[norm(p.name)];
    var genre=(g&&g.genre)||p.genre||null;
    if(!genre) return;
    pref[genre]=(pref[genre]||0)+(RATING_INFL[p.rating]||0);
  });
  return pref;
}
function topGenres(pref){
  return Object.keys(pref||{}).filter(function(k){ return pref[k]>0; })
    .sort(function(a,b){ return pref[b]-pref[a]; });
}
function getSuggestions(){
  var owned=ownedSet();
  var dis={}; (data.dismissed||[]).forEach(function(x){ dis[x]=1; });
  var pref=genrePrefs();
  function sc(g){
    var pf=pref[g.genre||"Other"]||0;          // taste match (dominant)
    var tier=3-tierRank(g.name);               // AAA 3 · AA 2 · Indie 1
    var critic=(g.score||0)/100;               // 0..1 tie-breaker
    return pf*2 + tier*0.6 + critic;
  }
  return fullCatalog().filter(function(g){
    return !dis[norm(g.name)] && !isOwned(g.name, owned);
  }).sort(function(a,b){
    var d=sc(b)-sc(a);
    if(d) return d;
    var ta=tierRank(a.name), tb=tierRank(b.name);
    if(ta!==tb) return ta-tb; // AAA first, then acclaimed AA, then indies
    return (b.score||0)-(a.score||0);
  });
}

function renderSuggest(){
  var sugs=getSuggestions();
  var pref=genrePrefs();
  var tops=topGenres(pref);
  var genres={}; sugs.forEach(function(g){ genres[g.genre||"Other"]=1; });
  var genreList=["All"].concat(Object.keys(genres).sort());
  if(genreList.indexOf(sugGenre)<0) sugGenre="All";
  var shown=(sugGenre==="All"?sugs:sugs.filter(function(g){ return g.genre===sugGenre; }))
    .filter(function(g){ return sugTier==="All" || tierFor(g.name)===sugTier; })
    .filter(function(g){ return matchQ(g.name); });

  var html =
    '<div class="toolbar" style="margin-top:14px">'+
    '<button class="btn blue" data-act="sync-catalog"'+(busy?' disabled':'')+'>'+(busy?"Updating…":"↻ Refresh")+'</button>'+
    '<div class="searchwrap"><span class="sic">⌕</span>'+
    '<input class="tab-search" id="tabSearch" placeholder="Search suggestions…" value="'+esc(q())+'" autocomplete="off">'+
    (q()?'<button class="sclear" data-act="clear-search" title="Clear">✕</button>':'')+
    '</div></div>'+
    '<div class="syncbar"><span class="syncnote">'+(data.lastCatalogSync?("Last updated "+esc(data.lastCatalogSync)):"Built-in top 40 — add API key in Settings for live data")+'</span></div>'+
    '<div class="meta" style="margin-bottom:10px">'+(tops.length?('<span style="color:var(--text)">Personalised from your ratings</span> — more <b style="color:#2BD46B">'+esc(tops.slice(0,2).join(" & "))+'</b> up top. '):'')+'Top-rated released PS5 games — best matches first, minus everything you’ve played, rented or queued.</div>'+
    '<div class="chipbar">'+["All","AAA","AA","Indie"].map(function(t){
      return '<button class="gchip '+(t===sugTier?"on":"")+'" data-tier="'+t+'">'+(t==="All"?"All tiers":t)+'</button>';
    }).join("")+'</div>'+
    '<div class="chipbar">'+genreList.map(function(g){
      return '<button class="gchip '+(g===sugGenre?"on":"")+'" data-genre="'+esc(g)+'">'+esc(g)+'</button>';
    }).join("")+((sugGenre!=="All"||sugTier!=="All")?'<button class="gchip clear-filter" data-act="clear-sug-filters">Clear filters</button>':'')+'</div>'+
    gameViewToggle();

  if(!shown.length) html+= q()?noMatch():'<div class="empty">Nothing left to suggest here — either you’ve played everything (impressive) or try Refresh for more.</div>';

  function sugCard(g, tierHtml){
    var prefChip=(g.genre&&tops.indexOf(g.genre)>-1)?'<span class="chip pref">♥ Your taste</span> ':'';
    return '<div class="card"><div class="row">'+
      coverImg(g)+
      '<div class="grow">'+
        '<div class="gname">'+esc(g.name)+'</div>'+
        '<div class="meta">'+prefChip+tierHtml+'<span style="color:'+scoreColor(g.score)+';font-weight:700">'+(g.score?("Critic "+g.score):"Unrated")+'</span> · '+(g.year||"")+' · '+esc(g.genre||"")+(g.rating?' · '+(Math.round(g.rating*10)/10)+'★ users':'')+(g.note?'<br>'+esc(g.note):'')+'</div>'+gameReleaseMeta(g)+
      '</div>'+
    '</div><div class="actions">'+
      '<button class="btn blue" data-act="sug-queue" data-name="'+esc(g.name)+'">◇ Add to queue</button>'+
      '<button class="btn" data-act="sug-played" data-name="'+esc(g.name)+'">✓ Played it</button>'+
      linkBtns(g.name)+
      '<button class="btn ghost danger" data-act="sug-hide" data-name="'+esc(g.name)+'">Not interested</button>'+
    '</div></div>';
  }

  html+='<div class="'+(gameView==="grid"?"game-grid":"cards")+'">';
  shown.forEach(function(g){ html+=gameView==="grid"?gameTile(g,"name:"+norm(g.name),tierFor(g.name)||"PS5"):sugCard(g, badges(g.name)); });
  html+='</div>';

  // ---- internet-wide search results ----
  var qs=q().trim();
  if(qs.length>=3){
    html+='<div class="sechead">From the internet</div>';
    if(!getKey()){
      html+='<div class="empty">Add your free RAWG API key in Settings to search the whole games database.</div>';
    } else if(webResults.q!==qs){
      html+='<div class="empty">Searching the games database for “'+esc(qs)+'”…</div>';
    } else {
      var ownedW=ownedSet();
      var seenLocal={}; shown.forEach(function(g){ seenLocal[norm(g.name)]=1; });
      var disW={}; (data.dismissed||[]).forEach(function(x){ disW[x]=1; });
      var webShown=webResults.items.filter(function(g){ return !disW[norm(g.name)] && !seenLocal[norm(g.name)] && !isOwned(g.name, ownedW); });
      if(!webShown.length) html+='<div class="empty">No new games found for “'+esc(qs)+'”.</div>';
      else{
        html+='<div class="'+(gameView==="grid"?"game-grid":"cards")+'">';
        webShown.forEach(function(g){
          var tierHtml = g.tier ? '<span class="chip t-'+g.tier.toLowerCase()+'">'+g.tier+'</span> ' : '';
          html+=gameView==="grid"?gameTile(g,"name:"+norm(g.name),g.tier||"PS5"):sugCard(g, tierHtml);
        });
        html+='</div>';
      }
    }
  }

  // ---- hidden (Not interested) games, restorable ----
  var dis=data.dismissed||[];
  if(dis.length){
    html+='<div class="sechead">Hidden games · '+dis.length+'</div><div class="cards">';
    dis.forEach(function(k){
      var nm2=(data.dismissedNames&&data.dismissedNames[k])||k;
      html+='<div class="card hist"><div class="row">'+
        coverImg({name:nm2})+
        '<div class="grow"><div class="gname">'+esc(nm2)+'</div><div class="meta">Hidden from suggestions</div></div>'+
        '<button class="btn" data-act="sug-restore" data-key="'+esc(k)+'">↩ Restore</button>'+
      '</div></div>';
    });
    html+='</div>';
  }
  return html;
}

/* Search RAWG for the For You internet-wide search */
var webResults={q:"",items:[]};
var webTimer=null;
function searchWeb(qs){
  var key=getKey(); if(!key) return;
  clearTimeout(webTimer);
  webTimer=setTimeout(function(){
    rawgFetch("https://api.rawg.io/api/games?key="+encodeURIComponent(key)+"&search="+encodeURIComponent(qs)+"&page_size=8&platforms=187")
    .then(function(json){
      if((searchQ.suggest||"").trim()!==qs) return; // stale response
      var items=(json.results||[]).filter(function(g){ return g&&g.name; }).map(function(g){
        if(g.background_image) data.covers[norm(g.name)]=g.background_image;
        return {
          name:g.name,
          year:g.released?Number(g.released.slice(0,4)):null,
          score:g.metacritic||null,
          rating:g.rating||null,
          genre:(g.genres&&g.genres[0]&&g.genres[0].name)||"",
          tier:(g.added>=8000?"AAA":g.added>=2500?"AA":"Indie")
        };
      });
      webResults={q:qs, items:items};
      renderKeepSearch();
    }).catch(function(){});
  },500);
}
/* Re-render without losing the search box focus/caret */
function renderKeepSearch(){
  var el=document.getElementById("tabSearch");
  var had=el && document.activeElement===el;
  var pos=had?el.selectionStart:0;
  render();
  if(had){
    var n=document.getElementById("tabSearch");
    if(n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch(e){} }
  }
  tvAfterRender();
}

/* ---------- Played card (shared by Played tab + Playing subsections) ---------- */
function playedCard(p, expandable){
  var open = !!expandable && expandedId===p.id;
  var dots="";
  for(var n=1;n<=5;n++) dots+='<button class="dot '+(p.rating>=n?"on":"")+'" data-act="rate" data-id="'+p.id+'" data-n="'+n+'">●</button>';
  var chipCls=p.status==="Platinum"?"plat":p.status==="Finished"?"fin":p.status==="Playing"?"play":"drop";
  var h='<div class="card">'+
    (expandable?'<div class="row clickrow" data-act="pl-toggle" data-id="'+p.id+'">':'<div class="row">')+
    coverImg(p)+
    '<div class="grow"><div class="gname">'+esc(p.name)+'</div><div class="meta">'+badges(p.name)+'Added '+fmt(p.added)+
    (p.vendor?' · <span style="color:var(--vendor)">'+esc(p.vendor)+'</span>':'')+
    (Number(p.cost)?' · <span style="color:#F2B84B;font-weight:700">'+fmtMoney(p.cost)+'</span>':'')+
    scoreBits(p)+'</div>'+gameReleaseMeta(p)+'</div>'+
    '<div class="dots">'+dots+'</div>'+
    (expandable?'<span style="color:var(--dim);font-size:12px;flex-shrink:0">'+(open?"▲":"▼")+'</span>':'')+
  '</div><div class="actions">'+
    '<span class="chip '+chipCls+'">'+(STATUS_LABEL[p.status]||p.status)+'</span>'+
    '<select class="selectmini status-sel" data-id="'+p.id+'">'+STATUSES.map(function(s){return '<option value="'+s+'"'+(s===p.status?" selected":"")+'>'+(STATUS_LABEL[s]||s)+'</option>';}).join("")+'<option value="__nowplaying__">▶ Now Playing</option></select>'+
    linkBtns(p.name)+
    '<button class="btn ghost danger" data-act="del-played" data-id="'+p.id+'">Remove</button>'+
  '</div>'+
  '<input class="note-inp" data-id="'+p.id+'" placeholder="Add a note — thoughts, playtime, DLC left…" value="'+esc(p.note||"")+'">';
  if(open){
    var u=coverUrl(p);
    if(u) h+='<img class="cover lg" src="'+esc(u)+'" alt="" loading="lazy">';
    h+=plotBlock(p.name);
    h+='<div class="actions">'+fandomBtn(p.name)+'</div>';
    h+=fandomEditor(p.name);
  }
  h+='</div>';
  return h;
}

/* ---------- Played tab ---------- */
function renderPlayed(){
  var html = toolbar("Add game","Search played…");
  if(formOpen[tab]){
    html+=
    '<div class="form"><h3>Add to your library</h3><div class="fields">'+
    '<div class="ac-wrap f-name"><input id="pName" class="ac-input" placeholder="Game name — start typing for suggestions" autocomplete="off"><div class="ac-drop"></div></div>'+
    '<select class="f-sm" id="pStatus">'+STATUSES.map(function(s){return '<option value="'+s+'">'+(STATUS_LABEL[s]||s)+'</option>';}).join("")+'</select>'+
    '<button class="btn blue" data-act="add-played">Add</button>'+
    '<button class="btn" data-act="toggle-import">'+(showImport?"Close import":"Bulk import")+'</button>'+
    '</div>';
    if(showImport){
      html+='<div style="margin-top:10px">'+
      '<div class="meta" style="margin-bottom:8px; line-height:1.6">'+
      '<b style="color:var(--text)">Getting your list out of PSN:</b><br>'+
      '1. Easiest — go to <b>psnprofiles.com</b>, enter your PSN ID and press Update (your profile must be public: PS5 → Settings → Users and Accounts → Privacy → Gaming | Trophies → Anyone). Open your profile, and every game you’ve ever launched is listed with trophy progress. Copy the game names.<br>'+
      '2. Or open the <b>PlayStation App → Game Library → Purchased</b> and copy the titles manually.<br>'+
      '3. Paste below — one game per line. Junk lines that are only numbers or percentages get skipped automatically.<br>'+
      'Optional format per line: <b>Game name | rating 1–5 | status | note</b></div>'+
      '<textarea id="importText" placeholder="God of War Ragnarök | 5 | Platinum | 100% story done\nElden Ring | 5 | Finished\nFC 25"></textarea>'+
      '<div class="actions"><button class="btn blue" data-act="run-import">Import list</button></div></div>';
    }
    html+='</div>';
  }

  var elsewhere=data.played.filter(function(p){ return p.status==="Playing"||p.status==="Dropped"; }).length;
  var shown=data.played.filter(function(p){ return matchQ(p.name) && p.status!=="Playing" && p.status!=="Dropped"; });
  if(!data.played.length) html+='<div class="empty">Your library is empty. Add games one by one, or open the PlayStation App → Game Library, copy your titles and use Bulk import (inside + Add game). The For You tab gets smarter as this list grows.</div>';
  else if(!shown.length) html+= q()?noMatch():'<div class="empty">Every game in your library is currently in the <b>▶ Playing</b> tab — under <b>Resume Later</b> or <b>On Hold</b>. Set one back to Finished or Platinum to return it here.</div>';

  if(elsewhere && shown.length) html+='<div class="meta" style="margin-bottom:10px">'+elsewhere+' game'+(elsewhere===1?" is":"s are")+' in the <b style="color:var(--text)">▶ Playing</b> tab — under Resume Later or On Hold.</div>';

  html+='<div class="'+(gameView==="grid"?"game-grid":"cards")+'">';
  shown.forEach(function(p){ html+=gameView==="grid"?gameTile(p,p.id,(STATUS_LABEL[p.status]||p.status)):playedCard(p); });
  html+='</div>';
  return html;
}

/* ---------- BiglyBT tab (HTTPS proxy contract) ---------- */
var BIGLY_PROXY_KEY="gamevault-biglybt-proxy";
var biglyItems=[];
function biglyProxyUrl(){
  try{ return (localStorage.getItem(BIGLY_PROXY_KEY)||"").trim().replace(/\/+$/,""); }catch(e){ return ""; }
}
function setBiglyProxyUrl(v){
  try{ localStorage.setItem(BIGLY_PROXY_KEY,(v||"").trim().replace(/\/+$/,"")); }catch(e){}
}
var BIGLY_NATIVE_TOKEN_KEY="gamevault-biglybt-native-token";
/* device-specific downloads folder link (e.g. Z:\Downloads, \\192.168.0.100\Elements,
   or an http file-browser URL). Differs per device, so kept in localStorage. */
var BIGLY_FOLDER_KEY="gamevault-biglybt-folder";
function biglyFolder(){ try{ return (localStorage.getItem(BIGLY_FOLDER_KEY)||"").trim(); }catch(e){ return ""; } }
function setBiglyFolder(v){ try{ localStorage.setItem(BIGLY_FOLDER_KEY,(v||"").trim()); }catch(e){} }
function biglyOpenFolder(){
  var loc=biglyFolder();
  if(!loc){ flash("Set your downloads folder in Settings first"); toggleSettings(true); return; }
  if(/^https?:\/\//i.test(loc)){ window.open(loc,"_blank","noopener"); return; }
  // file:// / drive / UNC path: browsers block opening these from an HTTPS page,
  // so copy it for pasting into Explorer / Files, and best-effort try to open.
  var copied=false;
  try{ if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(loc); copied=true; } }catch(e){}
  try{ var w=window.open(loc); if(w){ return; } }catch(e){}
  flash(copied?("Folder path copied — paste it into Explorer / Files ("+loc+")"):("Downloads folder: "+loc));
}
function biglyFrameUrl(){ return biglyProxyUrl()+"/__native"; }
function addBiglyHistoryEvent(entry){
  if(!entry||typeof entry!=="object") return;
  var clean={id:String(entry.id||("bigly-"+Date.now()+"-"+Math.random().toString(36).slice(2))),at:Number(entry.at)||Date.now(),name:String(entry.name||"Untitled torrent").slice(0,500),outcome:String(entry.outcome||"Activity recorded").slice(0,200),progress:Math.max(0,Math.min(100,Number(entry.progress)||0)),downloaded:Math.max(0,Number(entry.downloaded)||0),total:Math.max(0,Number(entry.total)||0),filesDeleted:!!entry.filesDeleted,hash:String(entry.hash||"").slice(0,100)};
  if((data.biglyHistory||[]).some(function(x){return x.id===clean.id;})) return;
  data.biglyHistory.unshift(clean);data.biglyHistory=data.biglyHistory.slice(0,1000);persist();
}
function removeBiglyHistoryEvent(id){
  if(!data.biglyHistory) return;
  var before=data.biglyHistory.length;
  data.biglyHistory=data.biglyHistory.filter(function(x){return x.id!==id;});
  if(data.biglyHistory.length!==before) persist();
}
function updateBiglyHistoryEvent(id,patch){
  if(!data.biglyHistory||!patch) return;
  var hit=false;
  data.biglyHistory.forEach(function(x){
    if(x.id!==id) return;
    if(typeof patch.filesDeleted==="boolean") x.filesDeleted=patch.filesDeleted;
    if(typeof patch.outcome==="string") x.outcome=String(patch.outcome).slice(0,200);
    hit=true;
  });
  if(hit) persist();
}
window.addEventListener("message",function(e){
  var frame=document.getElementById("biglyFrame"), proxy=biglyProxyUrl(), origin="";
  try{ origin=new URL(proxy).origin; }catch(err){ return; }
  if(!frame || e.source!==frame.contentWindow || e.origin!==origin || !e.data) return;
  if(e.data.type==="gvbt-native-token-request"){
    var saved=""; try{ saved=localStorage.getItem(BIGLY_NATIVE_TOKEN_KEY)||""; }catch(err){}
    e.source.postMessage({type:"gvbt-native-token-response",token:saved},origin);
  }else if(e.data.type==="gvbt-native-token-save" && typeof e.data.token==="string" && e.data.token.length<16384){
    try{ localStorage.setItem(BIGLY_NATIVE_TOKEN_KEY,e.data.token); }catch(err){}
  }else if(e.data.type==="gvbt-native-token-remove"){
    try{ localStorage.removeItem(BIGLY_NATIVE_TOKEN_KEY); }catch(err){}
  }else if(e.data.type==="gvbt-history-event"){
    addBiglyHistoryEvent(e.data.entry);
  }else if(e.data.type==="gvbt-history-remove" && e.data.id){
    removeBiglyHistoryEvent(String(e.data.id));
  }else if(e.data.type==="gvbt-history-update" && e.data.id){
    updateBiglyHistoryEvent(String(e.data.id), e.data);
  }else if(e.data.type==="gvbt-history-request"){
    e.source.postMessage({type:"gvbt-history-response",items:(data.biglyHistory||[]).slice(0,1000)},origin);
  }
});
function renderBiglyBT(){
  var proxy=biglyProxyUrl();
  var html='<div class="sechead">BiglyBT</div>';
  if(!proxy){
    return html+'<div class="card torrent-login"><h3>Proxy required</h3><p class="meta">For security, GameVault cannot connect directly to your public BiglyBT IP from this public GitHub Pages frontend. Add an HTTPS proxy URL in Settings. The proxy keeps the real BiglyBT server address in its backend environment/config.</p><button class="btn blue" data-act="bigly-settings">Open Settings</button></div>';
  }
  if(location.protocol==="https:" && /^http:\/\//i.test(proxy)){
    return html+'<div class="card torrent-login"><h3>HTTPS gateway required</h3><p class="meta">The saved BiglyBT URL starts with <b>http://</b>. Because GameVault is loaded from HTTPS GitHub Pages, the browser blocks that request before login. Add the HTTPS gateway URL in Settings.</p><div class="actions"><button class="btn blue" data-act="bigly-settings">Open Settings</button></div></div>';
  }
  if(/^https:\/\//i.test(proxy)){
    return html+'<div class="card bigly-browser" id="biglyBrowser"><div class="bigly-browser-bar"><button class="btn" data-act="bigly-reload" title="Reload BiglyBT">Reload</button><button class="btn" data-act="bigly-fullscreen" title="Use the full screen">Full screen</button><button class="btn" data-act="bigly-folder" title="Open the folder where all downloads are saved">&#128193; Files</button><button class="btn" data-act="bigly-settings" title="BiglyBT settings">Settings</button><span class="syncnote" style="align-self:center">Secure native dashboard</span></div><iframe id="biglyFrame" class="bigly-browser-frame" title="Native BiglyBT Dashboard" src="'+esc(biglyFrameUrl())+'" allow="clipboard-read; clipboard-write; fullscreen" allowfullscreen referrerpolicy="no-referrer"></iframe></div>';
  }
  return html+'<div class="card torrent-login"><h3>Invalid gateway URL</h3><p class="meta">Use an HTTPS BiglyBT gateway URL in Settings.</p><button class="btn blue" data-act="bigly-settings">Open Settings</button></div>';
}

/* ---------- Plex library (direct secure Plex Media Server API) ---------- */
var PLEX_URL_KEY="gamevault-plex-url", PLEX_TOKEN_KEY="gamevault-plex-token", PLEX_CACHE_KEY="gamevault-plex-cache";
var PLEX_ORDER=["home","continue","movies","shows","recent"], plexTab="home", plexItems=[], plexBusy=false, plexErr="", plexConnected=false, plexAllowDelete=false, plexSearch="", plexExpanded=null, plexDetailReturnY=0, plexEnriched={}, plexEnrichBusy={},plexCacheAt=0;
try{
  plexTab=localStorage.getItem("gamevault-plex-tab")||"home";
  if(PLEX_ORDER.indexOf(plexTab)<0) plexTab="home";
  var savedPlex=JSON.parse(localStorage.getItem(PLEX_CACHE_KEY)||"null");
  if(savedPlex&&Array.isArray(savedPlex.items)){plexItems=savedPlex.items;plexCacheAt=Number(savedPlex.at)||0;}
}catch(e){}
function plexServerUrl(){ try{ return (localStorage.getItem(PLEX_URL_KEY)||"").trim().replace(/\/+$/,""); }catch(e){ return ""; } }
function plexToken(){ try{ return localStorage.getItem(PLEX_TOKEN_KEY)||""; }catch(e){ return ""; } }
function setPlexConfig(url,token){
  try{
    localStorage.setItem(PLEX_URL_KEY,(url||"").trim().replace(/\/+$/,""));
    localStorage.setItem(PLEX_TOKEN_KEY,(token||"").trim());
  }catch(e){}
}
function plexWithToken(path, base){
  var u=new URL(path,(base||plexServerUrl())+"/");
  u.searchParams.set("X-Plex-Token",plexToken());
  return u.toString();
}
function plexRequest(path,opts){
  var base=plexServerUrl(), token=plexToken();
  if(!base||!token) return Promise.reject(new Error("Add your Plex server URL and owner token in Settings first."));
  if(location.protocol==="https:" && /^http:\/\//i.test(base)) return Promise.reject(new Error("GameVault is using HTTPS, so the browser blocks an HTTP Plex server. Use the server's secure plex.direct URL."));
  opts=opts||{};
  opts.headers=Object.assign({"Accept":"application/json"},opts.headers||{});
  return fetchWithPolicy(plexWithToken(path),opts,{timeout:18000,retries:opts.method?0:1}).then(function(r){
    return r.text().then(function(t){
      if(!r.ok) throw new Error(r.status===401?"Plex rejected the token.":r.status===403?"Plex denied this action. Confirm this is the owner token and Allow media deletion is enabled.":("Plex returned "+r.status));
      if(!t) return {};
      try{ return JSON.parse(t); }catch(e){ return new DOMParser().parseFromString(t,"application/xml"); }
    });
  }).catch(function(e){
    if(e&&e.message&&e.message!=="Failed to fetch") throw e;
    throw new Error("Plex is offline or unreachable. Cached library items remain visible until the Shield is available again.");
  });
}
function plexObjects(payload,names){
  if(payload&&payload.MediaContainer){
    var out=[];
    names.forEach(function(n){ var v=payload.MediaContainer[n]; if(Array.isArray(v)) out=out.concat(v); });
    return out;
  }
  if(payload&&payload.documentElement){
    return [].slice.call(payload.documentElement.children||[]).filter(function(el){ return names.indexOf(el.tagName)>-1; }).map(function(el){
      var o={}; [].slice.call(el.attributes||[]).forEach(function(a){ o[a.name]=a.value; }); return o;
    });
  }
  return [];
}
function plexContainerAttr(payload,name){
  if(payload&&payload.MediaContainer) return payload.MediaContainer[name];
  if(payload&&payload.documentElement) return payload.documentElement.getAttribute(name);
  return null;
}
function plexMapItem(x,kind){
  var duration=Number(x.duration)||0, offset=Number(x.viewOffset)||0;
  var watched=kind==="show" ? (Number(x.leafCount)>0&&Number(x.viewedLeafCount)>=Number(x.leafCount)) : Number(x.viewCount)>0;
  var genres=(x.Genre||[]).map(function(g){ return g.tag||g.name||""; }).filter(Boolean);
  var guids=(x.Guid||[]).map(function(g){ return g.id||""; }), imdbId="";
  guids.some(function(g){ var m=String(g).match(/imdb:\/\/(tt\d+)/i); if(m){ imdbId=m[1]; return true; } return false; });
  return {ratingKey:String(x.ratingKey||""),type:kind,title:x.title||"Untitled",year:x.year||"",summary:x.summary||"",thumb:x.thumb||"",art:x.art||"",
    duration:duration,viewOffset:offset,viewCount:Number(x.viewCount)||0,leafCount:Number(x.leafCount)||0,viewedLeafCount:Number(x.viewedLeafCount)||0,
    addedAt:Number(x.addedAt)||0,lastViewedAt:Number(x.lastViewedAt)||0,watched:watched,genres:genres,imdbId:imdbId,
    rating:Number(x.audienceRating||x.rating)||null,date:x.originallyAvailableAt||""};
}
function plexSaveCache(){
  var plexStored={at:Date.now(),items:plexItems};
  if(window.GameVaultCore)GameVaultCore.storage.put("plex-cache",plexStored).then(function(result){if(result!==false)try{localStorage.removeItem(PLEX_CACHE_KEY);}catch(e){}});
  else try{localStorage.setItem(PLEX_CACHE_KEY,JSON.stringify(plexStored));}catch(e){}
}
function plexMediaUrl(path){ return path&&plexServerUrl()&&plexToken()?plexWithToken(path):""; }
function plexRefresh(){
  if(plexBusy) return Promise.resolve();
  plexBusy=true; plexErr=""; render();
  return Promise.all([plexRequest("/"),plexRequest("/library/sections")]).then(function(res){
    var allowDelete=plexContainerAttr(res[0],"allowMediaDeletion");
    plexAllowDelete=allowDelete===true||Number(allowDelete)===1;
    var sections=plexObjects(res[1],["Directory"]).filter(function(s){ return s.type==="movie"||s.type==="show"; });
    return Promise.all(sections.map(function(s){
      return plexRequest("/library/sections/"+encodeURIComponent(s.key)+"/all?sort=titleSort&X-Plex-Container-Start=0&X-Plex-Container-Size=5000").then(function(p){
        return plexObjects(p,["Metadata","Video","Directory"]).map(function(x){ return plexMapItem(x,s.type); });
      });
    }));
  }).then(function(groups){
    plexItems=[].concat.apply([],groups).filter(function(x){ return x.ratingKey; });
    plexItems.sort(function(a,b){ return a.title.localeCompare(b.title); });
    plexConnected=true; plexBusy=false; plexSaveCache(); plexReconcilePlayback(plexItems); render();
  }).catch(function(e){ plexConnected=false; plexBusy=false; plexErr=e.message||"Plex is unavailable"; render(); });
}
function plexDiscover(){
  var input=document.getElementById("plexTokenInput"), token=(input&&input.value.trim())||plexToken();
  var status=document.getElementById("plexSettingsStatus");
  if(!token){ if(status) status.textContent="Enter your X-Plex-Token first."; return; }
  if(status) status.textContent="Discovering your Plex Media Server...";
  fetchWithPolicy("https://plex.tv/api/resources?includeHttps=1&includeRelay=1&X-Plex-Token="+encodeURIComponent(token),{headers:{Accept:"application/xml"}},{scope:"plex:resources",timeout:16000,retries:1}).then(function(r){ if(!r.ok) throw new Error("Plex account rejected the token"); return r.text(); }).then(function(t){
    var doc=new DOMParser().parseFromString(t,"application/xml");
    var devices=[].slice.call(doc.querySelectorAll("Device")).filter(function(d){ return (d.getAttribute("provides")||"").split(",").indexOf("server")>-1&&d.getAttribute("owned")!=="0"; });
    if(!devices.length) throw new Error("No owned Plex server was found on this account");
    var conns=[].slice.call(devices[0].querySelectorAll("Connection"));
    var conn=conns.filter(function(c){ return c.getAttribute("protocol")==="https"&&c.getAttribute("relay")!=="1"&&c.getAttribute("local")!=="1"; })[0]||
      conns.filter(function(c){ return c.getAttribute("protocol")==="https"&&c.getAttribute("relay")!=="1"; })[0]||
      conns.filter(function(c){ return c.getAttribute("protocol")==="https"; })[0];
    if(!conn) throw new Error("Plex did not publish a secure server connection");
    document.getElementById("plexUrlInput").value=conn.getAttribute("uri")||"";
    document.getElementById("plexTokenInput").value=devices[0].getAttribute("accessToken")||token;
    if(status) status.textContent="Server found. Press Save Plex to connect.";
  }).catch(function(e){ if(status) status.textContent=e.message||"Server discovery failed"; });
}
function plexProgress(item){
  if(item.watched) return 100;
  if(item.type==="show") return item.leafCount?Math.round(item.viewedLeafCount/item.leafCount*100):0;
  return item.duration?Math.round(item.viewOffset/item.duration*100):0;
}
function plexTitleMatch(x,item){
  if(!x||norm(x.title)!==norm(item.title)) return false;
  return !x.year||!item.year||String(x.year)===String(item.year);
}
function plexKnownMedia(item){
  var pools=item.type==="show"?[data.seriesWatchlist||[],data.watchingSeries||[],data.watchedSeries||[]]:[data.movieWatchlist||[],data.watchingMovies||[],data.watchedMovies||[]];
  for(var p=0;p<pools.length;p++) for(var i=0;i<pools[p].length;i++) if(plexTitleMatch(pools[p][i],item)) return pools[p][i];
  var cache=item.type==="show"?seriesCache:filmCache;
  for(var k in cache){var list=(cache[k]&&cache[k].items)||[];for(var j=0;j<list.length;j++)if(plexTitleMatch(list[j],item))return list[j];}
  return null;
}
function plexSyncRecord(item){
  var known=plexKnownMedia(item),m=known||plexAsMedia(item),key=item.type==="show"?seriesKey(m):movieWatchKey(m);
  return {key:key,id:m.id,title:item.title,year:String(item.year||m.year||""),poster:known&&known.poster||"",imdb:typeof m.imdb==="number"?m.imdb:null,imdbId:m.imdbId||null,tmdb:m.tmdb||null,overview:item.summary||m.overview||"",genres:m.genres||[],providers:m.providers||[],seasons:m.seasons||0,seasonList:m.seasonList||[],plexRatingKey:item.ratingKey,plexSyncedAt:Date.now()};
}
function plexReconcilePlayback(items){
  var changed=false;
  function removeMatch(list,item){var before=list.length,out=list.filter(function(x){return !plexTitleMatch(x,item);});if(out.length!==before)changed=true;return out;}
  (items||[]).forEach(function(item){
    var pct=plexProgress(item);if(pct<=0)return;
    var record=plexSyncRecord(item);
    if(item.type==="show"){
      var inWatched=(data.watchedSeries||[]).some(function(x){return plexTitleMatch(x,item);});
      if(item.watched||pct>=100){
        data.seriesWatchlist=removeMatch(data.seriesWatchlist||[],item);data.watchingSeries=removeMatch(data.watchingSeries||[],item);
        if(!inWatched){record.t=Date.now();data.watchedSeries.unshift(record);changed=true;}
      }else if(!inWatched&&!(data.watchingSeries||[]).some(function(x){return plexTitleMatch(x,item);})){data.seriesWatchlist=removeMatch(data.seriesWatchlist||[],item);record.started=Date.now();data.watchingSeries.unshift(record);changed=true;}
    }else{
      var movieWatched=(data.watchedMovies||[]).some(function(x){return plexTitleMatch(x,item);});
      if(item.watched||pct>=100){
        data.movieWatchlist=removeMatch(data.movieWatchlist||[],item);data.watchingMovies=removeMatch(data.watchingMovies||[],item);
        if(!movieWatched){record.t=Date.now();data.watchedMovies.unshift(record);changed=true;}
      }else if(!movieWatched&&!(data.watchingMovies||[]).some(function(x){return plexTitleMatch(x,item);})){data.movieWatchlist=removeMatch(data.movieWatchlist||[],item);record.started=Date.now();data.watchingMovies.unshift(record);changed=true;}
    }
  });
  if(changed){addAudit("plex-playback-synced","Plex progress updated Watching and Watched lists");persist();}
  return changed;
}
function plexSyntheticId(item){ return "plex-"+item.type+"-"+item.ratingKey; }
function plexGenreIds(names,list){
  var wanted=(names||[]).map(norm),out=[];
  (list||[]).forEach(function(g){ if(wanted.indexOf(norm(g[1]))>-1) out.push(g[0]); });
  return out;
}
function plexAsMedia(item){
  if(!item) return null;
  var cached=plexEnriched[item.ratingKey]||{}, isShow=item.type==="show";
  return Object.assign({},cached,{
    id:plexSyntheticId(item),plexRatingKey:item.ratingKey,plexType:item.type,title:item.title,year:String(item.year||cached.year||""),
    date:item.date||cached.date||"",overview:item.summary||cached.overview||"",poster:plexMediaUrl(item.thumb)||cached.poster||"",
    backdrop:plexMediaUrl(item.art)||cached.backdrop||"",imdbId:item.imdbId||cached.imdbId||null,
    imdb:typeof cached.imdb==="number"?cached.imdb:(typeof item.rating==="number"?item.rating:null),tmdbId:cached.tmdbId||null,
    genres:(cached.genres&&cached.genres.length)?cached.genres:plexGenreIds(item.genres,isShow?SERIES_GENRES:MOVIE_GENRES),
    providers:cached.providers||[],seasons:cached.seasons||0,seasonList:cached.seasonList||[],latestDate:cached.latestDate||""
  });
}
function plexFindItem(id){
  return plexItems.filter(function(x){ return x.ratingKey===String(id)||plexSyntheticId(x)===String(id); })[0]||null;
}
function findPlexMedia(id,type){
  var item=plexItems.filter(function(x){ return (!type||x.type===type)&&(x.ratingKey===String(id)||plexSyntheticId(x)===String(id)); })[0];
  return plexAsMedia(item);
}
function plexEnrichItem(item){
  if(!item||!tmdbKey()||plexEnriched[item.ratingKey]||plexEnrichBusy[item.ratingKey]) return;
  plexEnrichBusy[item.ratingKey]=1;
  var searchPath=item.type==="show"?"/search/tv":"/search/movie";
  var params={query:item.title,include_adult:"false",page:1};
  if(item.year) params[item.type==="show"?"first_air_date_year":"year"]=item.year;
  tmdbGet(searchPath,params).then(function(j){
    var results=j.results||[], exact=results.filter(function(x){ var d=item.type==="show"?x.first_air_date:x.release_date; return !item.year||String(d||"").slice(0,4)===String(item.year); })[0]||results[0];
    if(!exact) throw new Error("No TMDB match");
    if(item.type==="show"){
      var s=mapSeries(exact),tmdbId=s.id;
      return enrichSeriesIds(s).then(function(){ s.tmdbId=tmdbId; return s; });
    }
    var m=mapMovie(exact),tmdbId=m.id;
    return tmdbGet("/movie/"+tmdbId,{append_to_response:"external_ids,watch/providers"}).then(function(d){
      m.tmdbId=tmdbId;m.imdbId=(d.external_ids&&d.external_ids.imdb_id)||m.imdbId;
      m.genres=(d.genres||[]).map(function(g){return g.id;});
      var wp=d["watch/providers"]&&d["watch/providers"].results&&d["watch/providers"].results.US;
      m.providers=(((wp&&wp.flatrate)||[]).concat((wp&&wp.free)||[])).map(function(p){return p.provider_name;});
      return omdbRatingById(m.imdbId).then(function(rt){if(typeof rt==="number")m.imdb=rt;return m;});
    });
  }).then(function(m){
    plexEnriched[item.ratingKey]=m;delete plexEnrichBusy[item.ratingKey];
    if(section==="plex"&&plexExpanded===item.ratingKey) render();
  }).catch(function(){ delete plexEnrichBusy[item.ratingKey]; });
}
function plexMovieState(m){
  if(isMovieWatched(m)) return "watched";
  if((data.watchingMovies||[]).some(function(x){return plexTitleMatch(x,{title:m.title,year:m.year});})) return "watching";
  if(inWatchlist(m)) return "watchlist";
  return "plex";
}
function plexSeriesState(s){
  if((data.watchedSeries||[]).some(function(x){return String(x.id)===String(s.id);})) return "serieswatched";
  if((data.watchingSeries||[]).some(function(x){return String(x.id)===String(s.id);})) return "serieswatching";
  if(inSeriesWatchlist(s)) return "serieswatchlist";
  return "plex";
}
function plexHero(item,m){
  var list=item.type==="show"?SERIES_GENRES:MOVIE_GENRES;
  ensureMediaArtwork(m,item.type==="show"?"series":"movie");
  return '<div class="media-closebar detail-toolbar">'+mediaClose("plex")+'</div><div class="media-page-head">'+
    '<div class="media-page-poster">'+mediaImage(m.poster,m.title,(m.poster?"":"fallback-art"))+'</div><div><div class="media-page-title">'+esc(m.title)+'</div><div class="media-page-sub"><span class="media-pill imdb">'+esc(mediaRatingLabel(m))+'</span><span class="media-pill">'+esc(genreLabel(m.genres,list))+'</span>'+(m.year?'<span class="media-pill">'+esc(m.year)+'</span>':'')+'</div>'+(m.overview?'<div class="media-page-overview">'+esc(m.overview)+'</div>':'')+'</div></div>';
}
function plexDetailPage(item){
  var m=plexAsMedia(item), actions='<div class="actions detail-actionbar">';
  refreshImdbIfStale(m);
  if(item.type==="show"){
    var sk=plexSeriesState(m);
    actions+=seriesPrimaryAction(m,sk,false)+seriesMoreMenu(m,sk)+seriesRatingDots(m)+seriesLinks(m.title,m.year)+reeloadReviewLink(m.title,m.year,"series")+seriesImdbLink(m)+'<button class="btn" data-act="ai-open" data-ai-type="series" data-id="'+esc(String(m.id))+'">AI Assistant</button>'+(m.tmdbId?'<a class="btn" href="https://www.themoviedb.org/tv/'+m.tmdbId+'" target="_blank" rel="noopener">TMDB</a>':'');
  }else{
    var mk=plexMovieState(m);
    actions+=moviePrimaryAction(m,mk,false)+movieMoreMenu(m,mk)+movieLinks(m.title,m.year)+imdbLink(m)+reeloadReviewLink(m.title,m.year,"movie")+(m.tmdbId?'<a class="btn" href="https://www.themoviedb.org/movie/'+m.tmdbId+'" target="_blank" rel="noopener">TMDB</a>':'')+'<button class="btn" data-act="ai-open" data-ai-type="film" data-id="'+esc(String(m.id))+'">AI Assistant</button>';
  }
  actions+='<button class="btn ghost danger" data-act="plex-delete" data-id="'+esc(item.ratingKey)+'">Permanently delete from Plex</button></div>';
  return '<div class="media-page plex-detail">'+plexHero(item,m)+actions+mediaProvidersBlock(m)+(item.type==="show"?(seriesEpisodeBlock(m)||plotBlock(seriesPlotName(m),"TV series")):plotBlock(moviePlotName(m),"film"))+aiPanel(item.type==="show"?"series":"film",m)+'</div>';
}
function plexCard(item){
  var pct=Math.max(0,Math.min(100,plexProgress(item)));
  var status=item.type==="show"?(item.viewedLeafCount+" / "+item.leafCount+" episodes watched"):(item.watched?"Watched":pct?pct+"% watched":"Unwatched");
  return '<div class="card plex-card"><div class="media-main clickrow" role="button" tabindex="0" data-act="plex-open" data-id="'+esc(item.ratingKey)+'">'+mediaPoster(plexMediaUrl(item.thumb),item.title||item.type)+
    '<div class="media-info"><div class="media-title">'+esc(item.title)+'</div><div class="media-meta">'+(item.year?'<span class="media-pill">'+esc(String(item.year))+'</span>':'')+'<span class="media-pill">'+(item.type==="show"?"TV Show":"Movie")+'</span></div>'+
    '<div class="plex-progress"><span style="width:'+pct+'%"></span></div><div class="plex-status '+(item.watched?'watched':'')+'">'+(item.watched?'✓ ':'')+esc(status)+'</div></div></div></div>';
}
function renderPlex(){
  if(plexExpanded){ var selected=plexFindItem(plexExpanded); if(selected){ plexEnrichItem(selected); return plexDetailPage(selected); } plexExpanded=null; }
  var configured=plexServerUrl()&&plexToken();
  var searchLabel=plexTab==="shows"?"TV shows":plexTab==="movies"?"movies":"library";
  var html='<div class="toolbar" style="margin-top:14px"><div class="searchwrap"><span class="sic">⌕</span><input class="tab-search" id="plexSearch" placeholder="Search Plex '+searchLabel+'..." value="'+esc(plexSearch)+'" autocomplete="off"></div><button class="btn blue" data-act="plex-refresh"'+(plexBusy?' disabled':'')+'>'+(plexBusy?'Connecting...':'Refresh Plex')+'</button><button class="btn" data-act="plex-settings">Settings</button></div>';
  if(!configured) return html+'<div class="empty">Connect your Plex owner account in Settings. Your token stays only on this device.</div>';
  if(plexErr) html+='<div class="empty">'+esc(plexErr)+'</div>';
  if(plexConnected && !plexAllowDelete) html+='<div class="meta" style="margin-bottom:10px">Viewing is connected. To permanently delete media, enable <b>Allow media deletion</b> in Plex Server Settings → Library.</div>';
  var term=norm(plexSearch),base=plexItems.filter(function(x){return !term||norm(x.title).indexOf(term)>-1;});
  var continueItems=base.filter(function(x){var p=plexProgress(x);return p>0&&p<100;}).sort(function(a,b){return (b.lastViewedAt||0)-(a.lastViewedAt||0);});
  var recentItems=base.slice().sort(function(a,b){return (b.addedAt||0)-(a.addedAt||0);}).slice(0,40);
  if(plexTab==="home"){
    var home=html+'<div class="sechead">Continue Watching · '+continueItems.length+'</div>';
    home+=continueItems.length?'<div class="plex-grid">'+continueItems.slice(0,12).map(plexCard).join("")+'</div>':'<div class="empty">Nothing is currently in progress.</div>';
    home+='<div class="sechead">Recently Added</div>'+(recentItems.length?'<div class="plex-grid">'+recentItems.slice(0,12).map(plexCard).join("")+'</div>':'<div class="empty">No cached Plex library yet.</div>');
    return home;
  }
  var kind=plexTab==="shows"?"show":"movie",items=plexTab==="continue"?continueItems:plexTab==="recent"?recentItems:base.filter(function(x){return x.type===kind;});
  if(!items.length){
    if(plexBusy) return html+loadingSkeletons("media",6);
    if(!plexItems.length) return html+'<div class="empty">No cached Plex library yet. The Shield can be connected later; press Refresh Plex when it is reachable.</div>';
    return html+'<div class="empty">No '+(plexTab==="continue"?'partially watched items':plexTab==="recent"?'recently added media':kind==="show"?'TV shows':'movies')+' match this search.</div>';
  }
  return html+'<div class="plex-grid">'+items.map(plexCard).join("")+'</div>';
}
function plexDeleteItem(id,confirmed){
  var item=plexItems.filter(function(x){ return x.ratingKey===String(id); })[0];
  if(!item) return;
  if(!plexConnected){ flash("Reconnect Plex before deleting media"); return; }
  if(!plexAllowDelete){ flash("Enable Allow media deletion in Plex Server Settings first"); return; }
  var what=item.type==="show"?"the entire TV series and all of its media files":"this movie and its media file";
  var progress=item.watched?"watched":plexProgress(item)>0?"partially watched":"unwatched";
  var warning='Permanently delete "'+item.title+'"? This item is '+progress+'. Plex will remove '+what+' from the Shield storage. This cannot be undone in GameVault.';
  if(!confirmed){
    if(phoneUi()){tvConfirm(warning,"Delete from Plex",function(){plexDeleteItem(id,true);});return;}
    if(!confirm(warning)) return;
  }
  plexBusy=true; render();
  plexRequest("/library/metadata/"+encodeURIComponent(item.ratingKey),{method:"DELETE"}).then(function(){
    plexItems=plexItems.filter(function(x){ return x.ratingKey!==item.ratingKey; }); delete plexEnriched[item.ratingKey]; if(plexExpanded===item.ratingKey) plexExpanded=null; plexBusy=false; plexSaveCache(); render(); flash("Deleted from Plex and removed the media file");
  }).catch(function(e){ plexBusy=false; plexErr=e.message||"Plex delete failed"; render(); });
}

function renderPageContext(){
  var el=document.getElementById("pageContext"); if(!el) return;
  var parent="Games",key=tab,title="",desc="",count="";
  var labels={rentals:"Rentals",playing:"Now Playing",queue:"Rental Queue",upcoming:"Upcoming Releases",suggest:"Discover",played:"Completed",watchlist:"My Watchlist",watching:"Watching",bluray:"New on Blu-ray",uphw:"Coming Soon",relhw:"Discover",mlott:"Malayalam OTT",watched:"Watched",serieswatchlist:"My Watchlist",serieswatching:"Watching",seriesnew:"New Episodes",seriesupcoming:"Upcoming",enseries:"English",mlseries:"Malayalam",taseries:"Tamil",hiseries:"Hindi",serieswatched:"Watched",home:"Home",continue:"Continue Watching",movies:"Movies",shows:"TV Shows",recent:"Recently Added",healthoverview:"Overview",healthfood:"Food & Activity",healthlabs:"Lab Trends",financeoverview:"Monthly Summary",financetransactions:"Details",financeloans:"EMI & Recurring",financestatements:"Gmail Sync"};
  var descriptions={rentals:"Active rentals, return dates and complete history",playing:"Games in progress, saved for later, or on hold",queue:"Your prioritized rental queue and vendor availability",upcoming:"Upcoming game releases and release countdowns",suggest:"Recommendations shaped by your ratings and library",played:"Finished games, ratings and personal history",watchlist:"Movies saved for later",watching:"Movies you have started watching",bluray:"Major new Hollywood physical-media releases",uphw:"Major movies in every language with a confirmed U.S. theatrical release",relhw:"Critically acclaimed Hollywood movies to discover",mlott:"Latest and upcoming Malayalam streaming releases",watched:"Your completed movie library",serieswatchlist:"TV shows saved for later",serieswatching:"TV shows you are currently watching",seriesnew:"Latest episodes from shows you are watching",seriesupcoming:"New and returning TV shows coming soon",enseries:"Highly rated English TV shows",mlseries:"Malayalam TV shows, newest first",taseries:"Tamil TV shows, newest first",hiseries:"Hindi TV shows, newest first",serieswatched:"Watched",home:"A summary of your Plex library",continue:"Partially watched movies and TV shows",movies:"Movies available on your Plex server",shows:"TV shows available on your Plex server",recent:"The latest media added to your Plex server",healthoverview:"Your July 2026 report priorities and this week's progress",healthfood:"Track vegetarian and non-vegetarian meals, activity and recovery",healthlabs:"Compare future blood-test results with your July 2026 baseline",financeoverview:"Monthly credits, spending, cash flow and key insights",financetransactions:"Statement transactions, collapsed by category",financeloans:"Detected EMI schedules, subscriptions and upcoming payments",financestatements:"Secure Gmail statement synchronization and import review"};
  if(section==="films"){ parent="Movies"; key=filmTab; }
  else if(section==="series"){ parent="TV Shows"; key=seriesTab; }
  else if(section==="plex"){ parent="Plex Library"; key=plexTab; }
  else if(section==="biglybt"){ parent="BiglyBT"; key="biglybt"; }
  else if(section==="health"){ parent="Health"; key=healthTab; }
  else if(section==="finance"){ parent="Finance"; key=financeTab; }
  else if(section==="library"){ parent="GameVault";key="phonelibrary"; }
  else if(section==="home"){ parent="GameVault";key="homedash"; }
  if(key==="phonelibrary"){title="Library";desc="Health, sync, backup and application tools";}
  else if(key==="homedash"){title="Home";desc="Today across rentals, downloads, releases and your watchlists";}
  else{
  title=labels[key]||(section==="biglybt"?"BiglyBT":"Library");
  desc=descriptions[key]||(section==="biglybt"?"Downloads, progress, speed and torrent controls":"Your personal media library");
  }
  if(section==="games"){
    var counts={rentals:data.rentals.length,playing:data.playing.length+data.rentals.length,queue:data.queue.length,upcoming:data.upcoming.length,suggest:fullCatalog().length,played:data.played.length};
    count=(counts[key]!=null?counts[key]:"")+" "+(counts[key]===1?"item":"items");
  }else if(section==="plex"){
    var pc=plexItems;
    if(plexTab==="movies") pc=pc.filter(function(x){return x.type==="movie";});
    else if(plexTab==="shows") pc=pc.filter(function(x){return x.type==="show";});
    else if(plexTab==="continue") pc=pc.filter(function(x){var p=plexProgress(x);return p>0&&p<100;});
    else if(plexTab==="recent") pc=pc.slice().sort(function(a,b){return (b.addedAt||0)-(a.addedAt||0);}).slice(0,40);
    count=pc.length+" items";
  }
  if((section==="games"&&expandedId)||(section==="films"&&filmExpanded)||(section==="series"&&seriesExpanded)||(section==="plex"&&plexExpanded)) desc="Full details and available actions";
  el.innerHTML='<div><div class="context-path">'+esc(parent)+' / '+esc(title)+'</div><h2>'+esc(title)+'</h2><p>'+esc(desc)+'</p></div>'+(count?'<span class="context-count">'+esc(count)+'</span>':'');
}
var RECENT_VIEWED_KEY="gamevault-recent-viewed";
function recentViewed(){ try{ var a=JSON.parse(localStorage.getItem(RECENT_VIEWED_KEY)||"[]"); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
function rememberViewed(kind,id,title,subtab){
  if(!title) return;
  var list=recentViewed(),key=kind+":"+String(id);
  list=list.filter(function(x){return x.key!==key;});
  list.unshift({key:key,kind:kind,id:String(id),title:title,tab:subtab||"",at:Date.now()});
  try{ localStorage.setItem(RECENT_VIEWED_KEY,JSON.stringify(list.slice(0,7))); }catch(e){}
}
function renderRecentStrip(){
  var el=document.getElementById("recentStrip"); if(!el) return;
  var list=recentViewed();
  if(!list.length || filmExpanded || seriesExpanded || plexExpanded || expandedId || section==="biglybt" || section==="finance" || section==="library"){ el.innerHTML=""; el.style.display="none"; return; }
  el.style.display="flex";
  el.innerHTML='<span class="recent-label">Recent</span>'+list.map(function(x){return '<button class="recent-item" data-act="recent-open" data-kind="'+esc(x.kind)+'" data-id="'+esc(x.id)+'" data-subtab="'+esc(x.tab)+'">'+esc(x.title)+'</button>';}).join("");
}
function openRecent(kind,id,subtab){
  if(kind==="film"){
    switchSection("films"); filmTab=subtab||"watchlist"; filmExpanded=id; try{localStorage.setItem(FILMTAB_KEY,filmTab);}catch(err){}
  }else if(kind==="series"){
    switchSection("series"); seriesTab=subtab||"serieswatchlist"; seriesExpanded=id; try{localStorage.setItem(SERIESTAB_KEY,seriesTab);}catch(err){}
  }else{
    switchSection("games"); tab=subtab||"played"; expandedId=id;
  }
  render(); window.scrollTo(0,0);
}

function libraryStatus(ok){return '<span class="phone-library-status '+(ok?"ok":"")+'">'+(ok?"Connected":"Setup needed")+'</span>';}
function renderPhoneLibrary(){
  return '<div class="phone-library-grid">'+
    '<button type="button" data-act="phone-library-open" data-section="finance"><span class="phone-library-icon">&#8377;</span><strong>Finance</strong><small>Encrypted expenses, statements, loans and EMI tracking</small></button>'+
    '<button type="button" data-act="phone-library-open" data-section="health"><span class="phone-library-icon">&#9829;</span><strong>Health</strong><small>Food, activity, lab trends and weekly progress</small></button>'+
    '<button type="button" data-act="phone-sync"><span class="phone-library-icon">&#8635;</span><strong>Sync now</strong><small>Check Google Drive for the newest vault</small>'+libraryStatus(!!cloudMode())+'</button>'+
    '<button type="button" data-act="phone-settings"><span class="phone-library-icon">&#9881;</span><strong>Settings</strong><small>Services, appearance and recovery</small></button>'+
    '<button type="button" data-act="phone-export"><span class="phone-library-icon">&#8659;</span><strong>Export backup</strong><small>Download a manual JSON backup</small></button>'+
    '<button type="button" data-act="phone-restore"><span class="phone-library-icon">&#8657;</span><strong>Restore backup</strong><small>Restore an existing GameVault backup</small></button></div>';
}

/* ---------- personal health monitor (PC/mobile only) ---------- */
function healthWeekStart(offset){
  var d=today(),day=d.getDay()||7;
  d.setDate(d.getDate()-day+1+(Number(offset)||0)*7);
  return d;
}
function healthDay(date,create){
  data.health=normalizeHealth(data.health);
  var item=data.health.foodLog.filter(function(x){return x.date===date;})[0];
  if(!item&&create){
    item={date:date,plantMeals:0,fishMeals:0,poultryMeals:0,redMeatMeals:0,friedMeals:0,sugaryItems:0,fruitServings:0,vegetableServings:0,wholeGrainMeals:0,waterCups:0,activityMinutes:0,strength:false,sleepHours:0,notes:""};
    data.health.foodLog.push(item);
  }
  return item||{};
}
function healthWeekEntries(){
  var start=healthWeekStart(healthWeekOffset),out=[];
  for(var i=0;i<7;i++){var d=new Date(start);d.setDate(start.getDate()+i);out.push({date:localISO(d),day:d});}
  return out;
}
function healthWeekSummary(){
  var sums={plantMeals:0,fishMeals:0,poultryMeals:0,redMeatMeals:0,friedMeals:0,sugaryItems:0,fruitServings:0,vegetableServings:0,wholeGrainMeals:0,waterCups:0,activityMinutes:0,strengthDays:0,sleepTotal:0,sleepDays:0};
  healthWeekEntries().forEach(function(x){
    var d=healthDay(x.date,false);
    Object.keys(sums).forEach(function(k){if(k!=="strengthDays"&&k!=="sleepTotal"&&k!=="sleepDays")sums[k]+=Number(d[k])||0;});
    if(d.strength)sums.strengthDays++;
    if(Number(d.sleepHours)>0){sums.sleepTotal+=Number(d.sleepHours);sums.sleepDays++;}
  });
  sums.nonVegMeals=sums.fishMeals+sums.poultryMeals+sums.redMeatMeals;
  sums.sleepAverage=sums.sleepDays?sums.sleepTotal/sums.sleepDays:0;
  return sums;
}
function healthRangeLabel(){var a=healthWeekStart(healthWeekOffset),b=new Date(a);b.setDate(a.getDate()+6);return fmt(localISO(a))+" - "+fmt(localISO(b));}
function healthProgress(label,value,target,lowerIsBetter){
  value=Number(value)||0;target=Math.max(1,Number(target)||1);
  var ok=lowerIsBetter?value<=target:value>=target;
  var pct=lowerIsBetter?(value?Math.min(100,target/value*100):100):Math.min(100,value/target*100);
  return '<div class="health-progress '+(ok?'good':'pending')+'"><div><strong>'+esc(label)+'</strong><span>'+value+' / '+target+(lowerIsBetter?' max':'')+'</span></div><div class="health-track"><i style="width:'+Math.round(pct)+'%"></i></div></div>';
}
function healthMetric(label,value,unit,tone,detail){return '<div class="health-metric '+tone+'"><span>'+esc(label)+'</span><strong>'+esc(String(value))+' <small>'+esc(unit||"")+'</small></strong><p>'+esc(detail||"")+'</p></div>';}
function healthMetricValue(value,decimals){return value==null||value===""?"-":Number(value).toFixed(decimals||0).replace(/\.0$/,"");}
function healthMetricTone(kind,value){
  if(value==null||value===""||!Number.isFinite(Number(value)))return "pending";
  return "pending";
}
function healthMetricDetail(kind,value){
  if(value==null||value==="")return "No result saved yet";
  return "Compare with the reference range on your lab report";
}
function renderHealthOverview(){
  var s=healthWeekSummary(),t=data.health.targets,last=data.health.labs.slice().sort(function(a,b){return (b.date||"").localeCompare(a.date||"");})[0]||{};
  var hasLabs=!!last.date;
  var privacy=healthCloudSyncEnabled()?"Health cloud sync is enabled. Use an encrypted export for password-protected sharing.":"Health records are local-only on this device. Cloud health sync is off.";
  var review=data.health.doctorNotes||"Review personal targets and any abnormal or changing results with a qualified clinician.";
  if(last.eosinophilsAbs!=null)review+=" Latest absolute eosinophils: "+last.eosinophilsAbs+" cells/µL.";
  return '<div class="health-intro"><div><span class="health-eyebrow">'+(hasLabs?("LATEST LABS · "+esc(fmt(last.date)).toUpperCase()):"PRIVATE HEALTH TRACKER")+'</span><h3>'+(hasLabs?"Health overview":"Add your first lab baseline")+'</h3><p>'+(hasLabs?"Your latest saved lab values and weekly habits are shown below. Trends are more useful than a single result.":"Add results in Lab Trends to create a private baseline, then compare future reports over time.")+'</p></div><div class="health-privacy">'+esc(privacy)+'</div></div>'+
    '<div class="health-metrics">'+healthMetric("LDL cholesterol",healthMetricValue(last.ldl,1),"mg/dL",healthMetricTone("ldl",last.ldl),healthMetricDetail("ldl",last.ldl))+healthMetric("Triglycerides",healthMetricValue(last.triglycerides,1),"mg/dL",healthMetricTone("triglycerides",last.triglycerides),healthMetricDetail("triglycerides",last.triglycerides))+healthMetric("HDL cholesterol",healthMetricValue(last.hdl,1),"mg/dL",healthMetricTone("hdl",last.hdl),healthMetricDetail("hdl",last.hdl))+healthMetric("HbA1c",healthMetricValue(last.hba1c,1),"%",healthMetricTone("hba1c",last.hba1c),healthMetricDetail("hba1c",last.hba1c))+'</div>'+
    '<div class="health-layout"><section class="health-panel"><div class="health-section-head"><div><span>THIS WEEK</span><h3>Food balance</h3></div><button class="btn" data-act="health-open-food">Log today</button></div><div class="health-versus"><div><strong>'+s.plantMeals+'</strong><span>Vegetarian meals</span></div><b>vs</b><div><strong>'+s.nonVegMeals+'</strong><span>Non-veg meals</span></div></div>'+healthProgress("Plant-based meals",s.plantMeals,t.plantMeals,false)+healthProgress("Fish meals",s.fishMeals,t.fishMeals,false)+healthProgress("Red / processed meat",s.redMeatMeals,t.redMeatMeals,true)+healthProgress("Fried / takeaway",s.friedMeals,t.friedMeals,true)+'</section>'+
    '<section class="health-panel"><div class="health-section-head"><div><span>WEEKLY MOVEMENT</span><h3>Activity & recovery</h3></div></div>'+healthProgress("Moderate activity",s.activityMinutes,t.activityMinutes,false)+healthProgress("Strength days",s.strengthDays,t.strengthDays,false)+'<div class="health-callout"><strong>'+(s.sleepAverage?s.sleepAverage.toFixed(1)+" h":"Not logged")+'</strong><span>Average sleep on logged days</span></div></section></div>'+
    '<section class="health-panel health-review"><div><span>CLINICIAN REVIEW</span><h3>Use saved results as a discussion aid</h3><p>'+esc(review)+'</p></div><button class="btn" data-act="health-open-labs">'+(hasLabs?"View lab values":"Add lab values")+'</button></section>'+healthDisclaimer();
}
function healthCounter(field,label,hint){
  var d=healthDay(localISO(today()),false),value=Number(d[field])||0;
  return '<div class="health-counter"><div><strong>'+esc(label)+'</strong><span>'+esc(hint)+'</span></div><div class="health-stepper"><button type="button" data-act="health-adjust" data-field="'+field+'" data-delta="-1" aria-label="Remove one '+esc(label)+'">−</button><output>'+value+'</output><button type="button" data-act="health-adjust" data-field="'+field+'" data-delta="1" aria-label="Add one '+esc(label)+'">+</button></div></div>';
}
function renderHealthFood(){
  var d=healthDay(localISO(today()),false),days=healthWeekEntries(),s=healthWeekSummary(),t=data.health.targets;
  var rows=days.map(function(x){var e=healthDay(x.date,false),nv=(Number(e.fishMeals)||0)+(Number(e.poultryMeals)||0)+(Number(e.redMeatMeals)||0);return '<tr class="'+(x.date===localISO(today())?'today':'')+'"><td>'+x.day.toLocaleDateString("en-GB",{weekday:"short",day:"numeric"})+'</td><td>'+((Number(e.plantMeals)||0))+'</td><td>'+nv+'</td><td>'+((Number(e.activityMinutes)||0))+' min</td><td>'+(Number(e.sleepHours)?Number(e.sleepHours).toFixed(1)+" h":"-")+'</td></tr>';}).join("");
  return '<div class="health-weekbar"><button class="btn" data-act="health-week" data-delta="-1">&#8592; Previous</button><strong>'+healthRangeLabel()+'</strong><button class="btn" data-act="health-week" data-delta="1"'+(healthWeekOffset>=0?' disabled':'')+'>Next &#8594;</button></div>'+
    (healthWeekOffset===0?'<section class="health-panel"><div class="health-section-head"><div><span>TODAY · '+esc(fmt(localISO(today())))+'</span><h3>Quick food log</h3></div></div><div class="health-counter-grid">'+healthCounter("plantMeals","Vegetarian meal","Vegetables, beans, dal or other plant-focused meal")+healthCounter("fishMeals","Fish meal","Prefer non-fried fish")+healthCounter("poultryMeals","Poultry / egg meal","Lean, minimally processed choice")+healthCounter("redMeatMeals","Red / processed meat","Beef, mutton, pork or processed meat")+healthCounter("friedMeals","Fried / takeaway","Deep-fried or fast-food meal")+healthCounter("sugaryItems","Sugary item","Sweetened drink or dessert")+healthCounter("fruitServings","Fruit serving","Whole fruit rather than juice")+healthCounter("vegetableServings","Vegetable serving","One portion with a meal")+healthCounter("wholeGrainMeals","Whole grain / legume","Oats, brown rice, beans or lentils")+'</div><div class="health-daily-fields"><label>Activity minutes<input id="healthActivity" type="number" min="0" max="600" value="'+(Number(d.activityMinutes)||0)+'"></label><label>Water cups<input id="healthWater" type="number" min="0" max="30" value="'+(Number(d.waterCups)||0)+'"></label><label>Sleep hours<input id="healthSleep" type="number" min="0" max="24" step="0.5" value="'+(Number(d.sleepHours)||0)+'"></label><label class="health-check"><input id="healthStrength" type="checkbox"'+(d.strength?' checked':'')+'> Strength training today</label><label class="wide">Notes<textarea id="healthNotes" rows="2" placeholder="Meal details, cravings or symptoms">'+esc(d.notes||"")+'</textarea></label><button class="btn blue" data-act="health-save-day">Save today</button></div></section>':'')+
    '<div class="health-layout"><section class="health-panel"><div class="health-section-head"><div><span>WEEK TOTAL</span><h3>'+s.plantMeals+' veg · '+s.nonVegMeals+' non-veg meals</h3></div></div>'+healthProgress("Plant-based meals",s.plantMeals,t.plantMeals,false)+healthProgress("Fish meals",s.fishMeals,t.fishMeals,false)+healthProgress("Vegetable servings",s.vegetableServings,t.vegetableServings,false)+healthProgress("Fruit servings",s.fruitServings,t.fruitServings,false)+healthProgress("Whole grains / legumes",s.wholeGrainMeals,t.wholeGrainMeals,false)+'</section><section class="health-panel health-table-wrap"><table class="health-table"><thead><tr><th>Day</th><th>Veg</th><th>Non-veg</th><th>Activity</th><th>Sleep</th></tr></thead><tbody>'+rows+'</tbody></table></section></div>'+
    '<details class="health-panel health-targets"><summary>Adjust weekly starter targets</summary><div class="health-target-grid">'+Object.keys(t).map(function(k){var labels={plantMeals:"Plant meals",fishMeals:"Fish meals",redMeatMeals:"Max red meat",friedMeals:"Max fried meals",sugaryItems:"Max sugary items",fruitServings:"Fruit servings",vegetableServings:"Vegetable servings",wholeGrainMeals:"Whole grain meals",activityMinutes:"Activity minutes",strengthDays:"Strength days"};return '<label>'+labels[k]+'<input type="number" min="0" data-health-target="'+k+'" value="'+Number(t[k])+'"></label>';}).join("")+'</div><button class="btn blue" data-act="health-save-targets">Save targets</button></details>'+healthDisclaimer();
}
function renderHealthLabs(){
  var labs=data.health.labs.slice().sort(function(a,b){return (b.date||"").localeCompare(a.date||"");});
  var oldest=labs.slice().sort(function(a,b){return (a.date||"").localeCompare(b.date||"");})[0]||{};
  var rows=labs.map(function(x){var baseline=x.date===oldest.date;return '<tr><td>'+fmt(x.date)+'</td><td>'+healthLabValue(x.totalCholesterol)+'</td><td>'+healthLabValue(x.ldl)+'</td><td>'+healthLabValue(x.hdl)+'</td><td>'+healthLabValue(x.triglycerides)+'</td><td>'+healthLabValue(x.hba1c)+'</td><td>'+healthLabValue(x.eosinophilsAbs)+'</td><td>'+(baseline?'<span class="health-baseline">Baseline</span>':'')+'<button class="iconbtn health-delete-lab" data-act="health-delete-lab" data-date="'+esc(x.date)+'" aria-label="Delete lab entry">&times;</button></td></tr>';}).join("");
  if(!rows)rows='<tr><td colspan="8">No lab results saved yet.</td></tr>';
  var baselineParts=[];
  [["Fasting glucose",oldest.fastingGlucose,"mg/dL"],["HbA1c",oldest.hba1c,"%"],["Total cholesterol",oldest.totalCholesterol,"mg/dL"],["LDL",oldest.ldl,"mg/dL"],["HDL",oldest.hdl,"mg/dL"],["Triglycerides",oldest.triglycerides,"mg/dL"],["Absolute eosinophils",oldest.eosinophilsAbs,"cells/µL"]].forEach(function(x){if(x[1]!=null&&x[1]!=="")baselineParts.push(x[0]+" "+x[1]+" "+x[2]);});
  var baselineNote=oldest.date?'<div class="health-note"><strong>Baseline · '+esc(fmt(oldest.date))+':</strong> '+esc(baselineParts.join("; ")||"No numeric values saved.")+'</div>':'<div class="health-note">Add the first result to establish a private baseline for future comparisons.</div>';
  return '<section class="health-panel"><div class="health-section-head"><div><span>FOLLOW-UP RESULTS</span><h3>Add a new blood test</h3></div></div><div class="health-lab-form"><label>Date<input id="healthLabDate" type="date" value="'+localISO(today())+'"></label><label>Total cholesterol<input id="healthLabTotal" type="number" step="0.1" placeholder="mg/dL"></label><label>LDL<input id="healthLabLdl" type="number" step="0.1" placeholder="mg/dL"></label><label>HDL<input id="healthLabHdl" type="number" step="0.1" placeholder="mg/dL"></label><label>Triglycerides<input id="healthLabTg" type="number" step="0.1" placeholder="mg/dL"></label><label>HbA1c<input id="healthLabA1c" type="number" step="0.1" placeholder="%"></label><label>Fasting glucose<input id="healthLabGlucose" type="number" step="0.1" placeholder="mg/dL"></label><label>Absolute eosinophils<input id="healthLabEos" type="number" step="1" placeholder="cells/µL"></label><button class="btn blue" data-act="health-save-lab">Add result</button></div></section><section class="health-panel health-table-wrap"><table class="health-table health-lab-table"><thead><tr><th>Date</th><th>Total</th><th>LDL</th><th>HDL</th><th>TG</th><th>HbA1c</th><th>Eosinophils</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></section>'+baselineNote+healthDisclaimer();
}
function healthLabValue(v){return v==null||v===""?"-":esc(String(v));}
function healthDisclaimer(){return '<p class="health-disclaimer">This tracker supports habit tracking and is not a diagnosis or treatment plan. Review abnormal results and personal targets with a doctor or registered dietitian.</p>';}
function renderHealth(){data.health=normalizeHealth(data.health);return healthTab==="healthfood"?renderHealthFood():healthTab==="healthlabs"?renderHealthLabs():renderHealthOverview();}
function healthCaptureDayForm(d){
  var activity=document.getElementById("healthActivity"),water=document.getElementById("healthWater"),sleep=document.getElementById("healthSleep"),strength=document.getElementById("healthStrength"),notes=document.getElementById("healthNotes");
  if(activity)d.activityMinutes=Math.max(0,Number(activity.value)||0);if(water)d.waterCups=Math.max(0,Number(water.value)||0);if(sleep)d.sleepHours=Math.max(0,Number(sleep.value)||0);if(strength)d.strength=!!strength.checked;if(notes)d.notes=(notes.value||"").trim();
  return d;
}
function healthSaveDay(){var d=healthCaptureDayForm(healthDay(localISO(today()),true));save();flash("Today's health log saved");}
function healthSaveLab(){
  function value(id){var el=document.getElementById(id),n=el&&el.value!==""?Number(el.value):null;return Number.isFinite(n)?n:null;}
  var date=(document.getElementById("healthLabDate")||{}).value||localISO(today());
  var item={date:date,totalCholesterol:value("healthLabTotal"),ldl:value("healthLabLdl"),hdl:value("healthLabHdl"),triglycerides:value("healthLabTg"),hba1c:value("healthLabA1c"),fastingGlucose:value("healthLabGlucose"),eosinophilsAbs:value("healthLabEos")};
  if(Object.keys(item).filter(function(k){return k!=="date"&&item[k]!=null;}).length===0){flash("Enter at least one lab value");return;}
  data.health.labs=data.health.labs.filter(function(x){return x.date!==date;});data.health.labs.push(item);save();flash("Lab results added");
}

/* Android TV uses the separate native application in android-tv-native. */

function renderContentHtml(html,preservePageScroll){
  var target=document.getElementById("content");
  if(window.GameVaultCore)return GameVaultCore.renderInto(target,html,{preservePageScroll:preservePageScroll!==false});
  target.innerHTML=html;
  return true;
}
function render(){
  phoneMenuRegistry={};phoneMenuCounter=0;closePhoneSheet();
  document.body.classList.toggle("phone-root-section",section==="library");
  var detailOpen=!!((section==="games"&&gameView==="grid"&&expandedId)||(section==="films"&&filmExpanded)||(section==="series"&&seriesExpanded)||(section==="plex"&&plexExpanded));
  document.body.classList.toggle("detail-open",detailOpen);
  renderPageContext();
  renderRecentStrip();
  var statsEl=document.getElementById("stats");
  document.body.classList.toggle("bigly-active",section==="biglybt");
  if(section==="home"){
    statsEl.style.display="none";
    renderTabs();
    renderContentHtml(renderHome());
    applyBackground();
    return;
  }
  if(section==="library"){
    statsEl.style.display="none";
    renderTabs();
    renderContentHtml(renderPhoneLibrary());
    applyBackground();
    return;
  }
  if(section==="health"){
    statsEl.style.display="none";
    renderTabs();
    renderContentHtml(renderHealth());
    applyBackground();
    return;
  }
  if(section==="finance"){
    statsEl.style.display="none";
    renderTabs();
    renderContentHtml(renderFinance());
    applyBackground();
    return;
  }
  if(section==="biglybt"){
    statsEl.style.display="none";
    renderTabs();
    if(document.getElementById("biglyBrowser")){
      applyBackground();
      tvAfterRender();
      return;
    }
    renderContentHtml(renderBiglyBT());
    applyBackground();
    tvAfterRender();
    return;
  }
  if(section==="plex"){
    statsEl.style.display="none";
    renderTabs();
    renderContentHtml(renderPlex());
    applyBackground();
    tvAfterRender();
    return;
  }
  if(section==="films" || section==="series"){
    statsEl.style.display="none";
    renderTabs();
    renderContentHtml(section==="films" ? renderFilms() : renderSeries());
    applyBackground();
    tvAfterRender();
    return;
  }
  statsEl.style.display="";
  renderStats();
  renderTabs();
  if(gameView==="grid" && expandedId){
    renderContentHtml(renderGameDetail());
    applyBackground();
    tvAfterRender();
    return;
  }
  renderContentHtml(
    tab==="rentals" ? renderRentals() :
    tab==="playing" ? renderPlaying() :
    tab==="queue"   ? renderQueue() :
    tab==="upcoming"? renderUpcoming() :
    tab==="suggest" ? renderSuggest() : renderPlayed()
  );
  applyBackground();
  tvAfterRender();
}

/* ================= FILMS SECTION (TMDB + OMDb) =================
   Live movie data, cached in localStorage only (public data — kept out of the
   synced game vault). Three tabs: upcoming Hollywood, released Hollywood
   (filtered to exact IMDb >= 7.0 via OMDb), and weekly Malayalam OTT. */
var TMDB_KEY_STORE="ps5-tmdb-key", OMDB_KEY_STORE="ps5-omdb-key";
var SECTION_KEY="ps5-section", FILMTAB_KEY="ps5-filmtab", FILM_CACHE_KEY="ps5-films-cache", MEDIA_CACHE_VERSION_KEY="gamevault-media-cache-version";
var section="games", filmTab="watchlist", healthTab="healthoverview", healthWeekOffset=0;
function phoneUi(){ return window.matchMedia&&window.matchMedia("(max-width:720px)").matches; }
try{ section=localStorage.getItem(SECTION_KEY)||"games"; }catch(e){}
var requestedSection=new URLSearchParams(location.search).get("section");
if(["games","films","series","plex","biglybt","health","finance","library"].indexOf(requestedSection)>=0)section=requestedSection;
if(["games","films","series","plex","biglybt","health","finance","library"].indexOf(section)<0)section="games";
if(!phoneUi()&&section==="library")section="games";
if(phoneUi()&&section==="home")section="games"; // Home dashboard is desktop-only
var requestedHealthTab=new URLSearchParams(location.search).get("healthTab");
if(["healthoverview","healthfood","healthlabs"].indexOf(requestedHealthTab)>=0)healthTab=requestedHealthTab;
try{ filmTab=localStorage.getItem(FILMTAB_KEY)||"watchlist"; }catch(e){}
function tmdbKey(){ try{ return localStorage.getItem(TMDB_KEY_STORE)||""; }catch(e){ return ""; } }
function omdbKey(){ try{ return localStorage.getItem(OMDB_KEY_STORE)||""; }catch(e){ return ""; } }
var FILM_ORDER=["watchlist","watching","uphw","bluray","relhw","mlott","watched"];
if(filmTab==="mlup") filmTab="mlott";
if(FILM_ORDER.indexOf(filmTab)<0) filmTab="watchlist";
var FILM_TTL={bluray:12*3600*1000, uphw:6*3600*1000, relhw:18*3600*1000, mlott:4*3600*1000, mlup:4*3600*1000};
var filmCache={}, filmBusy={}, filmErr={}, filmRequestVersion={};
try{ filmCache=JSON.parse(localStorage.getItem(FILM_CACHE_KEY)||"{}")||{}; }catch(e){ filmCache={}; }
try{
  if(localStorage.getItem(MEDIA_CACHE_VERSION_KEY)!=="4"){
    filmCache={}; localStorage.setItem(MEDIA_CACHE_VERSION_KEY,"4");
  }
}catch(e){}
function pruneMediaCache(cache,limit){
  var queryKeys=Object.keys(cache||{}).filter(function(k){return k.indexOf("|")>-1;});
  queryKeys.sort(function(a,b){return Number((cache[b]||{}).t||0)-Number((cache[a]||{}).t||0);});
  queryKeys.slice(limit).forEach(function(k){delete cache[k];});
}
function saveFilmCache(){
  pruneMediaCache(filmCache,24);
  if(window.GameVaultCore){
    GameVaultCore.storage.put("film-cache",filmCache).then(function(result){if(result!==false)try{localStorage.removeItem(FILM_CACHE_KEY);}catch(e){}});
    return;
  }
  try{localStorage.setItem(FILM_CACHE_KEY,JSON.stringify(filmCache));}catch(e){}
}
var FILM_GENRE_KEY="ps5-film-genre", SERIES_GENRE_KEY="ps5-series-genre";
var FILM_YEAR_KEY="ps5-film-year", SERIES_YEAR_KEY="ps5-series-year";
var filmGenre="", seriesGenre="";
try{ filmGenre=localStorage.getItem(FILM_GENRE_KEY)||""; }catch(e){}
try{ seriesGenre=localStorage.getItem(SERIES_GENRE_KEY)||""; }catch(e){}
var filmYear="", seriesYear="";
try{ filmYear=localStorage.getItem(FILM_YEAR_KEY)||""; }catch(e){}
try{ seriesYear=localStorage.getItem(SERIES_YEAR_KEY)||""; }catch(e){}
var FILM_VIEW_KEY="ps5-film-view", SERIES_VIEW_KEY="ps5-series-view";
var filmView="grid", seriesView="grid";
try{ filmView=localStorage.getItem(FILM_VIEW_KEY)||"grid"; }catch(e){}
try{ seriesView=localStorage.getItem(SERIES_VIEW_KEY)||"grid"; }catch(e){}
var FILM_SORT_KEY="gamevault-film-sort", SERIES_SORT_KEY="gamevault-series-sort";
var filmSort="smart", seriesSort="smart";
try{ filmSort=localStorage.getItem(FILM_SORT_KEY)||"smart"; }catch(e){}
try{ seriesSort=localStorage.getItem(SERIES_SORT_KEY)||"smart"; }catch(e){}
var SERIES_PROVIDER_KEY="ps5-series-provider", SERIES_LANGUAGE_KEY="ps5-series-language";
var seriesProvider="",seriesLanguage="";
try{ seriesProvider=localStorage.getItem(SERIES_PROVIDER_KEY)||""; }catch(e){}
try{ seriesLanguage=localStorage.getItem(SERIES_LANGUAGE_KEY)||""; }catch(e){}
function mediaCachePart(value){ return encodeURIComponent(String(value||"all")); }
function filmCacheKey(key){
  return key+"|genre="+mediaCachePart(filmGenre)+"|year="+mediaCachePart(filmYear);
}
function filmCacheEntry(key){
  var exact=filmCache[filmCacheKey(key)];
  if(exact) return exact;
  return !filmGenre&&!filmYear?(filmCache[key]||null):null;
}
var US_STREAMERS=[
  ["","All streamers"],
  ["8","Netflix"],
  ["1899","HBO / Max"],
  ["386","Peacock"],
  ["15","Hulu"],
  ["9","Prime Video"],
  ["337","Disney+"],
  ["350","Apple TV+"],
  ["531","Paramount+"]
];
var MOVIE_GENRES=[
  ["28","Action"],["12","Adventure"],["16","Animation"],["35","Comedy"],["80","Crime"],
  ["18","Drama"],["10751","Family"],["14","Fantasy"],["27","Horror"],["9648","Mystery"],
  ["10749","Romance"],["878","Science Fiction"],["53","Thriller"],["10752","War"]
];
var SERIES_GENRES=[
  ["10759","Action & Adventure"],["16","Animation"],["35","Comedy"],["80","Crime"],
  ["99","Documentary"],["18","Drama"],["10751","Family"],["9648","Mystery"],
  ["10765","Sci-Fi & Fantasy"],["10768","War & Politics"],["37","Western"]
];
function addGenreParam(params, genre){
  if(genre) params.with_genres=genre;
  return params;
}
function genreOptions(list, selected){
  return '<option value="">All genres</option>'+list.map(function(g){
    return '<option value="'+g[0]+'"'+(String(selected)===String(g[0])?' selected':'')+'>'+esc(g[1])+'</option>';
  }).join("");
}
function providerOptions(selected){
  return US_STREAMERS.map(function(p){
    return '<option value="'+p[0]+'"'+(String(selected)===String(p[0])?' selected':'')+'>'+esc(p[1])+'</option>';
  }).join("");
}
function yearOptions(selected){
  var y=new Date().getFullYear(), h='<option value="">All years</option>';
  for(var n=y+2;n>=1990;n--) h+='<option value="'+n+'"'+(String(selected)===String(n)?' selected':'')+'>'+n+'</option>';
  return h;
}
function mediaItemYear(x){
  return String((x&&(x.ottDate||x.date||x.year||"")).slice(0,4));
}
function matchMediaYear(x, selected){
  return !selected || mediaItemYear(x)===String(selected);
}
function yearStart(y){ return y ? y+"-01-01" : ""; }
function yearEnd(y){ return y ? y+"-12-31" : ""; }
function mediaViewToggle(kind){
  var v=kind==="series"?seriesView:filmView;
  return '<div class="viewbar"><span class="viewlbl">View</span>'+
    '<button class="gchip '+(v==="grid"?"on":"")+'" data-act="media-view" data-kind="'+kind+'" data-view="grid">Grid View</button>'+
    '<button class="gchip '+(v==="list"?"on":"")+'" data-act="media-view" data-kind="'+kind+'" data-view="list">List View</button>'+
  '</div>'+phoneMediaFilterBar(kind);
}
function filterLabel(type,kind){
  if(type==="genre"){
    var list=kind==="series"?SERIES_GENRES:MOVIE_GENRES,value=kind==="series"?seriesGenre:filmGenre;
    return (list.filter(function(x){return String(x[0])===String(value);})[0]||[])[1]||"Genre";
  }
  if(type==="year")return (kind==="series"?seriesYear:filmYear)||"Year";
  if(type==="provider"){
    var p=US_STREAMERS.filter(function(x){return String(x[0])===String(seriesProvider);})[0];
    return (p&&p[1])||"Streamer";
  }
  if(type==="language"){
    var names={en:"English",ml:"Malayalam",ta:"Tamil",hi:"Hindi"};return names[seriesLanguage]||"Language";
  }
  var sort=kind==="series"?seriesSort:filmSort;
  return ({smart:"Recommended",added:"Recently added",newest:"Newest",oldest:"Oldest",rating:"Highest rated",title:"A-Z"})[sort]||"Sort";
}
function phoneMediaFilterBar(kind){
  var active=kind==="series"?!!(seriesGenre||seriesYear||seriesProvider||seriesLanguage||seriesSort!=="smart"):!!(filmGenre||filmYear||filmSort!=="smart");
  return '<div class="phone-filter-bar" aria-label="'+kind+' filters">'+
    '<button type="button" class="'+((kind==="series"?seriesGenre:filmGenre)?"on":"")+'" data-phone-filter="genre" data-kind="'+kind+'">'+esc(filterLabel("genre",kind))+'</button>'+
    '<button type="button" class="'+((kind==="series"?seriesYear:filmYear)?"on":"")+'" data-phone-filter="year" data-kind="'+kind+'">'+esc(filterLabel("year",kind))+'</button>'+
    (kind==="series"?'<button type="button" class="'+(seriesProvider?"on":"")+'" data-phone-filter="provider" data-kind="series">'+esc(filterLabel("provider","series"))+'</button><button type="button" class="'+(seriesLanguage?"on":"")+'" data-phone-filter="language" data-kind="series">'+esc(filterLabel("language","series"))+'</button>':'')+
    '<button type="button" class="'+((kind==="series"?seriesSort:filmSort)!=="smart"?"on":"")+'" data-phone-filter="sort" data-kind="'+kind+'">'+esc(filterLabel("sort",kind))+'</button>'+
    (active?'<button type="button" class="clear" data-act="phone-filter-clear" data-kind="'+kind+'">Clear all</button>':'')+'</div>';
}
function mediaSortSelect(kind){
  var value=kind==="series"?seriesSort:filmSort;
  var labels={smart:"Recommended order",added:"Recently added",newest:"Newest release",oldest:"Oldest release",rating:"Highest rated",title:"Title A–Z"};
  return '<select class="selectmini '+kind+'-sort" title="Sort titles">'+Object.keys(labels).map(function(v){return '<option value="'+v+'"'+(value===v?' selected':'')+'>'+labels[v]+'</option>';}).join("")+'</select>';
}
function applyMediaSort(items,kind){
  var mode=kind==="series"?seriesSort:filmSort;
  if(mode==="smart") return items;
  return items.slice().sort(function(a,b){
    if(mode==="title") return String(a.title||"").localeCompare(String(b.title||""));
    if(mode==="rating") return (Number(b.imdb||b.tmdb)||0)-(Number(a.imdb||a.tmdb)||0);
    if(mode==="added") return Number(b.added||b.started||b.t||0)-Number(a.added||a.started||a.t||0);
    var ad=String(a.ottDate||a.latestDate||a.date||a.year||""),bd=String(b.ottDate||b.latestDate||b.date||b.year||"");
    return mode==="oldest"?ad.localeCompare(bd):bd.localeCompare(ad);
  });
}
function mediaWrapClass(kind){
  var v=kind==="series"?seriesView:filmView;
  return 'cards '+(v==="list"?'media-list':'media-grid');
}
function genreLabel(ids, list){
  var map={};
  list.forEach(function(g){ map[String(g[0])]=g[1]; });
  var out=(ids||[]).map(function(id){ return map[String(id)]; }).filter(Boolean);
  return out.length ? out.slice(0,2).join(" / ") : "Genre TBA";
}
function mediaRatingLabel(x){
  return typeof x.imdb==="number" ? ("IMDb "+x.imdb.toFixed(1)) : "IMDb -";
}
var mediaArtworkQueue=[],mediaArtworkPending={},mediaArtworkActive=0,mediaArtworkRenderTimer=null;
function tmdbPoster(path){ return path?("https://image.tmdb.org/t/p/w342"+path):""; }
function tmdbBackdrop(path){ return path?("https://image.tmdb.org/t/p/w1280"+path):""; }
function mediaArtworkKey(x,kind){ return kind+":"+String((x&&x.id)||norm(x&&x.title||"")); }
function scheduleArtworkRender(){
  clearTimeout(mediaArtworkRenderTimer);
  mediaArtworkRenderTimer=setTimeout(function(){
    if(section==="films") filmMaybeRender(filmTab,true);
    else if(section==="series") seriesMaybeRender(seriesTab,true);
    else if(section==="plex") render();
  },180);
}
function fetchMediaArtwork(job){
  var x=job.x,kind=job.kind,path=kind==="series"?"tv":"movie";
  var request;
  if(/^\d+$/.test(String(x.id||""))) request=tmdbGet("/"+path+"/"+x.id,{});
  else{
    var params={query:x.title||"",page:1};
    if(x.year) params[kind==="series"?"first_air_date_year":"year"]=x.year;
    request=tmdbGet("/search/"+path,params).then(function(j){return (j.results||[])[0]||{};});
  }
  return request.then(function(d){
    x.poster=x.poster||tmdbPoster(d.poster_path);
    x.backdrop=x.backdrop||tmdbBackdrop(d.backdrop_path);
    if(!x.poster&&x.backdrop)x.poster=x.backdrop;
    x._artCheckedAt=Date.now();
    saveFilmCache();saveSeriesCache();persistSilent();
    scheduleArtworkRender();
  }).catch(function(){ x._artCheckedAt=Date.now(); });
}
function pumpMediaArtwork(){
  while(mediaArtworkActive<2&&mediaArtworkQueue.length){
    var job=mediaArtworkQueue.shift();mediaArtworkActive++;
    (function(j){fetchMediaArtwork(j).then(function(){
      mediaArtworkActive--;delete mediaArtworkPending[j.key];pumpMediaArtwork();
    });})(job);
  }
}
function ensureMediaArtwork(x,kind){
  if(!x||x.poster||!x.title||!tmdbKey()||(x._artCheckedAt&&Date.now()-x._artCheckedAt<86400000)) return;
  var key=mediaArtworkKey(x,kind);if(mediaArtworkPending[key])return;
  mediaArtworkPending[key]=1;mediaArtworkQueue.push({key:key,x:x,kind:kind});pumpMediaArtwork();
}
function mediaImage(src,label,cls){
  return '<img'+(cls?' class="'+cls+'"':'')+' src="'+esc(src||"icon.png")+'" onerror="this.onerror=null;this.src=\'icon.png\';this.classList.add(\'fallback-art\')" alt="'+esc((src?"":"Cover unavailable for ")+(label||"Media"))+'" loading="lazy">';
}
function mediaPoster(src, label){
  return '<div class="poster-wrap">'+mediaImage(src,label,"poster-img"+(src?"":" fallback-art"))+'</div>';
}
function mediaSummary(title, rating, genre, extra){
  return '<div class="media-info"><div class="media-title" title="'+esc(title)+'">'+esc(title)+'</div><div class="media-meta">'+
    '<span class="media-pill imdb">'+esc(rating)+'</span><span class="media-pill">'+esc(genre)+'</span></div>'+(extra||'')+'</div>';
}
function mediaValue(value,fallback){
  return value!==undefined&&value!==null&&String(value).trim()?String(value):(fallback||"Not available");
}
function mediaFact(label,value,cls){
  return '<div class="media-fact'+(cls?' '+cls:'')+'"><span>'+esc(label)+'</span><b>'+esc(mediaValue(value))+'</b></div>';
}
function mediaProviderLine(x){
  if(!x||!x.providers||!x.providers.length) return "Provider not listed";
  return x.providers.slice(0,3).join(" · ");
}
function mediaRatingSource(x){
  if(typeof x.imdb==="number") return "IMDb "+x.imdb.toFixed(1)+" / 10";
  if(typeof x.tmdb==="number"&&x.tmdb>0) return "TMDB "+x.tmdb.toFixed(1)+" / 10";
  return "Rating unavailable";
}
function mediaStateLabel(kind,key){
  var film={watchlist:"WATCHLIST",watching:"WATCHING",watched:"WATCHED",uphw:"COMING SOON",bluray:"BLU-RAY",relhw:"DISCOVER",mlott:"MALAYALAM OTT",mlup:"UPCOMING OTT",search:"SEARCH RESULT"};
  var series={serieswatchlist:"WATCHLIST",serieswatching:"WATCHING",seriesnew:"NEW EPISODE",seriesupcoming:"COMING SOON",serieswatched:"WATCHED",seriesdiscover:"DISCOVER",enseries:"ENGLISH",mlseries:"MALAYALAM",taseries:"TAMIL",hiseries:"HINDI",seriessearch:"SEARCH RESULT"};
  return (kind==="film"?film[key]:series[key])||(kind==="film"?"MOVIE":"TV SERIES");
}
function mediaFreshness(x){
  if(!x||!x.imdbAt) return "";
  var mins=Math.max(0,Math.round((Date.now()-Number(x.imdbAt))/60000));
  return mins<2?"IMDb updated now":mins<60?("IMDb updated "+mins+" min ago"):"IMDb refreshed recently";
}
function mediaClose(kind){
  return '<button class="detail-close" data-act="media-close" data-kind="'+kind+'" aria-label="Close details" title="Close details (Esc)">&times;</button>';
}
function closeMediaStateDetail(kind,id){
  var wasOpen=kind==="film"?String(filmExpanded)===String(id):String(seriesExpanded)===String(id);
  if(!wasOpen) return false;
  if(kind==="film") filmExpanded=null; else seriesExpanded=null;
  aiOpen=null;
  if(history.state&&history.state.gameVaultDetail) history.replaceState(null,"",location.href.split("#")[0]);
  return true;
}
function seriesLanguageOptions(selected){
  return [["","All languages"],["en","English"],["ml","Malayalam"],["ta","Tamil"],["hi","Hindi"]].map(function(p){
    return '<option value="'+p[0]+'"'+(selected===p[0]?' selected':'')+'>'+p[1]+'</option>';
  }).join("");
}
function detailNeighbors(kind,current){
  var list=[];
  if(kind==="film") list=filmTab==="watchlist"?(data.movieWatchlist||[]):filmTab==="watching"?(data.watchingMovies||[]):filmTab==="watched"?(data.watchedMovies||[]):((filmCacheEntry(filmTab)||{}).items||[]);
  else if(kind==="series") list=seriesTab==="serieswatchlist"?(data.seriesWatchlist||[]):seriesTab==="serieswatching"||seriesTab==="seriesnew"?(data.watchingSeries||[]):seriesTab==="serieswatched"?(data.watchedSeries||[]):((seriesCacheEntry(seriesTab)||{}).items||[]);
  else if(tab==="rentals") list=data.rentals.concat(data.rentalHistory);
  else if(tab==="playing") list=data.rentals.concat(data.playing,data.played.filter(function(x){return x.status==="Playing"||x.status==="Dropped";}));
  else if(tab==="queue") list=data.queue;
  else if(tab==="upcoming") list=data.upcoming;
  else if(tab==="played") list=data.played;
  else list=fullCatalog();
  function itemId(x){ return String(x.id!=null?x.id:("name:"+norm(x.name||x.title||""))); }
  var currentId=itemId(current),idx=-1;
  for(var i=0;i<list.length;i++){ if(itemId(list[i])===currentId){idx=i;break;} }
  if(idx<0 || list.length<2) return "";
  var prev=list[(idx-1+list.length)%list.length],next=list[(idx+1)%list.length];
  return '<div class="detail-neighbors"><button class="btn" data-act="detail-neighbor" data-kind="'+kind+'" data-id="'+esc(itemId(prev))+'">← '+esc(prev.name||prev.title||"Previous")+'</button><button class="btn" data-act="detail-neighbor" data-kind="'+kind+'" data-id="'+esc(itemId(next))+'">'+esc(next.name||next.title||"Next")+' →</button></div>';
}
function detailToolbar(kind,current){
  return '<div class="media-closebar detail-toolbar">'+detailNeighbors(kind,current)+mediaClose(kind)+'</div>';
}
function daysAgoISO(n){ var d=new Date(); d.setDate(d.getDate()-n); return localISO(d); }
function daysAheadISO(n){ var d=new Date(); d.setDate(d.getDate()+n); return localISO(d); }
function yearsAgoISO(n){ var d=new Date(); d.setFullYear(d.getFullYear()-n); return localISO(d); }

function tmdbGet(path, params){
  var k=tmdbKey(); if(!k) return Promise.reject(new Error("no-tmdb-key"));
  var qs=Object.keys(params||{}).map(function(p){ return encodeURIComponent(p)+"="+encodeURIComponent(params[p]); }).join("&");
  return fetchWithPolicy("https://api.themoviedb.org/3"+path+"?api_key="+encodeURIComponent(k)+(qs?"&"+qs:""),{},{timeout:15000,retries:1})
    .then(function(r){ if(!r.ok) throw new Error("TMDB "+r.status); return r.json(); });
}
function pickCertification(rows,country){
  var groups=rows&&rows.results||[],found="";
  groups.some(function(group){
    if(group.iso_3166_1!==country) return false;
    if(group.rating){found=group.rating;return true;}
    var releases=group.release_dates||[];
    for(var i=0;i<releases.length;i++) if(releases[i].certification){found=releases[i].certification;break;}
    return !!found;
  });
  return found;
}
function ensureMediaDetails(x,kind){
  if(!x||!tmdbKey()||!/^[0-9]+$/.test(String(x.tmdbId||x.id||""))||x._detailBusy) return;
  if(x._detailCheckedAt&&Date.now()-Number(x._detailCheckedAt)<86400000&&x.date) return;
  x._detailBusy=true;
  var path=kind==="film"?"movie":"tv",id=x.tmdbId||x.id;
  var append=kind==="film"?"credits,release_dates,external_ids,watch/providers":"external_ids,watch/providers,content_ratings";
  tmdbGet("/"+path+"/"+id,{append_to_response:append}).then(function(d){
    x.poster=x.poster||tmdbPoster(d.poster_path);x.backdrop=x.backdrop||tmdbBackdrop(d.backdrop_path);
    x.overview=x.overview||d.overview||"";x.status=d.status||x.status||"";x.tagline=d.tagline||x.tagline||"";
    x.originalLanguage=d.original_language||x.originalLanguage||"";
    if(d.genres&&d.genres.length)x.genres=d.genres.map(function(g){return g.id;});
    if(kind==="film"){
      x.date=x.date||d.release_date||"";x.year=x.year||(x.date||"").slice(0,4);
      x.runtime=d.runtime||x.runtime||0;x.director=((d.credits&&d.credits.crew)||[]).filter(function(c){return c.job==="Director";}).map(function(c){return c.name;}).slice(0,2).join(" · ");
      x.certification=pickCertification(d.release_dates,"US")||pickCertification(d.release_dates,"IN")||x.certification||"";
      x.imdbId=d.external_ids&&d.external_ids.imdb_id||x.imdbId||"";
    }else{
      x.date=x.date||d.first_air_date||"";x.year=x.year||(x.date||"").slice(0,4);
      x.seasons=d.number_of_seasons||x.seasons||0;x.episodeCount=d.number_of_episodes||x.episodeCount||0;
      x.episodeRuntime=(d.episode_run_time&&d.episode_run_time[0])||x.episodeRuntime||0;
      x.networks=(d.networks||[]).map(function(n){return n.name;}).filter(Boolean);
      x.seriesType=d.type||x.seriesType||"";x.imdbId=d.external_ids&&d.external_ids.imdb_id||x.imdbId||"";
      x.certification=pickCertification(d.content_ratings,"US")||pickCertification(d.content_ratings,"IN")||x.certification||"";
      x.nextEpisode=d.next_episode_to_air?{season:d.next_episode_to_air.season_number,episode:d.next_episode_to_air.episode_number,title:d.next_episode_to_air.name||"",date:d.next_episode_to_air.air_date||""}:null;
      x.lastEpisode=d.last_episode_to_air?{season:d.last_episode_to_air.season_number,episode:d.last_episode_to_air.episode_number,title:d.last_episode_to_air.name||"",date:d.last_episode_to_air.air_date||""}:null;
      x.seasonList=(d.seasons||[]).filter(function(se){return se.season_number>0;}).map(function(se){return {n:se.season_number,name:se.name||("Season "+se.season_number),episodes:se.episode_count||0};});
    }
    var providerRows=d["watch/providers"]&&d["watch/providers"].results||{},wp=providerRows.IN||providerRows.US;
    if(wp)x.providers=(((wp.flatrate)||[]).concat((wp.free)||[])).map(function(p){return p.provider_name;}).filter(function(v,i,a){return a.indexOf(v)===i;});
    x._detailCheckedAt=Date.now();x._detailBusy=false;saveFilmCache();saveSeriesCache();persistSilent();scheduleArtworkRender();
    if((section==="films"&&kind==="film"&&String(filmExpanded)===String(x.id))||(section==="series"&&kind==="series"&&String(seriesExpanded)===String(x.id)))render();
  }).catch(function(){x._detailBusy=false;x._detailCheckedAt=Date.now();});
}
function mapMovie(m){
  return normalizeStoredRecord({ id:m.id, title:m.title||m.name||"Untitled",
    date:m.release_date||"", originalDate:m.release_date||"", year:(m.release_date||"").slice(0,4),
    originalLanguage:m.original_language||"",
    overview:m.overview||"", tmdb:Math.round((m.vote_average||0)*10)/10,
    genres:m.genre_ids||[],
    votes:m.vote_count||0, popularity:m.popularity||0,
    poster:tmdbPoster(m.poster_path),
    backdrop:m.backdrop_path?("https://image.tmdb.org/t/p/w1280"+m.backdrop_path):"" },"film");
}
var IMDB_CACHE_KEY="gamevault-imdb-cache-v1",imdbCache={},imdbPending={};
try{imdbCache=JSON.parse(localStorage.getItem(IMDB_CACHE_KEY)||"{}")||{};}catch(e){imdbCache={};}
function imdbCacheGet(key){
  var row=imdbCache[key];
  return row&&Date.now()-Number(row.t||0)<30*60*1000?row:null;
}
function imdbCacheSet(key,value){
  imdbCache[key]={t:Date.now(),value:value};
  var keys=Object.keys(imdbCache).sort(function(a,b){return imdbCache[b].t-imdbCache[a].t;});
  keys.slice(500).forEach(function(k){delete imdbCache[k];});
  try{localStorage.setItem(IMDB_CACHE_KEY,JSON.stringify(imdbCache));}catch(e){}
}
/* OMDb rating by IMDb id (exact match — used for regional films where title lookup is unreliable) */
function omdbRatingById(imdbId){
  var k=omdbKey(); if(!k||!imdbId) return Promise.resolve(null);
  var cacheKey="id:"+imdbId,cached=imdbCacheGet(cacheKey);
  if(cached)return Promise.resolve(cached.value);
  if(imdbPending[cacheKey])return imdbPending[cacheKey];
  imdbPending[cacheKey]=fetchWithPolicy("https://www.omdbapi.com/?apikey="+encodeURIComponent(k)+"&i="+encodeURIComponent(imdbId),{},{timeout:12000,retries:1})
    .then(function(r){ return r.json(); })
    .then(function(j){var value=(j&&j.imdbRating&&j.imdbRating!=="N/A")?parseFloat(j.imdbRating):null;imdbCacheSet(cacheKey,value);return value;})
    .catch(function(){ return null; }).then(function(value){delete imdbPending[cacheKey];return value;});
  return imdbPending[cacheKey];
}
function refreshImdbIfStale(x){
  if(!x || !x.imdbId || !omdbKey()) return;
  if(x.imdbAt && (Date.now()-x.imdbAt)<30*60*1000) return;
  omdbRatingById(x.imdbId).then(function(rt){
    if(typeof rt==="number"){
      x.imdb=rt;
      x.imdbAt=Date.now();
      schedulePublicCacheSave();
      scheduleMediaRender();
    }else x.imdbAt=Date.now()-25*60*1000;
  }).catch(function(){ x.imdbAt=Date.now()-25*60*1000; });
}
var publicCacheSaveTimer=null, mediaRenderTimer=null;
function schedulePublicCacheSave(){
  clearTimeout(publicCacheSaveTimer);
  publicCacheSaveTimer=setTimeout(function(){ saveFilmCache(); saveSeriesCache(); },350);
}
function scheduleMediaRender(){
  clearTimeout(mediaRenderTimer);
  mediaRenderTimer=setTimeout(function(){
    if(section==="films") filmsMaybeRender(filmTab,true);
    else if(section==="series") seriesMaybeRender(seriesTab,true);
  },500);
}
function mediaItemsFingerprint(items){
  return (items||[]).map(function(x){
    return [x.id||x.title,x.date||x.ottDate||x.latestDate||"",x.imdb||"",x.providers&&x.providers.join(",")||""].join(":");
  }).join("|");
}
function mediaIdle(callback, timeout){
  if(typeof requestIdleCallback==="function") return requestIdleCallback(callback,{timeout:timeout||2500});
  return setTimeout(callback,Math.min(timeout||1200,1200));
}
function pooledEach(list, concurrency, gap, fn){
  var next=0, workers=[], count=Math.max(1,Math.min(Number(concurrency)||1,(list||[]).length||1));
  function worker(){
    if(next>=list.length) return Promise.resolve();
    var item=list[next++];
    return Promise.resolve(fn(item)).catch(function(){}).then(function(){
      return gap?new Promise(function(resolve){setTimeout(resolve,gap);}):null;
    }).then(worker);
  }
  for(var i=0;i<count;i++) workers.push(worker());
  return Promise.all(workers).then(function(){return list;});
}
/* OMDb lookup returning both rating and the IMDb id (for a direct IMDb link) */
function omdbLookup(title, year){
  var k=omdbKey(); if(!k) return Promise.resolve(null);
  var cacheKey="title:"+norm(title)+":"+(year||""),cached=imdbCacheGet(cacheKey);
  if(cached)return Promise.resolve(cached.value);
  if(imdbPending[cacheKey])return imdbPending[cacheKey];
  imdbPending[cacheKey]=fetchWithPolicy("https://www.omdbapi.com/?apikey="+encodeURIComponent(k)+"&t="+encodeURIComponent(title)+(year?"&y="+year:""),{},{timeout:12000,retries:1})
    .then(function(r){ return r.json(); })
    .then(function(j){var value=j?{rating:(j.imdbRating&&j.imdbRating!=="N/A")?parseFloat(j.imdbRating):null,imdbId:j.imdbID||null}:null;imdbCacheSet(cacheKey,value);return value;})
    .catch(function(){ return null; }).then(function(value){delete imdbPending[cacheKey];return value;});
  return imdbPending[cacheKey];
}
/* Direct IMDb link when we know the title id, else an IMDb title search */
function imdbLink(m){
  var url = m.imdbId ? ("https://www.imdb.com/title/"+m.imdbId+"/")
                     : ("https://www.imdb.com/find/?q="+encodeURIComponent(m.title+" "+(m.year||""))+"&s=tt");
  return '<a class="btn imdbbtn" href="'+url+'" target="_blank" rel="noopener">IMDb ↗</a>';
}
function tmdbMovieLink(m){
  if(typeof m.id==="number") return '<a class="btn" href="https://www.themoviedb.org/movie/'+m.id+'" target="_blank" rel="noopener">TMDB</a>';
  return '<a class="btn" href="https://www.google.com/search?q='+encodeURIComponent(m.title+" movie")+'" target="_blank" rel="noopener">Search</a>';
}
/* Enrich with bounded concurrency so a large list does not wait for every
   detail request serially before it can be cached and displayed. */
function serialEach(list, gap, fn){
  return pooledEach(list,4,gap,fn);
}
function fetchUpHw(){
  var from=filmYear ? yearStart(filmYear) : localISO();
  var to=filmYear ? yearEnd(filmYear) : "";
  if(filmYear && to<localISO()) return Promise.resolve([]);
  if(filmYear && String(filmYear)===String(new Date().getFullYear())) from=localISO();
  var calls=[1,2,3,4].map(function(page){
    return tmdbGet("/discover/movie", addGenreParam({
      region:"US",with_release_type:"2|3",
      "release_date.gte":from,"release_date.lte":to||daysAheadISO(730),
      sort_by:"popularity.desc","vote_count.gte":0,include_adult:"false",page:page
    }, filmGenre));
  });
  return Promise.all(calls).then(function(pages){
    var seen={}, raw=[];
    pages.forEach(function(j){ (j.results||[]).forEach(function(m){ if(!seen[m.id]){ seen[m.id]=1; raw.push(m); } }); });
    var cands=raw.slice(0,70).map(mapMovie);
    return serialEach(cands,80,function(m){
      return tmdbGet("/movie/"+m.id,{append_to_response:"release_dates"}).then(function(d){
        m.date=pickReleaseEvent(d,"US",[2,3],true)||"";
        m.originalDate=d.release_date||m.originalDate||"";
        m.originalLanguage=d.original_language||m.originalLanguage||"";
        m.year=(m.date||m.originalDate||"").slice(0,4);
      }).catch(function(){m.date="";});
    }).then(function(){
      return cands.filter(function(m){
        if(!m.date||m.date<from||(to&&m.date>to)||(m.popularity||0)<5) return false;
        var usYear=Number(m.date.slice(0,4)),originalYear=Number((m.originalDate||"").slice(0,4));
        return !originalYear||originalYear>=usYear-3;
      }).sort(function(a,b){return a.date.localeCompare(b.date)||(b.popularity||0)-(a.popularity||0);}).slice(0,55);
    });
  });
}
function pickReleaseEvent(detail,country,types,future){
  var rows=(detail.release_dates&&detail.release_dates.results)||[];
  var row=rows.filter(function(x){return x.iso_3166_1===country;})[0],todayIso=localISO(),dates=[];
  if(row) (row.release_dates||[]).forEach(function(r){ if(types.indexOf(Number(r.type))>-1&&r.release_date) dates.push(r.release_date.slice(0,10)); });
  dates=dates.filter(function(d){return future?d>=todayIso:d<=todayIso;}).sort();
  return future?(dates[0]||null):(dates[dates.length-1]||null);
}
/* Recent major Hollywood physical releases. TMDB release type 5 is Physical/Blu-ray. */
function fetchBluRayHw(){
  var from=filmYear ? yearStart(filmYear) : daysAgoISO(365);
  var to=filmYear ? yearEnd(filmYear) : localISO();
  if(to>localISO()) to=localISO();
  var calls=[1,2].map(function(page){
    return tmdbGet("/discover/movie", addGenreParam({
      with_original_language:"en", region:"US", with_release_type:"5",
      "release_date.gte":from, "release_date.lte":to,
      sort_by:"release_date.desc", "vote_count.gte":100, page:page
    }, filmGenre));
  });
  return Promise.all(calls).then(function(pages){
    var seen={}, list=[];
    pages.forEach(function(j){ (j.results||[]).forEach(function(m){
      if(!seen[m.id] && m.release_date && m.popularity>8){ seen[m.id]=1; list.push(mapMovie(m)); }
    }); });
    var cands=list.slice(0,30);
    return serialEach(cands,100,function(m){
      return tmdbGet("/movie/"+m.id,{append_to_response:"release_dates"}).then(function(d){m.date=pickReleaseEvent(d,"US",[5],false)||"";});
    }).then(function(){ return cands.filter(function(m){return !!m.date&&m.date>=from&&m.date<=to;}).sort(newerFirst).slice(0,30); });
  });
}
function fetchRelHw(){
  var from=filmYear ? yearStart(filmYear) : yearsAgoISO(2);
  var to=filmYear ? yearEnd(filmYear) : localISO();
  if(to>localISO()) to=localISO();
  var calls=[1,2].map(function(page){ return tmdbGet("/discover/movie", addGenreParam({
    with_original_language:"en", region:"US",
    "primary_release_date.lte":to, "primary_release_date.gte":from,
    sort_by:"primary_release_date.desc", with_release_type:"3",
    "vote_count.gte":250, "vote_average.gte":6.0, page:page
  }, filmGenre)); });
  return Promise.all(calls).then(function(pages){
    var seen={},cands=[]; pages.forEach(function(j){(j.results||[]).forEach(function(m){if(!seen[m.id]&&m.release_date){seen[m.id]=1;cands.push(mapMovie(m));}});});
    cands=cands.slice(0,40);
    return serialEach(cands, 200, function(m){
      return tmdbGet("/movie/"+m.id, {append_to_response:"watch/providers"}).then(function(d){
        m.imdbId=d.imdb_id||m.imdbId||null;
        var wp=d["watch/providers"] && d["watch/providers"].results && d["watch/providers"].results.US;
        m.providers=(((wp&&wp.flatrate)||[]).concat((wp&&wp.free)||[])).map(function(p){ return p.provider_name; });
        return omdbRatingById(m.imdbId).then(function(rt){ if(typeof rt==="number"){ m.imdb=rt; m.imdbAt=Date.now(); } });
      }).catch(function(){
        return omdbLookup(m.title, m.year).then(function(o){ if(o){ m.imdb=o.rating; m.imdbId=o.imdbId; m.imdbAt=Date.now(); } });
      });
    }).then(function(){
      return cands.filter(function(m){ return typeof m.imdb==="number" && m.imdb>=7.0; })
        .sort(function(a,b){ return (b.date||"").localeCompare(a.date||"") || b.imdb-a.imdb; }).slice(0,35);
    });
  });
}
/* Pick a film's India digital/TV (OTT) release date from TMDB release_dates.
   type 4 = Digital, 6 = TV. future=true → earliest upcoming; else latest past. */
function pickOttDate(detail, future){
  var rd=(detail.release_dates&&detail.release_dates.results)||[];
  var inRow=rd.filter(function(x){ return x.iso_3166_1==="IN"; })[0];
  var dates=[];
  if(inRow) (inRow.release_dates||[]).forEach(function(r){
    if((r.type===4||r.type===6) && r.release_date) dates.push(r.release_date.slice(0,10));
  });
  var t=localISO();
  if(future){ dates=dates.filter(function(x){ return x>t; }).sort(); return dates[0]||null; }
  dates=dates.filter(function(x){ return x<=t; }).sort(); return dates[dates.length-1]||null;
}
/* one detail call per film gets both the OTT date and India streaming platforms */
function enrichMlMovie(m, future){
  return tmdbGet("/movie/"+m.id, {append_to_response:"release_dates,watch/providers", region:"IN"})
    .then(function(d){
      m.ottDate=pickOttDate(d, future);
      var wp=d["watch/providers"] && d["watch/providers"].results && d["watch/providers"].results.IN;
      m.providers=(((wp&&wp.flatrate)||[]).concat((wp&&wp.free)||[])).map(function(p){ return p.provider_name; });
      m.imdbId=d.imdb_id||null;
    })
    .then(function(){
      // add the IMDb rating when an OMDb key is set — display only, never filters ML
      return omdbRatingById(m.imdbId).then(function(rt){ if(typeof rt==="number") m.imdb=rt; });
    })
    .catch(function(){ m.providers=m.providers||[]; });
}
/* Released: Malayalam films with a recent India OTT/digital release, newest OTT date first */
function fetchMlOtt(){
  var from=filmYear ? yearStart(filmYear) : daysAgoISO(150);
  var to=filmYear ? yearEnd(filmYear) : localISO();
  if(to>localISO()) to=localISO();
  return tmdbGet("/discover/movie", addGenreParam({
    with_original_language:"ml", region:"IN", with_release_type:"4|6",
    "release_date.gte":from, "release_date.lte":to,
    sort_by:"primary_release_date.desc", page:1
  }, filmGenre)).then(function(j){
    var cands=(j.results||[]).map(mapMovie).slice(0,30);
    return serialEach(cands, 130, function(m){ return enrichMlMovie(m, false); }).then(function(){
      var out=cands.filter(function(m){ return (m.providers&&m.providers.length) || m.ottDate; });
      out.sort(function(a,b){ return (b.ottDate||b.date||"")<(a.ottDate||a.date||"") ? -1 : 1; });
      return mergeManualMlOtt(out);
    });
  });
}
/* Upcoming: Malayalam films with an announced future India OTT/digital date */
function fetchMlUp(){
  var from=filmYear ? yearStart(filmYear) : daysAheadISO(1);
  var to=filmYear ? yearEnd(filmYear) : daysAheadISO(150);
  return tmdbGet("/discover/movie", addGenreParam({
    with_original_language:"ml", region:"IN", with_release_type:"4|6",
    "release_date.gte":from, "release_date.lte":to,
    sort_by:"primary_release_date.asc", page:1
  }, filmGenre)).then(function(j){
    var cands=(j.results||[]).map(mapMovie).slice(0,25);
    return serialEach(cands, 130, function(m){ return enrichMlMovie(m, true); }).then(function(){
      var out=cands.filter(function(m){ return m.ottDate; }); // must have a confirmed upcoming OTT date
      out.sort(function(a,b){ return (a.ottDate||a.date||"")<(b.ottDate||b.date||"") ? -1 : 1; });
      return out;
    });
  });
}
var MANUAL_ML_OTT=[
  {id:"manual-balti-sonyliv-2026-07-10", title:"Balti", date:"2025-09-26", year:"2025", ottDate:"2026-07-10", providers:["SonyLIV"], genres:[], poster:"", overview:"Malayalam action drama now streaming on SonyLIV."}
];
function mergeManualMlOtt(list){
  var seen={}; (list||[]).forEach(function(m){ seen[norm(m.title)]=1; });
  MANUAL_ML_OTT.forEach(function(m){
    if(m.ottDate<=localISO() && matchMediaYear(m, filmYear) && !seen[norm(m.title)]) list.push(Object.assign({},m));
  });
  list.sort(function(a,b){ return (b.ottDate||b.date||"")<(a.ottDate||a.date||"") ? -1 : 1; });
  return list;
}
var FILM_FETCH={bluray:fetchBluRayHw, uphw:fetchUpHw, relhw:fetchRelHw, mlott:fetchMlOtt, mlup:fetchMlUp};
function setMediaRefreshStatus(kind,key,message){
  if(kind==="film" && (section!=="films"||filmTab!==key)) return;
  if(kind==="series" && (section!=="series"||seriesTab!==key)) return;
  var el=document.querySelector('[data-media-refresh="'+kind+'"]');
  if(el) el.textContent=message||"";
}
function ensureFilms(key, force, early){
  if(!FILM_FETCH[key]||!tmdbKey()) return Promise.resolve(false);
  var cacheKey=filmCacheKey(key), c=filmCacheEntry(key), ttl=FILM_TTL[key]||24*3600*1000;
  var maxAge=early?ttl*.75:ttl;
  if(!force && c && (Date.now()-c.t)<maxAge) return Promise.resolve(false);
  if(filmBusy[key]&&!force) return Promise.resolve(false);
  var requestId=(filmRequestVersion[key]||0)+1;
  filmRequestVersion[key]=requestId; filmErr[key]=0; filmBusy[key]=1;
  if(!c) filmsMaybeRender(key,true);
  else setMediaRefreshStatus("film",key,"Refreshing silently...");
  return FILM_FETCH[key]().then(function(items){
    if(filmRequestVersion[key]!==requestId) return false;
    var old=filmCacheEntry(key), changed=!old||mediaItemsFingerprint(old.items)!==mediaItemsFingerprint(items);
    var entry={t:Date.now(),items:items};
    filmCache[cacheKey]=entry;
    if(!filmGenre&&!filmYear) filmCache[key]=entry;
    saveFilmCache(); delete filmBusy[key];
    if(changed) filmsMaybeRender(key,true);
    else setMediaRefreshStatus("film",key,"Updated just now");
    return changed;
  }).catch(function(e){
    if(filmRequestVersion[key]!==requestId) return false;
    reportError("films:"+key,e); delete filmBusy[key]; filmErr[key]=1;
    if(!c) filmsMaybeRender(key,true);
    else setMediaRefreshStatus("film",key,"Offline cache - refresh will retry later");
    return false;
  });
}
function filmsMaybeRender(key){
  if(key&&filmTab!==key) return;
  if(section!=="films") return;
  var ae=document.activeElement;
  if(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
  var y=window.scrollY;
  renderContentHtml(renderFilms());
  applyBackground();
  if(y) window.scrollTo(0,y);
}
function movieLinks(title,year){
  var q=title+" "+(year||"");
  return '<a class="btn" href="https://www.google.com/search?q='+encodeURIComponent(q+" movie")+'" target="_blank" rel="noopener">⌕ Google</a>'+
         '<a class="btn" href="https://www.youtube.com/results?search_query='+encodeURIComponent(q+" trailer")+'" target="_blank" rel="noopener">▶ Trailer</a>';
}
/* Malayalam reviewer channels — YouTube search pinned to the channel + film,
   so the reviewer's video is the top result (opens the app on iPhone) */
function reeloadReviewLink(title,year,kind){
  var q=title+" "+(year||"")+" "+(kind||"review")+" @REELOADMEDIA review";
  return '<a class="btn" href="https://www.youtube.com/results?search_query='+encodeURIComponent(q)+'" target="_blank" rel="noopener">★ REELOADMEDIA</a>';
}
function mlReviewLinks(title){
  return '<a class="btn" href="https://www.youtube.com/results?search_query='+encodeURIComponent(title+" Malayalam review Monsoon Media")+'" target="_blank" rel="noopener">★ Monsoon Media</a>'+
         '<a class="btn" href="https://www.youtube.com/results?search_query='+encodeURIComponent(title+" Malayalam review Aswanth Kok")+'" target="_blank" rel="noopener">★ Aswanth Kok</a>';
}
function moviePoster(m){
  ensureMediaArtwork(m,"movie");
  return mediaImage(m.poster,m.title,"cover"+(m.poster?"":" fallback-art"));
}
function mediaDate(x){ return (x&&(x.ottDate||x.date||(x.year?x.year+"-12-31":"")))||""; }
function newerFirst(a,b){ var aa=mediaDate(a), bb=mediaDate(b); return aa<bb?1:aa>bb?-1:0; }
/* ---- movie Watched status (synced, never re-shown) ---- */
function movieWatchKey(m){ return "tmdb:"+(m.id!=null?m.id:norm(m.title)); }
function watchedMovieKeys(){ var s={}; (data.watchedMovies||[]).forEach(function(w){ s[w.key]=1; }); return s; }
function watchlistMovieKeys(){ var s={}; (data.movieWatchlist||[]).forEach(function(w){ s[w.key||movieWatchKey(w)]=1; }); return s; }
function watchingMovieKeys(){ var s={}; (data.watchingMovies||[]).forEach(function(w){ s[w.key||movieWatchKey(w)]=1; }); return s; }
function isMovieWatched(m, set){ return !!(set||watchedMovieKeys())[movieWatchKey(m)]; }
function hiddenMovieKeys(){ var s={}; (data.hiddenMovies||[]).forEach(function(w){ s[w.key]=1; }); return s; }
function moviePlotName(m){ return m.title+(m.year?(" "+m.year):""); }
function captureVaultLists(keys){
  var snapshot={};
  keys.forEach(function(key){ snapshot[key]=JSON.parse(JSON.stringify(data[key]||[])); });
  return snapshot;
}
function confirmDestructive(message,title,callback){
  if(phoneUi()){tvConfirm(message,title||"Confirm",callback);return;}
  if(window.confirm(message))callback();
}
function commitVaultUndo(snapshot,message){
  save();
  flash(message,function(){
    Object.keys(snapshot).forEach(function(key){ data[key]=snapshot[key]; });
    save();
    flash("Change undone");
  });
}
function markMovieWatched(m){
  if(!m) return;
  var undo=captureVaultLists(["movieWatchlist","watchingMovies","watchedMovies","hiddenMovies"]);
  var key=movieWatchKey(m);
  if(!data.watchedMovies) data.watchedMovies=[];
  data.movieWatchlist=(data.movieWatchlist||[]).filter(function(x){ return movieWatchKey(x)!==key; });
  data.watchingMovies=(data.watchingMovies||[]).filter(function(x){ return movieWatchKey(x)!==key; });
  data.hiddenMovies=(data.hiddenMovies||[]).filter(function(x){ return movieWatchKey(x)!==key; });
  if(data.watchedMovies.some(function(w){return w.key===key;})) return;
  data.watchedMovies.unshift({key:key, id:m.id, title:m.title, year:m.year||"", poster:m.poster||"",
    imdb:(typeof m.imdb==="number"?m.imdb:null), imdbId:m.imdbId||null,
    providers:m.providers||[], ottDate:m.ottDate||"", date:m.date||"", overview:m.overview||"", genres:m.genres||[], t:Date.now()});
  commitVaultUndo(undo,"Marked Watched — it won’t show up again");
}
function unwatchMovie(key){
  var undo=captureVaultLists(["watchedMovies"]);
  data.watchedMovies=(data.watchedMovies||[]).filter(function(w){return w.key!==key;});
  commitVaultUndo(undo,"Removed from Watched");
}
function markMovieWatching(m){
  if(!m) return;
  var undo=captureVaultLists(["movieWatchlist","watchingMovies","watchedMovies","hiddenMovies"]),key=movieWatchKey(m);
  data.movieWatchlist=(data.movieWatchlist||[]).filter(function(x){return movieWatchKey(x)!==key;});
  data.watchedMovies=(data.watchedMovies||[]).filter(function(x){return movieWatchKey(x)!==key;});
  data.hiddenMovies=(data.hiddenMovies||[]).filter(function(x){return movieWatchKey(x)!==key;});
  if(!(data.watchingMovies||[]).some(function(x){return movieWatchKey(x)===key;})){
    data.watchingMovies.unshift({key:key,id:m.id,title:m.title,year:m.year||"",poster:m.poster||"",imdb:typeof m.imdb==="number"?m.imdb:null,imdbId:m.imdbId||null,tmdb:m.tmdb||null,date:m.date||"",ottDate:m.ottDate||"",runtime:m.runtime||null,overview:m.overview||"",genres:m.genres||[],providers:m.providers||[],started:Date.now()});
  }
  commitVaultUndo(undo,"Moved to Watching");
}
function hideMovie(m){
  if(!m) return;
  var undo=captureVaultLists(["movieWatchlist","watchingMovies","hiddenMovies"]);
  var key=movieWatchKey(m);
  if(!data.hiddenMovies) data.hiddenMovies=[];
  data.movieWatchlist=(data.movieWatchlist||[]).filter(function(x){ return movieWatchKey(x)!==key; });
  data.watchingMovies=(data.watchingMovies||[]).filter(function(x){ return movieWatchKey(x)!==key; });
  if(!data.hiddenMovies.some(function(x){ return x.key===key; })){
    data.hiddenMovies.unshift({key:key, id:m.id, title:m.title, year:m.year||"", poster:m.poster||"",
      imdb:(typeof m.imdb==="number"?m.imdb:null), imdbId:m.imdbId||null, tmdb:m.tmdb||null,
      providers:m.providers||[], ottDate:m.ottDate||"", date:m.date||"", overview:m.overview||"", genres:m.genres||[], t:Date.now()});
  }
  commitVaultUndo(undo,"Moved to Not Interested");
}
function unhideMovie(key){
  var undo=captureVaultLists(["hiddenMovies"]);
  data.hiddenMovies=(data.hiddenMovies||[]).filter(function(x){ return x.key!==key; });
  commitVaultUndo(undo,"Restored");
}
function findCachedMovie(id){
  for(var k in filmCache){ var c=filmCache[k]; if(c&&c.items){ for(var i=0;i<c.items.length;i++){ if(String(c.items[i].id)===String(id)) return c.items[i]; } } }
  return null;
}
function findMovieAny(id){
  return findSearchMovie(id)||findWatchlistMovie(id)||(data.watchingMovies||[]).filter(function(x){return String(x.id)===String(id);})[0]||findCachedMovie(id)||(data.watchedMovies||[]).filter(function(x){ return String(x.id)===String(id); })[0]||(data.hiddenMovies||[]).filter(function(x){ return String(x.id)===String(id); })[0]||findPlexMedia(id,"movie")||null;
}
var provChips=function(list){ return (list||[]).map(function(p){ return '<span class="prov">'+esc(p)+'</span>'; }).join(""); };

/* ---- Movies Watchlist: internet search + add + Wikipedia plot ---- */
var movieSearchQ="", movieSearchItems=[], movieSearchBusy=false, movieSearchSeq=0, movieSearchTimer=null;
var filmExpanded=null; // expanded watchlist movie id (for the plot)
var filmDetailReturnY=0, seriesDetailReturnY=0, gameDetailReturnY=0;
function restoreDetailScroll(y){ requestAnimationFrame(function(){ window.scrollTo(0,Math.max(0,y||0)); tvAfterRender(); }); }
function searchMovies(qs){
  if(!tmdbKey()) return;
  var seq=++movieSearchSeq; movieSearchBusy=true;
  tmdbGet("/search/movie", {query:qs, include_adult:"false", page:1}).then(function(j){
    if(seq!==movieSearchSeq) return;
    movieSearchItems=(j.results||[]).filter(function(m){ return m.title; }).slice(0,12).map(mapMovie);
    movieSearchBusy=false; renderFilmsKeepSearch();
  }).catch(function(){ if(seq===movieSearchSeq){ movieSearchBusy=false; renderFilmsKeepSearch(); } });
}
function renderFilmsKeepSearch(){
  if(section!=="films") return;
  var el=document.getElementById("mwSearch");
  var had=el && document.activeElement===el, pos=had?el.selectionStart:0;
  renderContentHtml(renderFilms());
  if(had){ var n=document.getElementById("mwSearch"); if(n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch(e){} } }
  tvAfterRender();
}
function findSearchMovie(id){ for(var i=0;i<movieSearchItems.length;i++){ if(String(movieSearchItems[i].id)===String(id)) return movieSearchItems[i]; } return null; }
function findWatchlistMovie(id){ return (data.movieWatchlist||[]).filter(function(x){ return String(x.id)===String(id); })[0]||null; }
function inWatchlist(m){ return (data.movieWatchlist||[]).some(function(x){ return String(x.id)===String(m.id); }); }
function addToWatchlist(m){
  if(!m) return;
  var undo=captureVaultLists(["movieWatchlist","watchingMovies","hiddenMovies"]);
  if(!data.movieWatchlist) data.movieWatchlist=[];
  data.hiddenMovies=(data.hiddenMovies||[]).filter(function(x){ return movieWatchKey(x)!==movieWatchKey(m); });
  data.watchingMovies=(data.watchingMovies||[]).filter(function(x){ return movieWatchKey(x)!==movieWatchKey(m); });
  if(inWatchlist(m)){ flash("Already in your watchlist"); return; }
  data.movieWatchlist.unshift(normalizeStoredRecord({key:movieWatchKey(m), id:m.id, title:m.title, year:m.year||"", poster:m.poster||"",
    imdb:(typeof m.imdb==="number"?m.imdb:null), imdbId:m.imdbId||null, tmdb:m.tmdb||null, date:m.date||"", ottDate:m.ottDate||"",
    runtime:m.runtime||null, providers:m.providers||[], overview:m.overview||"", genres:m.genres||[], releases:normalizedReleases(m,"film"), added:Date.now()},"film"));
  commitVaultUndo(undo,"Added to your watchlist");
}
function removeFromWatchlist(id){
  var undo=captureVaultLists(["movieWatchlist"]);
  data.movieWatchlist=(data.movieWatchlist||[]).filter(function(x){ return String(x.id)!==String(id); });
  commitVaultUndo(undo,"Removed from watchlist");
}
var phoneMenuRegistry={},phoneMenuCounter=0;
function closePhoneSheet(){
  var old=document.getElementById("phoneActionSheet");if(old)old.remove();
  document.body.classList.remove("phone-sheet-open");
}
function openPhoneSheet(title,body){
  closePhoneSheet();
  var host=document.getElementById("content");if(!host)return;
  host.insertAdjacentHTML("beforeend",'<div class="phone-sheet" id="phoneActionSheet"><button class="phone-sheet-backdrop" type="button" aria-label="Close"></button><section role="dialog" aria-modal="true" aria-label="'+esc(title)+'"><div class="phone-sheet-handle"></div><header><strong>'+esc(title)+'</strong><button type="button" class="phone-sheet-done">Done</button></header><div class="phone-sheet-body">'+body+'</div></section></div>');
  document.body.classList.add("phone-sheet-open");
}
function phoneFilterItems(type,kind){
  var items=[],current="";
  if(type==="genre"){items=[["","All genres"]].concat(kind==="series"?SERIES_GENRES:MOVIE_GENRES);current=kind==="series"?seriesGenre:filmGenre;}
  else if(type==="year"){items=[["","All years"]];var y=new Date().getFullYear();for(var n=y+2;n>=1990;n--)items.push([String(n),String(n)]);current=kind==="series"?seriesYear:filmYear;}
  else if(type==="provider"){items=US_STREAMERS;current=seriesProvider;}
  else if(type==="language"){items=[["","All languages"],["en","English"],["ml","Malayalam"],["ta","Tamil"],["hi","Hindi"]];current=seriesLanguage;}
  else{items=[["smart","Recommended order"],["added","Recently added"],["newest","Newest release"],["oldest","Oldest release"],["rating","Highest rated"],["title","Title A-Z"]];current=kind==="series"?seriesSort:filmSort;}
  return items.map(function(x){return '<button type="button" class="'+(String(x[0])===String(current)?"on":"")+'" data-act="phone-filter-set" data-filter="'+type+'" data-kind="'+kind+'" data-value="'+esc(x[0])+'"><span>'+esc(x[1])+'</span>'+(String(x[0])===String(current)?'<b>&#10003;</b>':'')+'</button>';}).join("");
}
function titleOverflow(label,items){
  if(phoneUi()){
    var menuId="pm"+(++phoneMenuCounter);phoneMenuRegistry[menuId]={title:label,body:items.join("")};
    return '<button type="button" class="phone-more-button" data-phone-menu="'+menuId+'" aria-label="More actions for '+esc(label)+'">&#8943;</button>';
  }
  return '<details class="title-menu"><summary aria-label="More actions for '+esc(label)+'" title="More actions">&#8943;<span>More</span></summary><div class="title-menu-pop">'+items.join("")+'</div></details>';
}
function moviePrimaryAction(m,key,compact){
  var id=esc(String(m.id)),cls=compact?'btn title-primary compact':'btn blue title-primary';
  if(key==="watched") return '<button class="'+cls+'" data-act="movie-primary" data-state="unwatch" data-id="'+id+'">&#8634; Restore</button>';
  if(key==="watching") return '<button class="'+cls+'" data-act="movie-primary" data-state="watched" data-id="'+id+'">&#10003; Mark Watched</button>';
  if(key==="watchlist") return '<button class="'+cls+'" data-act="movie-primary" data-state="watched" data-id="'+id+'">&#10003; Mark Watched</button>';
  return '<button class="'+cls+'" data-act="movie-primary" data-state="watchlist" data-id="'+id+'">+ Watchlist</button>';
}
function movieMoreMenu(m,key){
  var id=esc(String(m.id)),items=[];
  if(key!=="watching"&&key!=="watched") items.push('<button type="button" data-act="movie-state" data-state="watching" data-id="'+id+'">&#9654; Start Watching</button>');
  if(key!=="watchlist"&&key!=="watched") items.push('<button type="button" data-act="movie-state" data-state="watched" data-id="'+id+'">&#10003; Mark Watched</button>');
  if(key!=="watchlist") items.push('<button type="button" data-act="movie-state" data-state="watchlist" data-id="'+id+'">+ Add to Watchlist</button>');
  if(key!=="watched") items.push('<button type="button" data-act="movie-state" data-state="hide" data-id="'+id+'">Not Interested</button>');
  if(key==="watchlist") items.push('<button type="button" class="danger" data-act="movie-state" data-state="remove" data-id="'+id+'">Remove from Watchlist</button>');
  if(key==="watching") items.push('<button type="button" data-act="movie-state" data-state="watchlist" data-id="'+id+'">Move back to Watchlist</button>');
  if(key==="watched") items.push('<button type="button" data-act="movie-state" data-state="unwatch" data-id="'+id+'">Restore to suggestions</button>');
  return titleOverflow(m.title,items);
}
function movieStateBadge(key){
  var labels={watchlist:"WATCHLIST",watching:"WATCHING",watched:"WATCHED",uphw:"UPCOMING",bluray:"BLU-RAY",mlott:"OTT"};
  return labels[key]?'<span class="title-state state-'+key+'">'+labels[key]+'</span>':'';
}
function movieCompactLinks(m){
  var q=m.title+" "+(m.year||"");
  return '<a class="btn compact-link" href="https://www.youtube.com/results?search_query='+encodeURIComponent(q+" trailer")+'" target="_blank" rel="noopener">&#9654; Trailer</a>'+imdbLink(m);
}
function releaseCountdown(date){
  if(!date) return "";
  var left=daysBetween(today(),parseD(date));
  if(left<0) return "";
  var cls=left<=7?"urgent":left<=30?"soon":"later";
  var label=left===0?"RELEASES TODAY":left+" DAY"+(left===1?"":"S")+" LEFT";
  return '<div class="release-countdown '+cls+'">'+label+'</div>';
}
function gameKnownReleaseDate(g){
  if(g&&g.releases&&g.releases.launch&&g.releases.launch.date)return g.releases.launch.date;
  if(g&&g.date)return g.date;
  var name=norm(g&&g.name||"");if(!name)return "";
  var lists=[data.upcoming||[],data.upcomingRemoved||[],fullCatalog()];
  for(var li=0;li<lists.length;li++)for(var i=0;i<lists[li].length;i++)if(norm(lists[li][i].name)===name&&lists[li][i].date)return lists[li][i].date;
  return "";
}
function gameReleaseMeta(g){
  var date=gameKnownReleaseDate(g);if(!date)return "";
  var left=daysBetween(today(),parseD(date));
  var status=left>=0?releaseCountdown(date):(tab==="upcoming"?'<div class="release-countdown available">AVAILABLE NOW</div>':'');
  return '<div class="media-release game-release">Release date: '+esc(fmt(date))+(status?'<br>'+status:'')+'</div>';
}
function filmReleaseMeta(m,key){
  var releases=normalizedReleases(m,"film"),theatrical=releases.theatrical&&releases.theatrical.date||m.date||"";
  var digital=releases.digital&&releases.digital.date||m.ottDate||"";
  var physical=releases.physical&&releases.physical.date||m.blurayDate||(key==="bluray"?m.date:"")||"";
  if(key==="uphw") return '<div class="media-release">Theatrical release: '+esc(theatrical?fmt(theatrical):"Date TBC")+'<br>'+releaseCountdown(theatrical)+'</div>';
  if(key==="bluray") return '<div class="media-release">Blu-ray release: '+esc(physical?fmt(physical):"Date TBC")+'</div>';
  if(key==="mlott") return '<div class="media-release">OTT release: '+esc(digital?fmt(digital):"Date TBC")+'</div>';
  if(key==="mlup") return '<div class="media-release">OTT release: '+esc(digital?fmt(digital):"Date TBC")+'<br>'+releaseCountdown(digital)+'</div>';
  var cached=(!m.date&&!m.ottDate)?findCachedMovie(m.id):null;
  var date=theatrical||(cached&&cached.date)||"",ott=digital||(cached&&cached.ottDate)||"";
  var selected=ott||date,label=ott?"OTT release":"Release date";
  if(selected) return '<div class="media-release">'+label+': '+esc(fmt(selected))+(daysBetween(today(),parseD(selected))>=0?'<br>'+releaseCountdown(selected):'')+'</div>';
  return "";
}
function filmCardContext(m,key){
  var release=filmReleaseMeta(m,key);
  if(release)return release;
  var bits=[];
  if(m.year)bits.push(m.year);
  if(m.runtime)bits.push(m.runtime+" min");
  if(m.providers&&m.providers.length)bits.push(m.providers.slice(0,2).join(" · "));
  return bits.length?'<div class="media-release media-context">'+esc(bits.join(" · "))+'</div>':'<div class="media-release media-context muted-context">Release details unavailable</div>';
}
function movieMain(m,key){
  ensureMediaArtwork(m,"movie");
  if(!m.date)ensureMediaDetails(m,"film");
  var details=genreLabel(m.genres,MOVIE_GENRES);
  if(m.originalLanguage&&m.originalLanguage!=="en") details+=(details?" · ":"")+m.originalLanguage.toUpperCase();
  return mediaPoster(m.poster,m.title)+mediaSummary(m.title,mediaRatingLabel(m),details,filmCardContext(m,key));
}
function mediaDetailFacts(kind,x,genreList){
  var facts="";
  if(kind==="film"){
    facts+=mediaFact("Release",x.date?fmt(x.date):(x.year||"Date TBC"));
    facts+=mediaFact("Runtime",x.runtime?(x.runtime+" min"):"Not listed");
    facts+=mediaFact("Rating",mediaRatingSource(x));
    facts+=mediaFact("Where to watch",mediaProviderLine(x));
    if(x.director)facts+=mediaFact("Director",x.director,"wide");
    if(x.certification)facts+=mediaFact("Certification",x.certification);
  }else{
    facts+=mediaFact("First aired",x.date?fmt(x.date):(x.year||"Date TBC"));
    facts+=mediaFact("Seasons / episodes",(x.seasons||"-")+" / "+(x.episodeCount||"-"));
    facts+=mediaFact("Rating",mediaRatingSource(x));
    facts+=mediaFact("Status",x.status||x.seriesType||"Not listed");
    facts+=mediaFact("Network",(x.networks&&x.networks.length)?x.networks.slice(0,2).join(" · "):mediaProviderLine(x),"wide");
    facts+=mediaFact("Episode runtime",x.episodeRuntime?(x.episodeRuntime+" min"):"Not listed");
  }
  return '<div class="media-fact-grid">'+facts+'</div>';
}
function mediaPageHero(kind,x,genreList,key){
  ensureMediaArtwork(x,kind==="film"?"movie":"series");ensureMediaDetails(x,kind);
  var cinematic=mediaBgUrl(x);
  return detailToolbar(kind,x)+(cinematic?'<div class="phone-detail-backdrop" style="background-image:url(&quot;'+esc(cinematic)+'&quot;)"></div>':'')+'<div class="media-page-head">'+
    '<div class="media-page-poster">'+mediaImage(x.poster,x.title||kind,(x.poster?"":"fallback-art"))+'</div>'+
    '<div class="media-page-info"><div class="media-page-kicker"><span>'+(kind==="film"?'MOVIE':'TV SERIES')+'</span><span>'+esc(mediaStateLabel(kind,key))+'</span></div><div class="media-page-title">'+esc(x.title)+'</div>'+
    '<div class="media-page-sub"><span class="media-pill imdb">'+esc(mediaRatingSource(x))+'</span><span class="media-pill">'+esc(genreLabel(x.genres,genreList))+'</span>'+(x.originalLanguage?'<span class="media-pill">'+esc(x.originalLanguage.toUpperCase())+'</span>':'')+'</div>'+
    mediaDetailFacts(kind,x,genreList)+(mediaFreshness(x)?'<div class="rating-freshness">'+esc(mediaFreshness(x))+'</div>':'')+
    (x.overview?'<div class="media-page-overview"><span>Overview</span><p>'+esc(x.overview)+'</p></div>':'<div class="media-page-overview empty-overview"><span>Overview</span><p>Synopsis not available from the current source.</p></div>')+
    '</div></div>';
}
function mediaProvidersBlock(x){
  return (x.providers&&x.providers.length)?'<div class="plot"><b>Available on:</b><br>'+provChips(x.providers)+'</div>':'';
}
function filmDetailPage(m,key){
  refreshImdbIfStale(m);
  var actions='<div class="actions detail-actionbar">'+moviePrimaryAction(m,key,false)+movieMoreMenu(m,key);
  var showReviews=(key==="mlott"||key==="mlup"||(key==="watched"&&m.providers&&m.providers.length));
  actions+=movieLinks(m.title,m.year)+imdbLink(m)+((key==="bluray"||key==="uphw"||key==="relhw"||key==="watched"||key==="watchlist")?reeloadReviewLink(m.title,m.year,"movie"):"")+(showReviews?mlReviewLinks(m.title):"")+
    tmdbMovieLink(m)+
    '<button class="btn" data-act="ai-open" data-ai-type="film" data-id="'+esc(String(m.id))+'">AI Assistant</button></div>';
  return '<div class="media-page">'+mediaPageHero("film",m,MOVIE_GENRES,key)+filmReleaseMeta(m,key)+'<div class="detail-section-label">Library &amp; links</div>'+actions+mediaProvidersBlock(m)+plotBlock(moviePlotName(m),"film")+aiPanel("film",m)+'</div>';
}
function watchlistSearchCard(m){
  return movieCard(m,"search");
}
function watchlistCard(m){
  return movieCard(m,"watchlist");
}
function movieQuickActions(m,key){
  return '<div class="media-card-actions">'+moviePrimaryAction(m,key,true)+movieCompactLinks(m)+movieMoreMenu(m,key)+'</div>';
}
function movieCard(m, key){
  return '<div class="card media-card">'+movieStateBadge(key)+'<div class="media-main clickrow" role="button" tabindex="0" data-act="mw-toggle" data-id="'+esc(String(m.id))+'">'+movieMain(m,key)+'</div>'+movieQuickActions(m,key)+'</div>';
}
function renderFilms(){
  var key=filmTab;
  var blurbs={
    bluray:"Major Hollywood movies newly available on Blu-ray, ordered by physical release date.",
    uphw:"Major movies in every language with a confirmed U.S. theatrical release, earliest release first.",
    relhw:"Critically acclaimed Hollywood movies with an exact IMDb rating of 7.0 or higher.",
    mlott:"Newly streaming and confirmed upcoming Malayalam OTT movies across major Indian platforms.",
    mlup:"Confirmed upcoming Malayalam OTT premieres with their announced streaming date and platform, soonest first.",
    watchlist:"Search any movie on the internet and add it to your personal watchlist. Tap a saved film to read its Wikipedia plot.",
    watching:"Movies you have started. Plex playback progress automatically updates this list.",
    watched:"Films you’ve marked as watched. They’re hidden from every other tab and never come back on refresh — synced across your devices."
  };
  var selectedFilm=filmExpanded?findMovieAny(filmExpanded):null;
  if(selectedFilm){
    if(!(plotKey(moviePlotName(selectedFilm),"film") in plotCache) && !plotPending[plotKey(moviePlotName(selectedFilm),"film")]) ensurePlot(moviePlotName(selectedFilm),"film");
    return filmDetailPage(selectedFilm,key);
  }

  // Watchlist tab: internet search + personal list, from the synced vault
  if(key==="watchlist"){
    var wl=applyMediaSort((data.movieWatchlist||[]).filter(function(m){ return matchMediaYear(m, filmYear); }).slice().sort(newerFirst),"film");
    var hidden=data.hiddenMovies||[];
    var hset=hiddenMovieKeys();
    var wh='<div class="toolbar" style="margin-top:14px"><select class="selectmini film-year" title="Filter by year">'+yearOptions(filmYear)+'</select>'+mediaSortSelect("film")+'<div class="searchwrap"><span class="sic">⌕</span>'+
      '<input class="tab-search" id="mwSearch" placeholder="Search any movie to add…" value="'+esc(movieSearchQ)+'" autocomplete="off">'+
      (movieSearchQ?'<button class="sclear" data-act="mw-clear" title="Clear">✕</button>':'')+'</div></div>'+
      mediaViewToggle("film")+
      '<div class="meta" style="margin-bottom:10px">'+blurbs.watchlist+'</div>';
    if(!tmdbKey()) return wh+'<div class="empty">Add your free <b>TMDB API key</b> in Settings to search movies.</div>';
    if(movieSearchQ.trim().length>=2){
      wh+='<div class="sechead">Search results</div>';
      if(movieSearchBusy && !movieSearchItems.length) wh+='<div class="empty">Searching the internet…</div>';
      else if(!movieSearchItems.length) wh+='<div class="empty">No movies match “'+esc(movieSearchQ)+'”.</div>';
      else{ wh+='<div class="'+mediaWrapClass("film")+'">'; movieSearchItems.filter(function(m){ return !hset[movieWatchKey(m)] && matchMediaYear(m, filmYear); }).forEach(function(m){ wh+=watchlistSearchCard(m); }); wh+='</div>'; }
    }
    wh+='<div class="sechead">My Watchlist · '+wl.length+'</div>';
    if(!wl.length) wh+='<div class="empty">Your movie watchlist is empty. Search above and tap <b>+ Add</b>. Tap a saved film to read its plot.</div>';
    else{ wh+='<div class="'+mediaWrapClass("film")+'">'; wl.forEach(function(m){ wh+=watchlistCard(m); }); wh+='</div>'; }
    if(hidden.length){
      wh+='<div class="sechead">Not Interested · '+hidden.length+'</div><div class="cards">';
      hidden.forEach(function(m){
        wh+='<div class="card hist"><div class="row">'+moviePoster(m)+'<div class="grow"><div class="gname">'+esc(m.title)+'</div><div class="meta">'+(m.year||"")+'</div></div><button class="btn blue" data-act="mv-unhide" data-key="'+esc(m.key)+'">Restore</button></div></div>';
      });
      wh+='</div>';
    }
    return wh;
  }

  if(key==="watching"){
    var watching=applyMediaSort((data.watchingMovies||[]).filter(function(m){return matchMediaYear(m,filmYear);}).slice().sort(newerFirst),"film");
    var wg='<div class="toolbar" style="margin-top:14px"><select class="selectmini film-year" title="Filter by year">'+yearOptions(filmYear)+'</select>'+mediaSortSelect("film")+'</div>'+mediaViewToggle("film")+'<div class="meta" style="margin:14px 0 10px">'+blurbs.watching+'</div>';
    if(!watching.length) return wg+'<div class="empty">No movies are currently in progress.</div>';
    wg+='<div class="'+mediaWrapClass("film")+'">';watching.forEach(function(m){wg+=movieCard(m,"watching");});return wg+'</div>';
  }

  // Watched tab: rendered straight from the synced vault, no internet needed
  if(key==="watched"){
    var wm=applyMediaSort((data.watchedMovies||[]).filter(function(m){ return matchMediaYear(m, filmYear); }).slice().sort(newerFirst),"film");
    var wh='<div class="toolbar" style="margin-top:14px"><select class="selectmini film-year" title="Filter by year">'+yearOptions(filmYear)+'</select>'+mediaSortSelect("film")+'</div>'+mediaViewToggle("film")+'<div class="meta" style="margin:14px 0 10px">'+blurbs.watched+'</div>';
    if(!wm.length) return wh+'<div class="empty">No watched films yet. On any film, pick <b>✓ Watched</b> from its dropdown to file it here.</div>';
    wh+='<div class="'+mediaWrapClass("film")+'">';
    wm.forEach(function(m){ wh+=movieCard(m,"watched"); });
    return wh+'</div>';
  }

  var last=filmCacheEntry(key);
  var mlUpcoming=key==="mlott"?filmCacheEntry("mlup"):null;
  var html=
    '<div class="toolbar" style="margin-top:14px">'+
    '<select class="selectmini film-genre" title="Filter by genre">'+genreOptions(MOVIE_GENRES, filmGenre)+'</select>'+
    '<select class="selectmini film-year" title="Filter by year">'+yearOptions(filmYear)+'</select>'+
    mediaSortSelect("film")+
    '<button class="btn blue" data-act="film-refresh"'+((filmBusy[key]||(key==="mlott"&&filmBusy.mlup))?' disabled':'')+'>'+((filmBusy[key]||(key==="mlott"&&filmBusy.mlup))?"Updating…":"↻ Refresh from internet")+'</button>'+
    '<span class="syncnote" data-media-refresh="film" style="align-self:center">'+(last?("Updated "+new Date(last.t).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})):"")+'</span>'+
    '</div>'+
    mediaViewToggle("film")+
    '<div class="meta" style="margin-bottom:10px">'+blurbs[key]+'</div>';

  if(!tmdbKey()){
    return html+'<div class="empty">Add your free <b>TMDB API key</b> in Settings (&#8943; menu → Settings) to load films.</div>';
  }
  if(key==="relhw" && !omdbKey()){
    return html+'<div class="empty">Add your free <b>OMDb API key</b> in Settings for exact IMDb ratings on this tab.</div>';
  }
  if(filmBusy[key] && !last){
    return html+loadingSkeletons("media",8);
  }
  if(filmErr[key] && !last){
    return html+'<div class="empty">Couldn’t load — check your internet and API key, then <button class="btn" data-act="film-refresh">↻ Try again</button></div>';
  }
  var wset=watchedMovieKeys();
  var wlset=watchlistMovieKeys();
  var wingset=watchingMovieKeys();
  var hset2=hiddenMovieKeys();
  var hidePersonal=(key!=="uphw" && key!=="mlup");
  var items=((last&&last.items)||[]).filter(function(m){
    var mk=movieWatchKey(m);
    return matchMediaYear(m, filmYear) && !hset2[mk] && (!hidePersonal || (!wset[mk] && !wlset[mk] && !wingset[mk]));
  }); // watched/watchlist/watching/hidden stay out of suggestion lists, except Upcoming
  if(key==="bluray"||key==="relhw"||key==="mlott") items.sort(newerFirst);
  items=applyMediaSort(items,"film");
  var upcomingItems=[];
  if(key==="mlott") upcomingItems=((mlUpcoming&&mlUpcoming.items)||[]).filter(function(m){
    var mk=movieWatchKey(m); return matchMediaYear(m,filmYear)&&!hset2[mk];
  }).sort(function(a,b){return (a.ottDate||a.date||"").localeCompare(b.ottDate||b.date||"");});
  upcomingItems=applyMediaSort(upcomingItems,"film");
  if(!items.length && !upcomingItems.length){
    return html+'<div class="empty">'+(filmBusy[key]?"Loading…":(last?"Nothing left here — everything shown is marked Watched.":"Nothing to show yet — tap ↻ Refresh."))+'</div>';
  }
  if(key==="mlott"){
    html+='<div class="sechead">Coming to Malayalam OTT · '+upcomingItems.length+'</div>';
    if(upcomingItems.length){ html+='<div class="'+mediaWrapClass("film")+'">'; upcomingItems.forEach(function(m){ html+=movieCard(m,"mlup"); }); html+='</div>'; }
    else html+='<div class="empty">No confirmed upcoming Malayalam OTT dates are available yet.</div>';
    html+='<div class="sechead">Now Streaming · '+items.length+'</div>';
  }
  if(items.length){ html+='<div class="'+mediaWrapClass("film")+'">'; items.forEach(function(m){ html+=movieCard(m,key); }); html+='</div>'; }
  return html;
}
/* ================= TV SERIES SECTION (TMDB + OMDb) =================
   Public lists cache locally; personal watchlist, watched state and ratings
   live in the synced vault beside the game and film data. */
var SERIESTAB_KEY="ps5-seriestab", SERIES_CACHE_KEY="ps5-series-cache-v3";
var seriesTab="serieswatchlist";
try{ seriesTab=localStorage.getItem(SERIESTAB_KEY)||"serieswatchlist"; }catch(e){}
var SERIES_ORDER=["serieswatchlist","serieswatching","seriesnew","seriesupcoming","enseries","mlseries","taseries","hiseries","serieswatched"];
if(seriesTab==="seriesdiscover") seriesTab="enseries";
if(SERIES_ORDER.indexOf(seriesTab)<0) seriesTab="serieswatchlist";
var SERIES_TTL={enseries:18*3600*1000,mlseries:12*3600*1000,taseries:12*3600*1000,hiseries:12*3600*1000,seriesdiscover:18*3600*1000,seriesupcoming:6*3600*1000};
var seriesCache={}, seriesBusy={}, seriesErr={}, seriesRequestVersion={};
try{ seriesCache=JSON.parse(localStorage.getItem(SERIES_CACHE_KEY)||"{}")||{}; }catch(e){ seriesCache={}; }
function saveSeriesCache(){
  pruneMediaCache(seriesCache,36);
  if(window.GameVaultCore){
    GameVaultCore.storage.put("series-cache",seriesCache).then(function(result){if(result!==false)try{localStorage.removeItem(SERIES_CACHE_KEY);}catch(e){}});
    return;
  }
  try{localStorage.setItem(SERIES_CACHE_KEY,JSON.stringify(seriesCache));}catch(e){}
}
function seriesCacheKey(key){
  var language=(key==="seriesupcoming"||key==="seriesdiscover")?seriesLanguage:"";
  return key+"|genre="+mediaCachePart(seriesGenre)+"|year="+mediaCachePart(seriesYear)+
    "|provider="+mediaCachePart(seriesProvider)+"|language="+mediaCachePart(language);
}
function seriesCacheEntry(key){
  var exact=seriesCache[seriesCacheKey(key)];
  if(exact) return exact;
  var languageRelevant=key==="seriesupcoming"||key==="seriesdiscover";
  return !seriesGenre&&!seriesYear&&!seriesProvider&&(!languageRelevant||!seriesLanguage)?(seriesCache[key]||null):null;
}
var seriesEpisodeCache={}, seriesSeasonSel={}, seriesEpisodeSel={}, seriesEpisodeBusy={};
function mapSeries(s){
  return normalizeStoredRecord({ id:s.id, title:s.name||s.original_name||"Untitled",
    date:s.first_air_date||"", firstAirDate:s.first_air_date||"", latestDate:s.last_air_date||"", year:(s.first_air_date||"").slice(0,4),
    overview:s.overview||"", tmdb:Math.round((s.vote_average||0)*10)/10,
    votes:s.vote_count||0, popularity:s.popularity||0, genres:s.genre_ids||[], originalLanguage:s.original_language||"",
    poster:tmdbPoster(s.poster_path),
    backdrop:s.backdrop_path?("https://image.tmdb.org/t/p/w1280"+s.backdrop_path):"" },"series");
}
function enrichSeriesIds(s){
  return tmdbGet("/tv/"+s.id, {append_to_response:"external_ids,watch/providers"}).then(function(d){
    if(d&&d.external_ids&&d.external_ids.imdb_id) s.imdbId=d.external_ids.imdb_id;
    if(d&&d.number_of_seasons) s.seasons=d.number_of_seasons;
    s.seriesType=d.type||"";
    s.originalLanguage=d.original_language||s.originalLanguage||"";
    s.poster=s.poster||tmdbPoster(d.poster_path);
    s.backdrop=s.backdrop||tmdbBackdrop(d.backdrop_path);
    s.episodeCount=d.number_of_episodes||0;
    s.networks=(d.networks||[]).map(function(n){ return n.name||""; }).filter(Boolean);
    s.latestDate=(d.next_episode_to_air&&d.next_episode_to_air.air_date)||(d.last_episode_to_air&&d.last_episode_to_air.air_date)||d.last_air_date||s.latestDate||s.date;
    s.seasonList=(d.seasons||[]).filter(function(se){ return se.season_number>0; }).map(function(se){ return {n:se.season_number,name:se.name||("Season "+se.season_number),episodes:se.episode_count||0}; });
    var region=s.providerRegion||"US";
    var wp=d["watch/providers"] && d["watch/providers"].results && d["watch/providers"].results[region];
    s.providers=(((wp&&wp.flatrate)||[]).concat((wp&&wp.free)||[])).map(function(p){ return p.provider_name; });
  }).then(function(){
    return omdbRatingById(s.imdbId).then(function(rt){ if(typeof rt==="number"){ s.imdb=rt; s.imdbAt=Date.now(); } });
  }).catch(function(){});
}
function regionalTvSeriesOnly(s,lang){
  var text=(s.title+" "+(s.overview||"")).toLowerCase();
  var networks=(s.networks||[]).join(" ").toLowerCase();
  if(networks.indexOf("youtube")>-1 || /\byou\s*tube\b/.test(text)) return false;
  if(/\b(daily soap|soap opera|television serial|tv serial|mega serial|daily serial)\b/.test(text)) return false;
  if(s.seriesType && s.seriesType!=="Scripted" && s.seriesType!=="Miniseries") return false;
  if(lang&&s.originalLanguage&&s.originalLanguage!==lang) return false;
  if((s.episodeCount||0)<2) return false;
  if((s.episodeCount||0)>120) return false;
  return true;
}
function regionalPrestigeSeries(s){
  var rating=Number(typeof s.imdb==="number"?s.imdb:s.tmdb)||0;
  var votes=Number(s.votes)||0,pop=Number(s.popularity)||0;
  var outlets=((s.networks||[]).concat(s.providers||[])).join(" ").toLowerCase();
  var premium=/netflix|amazon|prime video|disney|hotstar|jiohotstar|jio cinema|jiocinema|sony\s*liv|zee5|aha|sun nxt|manorama|max|hoichoi|hbo|apple tv|peacock|paramount/.test(outlets);
  var highlyRated=rating>=7.2&&(votes>=5||typeof s.imdb==="number");
  var established=rating>=6.8&&votes>=15;
  var highProduction=premium&&rating>=6.3&&(votes>=3||pop>=2.5)&&!!(s.poster||s.backdrop);
  return highlyRated||established||highProduction;
}
function fetchSeriesLang(lang, minVotes, minRating, sortBy, pages, regionalOnly){
  pages=pages||1;
  var calls=[];
  for(var pg=1; pg<=pages; pg++){
    var params=addGenreParam({
      with_original_language:lang, "first_air_date.lte":localISO(), watch_region:regionalOnly?"IN":"US",
      sort_by:sortBy||"popularity.desc", "vote_count.gte":minVotes,
      "vote_average.gte":minRating, page:pg
    }, seriesGenre);
    if(seriesYear){
      params["first_air_date.gte"]=yearStart(seriesYear);
      params["first_air_date.lte"]=yearEnd(seriesYear);
      if(params["first_air_date.lte"]>localISO()) params["first_air_date.lte"]=localISO();
    }
    if(seriesProvider) params.with_watch_providers=seriesProvider;
    calls.push(tmdbGet("/discover/tv", params).catch(function(){ return {results:[]}; }));
  }
  return Promise.all(calls).then(function(all){
    var seen={}, cands=[];
    all.forEach(function(j){
      (j.results||[]).forEach(function(s){
        if(!s.name || !s.first_air_date || seen[s.id]) return;
        seen[s.id]=1; var mapped=mapSeries(s); mapped.providerRegion=regionalOnly?"IN":"US"; mapped.requestedLanguage=lang;cands.push(mapped);
      });
    });
    if(regionalOnly) cands.sort(newerFirst);
    else cands.sort(function(a,b){
      function sc(x){ return (x.tmdb||0)*8 + Math.log((x.votes||0)+1)*3 + Math.min(35, (x.popularity||0)); }
      return sc(b)-sc(a);
    });
    cands=cands.slice(0,45);
    var enrichList=regionalOnly?cands:cands.slice(0,24);
    return serialEach(enrichList, 120, enrichSeriesIds).then(function(){
      return regionalOnly ? cands.filter(function(s){return regionalTvSeriesOnly(s,lang)&&regionalPrestigeSeries(s);}).sort(function(a,b){return (b.latestDate||b.date||"").localeCompare(a.latestDate||a.date||"");}) : cands;
    });
  });
}
function gdMaybeHistory(tok,body){
  var last=0;
  try{ last=Number(localStorage.getItem(GD_HISTORY_STORE))||0; }catch(e){}
  if(!vaultSize(data) || Date.now()-last<86400000) return Promise.resolve();
  var boundary="gvh"+Date.now(),name=GD_HISTORY_PREFIX+localISO()+".json";
  var mp="--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+
    JSON.stringify({name:name,mimeType:"application/json",appProperties:{gameVaultHistory:"true"}})+
    "\r\n--"+boundary+"\r\nContent-Type: application/json\r\n\r\n"+body+"\r\n--"+boundary+"--";
  return gdApi("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {method:"POST",headers:{"Content-Type":"multipart/related; boundary="+boundary},body:mp},tok)
  .then(function(){ try{ localStorage.setItem(GD_HISTORY_STORE,String(Date.now())); }catch(e){} })
  .then(function(){
    var q=encodeURIComponent("appProperties has { key='gameVaultHistory' and value='true' } and trashed=false");
    return gdApi("https://www.googleapis.com/drive/v3/files?q="+q+"&fields=files(id,createdTime)&orderBy=createdTime%20desc&pageSize=20",{},tok);
  }).then(function(r){ return r.json(); }).then(function(j){
    return Promise.all((j.files||[]).slice(5).map(function(f){
      return gdApi("https://www.googleapis.com/drive/v3/files/"+f.id,{method:"DELETE"},tok).catch(function(){});
    }));
  }).catch(function(){});
}
function fetchEnSeries(){ return fetchSeriesLang("en", 350, 7.2, "vote_average.desc", 2).then(rankEnglishSeries); }
function fetchMlSeries(){ return fetchSeriesLang("ml", 2, 6.0, "first_air_date.desc", 6, true); }
function fetchTaSeries(){ return fetchSeriesLang("ta", 3, 6.0, "first_air_date.desc", 8, true); }
function fetchHiSeries(){ return fetchSeriesLang("hi", 5, 6.0, "first_air_date.desc", 8, true); }
function fetchSeriesDiscover(){
  if(seriesLanguage==="ml") return fetchMlSeries();
  if(seriesLanguage==="ta") return fetchTaSeries();
  if(seriesLanguage==="hi") return fetchHiSeries();
  if(seriesLanguage==="en") return fetchEnSeries();
  return Promise.all([
    fetchSeriesLang("en",350,7.2,"vote_average.desc",1),
    fetchMlSeries(),
    fetchTaSeries(),
    fetchHiSeries()
  ]).then(function(groups){
    var seen={},out=[]; groups.forEach(function(list){(list||[]).forEach(function(s){if(!seen[s.id]){seen[s.id]=1;out.push(s);}});});
    return rankEnglishSeries(out).slice(0,70);
  });
}
function fetchUpcomingSeries(){
  var params=addGenreParam({"first_air_date.gte":localISO(),"first_air_date.lte":daysAheadISO(365),sort_by:"popularity.desc","vote_count.gte":0,page:1},seriesGenre);
  if(seriesLanguage) params.with_original_language=seriesLanguage;
  if(seriesProvider){params.with_watch_providers=seriesProvider;params.watch_region=seriesLanguage&&seriesLanguage!=="en"?"IN":"US";}
  return tmdbGet("/discover/tv",params).then(function(j){
    return (j.results||[]).filter(function(s){return s.name&&s.first_air_date>=localISO();}).map(mapSeries).sort(function(a,b){return a.date.localeCompare(b.date);}).slice(0,45);
  });
}
var SERIES_FETCH={enseries:fetchEnSeries,mlseries:fetchMlSeries,taseries:fetchTaSeries,hiseries:fetchHiSeries,seriesdiscover:fetchSeriesDiscover,seriesupcoming:fetchUpcomingSeries};
var seriesPersonalRefreshAt=0,seriesPersonalPromise=null;
function ensureSeries(key, force){
  if(key==="serieswatching"||key==="seriesnew"){
    if(seriesPersonalPromise)return seriesPersonalPromise;
    if(!tmdbKey()||seriesBusy[key]) return Promise.resolve(false);
    if(!force&&Date.now()-seriesPersonalRefreshAt<3*3600*1000) return Promise.resolve(false);
    var personal=(data.watchingSeries||[]).slice(0,30);
    if(!personal.length) return Promise.resolve(false);
    seriesBusy[key]=1;
    setMediaRefreshStatus("series",key,"Checking for new episodes...");
    seriesPersonalPromise=serialEach(personal,80,enrichSeriesIds).then(function(){
      seriesPersonalRefreshAt=Date.now();delete seriesBusy[key];seriesPersonalPromise=null;persistSilent();seriesMaybeRender(key,true);return true;
    }).catch(function(e){
      delete seriesBusy[key];seriesPersonalPromise=null;reportError("series:"+key,e);setMediaRefreshStatus("series",key,"Could not refresh episodes");return false;
    });
    return seriesPersonalPromise;
  }
  if(!SERIES_FETCH[key]||!tmdbKey()) return Promise.resolve(false);
  var cacheKey=seriesCacheKey(key), c=seriesCacheEntry(key), ttl=SERIES_TTL[key]||18*3600*1000;
  var early=arguments.length>2&&arguments[2], maxAge=early?ttl*.75:ttl;
  if(!force && c && (Date.now()-c.t)<maxAge) return Promise.resolve(false);
  if(seriesBusy[key]&&!force) return Promise.resolve(false);
  var requestId=(seriesRequestVersion[key]||0)+1;
  seriesRequestVersion[key]=requestId;seriesErr[key]=0;seriesBusy[key]=1;
  if(!c) seriesMaybeRender(key,true);
  else setMediaRefreshStatus("series",key,"Refreshing silently...");
  return SERIES_FETCH[key]().then(function(items){
    if(seriesRequestVersion[key]!==requestId) return false;
    var old=seriesCacheEntry(key), changed=!old||mediaItemsFingerprint(old.items)!==mediaItemsFingerprint(items);
    var entry={t:Date.now(),items:items};
    seriesCache[cacheKey]=entry;
    if(!seriesGenre&&!seriesYear&&!seriesProvider&&!seriesLanguage) seriesCache[key]=entry;
    saveSeriesCache();delete seriesBusy[key];
    if(changed) seriesMaybeRender(key,true);
    else setMediaRefreshStatus("series",key,"Updated just now");
    return changed;
  }).catch(function(e){
    if(seriesRequestVersion[key]!==requestId) return false;
    reportError("series:"+key,e);delete seriesBusy[key];seriesErr[key]=1;
    if(!c) seriesMaybeRender(key,true);
    else setMediaRefreshStatus("series",key,"Offline cache - refresh will retry later");
    return false;
  });
}
function seriesMaybeRender(key){
  if(key&&seriesTab!==key) return;
  if(section!=="series") return;
  var ae=document.activeElement;
  if(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
  var y=window.scrollY;
  renderContentHtml(renderSeries());
  applyBackground();
  if(y) window.scrollTo(0,y);
}
var mediaWarmupVersion={films:0,series:0};
function scheduleMediaWarmup(kind,current){
  if(!tmdbKey()||document.visibilityState==="hidden"||navigator.onLine===false) return;
  if(navigator.connection&&navigator.connection.saveData) return;
  var version=++mediaWarmupVersion[kind];
  var order=kind==="films"?["uphw","mlott","mlup","bluray","relhw"]:
    ["seriesnew","seriesupcoming","enseries","mlseries","taseries","hiseries"];
  if(current&&order.indexOf(current)>-1) order=[current].concat(order.filter(function(k){return k!==current;}));
  var index=0;
  function next(){
    if(version!==mediaWarmupVersion[kind]||document.visibilityState==="hidden"||index>=order.length) return;
    var key=order[index++];
    var task=kind==="films"?ensureFilms(key,false,true):ensureSeries(key,false,true);
    Promise.resolve(task).then(function(){ mediaIdle(next,1800); });
  }
  mediaIdle(next,1200);
}
function seriesPoster(s){
  ensureMediaArtwork(s,"series");
  return mediaImage(s.poster,s.title,"cover"+(s.poster?"":" fallback-art"));
}
function seriesKey(s){ return "tmdbtv:"+(s.id!=null?s.id:norm(s.title)); }
function watchedSeriesKeys(){ var out={}; (data.watchedSeries||[]).forEach(function(s){ out[s.key]=1; }); return out; }
function watchlistSeriesKeys(){ var out={}; (data.seriesWatchlist||[]).forEach(function(s){ out[s.key||seriesKey(s)]=1; }); return out; }
function watchingSeriesKeys(){ var out={}; (data.watchingSeries||[]).forEach(function(s){ out[s.key||seriesKey(s)]=1; }); return out; }
function hiddenSeriesKeys(){ var out={}; (data.hiddenSeries||[]).forEach(function(s){ out[s.key]=1; }); return out; }
function seriesPlotName(s){ return s.title+(s.year?(" "+s.year):""); }
function findCachedSeries(id){
  for(var k in seriesCache){ var c=seriesCache[k]; if(c&&c.items){ for(var i=0;i<c.items.length;i++){ if(String(c.items[i].id)===String(id)) return c.items[i]; } } }
  return null;
}
function findSeriesAny(id){
  return findSearchSeries(id)||findWatchlistSeries(id)||(data.watchingSeries||[]).filter(function(x){ return String(x.id)===String(id); })[0]||findCachedSeries(id)||(data.watchedSeries||[]).filter(function(x){ return String(x.id)===String(id); })[0]||(data.hiddenSeries||[]).filter(function(x){ return String(x.id)===String(id); })[0]||findPlexMedia(id,"show")||null;
}
function seriesRating(s){ return (data.seriesRatings||{})[seriesKey(s)]||0; }
function setSeriesRating(s,n){
  if(!s) return;
  if(!data.seriesRatings) data.seriesRatings={};
  var k=seriesKey(s);
  data.seriesRatings[k]=(data.seriesRatings[k]===n?0:n);
  save(); flash(data.seriesRatings[k]?"Rating saved - recommendations updated":"Rating cleared");
}
function seriesRatingDots(s){
  var r=seriesRating(s), h='<div class="dots" title="Your rating">';
  for(var i=1;i<=5;i++) h+='<button class="dot '+(i<=r?"on":"")+'" data-act="sr-rate" data-id="'+esc(String(s.id))+'" data-n="'+i+'">●</button>';
  return h+'</div>';
}
function seriesPrefWeights(){
  var weights={}, rated=0;
  function add(s, r){
    if(!s||!s.genres||!r) return;
    rated++;
    s.genres.forEach(function(g){ weights[g]=(weights[g]||0)+r; });
  }
  [data.seriesWatchlist||[],data.watchingSeries||[],data.watchedSeries||[]].forEach(function(list){ list.forEach(function(s){ add(s, seriesRating(s)); }); });
  for(var k in seriesCache){ var c=seriesCache[k]; if(c&&c.items) c.items.forEach(function(s){ add(s, seriesRating(s)); }); }
  return {weights:weights, rated:rated};
}
function rankEnglishSeries(list){
  var pref=seriesPrefWeights();
  if(!pref.rated) return list.sort(function(a,b){ return (b.imdb||b.tmdb||0)-(a.imdb||a.tmdb||0); });
  return list.slice().sort(function(a,b){
    function score(s){
      var base=(s.imdb||s.tmdb||0)*10 + Math.min(20,(s.votes||0)/120);
      var bonus=0; (s.genres||[]).forEach(function(g){ bonus+=pref.weights[g]||0; });
      return base + bonus*6;
    }
    return score(b)-score(a);
  });
}
function markSeriesWatched(s){
  if(!s) return;
  var undo=captureVaultLists(["seriesWatchlist","watchingSeries","watchedSeries"]);
  var key=seriesKey(s);
  if(!data.watchedSeries) data.watchedSeries=[];
  if(data.watchedSeries.some(function(x){ return x.key===key; })) return;
  data.watchedSeries.unshift({key:key, id:s.id, title:s.title, year:s.year||"", poster:s.poster||"",
    imdb:(typeof s.imdb==="number"?s.imdb:null), imdbId:s.imdbId||null, tmdb:s.tmdb||null,
    date:s.date||"", latestDate:s.latestDate||"", overview:s.overview||"", genres:s.genres||[], seasons:s.seasons||"", seasonList:s.seasonList||[], providers:s.providers||[], t:Date.now()});
  data.seriesWatchlist=(data.seriesWatchlist||[]).filter(function(x){ return seriesKey(x)!==key; });
  data.watchingSeries=(data.watchingSeries||[]).filter(function(x){ return seriesKey(x)!==key; });
  commitVaultUndo(undo,"Marked Watched — it won’t show again");
}
function markSeriesWatching(s){
  if(!s) return;
  var undo=captureVaultLists(["seriesWatchlist","watchingSeries","watchedSeries","hiddenSeries"]);
  var key=seriesKey(s);
  if(!data.watchingSeries) data.watchingSeries=[];
  data.seriesWatchlist=(data.seriesWatchlist||[]).filter(function(x){return seriesKey(x)!==key;});
  data.watchedSeries=(data.watchedSeries||[]).filter(function(x){return seriesKey(x)!==key;});
  data.hiddenSeries=(data.hiddenSeries||[]).filter(function(x){return seriesKey(x)!==key;});
  if(!data.watchingSeries.some(function(x){return seriesKey(x)===key;})){
    data.watchingSeries.unshift({key:key,id:s.id,title:s.title,year:s.year||"",poster:s.poster||"",imdb:typeof s.imdb==="number"?s.imdb:null,imdbId:s.imdbId||null,tmdb:s.tmdb||null,date:s.date||"",latestDate:s.latestDate||"",overview:s.overview||"",genres:s.genres||[],seasons:s.seasons||"",seasonList:s.seasonList||[],providers:s.providers||[],started:Date.now()});
  }
  commitVaultUndo(undo,"Moved to Watching");
}
function unwatchSeries(key){
  var undo=captureVaultLists(["watchedSeries"]);
  data.watchedSeries=(data.watchedSeries||[]).filter(function(s){ return s.key!==key; });
  commitVaultUndo(undo,"Removed from Watched");
}
function hideSeries(s){
  if(!s) return;
  var undo=captureVaultLists(["seriesWatchlist","watchingSeries","hiddenSeries"]);
  var key=seriesKey(s);
  if(!data.hiddenSeries) data.hiddenSeries=[];
  data.seriesWatchlist=(data.seriesWatchlist||[]).filter(function(x){ return seriesKey(x)!==key; });
  data.watchingSeries=(data.watchingSeries||[]).filter(function(x){ return seriesKey(x)!==key; });
  if(!data.hiddenSeries.some(function(x){ return x.key===key; })){
    data.hiddenSeries.unshift({key:key, id:s.id, title:s.title, year:s.year||"", poster:s.poster||"",
      imdb:(typeof s.imdb==="number"?s.imdb:null), imdbId:s.imdbId||null, tmdb:s.tmdb||null,
      date:s.date||"", overview:s.overview||"", genres:s.genres||[], seasons:s.seasons||"", seasonList:s.seasonList||[], providers:s.providers||[], t:Date.now()});
  }
  commitVaultUndo(undo,"Moved to Not Interested");
}
function unhideSeries(key){
  var undo=captureVaultLists(["hiddenSeries"]);
  data.hiddenSeries=(data.hiddenSeries||[]).filter(function(s){ return s.key!==key; });
  commitVaultUndo(undo,"Restored");
}
function seriesPrimaryAction(s,key,compact){
  var id=esc(String(s.id)),cls=compact?'btn title-primary compact':'btn blue title-primary';
  if(key==="serieswatched") return '<button class="'+cls+'" data-act="series-primary" data-state="unwatch" data-id="'+id+'">&#8634; Restore</button>';
  if(key==="serieswatchlist"||key==="serieswatching"||key==="seriesnew") return '<button class="'+cls+'" data-act="series-primary" data-state="watched" data-id="'+id+'">&#10003; Mark Watched</button>';
  return '<button class="'+cls+'" data-act="series-primary" data-state="watchlist" data-id="'+id+'">+ Watchlist</button>';
}
function seriesMoreMenu(s,key){
  var id=esc(String(s.id)),items=[];
  if(key!=="serieswatching"&&key!=="seriesnew"&&key!=="serieswatched") items.push('<button type="button" data-act="series-state" data-state="watching" data-id="'+id+'">&#9654; Start Watching</button>');
  if(key!=="serieswatched") items.push('<button type="button" data-act="series-state" data-state="watched" data-id="'+id+'">&#10003; Mark Watched</button>');
  if(key!=="serieswatchlist") items.push('<button type="button" data-act="series-state" data-state="watchlist" data-id="'+id+'">+ Add to Watchlist</button>');
  if(key!=="serieswatched") items.push('<button type="button" data-act="series-state" data-state="hide" data-id="'+id+'">Not Interested</button>');
  if(key==="serieswatchlist") items.push('<button type="button" class="danger" data-act="series-state" data-state="remove" data-id="'+id+'">Remove from Watchlist</button>');
  if(key==="serieswatched") items.push('<button type="button" data-act="series-state" data-state="unwatch" data-id="'+id+'">Restore to suggestions</button>');
  return titleOverflow(s.title,items);
}
function seriesStateBadge(key){
  var labels={serieswatchlist:"WATCHLIST",serieswatching:"WATCHING",seriesnew:"NEW EPISODE",seriesupcoming:"UPCOMING",serieswatched:"WATCHED"};
  return labels[key]?'<span class="title-state state-'+key+'">'+labels[key]+'</span>':'';
}
function seriesCompactLinks(s){
  var q=s.title+" "+(s.year||"");
  return '<a class="btn compact-link" href="https://www.youtube.com/results?search_query='+encodeURIComponent(q+" trailer")+'" target="_blank" rel="noopener">&#9654; Trailer</a>'+seriesImdbLink(s);
}
function seriesLinks(title,year){
  var q=title+" "+(year||"");
  return '<a class="btn" href="https://www.google.com/search?q='+encodeURIComponent(q+" TV series")+'" target="_blank" rel="noopener">⌕ Google</a>'+
         '<a class="btn" href="https://www.youtube.com/results?search_query='+encodeURIComponent(q+" trailer")+'" target="_blank" rel="noopener">▶ Trailer</a>'+
         '<a class="btn" href="https://www.youtube.com/results?search_query='+encodeURIComponent(q+" review")+'" target="_blank" rel="noopener">★ Review</a>';
}
function seriesImdbLink(s){
  var url=s.imdbId ? ("https://www.imdb.com/title/"+s.imdbId+"/")
                   : ("https://www.imdb.com/find/?q="+encodeURIComponent(s.title+" "+(s.year||""))+"&s=tt");
  return '<a class="btn imdbbtn" href="'+url+'" target="_blank" rel="noopener">IMDb ↗</a>';
}
var seriesEpisodeRatingBusy={};
function applyEpisodeRatings(s,seasonNo,ratings){
  var key=s.id+":"+seasonNo,eps=seriesEpisodeCache[key];
  if(!eps||!ratings)return;
  eps.forEach(function(ep){
    var row=ratings[String(ep.n)];
    ep.imdbChecked=true;
    if(row){ep.imdb=row.rating;ep.imdbId=row.imdbId||"";}
  });
}
function ensureSeriesEpisodeRatings(s,seasonNo){
  if(!s||!s.imdbId||!seasonNo||!omdbKey())return;
  var cacheKey="season:"+s.imdbId+":"+seasonNo,cached=imdbCacheGet(cacheKey);
  if(cached){applyEpisodeRatings(s,seasonNo,cached.value);return;}
  if(seriesEpisodeRatingBusy[cacheKey])return;
  seriesEpisodeRatingBusy[cacheKey]=1;
  fetchWithPolicy("https://www.omdbapi.com/?apikey="+encodeURIComponent(omdbKey())+"&i="+encodeURIComponent(s.imdbId)+"&Season="+encodeURIComponent(seasonNo),{},{timeout:12000,retries:1})
    .then(function(r){return r.json();}).then(function(j){
      var ratings={};(j&&j.Episodes||[]).forEach(function(ep){
        ratings[String(ep.Episode)]={rating:ep.imdbRating&&ep.imdbRating!=="N/A"?parseFloat(ep.imdbRating):null,imdbId:ep.imdbID||""};
      });
      imdbCacheSet(cacheKey,ratings);applyEpisodeRatings(s,seasonNo,ratings);
    }).catch(function(){}).then(function(){delete seriesEpisodeRatingBusy[cacheKey];if(section==="series"&&String(seriesExpanded)===String(s.id))render();});
}
function ensureSeriesEpisodes(s, seasonNo){
  var tmdbId=s&&(s.tmdbId||s.id);
  if(!s||!tmdbId||!seasonNo||!tmdbKey()||!/^\d+$/.test(String(tmdbId))) return;
  var key=s.id+":"+seasonNo;
  if(seriesEpisodeCache[key] || seriesEpisodeBusy[key]) return;
  seriesEpisodeBusy[key]=1;
  tmdbGet("/tv/"+tmdbId+"/season/"+seasonNo, {}).then(function(j){
    seriesEpisodeCache[key]=(j.episodes||[]).map(function(e){
      return {n:e.episode_number, title:e.name||("Episode "+e.episode_number), overview:e.overview||"", air:e.air_date||""};
    });
    ensureSeriesEpisodeRatings(s,seasonNo);
    delete seriesEpisodeBusy[key];
    if(section==="series" && String(seriesExpanded)===String(s.id)) render();
  }).catch(function(){ delete seriesEpisodeBusy[key]; });
}
function seriesEpisodeBlock(s){
  if(!s) return "";
  var seasons=s.seasonList||[];
  if(!seasons.length && s.seasons){
    for(var i=1;i<=Number(s.seasons);i++) seasons.push({n:i,name:"Season "+i,episodes:0});
  }
  if(!seasons.length) return "";
  var sid=String(s.id), selected=seriesSeasonSel[sid]||String(seasons[0].n);
  ensureSeriesEpisodes(s, selected);
  ensureSeriesEpisodeRatings(s,selected);
  var key=s.id+":"+selected, eps=seriesEpisodeCache[key]||[];
  var epSel=seriesEpisodeSel[sid]||((eps[0]&&String(eps[0].n))||"");
  var h='<section class="episode-browser"><div class="detail-section-label">Episodes</div><div class="season-chipbar">'+seasons.map(function(se){return '<button class="season-chip '+(String(se.n)===String(selected)?"on":"")+'" data-act="series-season-pick" data-id="'+esc(sid)+'" data-season="'+se.n+'">'+esc(se.name)+(se.episodes?'<small>'+se.episodes+' episodes</small>':'')+'</button>';}).join("")+'</div>'+
    '<div class="episode-list">'+(eps.length?eps.map(function(ep){var rating=!omdbKey()?"—":ep.imdbChecked?(typeof ep.imdb==="number"?ep.imdb.toFixed(1):"—"):"…";return '<button class="episode-row '+(String(ep.n)===String(epSel)?"on":"")+'" data-act="series-episode-pick" data-id="'+esc(sid)+'" data-episode="'+ep.n+'"><b>E'+ep.n+'</b><span>'+esc(ep.title)+'</span><small>'+(ep.air?esc(fmt(ep.air)):"Air date TBC")+'</small><em class="episode-rating">IMDb '+rating+'</em></button>';}).join(""):'<div class="episode-loading">Loading episodes…</div>')+'</div>';
  var ep=eps.filter(function(e){ return String(e.n)===String(epSel); })[0];
  if(ep){
    h+='<div class="episode-summary"><div><b>S'+selected+' E'+ep.n+': '+esc(ep.title)+'</b>'+(ep.air?' <span>· '+fmt(ep.air)+'</span>':'')+(typeof ep.imdb==="number"?' <span class="episode-summary-rating">IMDb '+ep.imdb.toFixed(1)+' / 10</span>':'')+'</div><p>'+
      (ep.overview?esc(ep.overview):'No episode overview available from TMDB.')+'</p></div></section>'+
      episodePlotBlock(s,selected,ep);
    return h;
  }
  return h+'</section>';
}
function seriesReleaseMeta(s){
  var releases=normalizedReleases(s||{},"series");
  var next=releases.nextEpisode&&releases.nextEpisode.date||s&&s.nextEpisode&&s.nextEpisode.date||"";
  var digital=releases.digital&&releases.digital.date||s&&s.ottDate||"";
  var latest=releases.latestEpisode&&releases.latestEpisode.date||s&&s.latestDate||"";
  var first=releases.firstAir&&releases.firstAir.date||s&&s.date||"";
  var date=next||digital||latest||first;
  if(!date) return "";
  var day=parseD(date).toLocaleDateString("en-IN",{weekday:"long"});
  var label=next?"Next episode":digital?"OTT premiere":latest?"Latest episode":"First aired";
  var countdown=daysBetween(today(),parseD(date))>=0?releaseCountdown(date):"";
  return '<div class="media-release">'+label+': '+esc(fmt(date))+' · '+esc(day)+(countdown?'<br>'+countdown:'')+'</div>';
}
function seriesCardContext(s){
  var release=seriesReleaseMeta(s);
  if(release)return release;
  var bits=[];
  if(s.year)bits.push(s.year);
  if(s.seasons)bits.push(s.seasons+" season"+(Number(s.seasons)===1?"":"s"));
  if(s.providers&&s.providers.length)bits.push(s.providers.slice(0,2).join(" · "));
  return bits.length?'<div class="media-release media-context">'+esc(bits.join(" · "))+'</div>':'<div class="media-release media-context muted-context">Series details unavailable</div>';
}
function seriesMain(s){
  ensureMediaArtwork(s,"series");
  return mediaPoster(s.poster,s.title)+mediaSummary(s.title,mediaRatingLabel(s),genreLabel(s.genres,SERIES_GENRES),seriesCardContext(s));
}
var seriesSearchQ="", seriesSearchItems=[], seriesSearchBusy=false, seriesSearchSeq=0, seriesSearchTimer=null;
var seriesExpanded=null;
function searchSeries(qs){
  if(!tmdbKey()) return;
  var seq=++seriesSearchSeq; seriesSearchBusy=true;
  tmdbGet("/search/tv", {query:qs, include_adult:"false", page:1}).then(function(j){
    if(seq!==seriesSearchSeq) return;
    seriesSearchItems=(j.results||[]).filter(function(s){ return s.name; }).slice(0,12).map(mapSeries);
    seriesSearchBusy=false; renderSeriesKeepSearch();
  }).catch(function(){ if(seq===seriesSearchSeq){ seriesSearchBusy=false; renderSeriesKeepSearch(); } });
}
function renderSeriesKeepSearch(){
  if(section!=="series") return;
  var el=document.getElementById("swSearch");
  var had=el && document.activeElement===el, pos=had?el.selectionStart:0;
  renderContentHtml(renderSeries());
  if(had){ var n=document.getElementById("swSearch"); if(n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch(e){} } }
  tvAfterRender();
}
function findSearchSeries(id){ for(var i=0;i<seriesSearchItems.length;i++){ if(String(seriesSearchItems[i].id)===String(id)) return seriesSearchItems[i]; } return null; }
function findWatchlistSeries(id){ return (data.seriesWatchlist||[]).filter(function(x){ return String(x.id)===String(id); })[0]||null; }
function inSeriesWatchlist(s){ return (data.seriesWatchlist||[]).some(function(x){ return String(x.id)===String(s.id); }); }
function addSeriesWatchlist(s){
  if(!s) return;
  var undo=captureVaultLists(["seriesWatchlist","watchingSeries","hiddenSeries"]);
  if(!data.seriesWatchlist) data.seriesWatchlist=[];
  data.hiddenSeries=(data.hiddenSeries||[]).filter(function(x){ return seriesKey(x)!==seriesKey(s); });
  data.watchingSeries=(data.watchingSeries||[]).filter(function(x){ return seriesKey(x)!==seriesKey(s); });
  if(inSeriesWatchlist(s)){ flash("Already in your series watchlist"); return; }
  data.seriesWatchlist.unshift(normalizeStoredRecord({key:seriesKey(s), id:s.id, title:s.title, year:s.year||"", poster:s.poster||"",
    imdb:(typeof s.imdb==="number"?s.imdb:null), imdbId:s.imdbId||null, tmdb:s.tmdb||null,
    overview:s.overview||"", genres:s.genres||[], date:s.date||"", latestDate:s.latestDate||"", seasons:s.seasons||"", seasonList:s.seasonList||[], providers:s.providers||[], releases:normalizedReleases(s,"series"), added:Date.now()},"series"));
  commitVaultUndo(undo,"Added to your series watchlist");
}
function removeSeriesWatchlist(id){
  var undo=captureVaultLists(["seriesWatchlist"]);
  data.seriesWatchlist=(data.seriesWatchlist||[]).filter(function(x){ return String(x.id)!==String(id); });
  commitVaultUndo(undo,"Removed from watchlist");
}
function seriesDetailPage(s,key){
  refreshImdbIfStale(s);
  var actions='<div class="actions detail-actionbar">'+seriesPrimaryAction(s,key,false)+seriesMoreMenu(s,key);
  if(key!=="serieswatched") actions+=seriesRatingDots(s);
  actions+=seriesLinks(s.title,s.year)+((key==="enseries"||key==="serieswatchlist"||key==="serieswatched")?reeloadReviewLink(s.title,s.year,"series"):"")+seriesImdbLink(s)+
    '<button class="btn" data-act="ai-open" data-ai-type="series" data-id="'+esc(String(s.id))+'">AI Assistant</button>'+
    '<a class="btn" href="https://www.themoviedb.org/tv/'+s.id+'" target="_blank" rel="noopener">TMDB</a>';
  actions+='</div>';
  return '<div class="media-page">'+mediaPageHero("series",s,SERIES_GENRES,key)+seriesReleaseMeta(s)+'<div class="detail-section-label">Library &amp; links</div>'+actions+mediaProvidersBlock(s)+seriesEpisodeBlock(s)+aiPanel("series",s)+'</div>';
}
function seriesSearchCard(s){
  return seriesCard(s,"seriessearch");
}
function seriesCard(s, key){
  return '<div class="card media-card">'+seriesStateBadge(key)+'<div class="media-main clickrow" role="button" tabindex="0" data-act="sr-toggle" data-id="'+esc(String(s.id))+'">'+seriesMain(s)+'</div><div class="media-card-actions">'+seriesPrimaryAction(s,key,true)+seriesCompactLinks(s)+seriesMoreMenu(s,key)+'</div></div>';
}
function renderSeries(){
  var key=seriesTab;
  var blurbs={
    enseries:"Highly rated and critically acclaimed English TV series. Your ratings push better matches to the top.",
    mlseries:"Curated high-production or highly rated Malayalam TV series, newest first. Films, television serials and YouTube programmes are excluded.",
    taseries:"Curated high-production or highly rated Tamil TV series, newest first. Films, television serials and YouTube programmes are excluded.",
    hiseries:"Curated high-production or highly rated Hindi TV series, newest first. Films, television serials and YouTube programmes are excluded.",
    serieswatchlist:"Search any TV show on the internet and save it for later.",
    serieswatching:"TV shows you are currently watching. Move a show here from its action menu.",
    seriesnew:"Recent episodes from TV shows in your Watching list.",
    seriesupcoming:"Popular new TV shows with confirmed upcoming premiere dates.",
    seriesdiscover:"Highly rated TV shows across English, Malayalam, Tamil and Hindi, shaped by your ratings.",
    serieswatched:"Series you've marked as watched. They stay hidden from the other lists after refresh and sync."
  };
  var selectedSeries=seriesExpanded?findSeriesAny(seriesExpanded):null;
  if(selectedSeries){
    if(!(plotKey(seriesPlotName(selectedSeries),"TV series") in plotCache) && !plotPending[plotKey(seriesPlotName(selectedSeries),"TV series")]) ensurePlot(seriesPlotName(selectedSeries),"TV series");
    return seriesDetailPage(selectedSeries,key);
  }
  if(key==="serieswatchlist"){
    var wl=applyMediaSort((data.seriesWatchlist||[]).filter(function(s){ return matchMediaYear(s, seriesYear); }).slice().sort(newerFirst),"series");
    var hidden=data.hiddenSeries||[];
    var hset=hiddenSeriesKeys();
    var wh='<div class="toolbar" style="margin-top:14px"><select class="selectmini series-year" title="Filter by year">'+yearOptions(seriesYear)+'</select>'+mediaSortSelect("series")+'<div class="searchwrap"><span class="sic">⌕</span>'+
      '<input class="tab-search" id="swSearch" placeholder="Search any TV series to add..." value="'+esc(seriesSearchQ)+'" autocomplete="off">'+
      (seriesSearchQ?'<button class="sclear" data-act="sw-clear" title="Clear">×</button>':'')+'</div></div>'+
      mediaViewToggle("series")+
      '<div class="meta" style="margin-bottom:10px">'+blurbs.serieswatchlist+'</div>';
    if(!tmdbKey()) return wh+'<div class="empty">Add your free <b>TMDB API key</b> in Settings to search TV series.</div>';
    if(seriesSearchQ.trim().length>=2){
      wh+='<div class="sechead">Search results</div>';
      if(seriesSearchBusy && !seriesSearchItems.length) wh+='<div class="empty">Searching the internet...</div>';
      else if(!seriesSearchItems.length) wh+='<div class="empty">No series match "'+esc(seriesSearchQ)+'".</div>';
      else{ wh+='<div class="'+mediaWrapClass("series")+'">'; seriesSearchItems.filter(function(s){ return !hset[seriesKey(s)] && matchMediaYear(s, seriesYear); }).forEach(function(s){ wh+=seriesSearchCard(s); }); wh+='</div>'; }
    }
    wh+='<div class="sechead">My Series Watchlist - '+wl.length+'</div>';
    if(!wl.length) wh+='<div class="empty">Your series watchlist is empty. Search above and tap <b>+ Add</b>.</div>';
    else{ wh+='<div class="'+mediaWrapClass("series")+'">'; wl.forEach(function(s){ wh+=seriesCard(s,"serieswatchlist"); }); wh+='</div>'; }
    if(hidden.length){
      wh+='<div class="sechead">Not Interested · '+hidden.length+'</div><div class="cards">';
      hidden.forEach(function(s){
        wh+='<div class="card hist"><div class="row">'+seriesPoster(s)+'<div class="grow"><div class="gname">'+esc(s.title)+'</div><div class="meta">'+(s.year||"")+'</div></div><button class="btn blue" data-act="sr-unhide" data-key="'+esc(s.key)+'">Restore</button></div></div>';
      });
      wh+='</div>';
    }
    return wh;
  }
  if(key==="serieswatching"||key==="seriesnew"){
    var personal=(data.watchingSeries||[]).filter(function(s){return matchMediaYear(s,seriesYear);}).slice();
    if(key==="seriesnew"){
      var cutoff=daysAgoISO(45);
      personal=personal.filter(function(s){return s.latestDate&&s.latestDate>=cutoff;}).sort(function(a,b){return (b.latestDate||"").localeCompare(a.latestDate||"");});
    }else personal.sort(newerFirst);
    personal=applyMediaSort(personal,"series");
    var po='<div class="toolbar" style="margin-top:14px"><select class="selectmini series-year" title="Filter by year">'+yearOptions(seriesYear)+'</select>'+mediaSortSelect("series")+'<button class="btn blue" data-act="series-refresh"'+(seriesBusy[key]?' disabled':'')+'>'+(seriesBusy[key]?"Updating...":"↻ Check for new episodes")+'</button></div>'+mediaViewToggle("series")+'<div class="meta" style="margin:14px 0 10px">'+blurbs[key]+'</div>';
    if(!personal.length) return po+'<div class="empty">'+(key==="seriesnew"?"No episodes were released in the last 45 days for shows in Watching.":"Nothing is currently marked Watching. Open a show and choose Watching from its menu.")+'</div>';
    po+='<div class="'+mediaWrapClass("series")+'">'; personal.forEach(function(s){po+=seriesCard(s,key);}); return po+'</div>';
  }
  if(key==="serieswatched"){
    var ws=applyMediaSort((data.watchedSeries||[]).filter(function(s){ return matchMediaYear(s, seriesYear); }).slice().sort(newerFirst),"series");
    var out='<div class="toolbar" style="margin-top:14px"><select class="selectmini series-year" title="Filter by year">'+yearOptions(seriesYear)+'</select>'+mediaSortSelect("series")+'</div>'+mediaViewToggle("series")+'<div class="meta" style="margin:14px 0 10px">'+blurbs.serieswatched+'</div>';
    if(!ws.length) return out+'<div class="empty">No watched series yet. Pick <b>✓ Watched</b> from any series dropdown to file it here.</div>';
    out+='<div class="'+mediaWrapClass("series")+'">'; ws.forEach(function(s){ out+=seriesCard(s,"serieswatched"); }); return out+'</div>';
  }
  var last=seriesCacheEntry(key);
  var html='<div class="toolbar" style="margin-top:14px">'+
    (key==="seriesupcoming"?'<select class="selectmini series-language" title="Filter by language">'+seriesLanguageOptions(seriesLanguage)+'</select>':'')+
    '<select class="selectmini series-genre" title="Filter by genre">'+genreOptions(SERIES_GENRES, seriesGenre)+'</select>'+
    '<select class="selectmini series-year" title="Filter by year">'+yearOptions(seriesYear)+'</select>'+
    '<select class="selectmini series-provider" title="Filter by streaming platform">'+providerOptions(seriesProvider)+'</select>'+
    mediaSortSelect("series")+
    '<button class="btn blue" data-act="series-refresh"'+(seriesBusy[key]?' disabled':'')+'>'+(seriesBusy[key]?"Updating...":"↻ Refresh from internet")+'</button>'+
    '<span class="syncnote" data-media-refresh="series" style="align-self:center">'+(last?("Updated "+new Date(last.t).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})):"")+'</span>'+
    '</div>'+mediaViewToggle("series")+'<div class="meta" style="margin-bottom:10px">'+blurbs[key]+'</div>';
  if(!tmdbKey()) return html+'<div class="empty">Add your free <b>TMDB API key</b> in Settings to load TV series.</div>';
  if(seriesBusy[key] && !last) return html+loadingSkeletons("media",8);
  if(seriesErr[key] && !last) return html+'<div class="empty">Could not load - check your internet and API key, then <button class="btn" data-act="series-refresh">↻ Try again</button></div>';
  var wset=watchedSeriesKeys();
  var wlset=watchlistSeriesKeys();
  var wingSet=watchingSeriesKeys();
  var hset2=hiddenSeriesKeys();
  var items=((last&&last.items)||[]).filter(function(s){
    var sk=seriesKey(s);
    var regionalOk=(key!=="mlseries"&&key!=="taseries"&&key!=="hiseries")||
      (regionalTvSeriesOnly(s,key==="mlseries"?"ml":key==="taseries"?"ta":"hi")&&regionalPrestigeSeries(s));
    return regionalOk && matchMediaYear(s, seriesYear) && !wset[sk] && !wlset[sk] && !wingSet[sk] && !hset2[sk];
  });
  if(key==="seriesupcoming") items.sort(function(a,b){return (a.date||"").localeCompare(b.date||"");});
  else if(key==="mlseries"||key==="taseries"||key==="hiseries") items.sort(function(a,b){return (b.latestDate||b.date||"").localeCompare(a.latestDate||a.date||"");});
  else items.sort(function(a,b){ return (b.imdb||b.tmdb||0)-(a.imdb||a.tmdb||0); });
  items=applyMediaSort(items,"series");
  if(!items.length){
    return html+'<div class="empty">'+(seriesBusy[key]?"Loading...":(last?"Nothing left here - everything shown is marked Watched.":"Nothing to show yet - tap Refresh."))+'</div>';
  }
  html+='<div class="'+mediaWrapClass("series")+'">'; items.forEach(function(s){ html+=seriesCard(s,key); }); html+='</div>';
  return html;
}
function switchSeriesTab(next){
  tabScroll["series:"+seriesTab]=window.scrollY;
  seriesTab=next; seriesExpanded=null; try{ localStorage.setItem(SERIESTAB_KEY,next); }catch(e){}
  render();
  window.scrollTo(0, tabScroll["series:"+next]||0);
  ensureSeries(next);
  scheduleMediaWarmup("series",next);
}
function switchFilmTab(next){
  tabScroll["film:"+filmTab]=window.scrollY;
  filmTab=next; filmExpanded=null; try{ localStorage.setItem(FILMTAB_KEY,next); }catch(e){}
  render();
  window.scrollTo(0, tabScroll["film:"+next]||0);
  ensureFilms(next);
  if(next==="mlott") ensureFilms("mlup");
  scheduleMediaWarmup("films",next);
}
function switchPlexTab(next){
  tabScroll["plex:"+plexTab]=window.scrollY;
  plexTab=next; plexExpanded=null; try{ localStorage.setItem("gamevault-plex-tab",next); }catch(e){}
  render();
  window.scrollTo(0,tabScroll["plex:"+next]||0);
}
function switchSection(s,userGesture){
  if(section===s) return;
  if(section==="films") tabScroll["film:"+filmTab]=window.scrollY;
  else if(section==="series") tabScroll["series:"+seriesTab]=window.scrollY;
  else if(section==="plex") tabScroll["plex:"+plexTab]=window.scrollY;
  else if(section==="biglybt") tabScroll.biglybt=window.scrollY;
  else if(section==="health") tabScroll["health:"+healthTab]=window.scrollY;
  else if(section==="finance") tabScroll["finance:"+financeTab]=window.scrollY;
  else if(section==="library"||section==="home") tabScroll[section]=window.scrollY;
  else tabScroll[tab]=window.scrollY;
  section=s; try{ localStorage.setItem(SECTION_KEY,s); }catch(e){}
  expandedId=null; filmExpanded=null; seriesExpanded=null; plexExpanded=null;
  [].forEach.call(document.querySelectorAll("#sectionSw button"),function(b){
    var active=b.getAttribute("data-section")===s;
    b.classList.toggle("on",active);
    if(active) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current");
  });
  var autoFinanceUnlock=!!(userGesture&&s==="finance"&&typeof financeShouldAutoUnlock==="function"&&financeShouldAutoUnlock());
  if(autoFinanceUnlock)financeUnlockFace();else render();
  window.scrollTo(0, section==="films" ? (tabScroll["film:"+filmTab]||0) : section==="series" ? (tabScroll["series:"+seriesTab]||0) : section==="plex" ? (tabScroll["plex:"+plexTab]||0) : section==="biglybt" ? (tabScroll.biglybt||0) : section==="health" ? (tabScroll["health:"+healthTab]||0) : section==="finance" ? (tabScroll["finance:"+financeTab]||0) : (section==="library"||section==="home") ? (tabScroll[section]||0) : (tabScroll[tab]||0));
  if(section==="films") ensureFilms(filmTab);
  if(section==="films") scheduleMediaWarmup("films",filmTab);
  if(section==="series"){ ensureSeries(seriesTab); scheduleMediaWarmup("series",seriesTab); }
  if(section==="games") scheduleGameWarmup(tab);
  if(section==="plex" && plexServerUrl() && plexToken() && !plexItems.length) plexRefresh();
}
document.getElementById("sectionSw").addEventListener("click",function(e){
  var b=e.target.closest("[data-section]"); if(b) switchSection(b.getAttribute("data-section"),true);
});
document.getElementById("recentStrip").addEventListener("click",function(e){
  var b=e.target.closest('[data-act="recent-open"]');
  if(b) openRecent(b.getAttribute("data-kind"),b.getAttribute("data-id"),b.getAttribute("data-subtab")||"");
});

/* ---------- Windows desktop command palette + keyboard navigation ---------- */
var commandSelection=0,commandVisibleItems=[];
function commandNorm(value){return String(value||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
function commandPush(list,seen,item){
  if(!item||!item.title) return;
  var key=[item.kind,item.id||item.section||"",item.tab||"",item.title].join(":");
  if(seen[key]) return;
  seen[key]=1;list.push(item);
}
function commandCandidates(){
  var list=[],seen={};
  [
    ["games","🎮","Games"],["films","🎬","Movies"],["series","📺","TV Shows"],
    ["plex","▶","Plex Library"],["biglybt","⇩","BiglyBT"],["finance","₹","Finance"],["health","♥","Health"]
  ].forEach(function(x){commandPush(list,seen,{kind:"section",section:x[0],icon:x[1],title:x[2],meta:"Main section",label:"Page"});});
  var pages=[
    ["games","rentals","Rentals"],["games","playing","Now Playing"],["games","queue","Rental Queue"],
    ["games","upcoming","Upcoming Game Releases"],["games","suggest","Game Discover"],["games","played","Completed Games"],
    ["films","watchlist","Movie Watchlist"],["films","uphw","Coming Soon Movies"],["films","bluray","New on Blu-ray"],
    ["films","relhw","Movie Discover"],["films","mlott","Malayalam OTT"],["films","watched","Watched Movies"],
    ["series","serieswatchlist","TV Watchlist"],["series","serieswatching","Watching TV Shows"],
    ["series","seriesnew","New Episodes"],["series","seriesupcoming","Upcoming TV Shows"],
    ["series","enseries","English TV Shows"],["series","mlseries","Malayalam TV Shows"],
    ["series","taseries","Tamil TV Shows"],["series","hiseries","Hindi TV Shows"],
    ["series","serieswatched","Watched TV Shows"],
    ["plex","home","Plex Home"],["plex","continue","Plex Continue Watching"],["plex","movies","Plex Movies"],
    ["plex","shows","Plex TV Shows"],["plex","recent","Recently Added to Plex"],
    ["health","healthoverview","Health Overview"],["health","healthfood","Food and Activity"],["health","healthlabs","Lab Trends"],
    ["finance","financeoverview","Finance Monthly Summary"],["finance","financetransactions","Finance Details"],["finance","financeloans","EMI and Recurring Payments"],["finance","financestatements","Finance Gmail Sync"]
  ];
  pages.forEach(function(x){commandPush(list,seen,{kind:"page",section:x[0],tab:x[1],icon:"↗",title:x[2],meta:"Open page",label:"Page"});});
  [
    [data.rentals||[],"rentals","Rental"],[data.playing||[],"playing","Now Playing"],
    [data.queue||[],"queue","Rental Queue"],[data.upcoming||[],"upcoming","Upcoming Game"],
    [data.played||[],"played","Completed Game"]
  ].forEach(function(group){group[0].forEach(function(x){commandPush(list,seen,{kind:"game",id:String(x.id||""),tab:group[1],icon:"🎮",title:x.name,meta:group[2],label:"Game"});});});
  [data.movieWatchlist||[],data.watchingMovies||[],data.watchedMovies||[]].forEach(function(items,idx){var tabs=["watchlist","watching","watched"],meta=["Movie watchlist","Watching movie","Watched movie"];items.forEach(function(x){commandPush(list,seen,{kind:"film",id:String(x.id||""),tab:tabs[idx],icon:"🎬",title:x.title,meta:meta[idx],label:"Movie"});});});
  Object.keys(filmCache||{}).forEach(function(cacheKey){var key=cacheKey.split("|")[0],destination=key==="mlup"?"mlott":key;if(FILM_ORDER.indexOf(destination)<0)destination="relhw";((filmCache[cacheKey]&&filmCache[cacheKey].items)||[]).slice(0,180).forEach(function(x){commandPush(list,seen,{kind:"film",id:String(x.id||""),tab:destination,icon:"🎬",title:x.title,meta:"Movies · "+(key==="uphw"?"Coming Soon":key==="bluray"?"Blu-ray":key==="mlott"||key==="mlup"?"Malayalam OTT":"Discover"),label:"Movie"});});});
  [data.seriesWatchlist||[],data.watchingSeries||[],data.watchedSeries||[]].forEach(function(items,idx){var tabs=["serieswatchlist","serieswatching","serieswatched"];items.forEach(function(x){commandPush(list,seen,{kind:"series",id:String(x.id||""),tab:tabs[idx],icon:"📺",title:x.title,meta:idx===0?"TV watchlist":idx===1?"Watching":"Watched TV show",label:"TV"});});});
  Object.keys(seriesCache||{}).forEach(function(cacheKey){var key=cacheKey.split("|")[0],destination=SERIES_ORDER.indexOf(key)>=0?key:"enseries";((seriesCache[cacheKey]&&seriesCache[cacheKey].items)||[]).slice(0,180).forEach(function(x){commandPush(list,seen,{kind:"series",id:String(x.id||""),tab:destination,icon:"📺",title:x.title,meta:"TV Shows · Discover",label:"TV"});});});
  (plexItems||[]).forEach(function(x){commandPush(list,seen,{kind:"plex",id:String(x.ratingKey||""),tab:x.type==="show"?"shows":"movies",icon:"▶",title:x.title,meta:"Plex "+(x.type==="show"?"TV Show":"Movie"),label:"Plex"});});
  return list;
}
function renderCommandPalette(query){
  var box=document.getElementById("commandResults");if(!box)return;
  var q=commandNorm(query),tokens=q?q.split(/\s+/):[];
  var items=commandCandidates().filter(function(item){
    if(!tokens.length) return item.kind==="section"||item.kind==="page";
    var hay=commandNorm([item.title,item.meta,item.label].join(" "));
    return tokens.every(function(t){return hay.indexOf(t)>=0;});
  });
  commandVisibleItems=items.slice(0,tokens.length?18:12);
  commandSelection=Math.max(0,Math.min(commandSelection,commandVisibleItems.length-1));
  if(!commandVisibleItems.length){box.innerHTML='<div class="command-empty">No matching page or saved title</div>';return;}
  box.innerHTML=commandVisibleItems.map(function(item,i){return '<button class="command-item'+(i===commandSelection?' on':'')+'" type="button" role="option" aria-selected="'+(i===commandSelection?'true':'false')+'" data-command-index="'+i+'"><span class="command-item-icon">'+item.icon+'</span><span><span class="command-item-title">'+esc(item.title)+'</span><span class="command-item-meta">'+esc(item.meta||"")+'</span></span><span class="command-item-kind">'+esc(item.label||item.kind)+'</span></button>';}).join("");
  var selected=box.querySelector(".command-item.on");if(selected)selected.scrollIntoView({block:"nearest"});
}
function openCommandPalette(seed){
  if(!desktopMode())return;
  setMenuOpen(false);toggleSettings(false);
  var palette=document.getElementById("commandPalette"),input=document.getElementById("commandInput");
  palette.hidden=false;document.body.classList.add("command-open");commandSelection=0;input.value=seed||"";
  renderCommandPalette(input.value);setTimeout(function(){input.focus();input.select();},0);
}
function closeCommandPalette(restoreFocus){
  var palette=document.getElementById("commandPalette");if(!palette||palette.hidden)return;
  palette.hidden=true;document.body.classList.remove("command-open");
  if(restoreFocus!==false){var b=document.getElementById("commandBtn");if(b)b.focus();}
}
function openCommandItem(item){
  if(!item)return;closeCommandPalette(false);
  if(item.kind==="section"){switchSection(item.section);return;}
  if(item.kind==="page"){
    if(section!==item.section)switchSection(item.section);
    if(item.section==="games")switchTab(item.tab);
    else if(item.section==="films")switchFilmTab(item.tab);
    else if(item.section==="series")switchSeriesTab(item.tab);
    else if(item.section==="plex")switchPlexTab(item.tab);
    else if(item.section==="health"){healthTab=item.tab;render();}
    else if(item.section==="finance"){financeTab=item.tab;render();}
    return;
  }
  if(item.kind==="game"){
    if(section!=="games")switchSection("games");if(tab!==item.tab)switchTab(item.tab);
    gameView="grid";try{localStorage.setItem(GAME_VIEW_KEY,"grid");}catch(e){} expandedId=item.id;render();window.scrollTo(0,0);return;
  }
  if(item.kind==="film"){
    if(section!=="films")switchSection("films");if(filmTab!==item.tab)switchFilmTab(item.tab);
    filmExpanded=item.id;var movie=findMovieAny(item.id);if(movie)ensurePlot(moviePlotName(movie),"film");render();window.scrollTo(0,0);return;
  }
  if(item.kind==="series"){
    if(section!=="series")switchSection("series");if(seriesTab!==item.tab)switchSeriesTab(item.tab);
    seriesExpanded=item.id;render();window.scrollTo(0,0);return;
  }
  if(item.kind==="plex"){
    if(section!=="plex")switchSection("plex");plexSearch=item.title;switchPlexTab(item.tab);return;
  }
}
function desktopTabs(){return section==="films"?FILM_ORDER:section==="series"?SERIES_ORDER:section==="plex"?PLEX_ORDER:section==="health"?["healthoverview","healthfood","healthlabs"]:section==="finance"?["financeoverview","financetransactions","financeloans","financestatements"]:section==="biglybt"?[]:TAB_ORDER;}
function desktopOpenTabByIndex(index){
  var order=desktopTabs(),next=order[index];if(!next)return;
  if(section==="films")switchFilmTab(next);else if(section==="series")switchSeriesTab(next);else if(section==="plex")switchPlexTab(next);else if(section==="health"){healthTab=next;render();}else if(section==="finance"){financeTab=next;render();}else switchTab(next);
}
var desktopRailBtn=document.getElementById("desktopRailBtn");
if(desktopRailBtn)desktopRailBtn.addEventListener("click",function(){try{localStorage.setItem(DESKTOP_RAIL_KEY,desktopRailCollapsed()?"0":"1");}catch(e){}applyDesktopShell();});
var desktopRailTheme=document.getElementById("desktopRailTheme");
if(desktopRailTheme)desktopRailTheme.addEventListener("click",function(){var b=document.getElementById("themeBtn");if(b)b.click();});
var desktopRailSettings=document.getElementById("desktopRailSettings");
if(desktopRailSettings)desktopRailSettings.addEventListener("click",function(){toggleSettings(true);});
var desktopRailSync=document.getElementById("desktopRailSync");
if(desktopRailSync)desktopRailSync.addEventListener("click",function(){if(cloudMode())silentPullOnLoad();else toggleSettings(true);});
var commandBtn=document.getElementById("commandBtn"),commandCloseBtn=document.getElementById("commandCloseBtn"),commandInput=document.getElementById("commandInput"),commandResults=document.getElementById("commandResults"),commandPalette=document.getElementById("commandPalette");
if(commandBtn)commandBtn.addEventListener("click",function(){openCommandPalette("");});
if(commandCloseBtn)commandCloseBtn.addEventListener("click",function(){closeCommandPalette(true);});
if(commandInput){
  commandInput.addEventListener("input",function(){commandSelection=0;renderCommandPalette(this.value);});
  commandInput.addEventListener("keydown",function(e){
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();if(commandVisibleItems.length){commandSelection=(commandSelection+(e.key==="ArrowDown"?1:-1)+commandVisibleItems.length)%commandVisibleItems.length;renderCommandPalette(this.value);}return;}
    if(e.key==="Enter"){e.preventDefault();openCommandItem(commandVisibleItems[commandSelection]);return;}
    if(e.key==="Escape"){e.preventDefault();closeCommandPalette(true);}
  });
}
if(commandResults)commandResults.addEventListener("click",function(e){var b=e.target.closest("[data-command-index]");if(b)openCommandItem(commandVisibleItems[Number(b.getAttribute("data-command-index"))]);});
if(commandPalette)commandPalette.addEventListener("mousedown",function(e){if(e.target===commandPalette)closeCommandPalette(true);});
document.addEventListener("keydown",function(e){
  if(!desktopMode())return;
  var editable=e.target&&/^(INPUT|TEXTAREA|SELECT)$/i.test(e.target.tagName);
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();openCommandPalette("");return;}
  if(e.key==="Escape"){
    var helpOv=document.getElementById("shortcutsHelp");
    if(helpOv && !helpOv.hidden){e.preventDefault();toggleShortcutsHelp(false);return;}
    if(!document.getElementById("commandPalette").hidden){e.preventDefault();closeCommandPalette(true);return;}
    if(document.body.classList.contains("settings-open")){e.preventDefault();toggleSettings(false);document.getElementById("menuBtn").focus();return;}
    if(document.body.classList.contains("menu-open")){e.preventDefault();setMenuOpen(false);document.getElementById("menuBtn").focus();return;}
    var close=document.querySelector('[data-act="media-close"]');if(close){e.preventDefault();close.click();return;}
  }
  if(editable)return;
  if(e.key==="?"&&!e.ctrlKey&&!e.altKey&&!e.metaKey){e.preventDefault();toggleShortcutsHelp();return;}
  if(!e.ctrlKey&&!e.altKey&&!e.metaKey&&(e.key.toLowerCase()==="w"||e.key.toLowerCase()==="l")){
    if(section==="films"&&filmExpanded){
      var km=findMovieAny(filmExpanded);if(km){e.preventDefault();var kmi=filmExpanded;closeMediaStateDetail("film",kmi);if(e.key.toLowerCase()==="w")markMovieWatched(km);else addToWatchlist(km);restoreDetailScroll(filmDetailReturnY);return;}
    }
    if(section==="series"&&seriesExpanded){
      var ks=findSeriesAny(seriesExpanded);if(ks){e.preventDefault();var ksi=seriesExpanded;closeMediaStateDetail("series",ksi);if(e.key.toLowerCase()==="w")markSeriesWatched(ks);else addSeriesWatchlist(ks);restoreDetailScroll(seriesDetailReturnY);return;}
    }
  }
  if(e.key==="/"&&!e.ctrlKey&&!e.altKey&&!e.metaKey){var search=[].filter.call(document.querySelectorAll(".searchwrap input"),function(x){return x.offsetParent!==null;})[0];if(search){e.preventDefault();search.focus();search.select();}return;}
  if(e.altKey&&!e.ctrlKey&&/^[1-6]$/.test(e.key)){
    e.preventDefault();var n=Number(e.key)-1;
    if(e.shiftKey)desktopOpenTabByIndex(n);else{var sections=["games","films","series","plex","biglybt","finance","health"];if(sections[n])switchSection(sections[n]);}
  }
});

/* ---------- keyboard shortcuts help overlay (desktop, "?") ---------- */
function toggleShortcutsHelp(force){
  var ov=document.getElementById("shortcutsHelp");
  if(!ov){
    ov=document.createElement("div");
    ov.id="shortcutsHelp";
    ov.className="shortcuts-help";
    ov.hidden=true;
    ov.setAttribute("role","dialog");
    ov.setAttribute("aria-modal","true");
    ov.setAttribute("aria-label","Keyboard shortcuts");
    ov.innerHTML=
      '<div class="shortcuts-panel">'+
        '<div class="shortcuts-head"><strong>Keyboard shortcuts</strong><button class="iconbtn" data-shortcuts-close title="Close" aria-label="Close">&#10005;</button></div>'+
        '<div class="shortcuts-grid">'+
          '<span><kbd>Ctrl</kbd><kbd>K</kbd></span><span>Search everything</span>'+
          '<span><kbd>/</kbd></span><span>Focus the page search box</span>'+
          '<span><kbd>Alt</kbd><kbd>1</kbd>&#8211;<kbd>7</kbd></span><span>Switch section (Games &#8594; Health)</span>'+
          '<span><kbd>Alt</kbd><kbd>Shift</kbd><kbd>1</kbd>&#8211;<kbd>7</kbd></span><span>Open the Nth tab in this section</span>'+
          '<span><kbd>W</kbd></span><span>Mark open movie / show as Watched</span>'+
          '<span><kbd>L</kbd></span><span>Add open movie / show to Watchlist</span>'+
          '<span><kbd>Enter</kbd> / <kbd>Space</kbd></span><span>Activate the focused card</span>'+
          '<span><kbd>Esc</kbd></span><span>Close dialogs, details and menus</span>'+
          '<span><kbd>?</kbd></span><span>Show or hide this help</span>'+
        '</div>'+
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener("click",function(ev){
      if(ev.target===ov || ev.target.closest("[data-shortcuts-close]")) toggleShortcutsHelp(false);
    });
  }
  var show=(typeof force==="boolean")?force:ov.hidden;
  ov.hidden=!show;
  if(show){ var btn=ov.querySelector("[data-shortcuts-close]"); if(btn) btn.focus(); }
}

/* ---------- actions ---------- */
function byId(arr,id){ for(var i=0;i<arr.length;i++) if(arr[i].id===id) return arr[i]; return null; }
function toggleSettings(force){
  var box=document.getElementById("settingsBox");
  var show=(typeof force==="boolean")?force:(box.style.display==="none");
  box.style.display=show?"block":"none";
  document.body.classList.toggle("settings-open",show);
  if(show) setMenuOpen(false);
  if(show){
    document.getElementById("apiKeyInput").value=getKey();
    document.getElementById("tmdbKeyInput").value=tmdbKey();
    document.getElementById("omdbKeyInput").value=omdbKey();
    document.getElementById("gdClientInput").value=gdClientId();
    var biglyProxy=document.getElementById("biglyProxyInput");
    if(biglyProxy) biglyProxy.value=biglyProxyUrl();
    var biglyFolderIn=document.getElementById("biglyFolderInput");
    if(biglyFolderIn) biglyFolderIn.value=biglyFolder();
    var plexUrlInput=document.getElementById("plexUrlInput"), plexTokenInput=document.getElementById("plexTokenInput"), plexStatus=document.getElementById("plexSettingsStatus");
    if(plexUrlInput) plexUrlInput.value=plexServerUrl();
    if(plexTokenInput) plexTokenInput.value=plexToken();
    if(plexStatus) plexStatus.textContent=plexServerUrl()&&plexToken()?(plexConnected?"Connected to Plex on this device.":"Plex is configured; refresh when the Shield is reachable."):"Not configured.";
    gdSetStatus();
    var densityInput=document.getElementById("densityInput"); if(densityInput) densityInput.value=uiDensity;
    var healthCloudInput=document.getElementById("healthCloudInput"); if(healthCloudInput) healthCloudInput.checked=healthCloudSyncEnabled();
    var alertsChk=document.getElementById("alertsInput"); if(alertsChk) alertsChk.checked=alertsOn();
    refreshRecoveryUi();
  }
  if(desktopMode()){
    if(show)setTimeout(function(){var close=document.getElementById("settingsCloseBtn");if(close)close.focus();},0);
    else{var menu=document.getElementById("menuBtn");if(menu&&document.activeElement&&document.activeElement.closest&&document.activeElement.closest("#settingsBox"))menu.focus();}
  }
}

function setMenuOpen(show){
  var panel=document.getElementById("menuPanel");
  panel.classList.toggle("open",!!show);
  document.body.classList.toggle("menu-open",!!show);
  document.getElementById("menuBtn").setAttribute("aria-expanded",show?"true":"false");
  if(show&&desktopMode())setTimeout(function(){var first=panel.querySelector("button:not([style*='display:none'])");if(first)first.focus();},0);
}
document.getElementById("menuBtn").setAttribute("aria-expanded","false");
document.getElementById("menuBtn").addEventListener("click",function(){
  setMenuOpen(!document.getElementById("menuPanel").classList.contains("open"));
});
document.addEventListener("mousedown",function(e){
  if(!desktopMode()||!document.body.classList.contains("menu-open"))return;
  if(!e.target.closest("#menuPanel")&&!e.target.closest("#menuBtn"))setMenuOpen(false);
});
var menuCloseBtn=document.getElementById("menuCloseBtn");
if(menuCloseBtn) menuCloseBtn.addEventListener("click",function(){setMenuOpen(false);});
var settingsCloseBtn=document.getElementById("settingsCloseBtn");
if(settingsCloseBtn) settingsCloseBtn.addEventListener("click",function(){toggleSettings(false);});
document.getElementById("tabs").addEventListener("click",function(e){
  var fin=e.target.closest("[data-fin-tab]");
  if(fin){tabScroll["finance:"+financeTab]=window.scrollY;financeTab=fin.getAttribute("data-fin-tab");render();window.scrollTo(0,tabScroll["finance:"+financeTab]||0);return;}
  var more=e.target.closest("[data-phone-series-tabs]");
  if(more){
    var all=[["serieswatchlist","My Watchlist"],["serieswatching","Watching"],["seriesnew","New Episodes"],["seriesupcoming","Upcoming"],["enseries","English"],["mlseries","Malayalam"],["taseries","Tamil"],["hiseries","Hindi"],["serieswatched","Watched"]];
    openPhoneSheet("TV Show sections",all.map(function(x){return '<button type="button" class="'+(seriesTab===x[0]?"on":"")+'" data-stab="'+x[0]+'"><span>'+x[1]+'</span>'+(seriesTab===x[0]?'<b>&#10003;</b>':'')+'</button>';}).join(""));
    return;
  }
  var hb=e.target.closest("[data-htab]");
  if(hb){tabScroll["health:"+healthTab]=window.scrollY;healthTab=hb.getAttribute("data-htab");render();window.scrollTo(0,tabScroll["health:"+healthTab]||0);return;}
  var pb=e.target.closest("[data-ptab]");
  if(pb){ switchPlexTab(pb.getAttribute("data-ptab")); return; }
  var sb=e.target.closest("[data-stab]");
  if(sb){ switchSeriesTab(sb.getAttribute("data-stab")); return; }
  var fb=e.target.closest("[data-ftab]");
  if(fb){ switchFilmTab(fb.getAttribute("data-ftab")); return; }
  var b=e.target.closest("[data-tab]"); if(!b) return;
  switchTab(b.getAttribute("data-tab"));
});
document.getElementById("stats").addEventListener("click",function(e){
  var s=e.target.closest("[data-tab]"); if(!s) return;
  switchTab(s.getAttribute("data-tab"));
});

document.getElementById("settingsBtn").addEventListener("click",function(){ toggleSettings(); });
document.getElementById("saveKeyBtn").addEventListener("click",function(){
  var v=document.getElementById("apiKeyInput").value.trim();
  setSyncedKey("rawg", v);
  toggleSettings(false);
  flash(v?"API key saved on this device — covers, scores and refresh are live now":"API key cleared");
  render();
  if(v) setTimeout(backfillImages,600);
});
document.getElementById("gdSaveBtn").addEventListener("click",function(){
  var v=document.getElementById("gdClientInput").value.trim();
  try{ localStorage.setItem(GD_CLIENT_STORE,v); }catch(e){}
  gdTokenClient=null; // re-init with the new id on next request
  gdSetStatus();
  flash(v?"Client ID saved — now press Sign in with Google":"Client ID cleared");
});
document.getElementById("gdSignInBtn").addEventListener("click",gdSignIn);
document.getElementById("gdSignOutBtn").addEventListener("click",function(){confirmDestructive("Disconnect Google Drive on this device? Your Drive backup will not be deleted.","Disconnect Drive",gdSignOut);});
var secureConfigSaveBtn=document.getElementById("secureConfigSaveBtn");
if(secureConfigSaveBtn)secureConfigSaveBtn.addEventListener("click",secureConfigEncrypt);
var secureConfigUnlockBtn=document.getElementById("secureConfigUnlockBtn");
if(secureConfigUnlockBtn)secureConfigUnlockBtn.addEventListener("click",secureConfigUnlock);
document.getElementById("saveFilmKeysBtn").addEventListener("click",function(){
  setSyncedKey("tmdb", document.getElementById("tmdbKeyInput").value.trim());
  setSyncedKey("omdb", document.getElementById("omdbKeyInput").value.trim());
  filmCache={}; saveFilmCache(); // force a fresh pull with the new keys
  seriesCache={}; saveSeriesCache();
  toggleSettings(false);
  flash(tmdbKey()?"Film keys saved on this device — open Movies or TV Shows":"Film keys cleared");
  if(section==="films"){ render(); ensureFilms(filmTab); }
  if(section==="series"){ render(); ensureSeries(seriesTab); }
});
var saveBiglyProxyBtn=document.getElementById("saveBiglyProxyBtn");
if(saveBiglyProxyBtn) saveBiglyProxyBtn.addEventListener("click",function(){
  setBiglyProxyUrl(document.getElementById("biglyProxyInput").value);
  var fSel=document.getElementById("biglyFolderInput"); if(fSel) setBiglyFolder(fSel.value);
  var existingBigly=document.getElementById("biglyBrowser"); if(existingBigly) existingBigly.remove();
  biglyLogout();
  toggleSettings(false);
  flash(biglyProxyUrl()?"BiglyBT proxy saved":"BiglyBT proxy cleared");
});
document.addEventListener("click",function(e){
  if(!phoneUi())return;
  var menu=e.target.closest&&e.target.closest("[data-phone-menu]");
  if(menu){var def=phoneMenuRegistry[menu.getAttribute("data-phone-menu")];if(def)openPhoneSheet(def.title,def.body);return;}
  var filter=e.target.closest&&e.target.closest("[data-phone-filter]");
  if(filter){openPhoneSheet(filterLabel(filter.getAttribute("data-phone-filter"),filter.getAttribute("data-kind")),phoneFilterItems(filter.getAttribute("data-phone-filter"),filter.getAttribute("data-kind")));return;}
  var sheet=e.target.closest&&e.target.closest("#phoneActionSheet");
  if(!sheet)return;
  var confirmChoice=e.target.closest("[data-phone-confirm]");
  if(confirmChoice){
    var approved=confirmChoice.getAttribute("data-phone-confirm")==="yes",callback=phoneConfirmCallback;
    phoneConfirmCallback=null;closePhoneSheet();if(approved&&callback)callback();return;
  }
  if(e.target.closest(".phone-sheet-backdrop,.phone-sheet-done")){closePhoneSheet();return;}
  var stab=e.target.closest("[data-stab]");
  if(stab){closePhoneSheet();switchSeriesTab(stab.getAttribute("data-stab"));return;}
  if(e.target.closest("a[href],button[data-act]"))setTimeout(closePhoneSheet,0);
});
document.addEventListener("keydown",function(e){
  if((e.key!=="Enter"&&e.key!==" ") || !e.target || e.target.tagName==="BUTTON" || e.target.tagName==="A") return;
  if(e.target.matches('[role="button"]')){ e.preventDefault(); e.target.click(); }
});
var plexDiscoverBtn=document.getElementById("plexDiscoverBtn");
if(plexDiscoverBtn) plexDiscoverBtn.addEventListener("click",plexDiscover);
var savePlexBtn=document.getElementById("savePlexBtn");
if(savePlexBtn) savePlexBtn.addEventListener("click",function(){
  setPlexConfig(document.getElementById("plexUrlInput").value,document.getElementById("plexTokenInput").value);
  plexErr=""; plexConnected=false; toggleSettings(false); flash("Plex saved on this device");
  if(section==="plex") plexRefresh();
});
var clearPlexBtn=document.getElementById("clearPlexBtn");
if(clearPlexBtn) clearPlexBtn.addEventListener("click",function(){
  confirmDestructive("Disconnect Plex on this device? Cached titles will be kept.","Disconnect Plex",function(){setPlexConfig("",""); plexConnected=false; plexAllowDelete=false; plexErr=""; toggleSettings(false); render(); flash("Plex disconnected; cached titles were kept");});
});
var densityInput=document.getElementById("densityInput");
if(densityInput) densityInput.addEventListener("change",function(){
  uiDensity=this.value==="compact"?"compact":"comfortable";
  try{ localStorage.setItem(DENSITY_KEY,uiDensity); }catch(e){}
  applyDensity(); render(); flash(uiDensity==="compact"?"Compact layout enabled":"Comfortable layout enabled");
});
/* ---------- alerts: rentals due + imminent releases (device-local, no server) ----------
   Checked at boot, hourly while open, and when alerts are switched on. Each
   alert fires once (14-day dedupe ledger in localStorage). Browser
   notifications are used when permitted; the toast always shows. TV skips. */
var ALERTS_KEY="gamevault-alerts-on", ALERTS_SEEN_KEY="gamevault-alerts-seen";
function alertsOn(){ try{ return localStorage.getItem(ALERTS_KEY)==="1"; }catch(e){ return false; } }
function setAlertsOn(v){ try{ localStorage.setItem(ALERTS_KEY, v?"1":"0"); }catch(e){} }
function alertsSeen(){ try{ return JSON.parse(localStorage.getItem(ALERTS_SEEN_KEY)||"{}")||{}; }catch(e){ return {}; } }
function markAlertSeen(k){
  var s=alertsSeen(); s[k]=Date.now();
  var cut=Date.now()-14*86400000;
  for(var x in s){ if(s[x]<cut) delete s[x]; }
  try{ localStorage.setItem(ALERTS_SEEN_KEY,JSON.stringify(s)); }catch(e){}
}
function collectAlerts(){
  var out=[], t0=today(), todayKey=localISO();
  (data.rentals||[]).forEach(function(r){
    var left=r.days-daysBetween(parseD(r.start),t0);
    if(left>0&&left<=3) out.push({k:"rent:"+r.id+":"+todayKey, msg:"Rental due: "+r.name+" — "+left+" day"+(left===1?"":"s")+" left"});
  });
  (data.upcoming||[]).forEach(function(g){
    if(!g.want||!g.date) return;
    var dl=daysBetween(t0,parseD(g.date));
    if(dl>=0&&dl<=7) out.push({k:"up:"+norm(g.name)+":"+g.date, msg:(dl===0?"Releasing today: ":"Releasing in "+dl+" day"+(dl===1?"":"s")+": ")+g.name});
  });
  (data.movieWatchlist||[]).forEach(function(m){
    var d=m.ottDate||m.date||""; if(!d) return;
    d=String(d).slice(0,10);
    var dl=daysBetween(parseD(d),t0);
    if(dl>=0&&dl<=7) out.push({k:"film:"+(m.id!=null?m.id:norm(m.title||""))+":"+d, msg:"Watchlist film is out: "+(m.title||"")});
  });
  var seen=alertsSeen();
  return out.filter(function(a){ return !seen[a.k]; });
}
function runAlerts(){
  if(!alertsOn()) return;
  var list=collectAlerts();
  if(!list.length) return;
  list.slice(0,4).forEach(function(a){
    markAlertSeen(a.k);
    if(("Notification" in window) && Notification.permission==="granted"){
      try{ new Notification("GameVault",{body:a.msg,icon:"icon.png",tag:a.k}); }catch(e){}
    }
  });
  list.slice(4).forEach(function(a){ markAlertSeen(a.k); });
  var summary = list.length===1 ? list[0].msg
    : list.length+" alerts · "+list.slice(0,2).map(function(a){ return a.msg; }).join(" · ")+(list.length>2?" …":"");
  flash(summary);
}
var alertsInput=document.getElementById("alertsInput");
if(alertsInput) alertsInput.addEventListener("change",function(){
  setAlertsOn(this.checked);
  if(this.checked){
    if(("Notification" in window) && Notification.permission==="default") Notification.requestPermission();
    flash("Alerts on — rentals due and releases will notify you");
    setTimeout(runAlerts,400);
  } else flash("Alerts off");
});
setTimeout(runAlerts,2500);
setInterval(runAlerts,3600000);

var healthCloudInput=document.getElementById("healthCloudInput");
if(healthCloudInput) healthCloudInput.addEventListener("change",function(){
  setHealthCloudSyncEnabled(this.checked);
  if(cloudMode()) silentPush();
  refreshRecoveryUi();
  render();
  flash(this.checked?"Health records will be included in cloud sync":"Health records are now local-only; the next sync removes them from the cloud backup");
});

document.getElementById("content").addEventListener("click",function(e){
  var vc=e.target.closest("[data-vendor]");
  if(vc){ rentVendor=vc.getAttribute("data-vendor"); render(); return; }
  var tc=e.target.closest("[data-tier]");
  if(tc){ sugTier=tc.getAttribute("data-tier"); render(); return; }
  var gc=e.target.closest("[data-genre]");
  if(gc){ sugGenre=gc.getAttribute("data-genre"); render(); return; }
  var b=e.target.closest("[data-act]"); if(!b) return;
  var act=b.getAttribute("data-act"), id=b.getAttribute("data-id"), nm=b.getAttribute("data-name");
  if(act==="phone-library-open"){switchSection(b.getAttribute("data-section"),true);return;}
  if(act==="phone-sync"){setPhoneRefreshing(true);refreshAllData();setTimeout(function(){setPhoneRefreshing(false);},1500);return;}
  if(act==="phone-settings"){toggleSettings(true);return;}
  if(act==="phone-export"){document.getElementById("exportBtn").click();return;}
  if(act==="phone-restore"){document.getElementById("importBtn").click();return;}
  if(act.indexOf("finance-")===0&&financeHandleAction(act,id))return;
  if(act==="phone-filter-set"){
    var ftype=b.getAttribute("data-filter"),fkind=b.getAttribute("data-kind"),fvalue=b.getAttribute("data-value")||"";
    if(fkind==="film"){
      if(ftype==="genre"){filmGenre=fvalue;try{localStorage.setItem(FILM_GENRE_KEY,filmGenre);}catch(err){}}
      else if(ftype==="year"){filmYear=fvalue;try{localStorage.setItem(FILM_YEAR_KEY,filmYear);}catch(err){}}
      else if(ftype==="sort"){filmSort=fvalue;try{localStorage.setItem(FILM_SORT_KEY,filmSort);}catch(err){}}
      closePhoneSheet();render();ensureFilms(filmTab);
    }else{
      if(ftype==="genre"){seriesGenre=fvalue;try{localStorage.setItem(SERIES_GENRE_KEY,seriesGenre);}catch(err){}}
      else if(ftype==="year"){seriesYear=fvalue;try{localStorage.setItem(SERIES_YEAR_KEY,seriesYear);}catch(err){}}
      else if(ftype==="provider"){seriesProvider=fvalue;try{localStorage.setItem(SERIES_PROVIDER_KEY,seriesProvider);}catch(err){}}
      else if(ftype==="language"){seriesLanguage=fvalue;try{localStorage.setItem(SERIES_LANGUAGE_KEY,seriesLanguage);}catch(err){}}
      else if(ftype==="sort"){seriesSort=fvalue;try{localStorage.setItem(SERIES_SORT_KEY,seriesSort);}catch(err){}}
      closePhoneSheet();render();ensureSeries(seriesTab);
    }
    return;
  }
  if(act==="phone-filter-clear"){
    var clearKind=b.getAttribute("data-kind");
    if(clearKind==="film"){filmGenre="";filmYear="";filmSort="smart";try{localStorage.removeItem(FILM_GENRE_KEY);localStorage.removeItem(FILM_YEAR_KEY);localStorage.setItem(FILM_SORT_KEY,filmSort);}catch(err){}render();ensureFilms(filmTab);}
    else{seriesGenre="";seriesYear="";seriesProvider="";seriesLanguage="";seriesSort="smart";try{localStorage.removeItem(SERIES_GENRE_KEY);localStorage.removeItem(SERIES_YEAR_KEY);localStorage.removeItem(SERIES_PROVIDER_KEY);localStorage.removeItem(SERIES_LANGUAGE_KEY);localStorage.setItem(SERIES_SORT_KEY,seriesSort);}catch(err){}render();ensureSeries(seriesTab);}
    return;
  }
  if(act==="health-open-food"){healthTab="healthfood";render();window.scrollTo(0,0);return;}
  if(act==="health-open-labs"){healthTab="healthlabs";render();window.scrollTo(0,0);return;}
  if(act==="health-week"){healthWeekOffset=Math.min(0,Math.max(-52,healthWeekOffset+(Number(b.getAttribute("data-delta"))||0)));render();return;}
  if(act==="health-adjust"){
    var day=healthDay(localISO(today()),true),field=b.getAttribute("data-field");
    healthCaptureDayForm(day);
    if(field in day){day[field]=Math.max(0,(Number(day[field])||0)+(Number(b.getAttribute("data-delta"))||0));save();}
    return;
  }
  if(act==="health-save-day"){healthSaveDay();return;}
  if(act==="health-save-lab"){healthSaveLab();return;}
  if(act==="health-delete-lab"){
    var labDate=b.getAttribute("data-date");confirmDestructive("Delete the lab entry dated "+fmt(labDate)+"? This cannot be undone.","Delete lab entry",function(){data.health.labs=data.health.labs.filter(function(x){return x.date!==labDate;});save();flash("Lab entry removed");});return;
  }
  if(act==="health-save-targets"){
    [].forEach.call(document.querySelectorAll("[data-health-target]"),function(el){data.health.targets[el.getAttribute("data-health-target")]=Math.max(0,Number(el.value)||0);});
    save();flash("Weekly targets updated");return;
  }
  if(act==="recent-open"){
    openRecent(b.getAttribute("data-kind"),id,b.getAttribute("data-subtab")||""); return;
  }
  if(act==="plex-settings"){ toggleSettings(true); return; }
  if(act==="plex-refresh"){ plexRefresh(); return; }
  if(act==="plex-open"){
    if(String(plexExpanded)!==String(id)) plexDetailReturnY=window.scrollY;
    plexExpanded=String(id); var pi=plexFindItem(id); if(pi){ var pm=plexAsMedia(pi); rememberViewed(pi.type==="show"?"series":"film",pm.id,pm.title,plexTab); plexEnrichItem(pi); if(pi.type!=="show") ensurePlot(moviePlotName(pm),"film"); }
    history.pushState({gameVaultDetail:"plex",id:id},"",location.href.split("#")[0]+"#plex-detail");
    render(); window.scrollTo(0,0); return;
  }
  if(act==="plex-delete"){ plexDeleteItem(id); return; }
  if(act==="bigly-settings"){ toggleSettings(true); return; }
  if(act==="bigly-home"){ var bh=document.getElementById("biglyFrame"); if(bh) bh.src=biglyFrameUrl(); return; }
  if(act==="bigly-folder"){ biglyOpenFolder(); return; }
  if(act==="bigly-reload"){ var bf=document.getElementById("biglyFrame"); if(bf) bf.src=bf.src; return; }
  if(act==="bigly-fullscreen"){
    var browser=document.getElementById("biglyBrowser");
    if(browser && browser.requestFullscreen) browser.requestFullscreen().catch(function(){ flash("Full screen is not supported by this browser"); });
    return;
  }
  if(act==="home-goto"){
    var hs=b.getAttribute("data-sec")||"games", ht=b.getAttribute("data-tab")||"";
    switchSection(hs);
    if(ht){
      if(hs==="games") switchTab(ht);
      else if(hs==="films") switchFilmTab(ht);
      else if(hs==="series") switchSeriesTab(ht);
      else if(hs==="plex") switchPlexTab(ht);
    }
    return;
  }
  if(act==="film-refresh"){ ensureFilms(filmTab,true); if(filmTab==="mlott") ensureFilms("mlup",true); return; }
  if(act==="series-season-pick"){
    seriesSeasonSel[id]=b.getAttribute("data-season");delete seriesEpisodeSel[id];render();return;
  }
  if(act==="series-episode-pick"){
    seriesEpisodeSel[id]=b.getAttribute("data-episode");render();return;
  }
  if(act==="clear-sug-filters"){ sugGenre="All"; sugTier="All"; render(); return; }
  if(act==="detail-neighbor"){
    var neighborKind=b.getAttribute("data-kind");
    if(neighborKind==="film"){
      filmExpanded=id; var nf=findMovieAny(id); if(nf){rememberViewed("film",id,nf.title,filmTab);ensurePlot(moviePlotName(nf),"film");}
    }else if(neighborKind==="series"){
      seriesExpanded=id; var ns=findSeriesAny(id); if(ns) rememberViewed("series",id,ns.title,seriesTab);
    }else{
      expandedId=id; var ng=gameFindById(id); if(ng){rememberViewed("game",id,ng.name,tab);if(tab==="playing")ensurePlot(ng.name);}
    }
    if(history.state && history.state.gameVaultDetail) history.replaceState({gameVaultDetail:neighborKind,id:id},"",location.href);
    render(); window.scrollTo(0,0); return;
  }
  if(act==="media-close"){
    if(history.state && history.state.gameVaultDetail){ history.back(); return; }
    var mk=b.getAttribute("data-kind");
    var returnY=mk==="film"?filmDetailReturnY:mk==="series"?seriesDetailReturnY:mk==="plex"?plexDetailReturnY:gameDetailReturnY;
    if(mk==="film") filmExpanded=null;
    if(mk==="series") seriesExpanded=null;
    if(mk==="game") expandedId=null;
    if(mk==="plex") plexExpanded=null;
    aiOpen=null;
    render();
    restoreDetailScroll(returnY);
    return;
  }
  if(act==="game-view"){
    gameView=b.getAttribute("data-view")==="list"?"list":"grid";
    try{ localStorage.setItem(GAME_VIEW_KEY,gameView); }catch(e){}
    expandedId=null;
    render();
    return;
  }
  if(act==="media-view"){
    var mkv=b.getAttribute("data-kind"), vv=b.getAttribute("data-view")==="list"?"list":"grid";
    if(mkv==="series"){ seriesView=vv; try{ localStorage.setItem(SERIES_VIEW_KEY,seriesView); }catch(e){} }
    else { filmView=vv; try{ localStorage.setItem(FILM_VIEW_KEY,filmView); }catch(e){} }
    render();
    return;
  }
  if(act==="game-open"){
    if(!expandedId) gameDetailReturnY=window.scrollY;
    expandedId=b.getAttribute("data-id");
    history.pushState({gameVaultDetail:"game",id:expandedId},"",location.href.split("#")[0]+"#game-detail");
    var gx=gameFindById(expandedId);
    if(gx){ rememberViewed("game",expandedId,gx.name,tab); ensurePlot(gx.name); }
    render(); window.scrollTo(0,0);
    return;
  }
  if(act==="played-resume"){
    var pr=byId(data.played,id);
    if(pr){ pr.status="Playing"; save(); flash("Moved to Playing → Resume Later"); }
    return;
  }
  if(act==="played-now"){
    var pnw=byId(data.played,id);
    if(!pnw) return;
    var existingNow=inList(data.playing,pnw.name);
    if(!existingNow){
      data.playing.unshift({id:uid(),name:pnw.name,added:localISO(),rating:pnw.rating||0,note:pnw.note||"",vendor:pnw.vendor||"",cost:pnw.cost||0,score:pnw.score||null,rrating:pnw.rrating||null,img:coverUrl(pnw)||undefined});
    }
    data.played=data.played.filter(function(x){ return x.id!==pnw.id; });
    save(); flash(existingNow?"Already in Now Playing":"Moved to Now Playing");
    return;
  }
  if(act==="movie-primary"||act==="movie-state"){
    var ma=findMovieAny(id),ms=b.getAttribute("data-state");
    if(!ma) return;
    if(ms==="remove"){confirmDestructive('Remove "'+ma.title+'" from your movie watchlist?',"Remove movie",function(){removeFromWatchlist(id);});return;}
    if(ms==="unwatch"){confirmDestructive('Remove "'+ma.title+'" from Watched and allow it in suggestions again?',"Remove watched status",function(){unwatchMovie(ma.key||movieWatchKey(ma));});return;}
    var movieWasOpen=closeMediaStateDetail("film",id);
    if(ms==="watched") markMovieWatched(ma);
    else if(ms==="watching") markMovieWatching(ma);
    else if(ms==="watchlist") addToWatchlist(ma);
    else if(ms==="hide") hideMovie(ma);
    if(movieWasOpen) restoreDetailScroll(filmDetailReturnY);
    return;
  }
  if(act==="series-primary"||act==="series-state"){
    var sa=findSeriesAny(id),ssv=b.getAttribute("data-state");
    if(!sa) return;
    if(ssv==="remove"){confirmDestructive('Remove "'+sa.title+'" from your TV watchlist?',"Remove TV show",function(){removeSeriesWatchlist(id);});return;}
    if(ssv==="unwatch"){confirmDestructive('Remove "'+sa.title+'" from Watched and allow it in suggestions again?',"Remove watched status",function(){unwatchSeries(sa.key||seriesKey(sa));});return;}
    var seriesWasOpen=closeMediaStateDetail("series",id);
    if(ssv==="watching") markSeriesWatching(sa);
    else if(ssv==="watched") markSeriesWatched(sa);
    else if(ssv==="watchlist") addSeriesWatchlist(sa);
    else if(ssv==="hide") hideSeries(sa);
    if(seriesWasOpen) restoreDetailScroll(seriesDetailReturnY);
    return;
  }
  if(act==="mv-unwatch"){ var muk=b.getAttribute("data-key"),muw=(data.watchedMovies||[]).filter(function(x){return x.key===muk;})[0];confirmDestructive('Remove "'+(muw?muw.title:"this movie")+'" from Watched?',"Remove watched status",function(){unwatchMovie(muk);});return; }
  if(act==="mw-add"){ addToWatchlist(findSearchMovie(id)); return; }
  if(act==="mw-remove"){ var mwr=findWatchlistMovie(id);confirmDestructive('Remove "'+(mwr?mwr.title:"this movie")+'" from your watchlist?',"Remove movie",function(){removeFromWatchlist(id);});return; }
  if(act==="mw-clear"){ movieSearchQ=""; movieSearchItems=[]; movieSearchSeq++; render(); return; }
  if(act==="mw-toggle"){
    if(String(filmExpanded)!==String(id)) filmDetailReturnY=window.scrollY;
    filmExpanded = String(filmExpanded)===String(id) ? null : id;
    if(filmExpanded) history.pushState({gameVaultDetail:"film",id:id},"",location.href.split("#")[0]+"#film-detail");
    var wm=findMovieAny(id);
    if(filmExpanded && wm){ rememberViewed("film",id,wm.title,filmTab); ensurePlot(moviePlotName(wm),"film"); }
    render(); if(filmExpanded) window.scrollTo(0,0); return;
  }
  if(act==="mw-watched"){
    var wmv=findWatchlistMovie(id);
    if(wmv) markMovieWatched(wmv); // marking Watched already moves it out of the watchlist
    return;
  }
  if(act==="mv-unhide"){ unhideMovie(b.getAttribute("data-key")); return; }
  if(act==="series-refresh"){ ensureSeries(seriesTab,true); return; }
  if(act==="sw-add"){ addSeriesWatchlist(findSearchSeries(id)); return; }
  if(act==="sw-remove"){ var swr=findWatchlistSeries(id);confirmDestructive('Remove "'+(swr?swr.title:"this TV show")+'" from your watchlist?',"Remove TV show",function(){removeSeriesWatchlist(id);});return; }
  if(act==="sw-clear"){ seriesSearchQ=""; seriesSearchItems=[]; seriesSearchSeq++; render(); return; }
  if(act==="sr-unwatch"){ var suk=b.getAttribute("data-key"),suw=(data.watchedSeries||[]).filter(function(x){return x.key===suk;})[0];confirmDestructive('Remove "'+(suw?suw.title:"this TV show")+'" from Watched?',"Remove watched status",function(){unwatchSeries(suk);});return; }
  if(act==="sr-unhide"){ unhideSeries(b.getAttribute("data-key")); return; }
  if(act==="ai-open"){
    var at=b.getAttribute("data-ai-type");
    var ax=aiFindItem(at,id);
    if(ax){
      var ak=aiKey(at,ax);
      aiOpen=aiOpen===ak?null:ak;
      if(aiOpen && at==="film") filmExpanded=id;
      if(aiOpen && at==="series") seriesExpanded=id;
      render();
    }
    return;
  }
  if(act==="ai-launch"){ aiLaunch(b.getAttribute("data-ai-type"),id,b.getAttribute("data-service")); return; }
  if(act==="ai-save"){ aiSaveLink(b.getAttribute("data-ai-type"),id,b.getAttribute("data-service")); return; }
  if(act==="sr-rate"){
    var rs=findSeriesAny(id);
    setSeriesRating(rs, Number(b.getAttribute("data-n"))||0);
    return;
  }
  if(act==="sr-toggle"){
    if(String(seriesExpanded)!==String(id)) seriesDetailReturnY=window.scrollY;
    seriesExpanded = String(seriesExpanded)===String(id) ? null : id;
    if(seriesExpanded) history.pushState({gameVaultDetail:"series",id:id},"",location.href.split("#")[0]+"#series-detail");
    var ss=findSeriesAny(id)||(data.watchedSeries||[]).filter(function(x){ return String(x.id)===String(id); })[0];
    if(seriesExpanded && ss) rememberViewed("series",id,ss.title,seriesTab);
    if(seriesExpanded && ss && (!ss.seasonList || !ss.seasonList.length || !ss.providers)){
      enrichSeriesIds(ss).then(function(){ if(section==="series" && String(seriesExpanded)===String(id)) render(); });
    }
    render(); if(seriesExpanded) window.scrollTo(0,0); return;
  }
  if(act==="toggle-form"){ formOpen[tab]=!formOpen[tab]; render(); }
  else if(act==="clear-search"){ searchQ[tab]=""; render(); }
  else if(act==="goto"){ switchTab(b.getAttribute("data-dest")||"rentals"); }

  else if(act==="add-rental"){
    var name=document.getElementById("rName").value.trim(); if(!name) return;
    var start=document.getElementById("rStart").value||localISO();
    var days=Math.max(1,Number(document.getElementById("rDays").value)||30);
    var cost=Number(document.getElementById("rCost").value)||0;
    var vend=document.getElementById("rVendor").value; if(vend==="__new__") vend="";
    var newId=uid();
    data.rentals.push({id:newId,name:name,start:start,days:days,cost:cost,vendor:vend,note:""});
    formOpen[tab]=false;
    save(); flash("Rental added");
    enrichScore("rentals",newId);
  }
  else if(act==="extend"){
    var r=byId(data.rentals,id); if(r){ r.days+=Number(b.getAttribute("data-n")); save(); flash("Extended by "+b.getAttribute("data-n")+" days"); }
  }
  else if(act==="return-played"){ endRental(id,true); }
  else if(act==="return-only"){ endRental(id,false); }
  else if(act==="remove-rental"){
    if(phoneUi()){tvConfirm("Delete this rental without saving it to history?","Delete rental",function(){data.rentals=data.rentals.filter(function(x){return x.id!==id;});save();flash("Rental deleted");});return;}
    if(!confirm("Delete this rental without saving it to history?")) return;
    data.rentals=data.rentals.filter(function(x){return x.id!==id;}); save(); flash("Rental deleted");
  }
  else if(act==="hist-again"){
    var h=byId(data.rentalHistory,id);
    if(h){
      if(inList(data.rentals,h.name)){ flash("Already an active rental"); return; }
      var rid2=uid();
      data.rentals.push({id:rid2,name:h.name,start:localISO(),days:30,cost:0,vendor:h.vendor||"",note:"",img:h.img||undefined});
      save(); flash("Rented again — 30-day countdown started today");
      enrichScore("rentals",rid2);
    }
  }
  else if(act==="hist-del"){
    if(phoneUi()){tvConfirm("Delete this history record?","Delete record",function(){data.rentalHistory=data.rentalHistory.filter(function(x){return x.id!==id;});save();});return;}
    if(!confirm("Delete this history record?")) return;
    data.rentalHistory=data.rentalHistory.filter(function(x){return x.id!==id;}); save();
  }

  else if(act==="sync-upcoming"){ refreshUpcoming(); }
  else if(act==="sync-catalog"){ refreshCatalog(); }
  else if(act==="add-upcoming"){
    var un=document.getElementById("uName").value.trim(); if(!un) return;
    data.upcomingRemoved=(data.upcomingRemoved||[]).filter(function(x){return norm(x.name)!==norm(un);}); // un-remove if re-added
    data.upcoming.push({id:uid(),name:un,date:document.getElementById("uDate").value||null,note:document.getElementById("uNote").value.trim(),want:false,src:"manual"});
    formOpen[tab]=false;
    save(); flash("Game added to watchlist");
  }
  else if(act==="want"){ var g=byId(data.upcoming,id); if(g){ g.want=!g.want; save(); } }
  else if(act==="del-upcoming"){
    var gd=byId(data.upcoming,id);
    confirmDestructive('Remove "'+(gd?gd.name:"this game")+'" from Upcoming? It will move to Removed Games and stay hidden from refreshes.',"Remove upcoming game",function(){data.upcoming=data.upcoming.filter(function(x){return x.id!==id;});if(gd){if(!data.upcomingRemoved)data.upcomingRemoved=[];if(!data.upcomingRemoved.some(function(x){return norm(x.name)===norm(gd.name);}))data.upcomingRemoved.unshift(gd);}save();flash("Removed — it won’t come back on refresh"+(gd?" (restore below)":""));});
  }
  else if(act==="up-restore"){
    var gr=byId(data.upcomingRemoved,id);
    if(gr){
      data.upcomingRemoved=data.upcomingRemoved.filter(function(x){return x.id!==id;});
      if(!inList(data.upcoming,gr.name)) data.upcoming.push(gr);
      save(); flash("Restored to the watchlist");
    }
  }
  else if(act==="up-purge"){
    var gp=byId(data.upcomingRemoved,id);
    confirmDestructive('Permanently delete "'+(gp?gp.name:"this game")+'" from Removed Games? Internet refresh may discover it again later.',"Delete game record",function(){data.upcomingRemoved=(data.upcomingRemoved||[]).filter(function(x){return x.id!==id;});save();flash(gp?"Deleted for good — refresh may re-add it later":"Deleted");});
  }
  else if(act==="to-played"){
    var g2=byId(data.upcoming,id);
    if(g2){
      data.upcoming=data.upcoming.filter(function(x){return x.id!==id;});
      var exT=inList(data.played,g2.name);
      if(exT){
        exT.status="Playing";
        save(); flash("Already in your library — set to ↺ Resume Later");
      } else {
        var tpId=uid();
        data.played.unshift({id:tpId,name:g2.name,rating:0,status:"Playing",added:localISO(),date:g2.date||null,img:coverUrl(g2)||undefined});
        save(); flash("Moved to Played");
        enrichScore("played",tpId);
      }
    }
  }
  else if(act==="up-queue"){
    var gq=byId(data.upcoming,id);
    if(gq) addToQueue(gq.name,gq.note||"",gq.score||null,gq.rrating||null,null,gq.date||null);
  }

  else if(act==="sug-played"){
    if(nm){
      if(inList(data.played,nm)){ flash("Already in your Played library"); return; }
      var cat1=fullCatalog().filter(function(g){return norm(g.name)===norm(nm);})[0]||{};
      var spId=uid();
      data.played.unshift({id:spId,name:nm,rating:0,status:"Finished",added:localISO(),score:cat1.score||null,rrating:cat1.rating?Math.round(cat1.rating*10)/10:null,img:coverUrl(cat1)||undefined});
      save(); flash("Added to Played — set a rating in the Played tab");
      enrichScore("played",spId);
    }
  }
  else if(act==="sug-queue"){
    if(nm){
      var cat2=fullCatalog().filter(function(g){return norm(g.name)===norm(nm);})[0]||{};
      addToQueue(nm, "", cat2.score||null, cat2.rating?Math.round(cat2.rating*10)/10:null);
    }
  }
  else if(act==="sug-hide"){
    if(nm){
      var hk=norm(nm);
      data.dismissed.push(hk);
      if(!data.dismissedNames) data.dismissedNames={};
      data.dismissedNames[hk]=nm;
      save();
      flash("Hidden from suggestions", function(){
        data.dismissed=data.dismissed.filter(function(x){ return x!==hk; });
        if(data.dismissedNames) delete data.dismissedNames[hk];
        save();
      });
    }
  }
  else if(act==="sug-restore"){
    var rk=b.getAttribute("data-key");
    data.dismissed=(data.dismissed||[]).filter(function(x){ return x!==rk; });
    if(data.dismissedNames) delete data.dismissedNames[rk];
    save(); flash("Restored to suggestions");
  }

  else if(act==="add-queue"){
    var qn=document.getElementById("qName").value.trim(); if(!qn) return;
    var qav=document.getElementById("qAvail").value||null;
    formOpen[tab]=false;
    addToQueue(qn,"",null,null,qav);
  }
  else if(act==="q-up"||act==="q-down"||act==="q-top"||act==="q-bottom"){
    var qi=qIndex(id);
    if(qi>-1){
      var item=data.queue.splice(qi,1)[0];
      var ni2 = act==="q-top"?0 : act==="q-bottom"?data.queue.length : act==="q-up"?Math.max(0,qi-1) : Math.min(data.queue.length,qi+1);
      data.queue.splice(ni2,0,item);
      save();
    }
  }
  else if(act==="q-avail-check"){ checkAvailability(id,true); }
  else if(act==="q-rent"){
    var qr=byId(data.queue,id);
    if(qr){
      if(inList(data.rentals,qr.name)){ flash("Already an active rental"); return; }
      data.queue=data.queue.filter(function(x){return x.id!==id;});
      var rid=uid();
      data.rentals.push({id:rid,name:qr.name,start:localISO(),days:30,cost:0,vendor:"",note:qr.note||"",score:qr.score||null,rrating:qr.rrating||null,date:qr.date||gameKnownReleaseDate(qr)||null,img:coverUrl(qr)||undefined});
      tabScroll[tab]=window.scrollY; tab="rentals"; save(); window.scrollTo(0,0);
      flash("Rental started today — set the cost and vendor below");
      enrichScore("rentals",rid);
    }
  }
  else if(act==="q-del"){ var qd=byId(data.queue,id);confirmDestructive('Remove "'+(qd?qd.name:"this game")+'" from the rental queue?',"Remove queued game",function(){data.queue=data.queue.filter(function(x){return x.id!==id;});save();flash("Removed from Queue");}); }

  else if(act==="add-playing"){
    var pln=document.getElementById("plName").value.trim(); if(!pln) return;
    var exPl=inList(data.played,pln);
    if(inList(data.playing,pln) || inList(data.rentals,pln) || (exPl&&(exPl.status==="Playing"||exPl.status==="Dropped"))){
      flash("Already in the Playing tab"); return;
    }
    var plId=uid();
    data.playing.unshift({id:plId,name:pln,added:localISO()});
    formOpen[tab]=false;
    save(); flash("Added to Playing");
    enrichScore("playing",plId);
    ensurePlot(pln);
  }
  else if(act==="episode-plot-retry"){
    var es=findSeriesAny(id), esn=b.getAttribute("data-season"), een=b.getAttribute("data-episode");
    if(es){
      var epl=(seriesEpisodeCache[es.id+":"+esn]||[]).filter(function(x){return String(x.n)===String(een);})[0];
      if(epl){ var epk=episodePlotKey(es,esn,een); delete plotErr[epk]; delete plotPending[epk]; delete plotCache[epk]; ensureEpisodePlot(es,esn,epl); render(); }
    }
  }
  else if(act==="plot-retry"){
    var pn2=b.getAttribute("data-name"), pk2=b.getAttribute("data-kind")||"video game";
    if(pn2){ var kk2=plotKey(pn2,pk2); delete plotErr[kk2]; delete plotPending[kk2]; ensurePlot(pn2,pk2); render(); }
  }
  else if(act==="pl-toggle"){
    expandedId = (expandedId===id) ? null : id;
    if(expandedId){
      var all=data.rentals.concat(data.playing,data.played);
      var px=byId(all,id);
      if(px) ensurePlot(px.name);
    }
    render();
  }
  else if(act==="pl-played"){
    var pl2=byId(data.playing,id);
    if(pl2){
      data.playing=data.playing.filter(function(x){return x.id!==id;});
      var exF=inList(data.played,pl2.name);
      if(exF){
        exF.status="Finished";
        if(!exF.rating && pl2.rating) exF.rating=pl2.rating;
        if(!exF.note && pl2.note) exF.note=pl2.note;
        save(); flash("Finished — updated the existing entry in Played");
      } else {
        var ppId=uid();
        data.played.unshift({id:ppId,name:pl2.name,rating:pl2.rating||0,note:pl2.note||"",vendor:pl2.vendor||"",cost:pl2.cost||0,status:"Finished",added:localISO(),score:pl2.score||null,rrating:pl2.rrating||null,img:coverUrl(pl2)||undefined});
        save(); flash(pl2.rating?"Moved to Played — rating kept":"Moved to Played — set a rating there");
        enrichScore("played",ppId);
      }
    }
  }
  else if(act==="pl-resume"){
    var pl3=byId(data.playing,id);
    if(pl3){
      data.playing=data.playing.filter(function(x){return x.id!==id;});
      var exR=inList(data.played,pl3.name);
      if(exR){
        exR.status="Playing";
        if(!exR.rating && pl3.rating) exR.rating=pl3.rating;
        if(!exR.note && pl3.note) exR.note=pl3.note;
      } else {
        data.played.unshift({id:uid(),name:pl3.name,rating:pl3.rating||0,note:pl3.note||"",vendor:pl3.vendor||"",cost:pl3.cost||0,status:"Playing",added:localISO(),score:pl3.score||null,rrating:pl3.rrating||null,img:coverUrl(pl3)||undefined});
      }
      save(); flash("↺ Moved down to Resume Later");
    }
  }
  else if(act==="pl-del"){ var pld=byId(data.playing,id);confirmDestructive('Remove "'+(pld?pld.name:"this game")+'" from Playing?',"Remove playing game",function(){data.playing=data.playing.filter(function(x){return x.id!==id;});save();flash("Removed from Playing");}); }

  else if(act==="add-played"){
    var pn=document.getElementById("pName").value.trim(); if(!pn) return;
    var exA=inList(data.played,pn);
    if(exA){
      exA.status=document.getElementById("pStatus").value;
      formOpen[tab]=false;
      save(); flash("Already in your library — status updated");
      return;
    }
    var pid=uid();
    data.played.unshift({id:pid,name:pn,rating:0,status:document.getElementById("pStatus").value,added:localISO()});
    formOpen[tab]=false;
    save();
    enrichScore("played",pid);
  }
  else if(act==="toggle-import"){ showImport=!showImport; render(); }
  else if(act==="run-import"){
    var lines=document.getElementById("importText").value.split("\n").map(function(l){return l.trim();}).filter(Boolean);
    if(!lines.length) return;
    var existing={}; data.played.forEach(function(p){ existing[p.name.toLowerCase()]=1; });
    var added=0, skipped=0;
    lines.forEach(function(l){
      var parts=l.split("|").map(function(s){return s.trim();});
      if(!parts[0] || parts[0].length<2) return;
      // skip junk lines from trophy-site copies: pure numbers, percentages, trophy counts
      if(/^[\d\s.,%\/•·-]+$/.test(parts[0])) return;
      if(/^(trophies|platinum|gold|silver|bronze|completed?|level|rank)\b[\d\s%]*$/i.test(parts[0])) return;
      if(existing[parts[0].toLowerCase()]){ skipped++; return; }
      var rating=Math.min(5,Math.max(0,Number(parts[1])||0));
      var stTxt=(parts[2]||"").toLowerCase();
      if(stTxt==="resume later") stTxt="playing";
      if(stTxt==="on hold") stTxt="dropped";
      var status=STATUSES.filter(function(s){return s.toLowerCase()===stTxt;})[0]||"Finished";
      data.played.unshift({id:uid(),name:parts[0],rating:rating,status:status,note:parts[3]||"",added:localISO()});
      existing[parts[0].toLowerCase()]=1; added++;
    });
    showImport=false; save();
    flash("Imported "+added+" game"+(added===1?"":"s")+(skipped?" ("+skipped+" duplicates skipped)":""));
    setTimeout(backfillImages,600);
  }
  else if(act==="rate"){
    var p=byId(data.played,id);
    if(p){ var n=Number(b.getAttribute("data-n")); p.rating=(p.rating===n?0:n); save(); }
  }
  else if(act==="del-played"){ var dp=byId(data.played,id);confirmDestructive('Delete "'+(dp?dp.name:"this game")+'" from your Played library? Its rating and notes will also be removed.',"Delete played game",function(){data.played=data.played.filter(function(x){return x.id!==id;});save();flash("Deleted from Played");}); }
});

function handleVendorNew(sel){
  var v=prompt("New vendor name (e.g. Mayank, GameHub, CEX):");
  v=v?v.trim():"";
  if(v && data.vendors.indexOf(v)<0){ data.vendors.push(v); data.vendors.sort(); persist(); }
  sel.innerHTML=vendorOptions(v);
  return v;
}

document.getElementById("content").addEventListener("change",function(e){
  if(financeHandleChange(e.target))return;
  var fs=e.target.closest(".film-sort");
  if(fs){ filmSort=fs.value; try{localStorage.setItem(FILM_SORT_KEY,filmSort);}catch(err){} render(); return; }
  var ssrt=e.target.closest(".series-sort");
  if(ssrt){ seriesSort=ssrt.value; try{localStorage.setItem(SERIES_SORT_KEY,seriesSort);}catch(err){} render(); return; }
  var fg=e.target.closest(".film-genre");
  if(fg){
    filmGenre=fg.value;
    try{ localStorage.setItem(FILM_GENRE_KEY,filmGenre); }catch(err){}
    render(); ensureFilms(filmTab);
    return;
  }
  var fy=e.target.closest(".film-year");
  if(fy){
    filmYear=fy.value;
    try{ localStorage.setItem(FILM_YEAR_KEY,filmYear); }catch(err){}
    render(); ensureFilms(filmTab);
    return;
  }
  var sg=e.target.closest(".series-genre");
  if(sg){
    seriesGenre=sg.value;
    try{ localStorage.setItem(SERIES_GENRE_KEY,seriesGenre); }catch(err){}
    render(); ensureSeries(seriesTab);
    return;
  }
  var sy=e.target.closest(".series-year");
  if(sy){
    seriesYear=sy.value;
    try{ localStorage.setItem(SERIES_YEAR_KEY,seriesYear); }catch(err){}
    render(); ensureSeries(seriesTab);
    return;
  }
  var sp=e.target.closest(".series-provider");
  if(sp){
    seriesProvider=sp.value;
    try{ localStorage.setItem(SERIES_PROVIDER_KEY,seriesProvider); }catch(err){}
    render(); ensureSeries(seriesTab);
    return;
  }
  var sl=e.target.closest(".series-language");
  if(sl){
    seriesLanguage=sl.value;
    try{localStorage.setItem(SERIES_LANGUAGE_KEY,seriesLanguage);}catch(err){}
    render(); ensureSeries(seriesTab);
    return;
  }
  var srs=e.target.closest(".sr-season");
  if(srs){
    seriesSeasonSel[srs.getAttribute("data-id")]=srs.value;
    delete seriesEpisodeSel[srs.getAttribute("data-id")];
    render();
    return;
  }
  var sre=e.target.closest(".sr-episode");
  if(sre){
    seriesEpisodeSel[sre.getAttribute("data-id")]=sre.value;
    render();
    return;
  }
  var mm=e.target.closest(".mv-more");
  if(mm){
    var mv=findMovieAny(mm.getAttribute("data-id"));
    if(mm.value==="watched") markMovieWatched(mv);
    else if(mm.value==="watchlist") addToWatchlist(mv);
    else if(mm.value==="hide") hideMovie(mv);
    return;
  }
  var smore=e.target.closest(".sr-more");
  if(smore){
    var sx=findSeriesAny(smore.getAttribute("data-id"));
    if(smore.value==="watching") markSeriesWatching(sx);
    else if(smore.value==="watched") markSeriesWatched(sx);
    else if(smore.value==="watchlist") addSeriesWatchlist(sx);
    else if(smore.value==="hide") hideSeries(sx);
    return;
  }
  var sv=e.target.closest(".sr-status");
  if(sv){
    if(sv.value==="watched"){
      var sm=findCachedSeries(sv.getAttribute("data-id"))||findWatchlistSeries(sv.getAttribute("data-id"));
      markSeriesWatched(sm);
    }
    return;
  }
  var mv=e.target.closest(".mv-status");
  if(mv){
    if(mv.value==="watched"){ markMovieWatched(findCachedMovie(mv.getAttribute("data-id"))); }
    return;
  }
  var rn=e.target.closest(".r-note");
  if(rn){
    var rr1=byId(data.rentals,rn.getAttribute("data-id"));
    if(rr1){ rr1.note=rn.value.trim(); persist(); flash("Remark saved"); }
    return;
  }
  var rc=e.target.closest(".r-cost");
  if(rc){
    var rr2=byId(data.rentals,rc.getAttribute("data-id"));
    if(rr2){ rr2.cost=Number(rc.value)||0; persist(); renderStats(); flash("Cost saved — total updated"); }
    return;
  }
  var rv=e.target.closest(".r-vendor");
  if(rv){
    var val=rv.value==="__new__" ? handleVendorNew(rv) : rv.value;
    var rr3=byId(data.rentals,rv.getAttribute("data-id"));
    if(rr3){ rr3.vendor=val; persist(); flash(val?("Vendor set: "+val):"Vendor cleared"); }
    return;
  }
  var rend=e.target.closest(".r-end");
  if(rend){
    var rr4=byId(data.rentals,rend.getAttribute("data-id"));
    var rs=parseD(rr4&&rr4.start), re=parseD(rend.value);
    if(rr4 && rs && re){
      rr4.days=Math.max(1,daysBetween(rs,re));
      save(); flash("Return date updated");
    }
    return;
  }
  if(e.target.id==="rVendor"){
    if(e.target.value==="__new__") handleVendorNew(e.target);
    return;
  }
  // per-game Fandom reading spot (Playing tab)
  var fd=e.target.closest(".fd-link");
  if(fd){
    var fv=fd.value.trim();
    var fkk=fd.getAttribute("data-key");
    if(!fv){
      delete data.fandom[fkk];
      save(); flash("Fandom reading spot cleared");
    } else if(/^https?:\/\//i.test(fv)){
      data.fandom[fkk]=fv;
      save(); flash("Reading spot saved — the Fandom button now returns you there");
    } else {
      flash("That doesn't look like a link — paste the full page URL from your browser");
    }
    return;
  }
  // rental-history fields stay editable forever
  var hEl=e.target.closest(".h-note,.h-cost,.h-vendor,.h-start,.h-end,.h-days");
  if(hEl){
    var hh=byId(data.rentalHistory,hEl.getAttribute("data-id"));
    if(hh){
      if(hEl.classList.contains("h-note")) hh.note=hEl.value.trim();
      else if(hEl.classList.contains("h-cost")) hh.cost=Number(hEl.value)||0;
      else if(hEl.classList.contains("h-vendor")) hh.vendor=(hEl.value==="__new__"?handleVendorNew(hEl):hEl.value);
      else if(hEl.classList.contains("h-days")) hh.days=Math.max(1,Number(hEl.value)||hh.days);
      else if(hEl.classList.contains("h-start")) hh.start=hEl.value||hh.start;
      else if(hEl.classList.contains("h-end")) hh.end=hEl.value||hh.end;
      var hs=parseD(hh.start), he=parseD(hh.end);
      if(hs&&he) hh.used=Math.max(0,daysBetween(hs,he));
      save(); flash("History record updated");
    }
    return;
  }
  var qa=e.target.closest(".q-avail");
  if(qa){
    var qq=byId(data.queue,qa.getAttribute("data-id"));
    if(qq){ qq.avail=qa.value||null; save(); flash(qq.avail?("Availability set: "+fmt(qq.avail)):"Availability cleared"); }
    return;
  }
  var ni=e.target.closest(".note-inp");
  if(ni){
    var pn=byId(data.played,ni.getAttribute("data-id"));
    if(pn){ pn.note=ni.value.trim(); persist(); flash("Note saved"); }
    return;
  }
  var s=e.target.closest(".status-sel"); if(!s) return;
  var p=byId(data.played,s.getAttribute("data-id"));
  if(p){
    if(s.value==="__nowplaying__"){
      // move to the live "playing now" section at the top of the Playing tab,
      // carrying rating/note/cost so nothing is lost on the way back to Played
      var exN=inList(data.playing,p.name);
      if(exN){
        // already there — merge instead of creating a duplicate
        if(!exN.rating && p.rating) exN.rating=p.rating;
        if(!exN.note && p.note) exN.note=p.note;
        data.played=data.played.filter(function(x){ return x.id!==p.id; });
        tabScroll[tab]=window.scrollY; tab="playing"; save(); window.scrollTo(0,0);
        flash("Merged with the copy already in the playing list");
        return;
      }
      if(inList(data.rentals,p.name)){
        flash("It’s already at the top of Playing as an active rental");
        s.value=p.status; // snap the dropdown back
        return;
      }
      data.played=data.played.filter(function(x){ return x.id!==p.id; });
      data.playing.unshift({id:uid(),name:p.name,added:localISO(),rating:p.rating||0,note:p.note||"",vendor:p.vendor||"",cost:p.cost||0,score:p.score||null,rrating:p.rrating||null,img:coverUrl(p)||undefined});
      tabScroll[tab]=window.scrollY; tab="playing"; save(); window.scrollTo(0,0);
      flash("▶ Now playing — moved to the top of the Playing tab");
      return;
    }
    p.status=s.value; save();
    if(s.value==="Playing") flash("Moved to Playing → Resume Later");
    else if(s.value==="Dropped") flash("Moved to Playing → On Hold");
    else if(tab==="playing") flash("Sent back to the Played library");
  }
});

/* Enter key adds, no reaching for the button */
document.getElementById("content").addEventListener("keydown",function(e){
  if(e.key!=="Enter") return;
  if(e.target.id==="financePin"){e.preventDefault();var unlock=document.querySelector('[data-act="finance-unlock"]');if(unlock)unlock.click();return;}
  if(e.target.id==="financePinAgain"){e.preventDefault();var setup=document.querySelector('[data-act="finance-setup"]');if(setup)setup.click();return;}
  var map={rName:"add-rental",uName:"add-upcoming",qName:"add-queue",pName:"add-played",plName:"add-playing"};
  var actName=map[e.target.id];
  if(actName){
    e.preventDefault();
    var btn=document.querySelector('[data-act="'+actName+'"]');
    if(btn) btn.click();
  }
});

/* ---------- per-tab search + autocomplete (input delegation) ---------- */
document.getElementById("content").addEventListener("input",function(e){
  if(financeHandleInput(e.target))return;
  if(e.target.id==="plexSearch"){
    plexSearch=e.target.value;
    var plexPos=e.target.selectionStart;
    render();
    var plexInput=document.getElementById("plexSearch");
    if(plexInput){ plexInput.focus(); try{ plexInput.setSelectionRange(plexPos,plexPos); }catch(err){} }
    return;
  }
  if(e.target.id==="swSearch"){
    seriesSearchQ=e.target.value;
    var sq=seriesSearchQ.trim();
    clearTimeout(seriesSearchTimer);
    if(sq.length<2){ seriesSearchItems=[]; seriesSearchSeq++; renderSeriesKeepSearch(); return; }
    seriesSearchTimer=setTimeout(function(){ searchSeries(sq); }, 350);
    return;
  }
  if(e.target.id==="mwSearch"){
    movieSearchQ=e.target.value;
    var q=movieSearchQ.trim();
    clearTimeout(movieSearchTimer);
    if(q.length<2){ movieSearchItems=[]; movieSearchSeq++; renderFilmsKeepSearch(); return; }
    movieSearchTimer=setTimeout(function(){ searchMovies(q); }, 350);
    return;
  }
  var ts=e.target.closest(".tab-search");
  if(ts){
    searchQ[tab]=ts.value;
    var pos=ts.selectionStart;
    render();
    var el=document.getElementById("tabSearch");
    if(el){ el.focus(); try{ el.setSelectionRange(pos,pos); }catch(err){} }
    if(tab==="suggest"){
      var wq=ts.value.trim();
      if(wq.length>=3) searchWeb(wq);
      else webResults={q:"",items:[]};
    }
    return;
  }
  var inp=e.target.closest(".ac-input");
  if(inp) handleAc(inp);
});

/* Android TV navigation is handled by the native Shield application. */
function tvAfterRender(){}
function tvConfirm(message,confirmLabel,callback){ if(window.confirm(message)) callback(); }

/* ---------- autocomplete ---------- */
var AC_LIMIT=7, acTimer=null, acSeq=0;
function localNames(qs){
  var ql=qs.toLowerCase(); var seen={}; var out=[];
  function push(n,tag){
    var k=norm(n);
    if(!seen[k] && n.toLowerCase().indexOf(ql)>-1){ seen[k]=1; out.push({name:n, tag:tag}); }
  }
  fullCatalog().forEach(function(g){ push(g.name, g.year?String(g.year):""); });
  data.upcoming.forEach(function(g){ push(g.name, g.date?g.date.slice(0,4):"TBC"); });
  return out.slice(0,AC_LIMIT);
}
function renderAc(drop, items){
  if(!items || !items.length){ drop.style.display="none"; drop.innerHTML=""; return; }
  drop.innerHTML=items.slice(0,AC_LIMIT).map(function(it){
    return '<div class="ac-item" data-name="'+esc(it.name)+'"><span>'+esc(it.name)+'</span>'+(it.tag?'<span class="ac-tag">'+esc(it.tag)+'</span>':'')+'</div>';
  }).join("");
  drop.style.display="block";
}
function handleAc(inp){
  var qs=inp.value.trim();
  var drop=inp.parentElement.querySelector(".ac-drop");
  if(!drop) return;
  if(qs.length<2){ renderAc(drop,[]); return; }
  var items=localNames(qs);
  renderAc(drop, items);
  var key=getKey();
  if(!key) return;
  clearTimeout(acTimer);
  var seq=++acSeq;
  acTimer=setTimeout(function(){
    rawgFetch("https://api.rawg.io/api/games?key="+encodeURIComponent(key)+"&search="+encodeURIComponent(qs)+"&page_size=6&platforms=187")
    .then(function(json){
      if(seq!==acSeq) return;
      if(!document.body.contains(inp) || inp.value.trim()!==qs) return;
      var merged=items.slice(); var seen={};
      merged.forEach(function(i){ seen[norm(i.name)]=1; });
      (json.results||[]).forEach(function(g){
        if(g && g.name && !seen[norm(g.name)]){
          seen[norm(g.name)]=1;
          if(g.background_image) data.covers[norm(g.name)]=g.background_image;
          merged.push({name:g.name, tag:g.released?g.released.slice(0,4):""});
        }
      });
      renderAc(drop, merged);
    }).catch(function(){});
  },400);
}
document.getElementById("content").addEventListener("mousedown",function(e){
  var it=e.target.closest(".ac-item");
  if(it){
    var wrap=it.closest(".ac-wrap");
    var inp=wrap.querySelector("input");
    inp.value=it.getAttribute("data-name");
    renderAc(wrap.querySelector(".ac-drop"),[]);
    e.preventDefault();
  }
});
document.addEventListener("click",function(e){
  if(!e.target.closest(".ac-wrap")){
    var drops=document.querySelectorAll(".ac-drop");
    for(var i=0;i<drops.length;i++){ drops[i].style.display="none"; }
  }
});

/* ---------- backup / restore ---------- */
function downloadBlob(blob,name){
  var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); },1000);
}
function bytesToB64(bytes){ var s=""; for(var i=0;i<bytes.length;i+=8192) s+=String.fromCharCode.apply(null,bytes.subarray(i,i+8192)); return btoa(s); }
function b64ToBytes(s){ var b=atob(s),a=new Uint8Array(b.length); for(var i=0;i<b.length;i++) a[i]=b.charCodeAt(i); return a; }
function backupKey(password,salt){
  return crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveKey"]).then(function(base){
    return crypto.subtle.deriveKey({name:"PBKDF2",salt:salt,iterations:180000,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  });
}
function encryptVault(password){
  var salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  return backupKey(password,salt).then(function(key){
    return crypto.subtle.encrypt({name:"AES-GCM",iv:iv},key,new TextEncoder().encode(JSON.stringify(vaultCopyForExport())));
  }).then(function(cipher){ return {format:"gamevault-encrypted-v1",createdAt:new Date().toISOString(),salt:bytesToB64(salt),iv:bytesToB64(iv),data:bytesToB64(new Uint8Array(cipher))}; });
}
function decryptVault(envelope,password){
  var salt=b64ToBytes(envelope.salt),iv=b64ToBytes(envelope.iv),cipher=b64ToBytes(envelope.data);
  return backupKey(password,salt).then(function(key){ return crypto.subtle.decrypt({name:"AES-GCM",iv:iv},key,cipher); })
  .then(function(plain){ return JSON.parse(new TextDecoder().decode(plain)); });
}
function refreshRecoveryUi(){
  var sel=document.getElementById("snapshotSelect"),summary=document.getElementById("systemSummary"),grid=document.getElementById("connectionGrid"),activity=document.getElementById("recentActivity");
  if(!sel) return;
  var snaps=readRecoverySnapshots();
  sel.innerHTML=snaps.length?snaps.map(function(s,i){ return '<option value="'+i+'">'+esc(new Date(s.createdAt).toLocaleString()+" - "+s.reason+" ("+s.size+" items)")+'</option>'; }).join(""):'<option value="">No recovery points yet</option>';
  if(summary) summary.textContent="Version "+APP_VERSION+" · "+APP_RELEASE_CHANNEL+" · build "+APP_BUILD_DATE+" · data schema "+SCHEMA_VERSION+" · "+vaultSize(data)+" saved items · "+snaps.length+" recovery points · "+(cloudMode()==="drive"?"Google Drive primary":"local only");
  if(grid){
    var services=[
      ["Google Drive",!!gdTok(),cloudMode()==="drive"?"Primary sync":"Not connected"],
      ["RAWG",!!getKey(),getKey()?"Game data ready":"Optional key missing"],
      ["TMDB / OMDb",!!tmdbKey()&&!!omdbKey(),tmdbKey()?(omdbKey()?"Film data and IMDb ready":"IMDb key missing"):"Film key missing"],
      ["Plex",!!(plexServerUrl()&&plexToken()),plexServerUrl()?"Configured on this device":"Not configured"],
      ["BiglyBT",!!biglyProxyUrl(),biglyProxyUrl()?"Gateway configured":"Not configured"]
    ];
    grid.innerHTML=services.map(function(s){ return '<div class="connection-item '+(s[1]?"ok":"")+'"><b>'+esc(s[0])+'</b>'+esc(s[2])+'</div>'; }).join("");
  }
  if(activity){
    var recent=(data.audit||[]).slice(0,4);
    activity.innerHTML=recent.length?'<b>Recent vault activity</b><br>'+recent.map(function(a){ return esc(new Date(a.at).toLocaleString()+" · "+a.action+(a.detail?" · "+a.detail:"")); }).join("<br>"):"";
  }
}
function exportDiagnostics(){
  var report={app:"Sinu Game Vault",version:APP_VERSION,buildDate:APP_BUILD_DATE,releaseChannel:APP_RELEASE_CHANNEL,schema:SCHEMA_VERSION,generatedAt:new Date().toISOString(),device:deviceId(),userAgent:navigator.userAgent,online:navigator.onLine,storageItems:vaultSize(data),revision:data.revision||0,updatedAt:data.updatedAt||0,cloudMode:cloudMode()||"none",connections:{drive:!!gdTok(),rawg:!!getKey(),tmdb:!!tmdbKey(),omdb:!!omdbKey(),plex:!!(plexServerUrl()&&plexToken()),biglybt:!!biglyProxyUrl()},collections:{},runtimeErrors:runtimeErrors.slice(),requestDiagnostics:window.GameVaultCore?GameVaultCore.diagnostics.list():[],recentAudit:(data.audit||[]).slice(0,50)};
  VAULT_ARRAY_FIELDS.forEach(function(k){ report.collections[k]=(data[k]||[]).length; });
  downloadBlob(new Blob([JSON.stringify(report,null,2)],{type:"application/json"}),"game-vault-diagnostics-"+localISO()+".json");
}
document.getElementById("exportBtn").addEventListener("click",function(){
  createRecoverySnapshot("Before manual export",data);
  downloadBlob(new Blob([JSON.stringify(vaultCopyForExport(),null,2)],{type:"application/json"}),"game-vault-backup-"+localISO()+".json");
  if(cloudMode()==="drive"){ silentPush(); flash("Backup downloaded — Google Drive copy refreshed too"); }
  else flash("Backup downloaded");
});
document.getElementById("importBtn").addEventListener("click",function(){ document.getElementById("importFile").click(); });
document.getElementById("importFile").addEventListener("change",function(e){
  var f=e.target.files[0]; if(!f) return;
  var reader=new FileReader();
  reader.onload=function(){
    var parsed;
    try{ parsed=JSON.parse(reader.result); }catch(err){ flash("Couldn't read that file"); return; }
    var incoming=Promise.resolve(parsed);
    if(parsed && parsed.format==="gamevault-encrypted-v1"){
      var password=prompt("Enter the password used for this encrypted backup:");
      if(!password) return;
      incoming=decryptVault(parsed,password);
    }
    incoming.then(function(d){
      adoptVault(d,"imported backup"); data.updatedAt=Date.now(); persist(); render(); refreshRecoveryUi(); flash("Backup restored");
    }).catch(function(err){ flash("Backup restore failed - "+err.message); });
  };
  reader.readAsText(f);
  e.target.value="";
});
document.getElementById("snapshotBtn").addEventListener("click",function(){ createRecoverySnapshot("Manual recovery point",data); refreshRecoveryUi(); flash("Recovery point created"); });
document.getElementById("restoreSnapshotBtn").addEventListener("click",function(){
  var sel=document.getElementById("snapshotSelect"); if(!sel.value && sel.value!=="0"){ flash("No recovery point selected"); return; }
  function restoreSelected(){try{restoreRecoverySnapshot(sel.value);refreshRecoveryUi();flash("Recovery point restored");}catch(e){flash(e.message);}}
  var warning="Replace the current vault with this recovery point? A copy of the current vault will be kept first.";
  if(phoneUi()){tvConfirm(warning,"Restore recovery point",restoreSelected);return;}
  if(confirm(warning)) restoreSelected();
});
document.getElementById("encryptedExportBtn").addEventListener("click",function(){
  if(!window.crypto || !crypto.subtle){ flash("Encrypted backups are not supported in this browser"); return; }
  var password=prompt("Create a password for this encrypted backup (at least 10 characters):");
  if(!password) return; if(password.length<10){ flash("Use a password with at least 10 characters"); return; }
  encryptVault(password).then(function(envelope){ downloadBlob(new Blob([JSON.stringify(envelope,null,2)],{type:"application/json"}),"game-vault-encrypted-"+localISO()+".json"); flash("Encrypted backup downloaded"); }).catch(function(){ flash("Encrypted backup failed"); });
});
document.getElementById("diagnosticsBtn").addEventListener("click",function(){ exportDiagnostics(); flash("Diagnostics downloaded"); });

/* ---------- theme (dark / light) ---------- */
var THEME_KEY="ps5-theme";
var theme="dark";
try{ theme=localStorage.getItem(THEME_KEY)||"dark"; }catch(e){}
function applyTheme(t){
  document.documentElement.classList.toggle("light", t==="light");
  var b=document.getElementById("themeBtn");
  if(b) b.innerHTML = t==="light" ? "&#9790;" : "&#9788;";
  var rail=document.getElementById("desktopRailTheme");
  if(rail){
    var icon=rail.querySelector(".section-icon"),label=rail.querySelector(".section-label");
    if(icon) icon.innerHTML=t==="light"?"&#9790;":"&#9788;";
    if(label) label.textContent=t==="light"?"Dark mode":"Light mode";
  }
}
applyTheme(theme);
document.getElementById("themeBtn").addEventListener("click",function(){
  theme = theme==="light" ? "dark" : "light";
  try{ localStorage.setItem(THEME_KEY,theme); }catch(e){}
  applyTheme(theme);
});

/* ---------- global refresh ---------- */
function globalRefresh(){
  if(phoneUi()&&section==="library"){
    setPhoneRefreshing(true);refreshAllData();setTimeout(function(){setPhoneRefreshing(false);},1500);return;
  }
  if(phoneUi())setPhoneRefreshing(true);else flash("Refreshing the current section...");
  plotPending={}; plotErr={};
  triedCovers={};
  silentPullOnLoad();
  if(section==="films"&&tmdbKey()){
    ensureFilms(filmTab,true);
    if(filmTab==="mlott") ensureFilms("mlup",true);
    scheduleMediaWarmup("films",filmTab);
  }else if(section==="series"&&tmdbKey()){
    ensureSeries(seriesTab,true);
    scheduleMediaWarmup("series",seriesTab);
  }else if(section==="games"){
    if(tab==="upcoming") refreshUpcoming();
    else if(tab==="suggest") refreshCatalog();
  }
  if(section==="plex"&&plexServerUrl() && plexToken()) plexRefresh();
  if(section==="biglybt"){
    var biglyFrame=document.getElementById("biglyFrame");
    if(biglyFrame) biglyFrame.src=biglyFrame.src;
  }
  applyBackground();
  if(!phoneUi())render();
  setTimeout(backfillImages,600);
  if(phoneUi())setTimeout(function(){setPhoneRefreshing(false);},1400);
}
function refreshAllData(){
  flash("Refreshing all GameVault data in the background...");
  silentPullOnLoad();
  var tasks=[];
  if(getKey()){
    tasks.push(function(){return refreshUpcoming(true);});
    tasks.push(function(){return refreshCatalog(true);});
  }
  if(tmdbKey()){
    ["uphw","mlott","mlup","bluray","relhw"].forEach(function(key){tasks.push(function(){return ensureFilms(key,true);});});
    ["seriesnew","seriesupcoming","enseries","mlseries","taseries","hiseries"].forEach(function(key){tasks.push(function(){return ensureSeries(key,true);});});
  }
  var chain=Promise.resolve();
  tasks.forEach(function(task){chain=chain.then(task);});
  chain.then(function(){flash("All title lists are up to date");});
  if(plexServerUrl()&&plexToken())plexRefresh();
  setTimeout(backfillImages,600);
}
document.getElementById("refreshBtn").addEventListener("click",globalRefresh);
var syncNowBtn=document.getElementById("syncNowBtn");
if(syncNowBtn) syncNowBtn.addEventListener("click",function(){
  setMenuOpen(false);
  if(!gdConnected()){flash("Connect Google Drive in Settings first");toggleSettings(true);return;}
  refreshAllData();
});

/* ---------- swipe between tabs (phone) ---------- */
var TAB_ORDER=["rentals","playing","queue","upcoming","suggest","played"];
var swX=null,swY=0,swT=0;
document.addEventListener("touchstart",function(e){
  if(e.touches.length!==1){ swX=null; return; }
  var startX=e.touches[0].clientX;
  if(startX<24 || startX>window.innerWidth-24 || document.body.classList.contains("detail-open") || document.body.classList.contains("settings-open")){ swX=null; return; }
  // don't hijack horizontal gestures on inputs or scrollable strips
  if(e.target && e.target.closest && e.target.closest("input,textarea,select,.chipbar,#tabs,.sectionsw,.recent-strip,.viewbar,.actions,.ac-drop,.media-card,.game-tile,.plex-card,.phone-shelf-row,.phone-filter-bar")){ swX=null; return; }
  swX=startX; swY=e.touches[0].clientY; swT=Date.now();
},{passive:true});

var phoneGesture=null,phoneLongTimer=null,phoneSuppressClick=false;
function openPhoneCardActions(card){
  if(!card)return;
  var menu=card.querySelector("[data-phone-menu]");
  if(menu){menu.click();return;}
  var opener=card.querySelector('[data-act="game-open"],[data-act="plex-open"]');
  if(!opener)return;
  var id=opener.getAttribute("data-id"),act=opener.getAttribute("data-act");
  var title=(card.querySelector(".game-tile-title,.media-title")||{}).textContent||"Title";
  var body='<button type="button" data-act="'+act+'" data-id="'+esc(id)+'">Open details</button>';
  if(act==="game-open"){
    var game=gameFindById(id);if(game)body+=gameTilePrimary(game,id);
  }
  openPhoneSheet(title,body);
}
document.addEventListener("touchstart",function(e){
  if(!phoneUi()||e.touches.length!==1)return;
  var t=e.target,detail=t.closest&&t.closest(".media-page,.game-page");
  phoneGesture={x:e.touches[0].clientX,y:e.touches[0].clientY,at:Date.now(),card:t.closest&&t.closest(".media-card,.game-tile,.plex-card"),detail:detail,moved:false};
  if(phoneGesture.card){
    clearTimeout(phoneLongTimer);
    phoneLongTimer=setTimeout(function(){if(phoneGesture&&!phoneGesture.moved){phoneSuppressClick=true;openPhoneCardActions(phoneGesture.card);}},520);
  }
},{passive:true});
document.addEventListener("touchmove",function(e){
  if(!phoneGesture||!e.touches.length)return;
  var dx=e.touches[0].clientX-phoneGesture.x,dy=e.touches[0].clientY-phoneGesture.y;
  if(Math.abs(dx)>10||Math.abs(dy)>10){phoneGesture.moved=true;clearTimeout(phoneLongTimer);}
},{passive:true});
document.addEventListener("touchend",function(e){
  clearTimeout(phoneLongTimer);if(!phoneGesture)return;
  var g=phoneGesture;phoneGesture=null;
  var dx=e.changedTouches[0].clientX-g.x,dy=e.changedTouches[0].clientY-g.y;
  if(g.detail&&!e.target.closest("input,textarea,select,.actions,.detail-actionbar,.plot")){
    if(dy>110&&Math.abs(dy)>Math.abs(dx)*1.25){var close=g.detail.querySelector('[data-act="media-close"]');if(close)close.click();return;}
    if(Math.abs(dx)>90&&Math.abs(dx)>Math.abs(dy)*1.4){
      var neighbors=g.detail.querySelectorAll('[data-act="detail-neighbor"]');
      if(neighbors.length)(dx<0?neighbors[neighbors.length-1]:neighbors[0]).click();
      return;
    }
  }
  if(g.card&&Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.5)openPhoneCardActions(g.card);
},{passive:true});
document.addEventListener("click",function(e){
  if(phoneSuppressClick){phoneSuppressClick=false;e.preventDefault();e.stopPropagation();}
},true);

function decoratePhonePlots(){
  if(!phoneUi())return;
  [].forEach.call(document.querySelectorAll("#content .plot"),function(plot){
    if(plot.dataset.phonePlot)return;plot.dataset.phonePlot="1";
    requestAnimationFrame(function(){
      if(!plot.isConnected||plot.scrollHeight<=plot.clientHeight+18)return;
      var button=document.createElement("button");button.type="button";button.className="phone-plot-toggle";button.textContent="Read more";
      button.addEventListener("click",function(){var open=plot.classList.toggle("expanded");button.textContent=open?"Show less":"Read more";});
      plot.insertAdjacentElement("afterend",button);
    });
  });
}
var phoneContentObserver=new MutationObserver(function(){decoratePhonePlots();});
phoneContentObserver.observe(document.getElementById("content"),{childList:true,subtree:true});

var pullStartY=null,pullDistance=0;
function setPhoneRefreshing(active){
  var el=document.getElementById("phoneRefreshIndicator");if(!el)return;
  el.classList.toggle("show",!!active);if(!active)el.style.setProperty("--pull","0px");
}
document.addEventListener("touchstart",function(e){
  if(!phoneUi()||window.scrollY>1||document.body.classList.contains("detail-open")||document.body.classList.contains("phone-sheet-open")||e.touches.length!==1){pullStartY=null;return;}
  if(e.target.closest("input,textarea,select,.tabs,.phone-shelf-row")){pullStartY=null;return;}
  pullStartY=e.touches[0].clientY;pullDistance=0;
},{passive:true});
document.addEventListener("touchmove",function(e){
  if(pullStartY===null||!e.touches.length)return;
  pullDistance=Math.max(0,Math.min(110,e.touches[0].clientY-pullStartY));
  var el=document.getElementById("phoneRefreshIndicator");if(el){el.classList.toggle("show",pullDistance>12);el.style.setProperty("--pull",pullDistance+"px");}
},{passive:true});
document.addEventListener("touchend",function(){
  if(pullStartY===null)return;pullStartY=null;
  if(pullDistance>=78){setPhoneRefreshing(true);globalRefresh();setTimeout(function(){setPhoneRefreshing(false);},1400);}
  else setPhoneRefreshing(false);
},{passive:true});

var phoneLastScroll=0,phoneScrollTick=false;
window.addEventListener("scroll",function(){
  if(!phoneUi()||phoneScrollTick)return;phoneScrollTick=true;
  requestAnimationFrame(function(){
    var y=window.scrollY,down=y>phoneLastScroll&&y>70;
    document.body.classList.toggle("phone-header-compact",down&&!document.body.classList.contains("detail-open"));
    phoneLastScroll=y;phoneScrollTick=false;
  });
},{passive:true});

function phoneFocusableFields(){
  return [].slice.call(document.querySelectorAll('input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),select:not([disabled])')).filter(function(x){return x.offsetParent!==null;});
}
document.addEventListener("focusin",function(e){
  if(!phoneUi()||!e.target.matches("input,textarea,select"))return;
  var bar=document.getElementById("phoneKeyboardBar");if(bar)bar.hidden=false;
  setTimeout(function(){e.target.scrollIntoView({block:"center",behavior:"smooth"});},220);
});
document.addEventListener("focusout",function(){
  if(!phoneUi())return;
  setTimeout(function(){if(!document.activeElement.matches||!document.activeElement.matches("input,textarea,select"))document.getElementById("phoneKeyboardBar").hidden=true;},120);
});
document.getElementById("phoneKeyboardBar").addEventListener("click",function(e){
  var b=e.target.closest("[data-keyboard]");if(!b)return;
  var fields=phoneFocusableFields(),current=fields.indexOf(document.activeElement),action=b.getAttribute("data-keyboard");
  if(action==="done"){document.activeElement.blur();return;}
  var next=action==="previous"?Math.max(0,current-1):Math.min(fields.length-1,current+1);if(fields[next])fields[next].focus();
});

var pendingPhoneWorker=null;
function setPhoneStatus(message,tone,action){
  var el=document.getElementById("phoneStatusBanner");if(!el)return;
  if(!message){el.hidden=true;el.innerHTML="";return;}
  el.hidden=false;el.className="phone-status-banner "+(tone||"");el.innerHTML='<span>'+esc(message)+'</span>'+(action?'<button type="button" data-phone-status-action="'+action+'">'+(action==="update"?"Install":"Retry")+'</button>':'');
}
function updatePhoneConnectionStatus(){
  if(!phoneUi())return;
  if(!navigator.onLine)setPhoneStatus("Offline - showing saved GameVault data","offline","retry");
  else if(!pendingPhoneWorker)setPhoneStatus("");
}
document.getElementById("phoneStatusBanner").addEventListener("click",function(e){
  var b=e.target.closest("[data-phone-status-action]");if(!b)return;
  if(b.getAttribute("data-phone-status-action")==="update"&&pendingPhoneWorker)pendingPhoneWorker.postMessage({type:"SKIP_WAITING"});
  else{setPhoneStatus("Checking connection...","");globalRefresh();setTimeout(updatePhoneConnectionStatus,1200);}
});
window.addEventListener("online",updatePhoneConnectionStatus);
window.addEventListener("offline",updatePhoneConnectionStatus);
document.addEventListener("touchend",function(e){
  if(swX===null) return;
  var dx=e.changedTouches[0].clientX-swX;
  var dy=e.changedTouches[0].clientY-swY;
  swX=null;
  if(Date.now()-swT>600) return;                                 // slow drag, not a swipe
  if(Math.abs(dx)<70 || Math.abs(dx)<Math.abs(dy)*1.8) return;   // mostly vertical → scrolling
  if(section==="biglybt") return;
  var order = section==="films" ? FILM_ORDER : section==="series" ? SERIES_ORDER : section==="plex" ? PLEX_ORDER : TAB_ORDER;
  var cur = section==="films" ? filmTab : section==="series" ? seriesTab : section==="plex" ? plexTab : tab;
  var i=order.indexOf(cur); if(i<0) return;
  var ni=i+(dx<0?1:-1);
  if(ni<0 || ni>=order.length) return;
  if(section==="films") switchFilmTab(order[ni]); else if(section==="series") switchSeriesTab(order[ni]); else if(section==="plex") switchPlexTab(order[ni]); else switchTab(order[ni]);
},{passive:true});

/* ---------- back to top ---------- */
var toTopBtn=document.getElementById("toTop");
window.addEventListener("scroll",function(){
  toTopBtn.classList.toggle("show", window.scrollY>600);
},{passive:true});
toTopBtn.addEventListener("click",function(){ window.scrollTo({top:0,behavior:"smooth"}); });

/* ---------- startup ---------- */
/* Re-sync whenever the app comes back to the foreground (phone unlocked,
   tab refocused), and flush any pending change immediately when it leaves. */
function flushPendingPush(){
  if(!cloudMode()) return;
  if(data.updatedAt>lastSyncedAt){ clearTimeout(autoPushTimer); silentPush(true); }
}
var releaseCheckAt=0;
function versionNumber(value){
  return String(value||"0").split(".").reduce(function(total,part,index){return total+(Number(part)||0)*Math.pow(100,2-index);},0);
}
function checkReleaseVersion(force){
  if(location.protocol.indexOf("http")!==0||/^(localhost|127\.0\.0\.1)$/.test(location.hostname))return;
  if(!force&&Date.now()-releaseCheckAt<30*60*1000)return;
  releaseCheckAt=Date.now();
  fetchWithPolicy("./release.json?check="+releaseCheckAt,{cache:"no-store"},{scope:"release-check",timeout:8000,retries:0,noDedupe:true})
    .then(function(response){return response.json();})
    .then(function(remote){
      if(versionNumber(remote.version)<=versionNumber(APP_VERSION))return;
      if(phoneUi())setPhoneStatus("GameVault "+remote.version+" is available","update","update");
      if("serviceWorker" in navigator)navigator.serviceWorker.getRegistration().then(function(reg){if(reg)reg.update();});
    }).catch(function(){});
}
function warmVisibleContent(){
  if(document.visibilityState==="hidden") return;
  checkReleaseVersion(false);
  if(section==="films"){ensureFilms(filmTab);scheduleMediaWarmup("films",filmTab);}
  else if(section==="series"){ensureSeries(seriesTab);scheduleMediaWarmup("series",seriesTab);}
  else if(section==="games")scheduleGameWarmup(tab);
}
function hydrateIndexedStorage(){
  if(!window.GameVaultCore)return Promise.resolve(false);
  function newestCacheTime(cache){
    var newest=0;Object.keys(cache||{}).forEach(function(key){var item=cache[key];if(item&&item.t)newest=Math.max(newest,Number(item.t)||0);});return newest;
  }
  return Promise.all([
    GameVaultCore.storage.get("vault"),
    GameVaultCore.storage.get("film-cache"),
    GameVaultCore.storage.get("series-cache"),
    GameVaultCore.storage.get("plots"),
    GameVaultCore.storage.get("plex-cache")
  ]).then(function(values){
    var changed=false,idbVault=values[0];
    if(idbVault&&validateVault(idbVault).ok&&(Number(idbVault.updatedAt)||0)>(Number(data.updatedAt)||0)){
      var result=mergeAutomaticCloud(idbVault,"IndexedDB recovery");
      changed=changed||result.changedLocal;
    }
    if(values[1]&&newestCacheTime(values[1])>newestCacheTime(filmCache)){filmCache=values[1];changed=true;}
    if(values[2]&&newestCacheTime(values[2])>newestCacheTime(seriesCache)){seriesCache=values[2];changed=true;}
    if(values[3]&&Object.keys(values[3]).length>Object.keys(plotCache||{}).length){plotCache=values[3];changed=true;}
    if(values[4]&&values[4].at>plexCacheAt){plexCacheAt=values[4].at;plexItems=values[4].items||[];changed=true;}
    if(!values[1]&&Object.keys(filmCache||{}).length)saveFilmCache();
    if(!values[2]&&Object.keys(seriesCache||{}).length)saveSeriesCache();
    if(!values[3]&&Object.keys(plotCache||{}).length)savePlots();
    if(!values[4]&&plexItems.length){
      var initialPlex={at:plexCacheAt||Date.now(),items:plexItems};
      GameVaultCore.storage.put("plex-cache",initialPlex).then(function(result){if(result!==false)try{localStorage.removeItem(PLEX_CACHE_KEY);}catch(e){}});
    }
    if(changed){persistSilent();render();}
    return changed;
  }).catch(function(error){reportError("indexeddb:hydrate",error);return false;});
}
document.addEventListener("visibilitychange",function(){
  if(document.visibilityState==="visible"){
    silentPullOnLoad();warmVisibleContent();
  }else{
    flushPendingPush();
  }
});
window.addEventListener("online",warmVisibleContent);
window.addEventListener("pagehide",flushPendingPush);
/* iOS restores pages from the back-forward cache with in-flight fetches dead —
   clear the pending flags so plot loads restart instead of spinning forever */
window.addEventListener("pageshow",function(e){
  if(e.persisted){ plotPending={}; render(); }
});

applyKeysFromData();     // migrate legacy cached keys into device-local storage
backfillKeysToData();    // scrub any remaining key material from the vault object
secureConfigAutoUnlock();
if("serviceWorker" in navigator && location.protocol.indexOf("http")===0 && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)){
  navigator.serviceWorker.register("sw.js?v="+APP_VERSION,{updateViaCache:"none"}).then(function(reg){
    function offerUpdate(worker){
      if(!worker) return;
      if(phoneUi()){pendingPhoneWorker=worker;setPhoneStatus("GameVault "+APP_VERSION+" is ready to install","update","update");return;}
      flash("A GameVault update is ready - tap here to install",function(){ worker.postMessage({type:"SKIP_WAITING"}); });
    }
    if(reg.waiting) offerUpdate(reg.waiting);
    reg.update().catch(function(){});
    reg.addEventListener("updatefound",function(){
      var worker=reg.installing;
      if(worker) worker.addEventListener("statechange",function(){ if(worker.state==="installed" && navigator.serviceWorker.controller) offerUpdate(worker); });
    });
    var reloading=false;
    navigator.serviceWorker.addEventListener("controllerchange",function(){ if(!reloading){ reloading=true;pendingPhoneWorker=null;location.reload(); } });
  }).catch(function(){});
}
document.addEventListener("error",function(e){
  var img=e.target;
  if(img && img.tagName==="IMG" && !img.dataset.fallbackDone){
    img.dataset.fallbackDone="1";
    img.style.visibility="hidden";
    if(img.parentElement) img.parentElement.classList.add("image-missing");
  }
},true);
setTimeout(function(){
  if(gdClientId()) gdLoadGoogleIdentity().catch(function(){});
  var token=gdTok();
  if(token && token.access_token && Date.now()<(token.exp||0)-60000) gdRefreshUsage(token.access_token);
  checkReleaseVersion(true);
},1000);
/* deep link: ?section=films&tab=mlott — completes the existing ?section support
   so iOS Shortcuts / bookmarks can open any page directly (view-only; the
   saved default tab is not overwritten until the user taps a tab) */
(function(){
  var wanted="";
  try{ wanted=new URLSearchParams(location.search).get("tab")||""; }catch(e){}
  if(!wanted) return;
  if(section==="games" && TAB_ORDER.indexOf(wanted)>=0) tab=wanted;
  else if(section==="films" && FILM_ORDER.indexOf(wanted)>=0) filmTab=wanted;
  else if(section==="series" && SERIES_ORDER.indexOf(wanted)>=0) seriesTab=wanted;
  else if(section==="plex" && PLEX_ORDER.indexOf(wanted)>=0) plexTab=wanted;
  else if(section==="health" && ["healthoverview","healthfood","healthlabs"].indexOf(wanted)>=0) healthTab=wanted;
  else if(section==="finance" && ["financeoverview","financetransactions","financeloans","financestatements"].indexOf(wanted)>=0) financeTab=wanted;
})();
[].forEach.call(document.querySelectorAll("#sectionSw button"),function(b){
  var active=b.getAttribute("data-section")===section;
  b.classList.toggle("on",active);
  if(active) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current");
});
render();
hydrateIndexedStorage().then(function(){
  secureConfigAutoUnlock();
  if(section==="films"){ensureFilms(filmTab);scheduleMediaWarmup("films",filmTab);}
  if(section==="series"){ensureSeries(seriesTab);scheduleMediaWarmup("series",seriesTab);}
  if(section==="games")scheduleGameWarmup(tab);
});
decoratePhonePlots();
updatePhoneConnectionStatus();
refreshRecoveryUi();
if(plexServerUrl() && plexToken()) setTimeout(plexRefresh,500);
silentPullOnLoad();
setTimeout(backfillImages,1500);
