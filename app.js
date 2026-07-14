"use strict";
var APP_VERSION = "1.9.0";
var APP_BUILD_DATE = "2026-07-14";
var APP_RELEASE_CHANNEL = "Stable";
var APP_RELEASE_NOTES = [
  "Replaced the Shield layout with a dedicated view-only TV interface",
  "Added YouTube-style navigation, horizontal shelves and cinematic title details",
  "Removed editing, search, backup and advanced settings from the normal TV experience",
  "Added deterministic rail, shelf and card navigation for the NVIDIA Shield remote",
  "Rebuilt Android TV focus navigation for predictable one-step D-pad movement",
  "Made all TV menus, settings groups, dropdowns, dialogs and detail actions reachable",
  "Removed TV focus jumps caused by page recentering and card scaling",
  "Added dedicated English, Malayalam, Tamil and Hindi TV show tabs",
  "Improved 1080p and 2K layouts with sharper wide-screen artwork",
  "Fixed desktop navigation and detail-toolbar alignment",
  "Added one-click Watchlist, Watching and Watched actions with Undo",
  "Redesigned title cards, full-page details and desktop Library utilities",
  "Improved Windows alignment, sorting, status visibility and light-mode contrast",
  "Added a Windows laptop workspace with compact navigation and wider 16:9 layouts",
  "Added Ctrl+K search, keyboard shortcuts and persistent desktop navigation preferences",
  "Moved desktop Settings and quick actions into non-disruptive overlay panels",
  "Improved Windows density, contrast, focus visibility and sync status feedback",
  "Redesigned Android TV with a dedicated navigation rail and 10-foot layout",
  "Added stable per-screen focus memory, overlay focus traps and remote-safe text editing",
  "Added cinematic TV details, compact status rows and fixed-position notifications",
  "Upgraded the Shield launcher lifecycle, offline recovery and external-page return controls",
  "Redesigned the iPhone interface with a native-style bottom navigation bar",
  "Added compact phone headers, centered subsection tabs and full-screen Settings",
  "Improved mobile touch targets, detail pages, menus and safe-area spacing",
  "Locked accidental pinch and gesture zoom on iPhone while preserving scrolling",
  "Optimized portrait and landscape layouts for iPhone 17 Pro",
  "Fixed clipped text, top controls, forms and action buttons on iPhone",
  "Added Dynamic Island and home-indicator safe-area support",
  "Version badge is always visible in the top bar",
  "Coming Soon now includes major U.S. theatrical releases in every language",
  "Exact U.S. theatrical dates replace global or festival dates",
  "Original language is shown for non-English upcoming movies",
  "Clearer Games, Movies, TV Shows, Plex Library and BiglyBT navigation",
  "TV Watching, New Episodes, Upcoming and unified Discover tabs",
  "Plex Home, Continue Watching and Recently Added views",
  "Combined current and upcoming Malayalam OTT releases",
  "BiglyBT Active, Queued, Completed, Seeding and All filters"
];

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
var TV_MODE = new URLSearchParams(location.search).get("tv")==="1";
if(TV_MODE) document.documentElement.classList.add("tv");
var TV_ZOOM_KEY="gamevault-tv-zoom";
function tvZoomValue(){
  try{ return Math.min(1.15, Math.max(0.70, Number(localStorage.getItem(TV_ZOOM_KEY))||0.90)); }catch(e){ return 0.90; }
}
function applyTvZoom(){
  if(!TV_MODE) return;
  var z=tvZoomValue();
  document.documentElement.style.setProperty("--tv-zoom", String(z));
  document.documentElement.style.setProperty("--tv-zoom-size", (100/z).toFixed(3)+"%");
  var btn=document.getElementById("tvZoomResetBtn");
  if(btn) btn.textContent=Math.round(z*100)+"%";
  var settingsBtn=document.getElementById("tvSettingsZoomResetBtn");
  if(settingsBtn) settingsBtn.textContent=Math.round(z*100)+"%";
}
function setTvZoom(v){
  v=Math.min(1.15, Math.max(0.70, Math.round(v*100)/100));
  try{ localStorage.setItem(TV_ZOOM_KEY,String(v)); }catch(e){}
  applyTvZoom();
  if(typeof flash==="function") flash("TV zoom "+Math.round(v*100)+"%");
}
applyTvZoom();
var DENSITY_KEY="gamevault-density";
var uiDensity="comfortable";
try{ uiDensity=localStorage.getItem(DENSITY_KEY)||"comfortable"; }catch(e){}
function applyDensity(){ document.documentElement.classList.toggle("density-compact",uiDensity==="compact"&&!TV_MODE); }
applyDensity();
var DESKTOP_RAIL_KEY="gamevault-desktop-rail-collapsed";
function desktopMode(){ return !TV_MODE && window.matchMedia && window.matchMedia("(min-width:900px)").matches; }
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

/* ---------- built-in seeds (work fully offline) ---------- */
var SEED_UPCOMING = [
  {name:"Marvel Tōkon: Fighting Souls", date:"2026-08-06", note:"Marvel tag-team fighter from Arc System Works"},
  {name:"Metal Gear Solid: Master Collection Vol. 2", date:"2026-08-27", note:"MGS3/4-era classics collection"},
  {name:"Resonance: A Plague Tale Legacy", date:"2026-08-27", note:"New chapter in the Plague Tale saga"},
  {name:"Star Wars: Zero Company", date:"2026-08-27", note:"Turn-based tactics set in the Clone Wars era"},
  {name:"Phantom Blade Zero", date:"2026-09-09", note:"Kung-fu punk action, 30–40 hr campaign"},
  {name:"Marvel's Wolverine", date:"2026-09-15", note:"Insomniac's PS5 exclusive — brutal claw combat", want:true},
  {name:"Castlevania: Belmont's Curse", date:"2026-10-15", note:"New mainline Castlevania"},
  {name:"Grand Theft Auto VI", date:"2026-11-19", note:"Rockstar. Leonida. Lucia & Jason. The big one.", want:true},
  {name:"Assassin's Creed Black Flag Resynced", date:null, note:"Black Flag remake — 2026, date TBC"},
  {name:"The Blood of the Dawnwalker", date:null, note:"Dark-fantasy vampire RPG, ex-Witcher devs — 2026"},
  {name:"Onimusha: Way of the Sword", date:null, note:"Capcom's samurai revival — 2026"},
  {name:"Control Resonant", date:null, note:"Remedy's Control follow-up — 2026"}
].map(function(g){ return {id:uid(), name:g.name, date:g.date, note:g.note, want:!!g.want, src:"seed"}; });

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
var VAULT_ARRAY_FIELDS = ["rentals","upcoming","played","dismissed","catalogExtra","vendors","queue","rentalHistory","playing","upcomingRemoved","watchedMovies","movieWatchlist","hiddenMovies","watchedSeries","seriesWatchlist","watchingSeries","hiddenSeries"];
var VAULT_OBJECT_FIELDS = ["covers","dismissedNames","fandom","hubkeys","keys","seriesRatings","aiChats"];
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
function adoptVault(incoming,reason){
  var checked=validateVault(incoming);
  if(!checked.ok) throw new Error("Backup rejected: "+checked.errors.join(" "));
  if(data && vaultSize(data)) createRecoverySnapshot("Before "+(reason||"data restore"),data);
  data=migrate(incoming);
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
         ((d&&d.playing)||[]).length + ((d&&d.movieWatchlist)||[]).length +
         ((d&&d.watchedMovies)||[]).length + ((d&&d.hiddenMovies)||[]).length +
         ((d&&d.seriesWatchlist)||[]).length + ((d&&d.watchingSeries)||[]).length + ((d&&d.watchedSeries)||[]).length +
         ((d&&d.hiddenSeries)||[]).length;
}
/* Schema migrations: bump SCHEMA_VERSION when structure changes and add an
   upgrade step below. Old data is always upgraded in place, never recreated. */
var SCHEMA_VERSION = 7;
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
  if(!d.hiddenMovies) d.hiddenMovies = []; // films marked Not Interested, synced
  if(!d.watchedSeries) d.watchedSeries = []; // TV series marked Watched, synced
  if(!d.seriesWatchlist) d.seriesWatchlist = []; // personal TV series watchlist, synced
  if(!d.watchingSeries) d.watchingSeries = []; // TV shows currently being watched, synced
  if(!d.seriesRatings) d.seriesRatings = {}; // per-series preference ratings, synced
  if(!d.hiddenSeries) d.hiddenSeries = []; // TV series marked Not Interested, synced
  if(!d.aiChats) d.aiChats = {}; // saved AI assistant conversation links by title/service, synced
  // v5: a game appears at most once per library — merge accidental duplicates
  d.played = dedupeList(d.played);
  d.playing = dedupeList(d.playing);
  if(!Array.isArray(d.audit)) d.audit=[];
  d.revision=Math.max(0,Number(d.revision)||0);
  if(!d.updatedAt) d.updatedAt = Date.now();
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
function vaultFingerprint(d){
  return ["rentals","rentalHistory","playing","queue","played","movieWatchlist","watchedMovies","seriesWatchlist","watchingSeries","watchedSeries"].map(function(k){ return k+":"+((d[k]||[]).length); }).join(", ");
}
var lastAuditFingerprint=vaultFingerprint(data);
function getKey(){ try { return localStorage.getItem(KEY_STORE) || ""; } catch(e){ return ""; } }
function persist(){
  data.updatedAt = Date.now();
  data.revision=(Number(data.revision)||0)+1;
  data.lastDevice=deviceId();
  var fingerprint=vaultFingerprint(data);
  if(fingerprint!==lastAuditFingerprint){ addAudit("library-counts-changed",fingerprint); lastAuditFingerprint=fingerprint; }
  var snaps=readRecoverySnapshots();
  if(vaultSize(data) && (!snaps.length || Date.now()-snaps[0].createdAt>21600000)) createRecoverySnapshot("Automatic checkpoint",data);
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(data)); }catch(e){ flash("Local storage is full - export a backup now"); }
  scheduleAutoPush();
}
function save(){ persist(); render(); }
/* Save derived data (covers, fetched scores) WITHOUT bumping updatedAt, so an
   idle device backfilling artwork can never out-timestamp real edits made on
   another device and roll them back via cloud sync */
function persistSilent(){
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(data)); }catch(e){}
}

/* ---------- synced API keys (RAWG / TMDB / OMDb) ----------
   Keys live in data.keys and ride the cloud backup to every device, so after a
   Google sign-in (or a cache wipe + re-sign-in) they restore automatically.
   The device-local getKey()/tmdbKey()/omdbKey() still read localStorage; these
   helpers keep localStorage and data.keys in step. JSONBin's Master Key is
   deliberately NOT synced (it's the one sensitive credential). */
var SYNCED_KEYS={rawg:KEY_STORE, tmdb:"ps5-tmdb-key", omdb:"ps5-omdb-key"};
function setSyncedKey(which, val){
  var s=SYNCED_KEYS[which]; if(!s) return;
  try{ localStorage.setItem(s, val); }catch(e){}
  if(!data.keys) data.keys={};
  data.keys[which]=val;
  persist(); // a real change → pushes to the cloud with the rest of the vault
}
/* cloud → local: write synced keys into localStorage (after a pull / on load) */
function applyKeysFromData(){
  var k=data.keys; if(!k) return;
  for(var w in SYNCED_KEYS){
    if(typeof k[w]==="string" && k[w]){ try{ localStorage.setItem(SYNCED_KEYS[w], k[w]); }catch(e){} }
  }
}
/* local → cloud: fold any pre-existing local keys into data.keys (no timestamp
   bump) so they ride along on the next normal sync push */
function backfillKeysToData(){
  if(!data.keys) data.keys={};
  var changed=false;
  for(var w in SYNCED_KEYS){
    var local=""; try{ local=localStorage.getItem(SYNCED_KEYS[w])||""; }catch(e){}
    if(local && !data.keys[w]){ data.keys[w]=local; changed=true; }
  }
  if(changed) persistSilent();
}
/* Bidirectional key merge run on every cloud sync — self-healing:
   this device adopts any key the cloud has that it lacks, and flags a push
   for any key it holds that the cloud is missing. Returns {changed, push}. */
function reconcileKeys(cloudData){
  var ck=(cloudData&&cloudData.keys)||{};
  if(!data.keys) data.keys={};
  var res={changed:false, push:false};
  for(var w in SYNCED_KEYS){
    var local=""; try{ local=localStorage.getItem(SYNCED_KEYS[w])||""; }catch(e){}
    var mine=data.keys[w]||local||"";
    var cloud=ck[w]||"";
    if(!mine && cloud){                       // cloud has it, we don't → adopt
      try{ localStorage.setItem(SYNCED_KEYS[w], cloud); }catch(e){}
      data.keys[w]=cloud; res.changed=true;
    } else if(mine){                          // we have it → keep, and push if cloud lacks/differs
      if(local!==mine){ try{ localStorage.setItem(SYNCED_KEYS[w], mine); }catch(e){} res.changed=true; }
      data.keys[w]=mine;
      if(mine!==cloud) res.push=true;
    }
  }
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

/* ---------- cloud sync (JSONBin) ---------- */
var JB_KEY_STORE="ps5-jsonbin-key", JB_BIN_STORE="ps5-jsonbin-bin";
function getJB(){
  try { return { key:localStorage.getItem(JB_KEY_STORE)||"", bin:localStorage.getItem(JB_BIN_STORE)||"" }; }
  catch(e){ return {key:"",bin:""}; }
}
function jbPushCloud(){
  var jb=getJB();
  if(!jb.key){ flash("Set up cloud sync in Settings first"); toggleSettings(true); return; }
  if(busy) return; busy=true;
  var isNew=!jb.bin;
  var url=isNew?"https://api.jsonbin.io/v3/b":"https://api.jsonbin.io/v3/b/"+jb.bin;
  var headers={ "Content-Type":"application/json", "X-Master-Key":jb.key };
  if(isNew){ headers["X-Bin-Private"]="true"; headers["X-Bin-Name"]="game-vault"; }
  fetch(url,{ method:isNew?"POST":"PUT", headers:headers, body:JSON.stringify(data) })
  .then(function(res){ if(!res.ok) throw new Error("HTTP "+res.status); return res.json(); })
  .then(function(json){
    if(isNew && json.metadata && json.metadata.id){
      try{ localStorage.setItem(JB_BIN_STORE,json.metadata.id); }catch(e){}
    }
    busy=false;
    lastSyncedAt=data.updatedAt;
    setSyncStatus("Synced just now");
    var bin=getJB().bin;
    flash("Pushed to cloud"+(isNew&&bin?(" — Bin ID saved: "+bin+" (see Settings)"):""));
    toggleSettings(false);
  })
  .catch(function(err){ busy=false; flash("Push failed — check internet and Master Key"); });
}
function jbPullCloud(confirmed){
  var jb=getJB();
  if(!jb.key||!jb.bin){ flash("Enter Master Key and Bin ID in Settings first"); toggleSettings(true); return; }
  if(busy) return;
  if(!confirmed){
    if(TV_MODE){tvConfirm("Replace the data on this device with the JSONBin cloud copy?","Replace local data",function(){jbPullCloud(true);});return;}
    if(!confirm("Replace the data on THIS device with the cloud copy?")) return;
  }
  busy=true;
  fetch("https://api.jsonbin.io/v3/b/"+jb.bin+"/latest",{ headers:{ "X-Master-Key":jb.key } })
  .then(function(res){ if(!res.ok) throw new Error("HTTP "+res.status); return res.json(); })
  .then(function(json){
    var d=json.record;
    if(d&&d.rentals&&d.upcoming&&d.played){
      adoptVault(d,"JSONBin manual pull"); busy=false; lastSyncedAt=data.updatedAt; render(); flash("Pulled from cloud - this device is up to date");
    } else { busy=false; flash("Cloud data doesn't look like a Game Vault backup"); }
  })
  .catch(function(err){ busy=false; flash("Pull failed — check internet, Master Key and Bin ID"); });
}

/* ---------- automatic sync engine ---------- */
/* Every device that has the same Master Key + Bin ID stays in step without
   any button presses: the newest updatedAt timestamp always wins. */
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
function jbSilentPush(keepalive){
  var jb=getJB();
  if(!jb.key) return;
  var isNew=!jb.bin;
  var url=isNew?"https://api.jsonbin.io/v3/b":"https://api.jsonbin.io/v3/b/"+jb.bin;
  var headers={ "Content-Type":"application/json", "X-Master-Key":jb.key };
  if(isNew){ headers["X-Bin-Private"]="true"; headers["X-Bin-Name"]="game-vault"; }
  var snapshot=JSON.stringify(data);
  fetch(url,{ method:isNew?"POST":"PUT", headers:headers, body:snapshot, keepalive:!!keepalive })
  .then(function(res){ if(!res.ok) throw new Error("HTTP "+res.status); return res.json(); })
  .then(function(json){
    if(isNew && json.metadata && json.metadata.id){
      try{ localStorage.setItem(JB_BIN_STORE,json.metadata.id); }catch(e){}
      flash("Cloud sync connected — Bin ID saved automatically");
    }
    lastSyncedAt=data.updatedAt;
    setSyncStatus("Synced just now");
  })
  .catch(function(){ setSyncStatus("Sync failed — will retry on next change"); });
}
function jbSilentPullOnLoad(){
  var jb=getJB();
  if(!jb.key||!jb.bin) return;
  setSyncStatus("Checking for updates…");
  fetch("https://api.jsonbin.io/v3/b/"+jb.bin+"/latest",{ headers:{ "X-Master-Key":jb.key } })
  .then(function(res){ if(!res.ok) throw new Error("HTTP "+res.status); return res.json(); })
  .then(function(json){
    var d=json.record;
    cloudChecked=true;
    if(!d||!d.rentals||!d.upcoming||!d.played){ setSyncStatus(""); return; }
    var cloudTime=d.updatedAt||0, localTime=data.updatedAt||0;
    if(cloudTime>localTime || (vaultSize(data)===0 && vaultSize(d)>0)){
      adoptVault(d,"JSONBin automatic pull");
      lastSyncedAt=data.updatedAt;
      render();
      setSyncStatus("Synced from your other device");
      flash("Pulled the newer data from your other device");
      setTimeout(backfillImages,800);
    } else if(localTime>cloudTime){
      lastSyncedAt=cloudTime;
      silentPush(); // this device is ahead, push it up
    } else {
      lastSyncedAt=cloudTime;
      setSyncStatus("Up to date");
    }
  })
  .catch(function(){ setSyncStatus(""); });
}

/* ---------- Google Drive sync (primary) ----------
   Browser-only OAuth via Google Identity Services (loaded from CDN in <head>).
   The whole vault lives as one JSON file (SinuGameVault.json) created by this
   app in the user's Drive under the non-sensitive drive.file scope — the app
   can always find its own file again after a sign-in, so clearing the cache
   loses nothing. */
var GD_CLIENT_STORE="ps5-gd-client", GD_TOKEN_STORE="ps5-gd-token", GD_FILE_STORE="ps5-gd-file";
var GD_HISTORY_STORE="ps5-gd-history-at", GD_HISTORY_PREFIX="game-vault-history-";
var GD_TV_CLIENT_STORE="ps5-gd-tv-client", GD_TV_SECRET_STORE="ps5-gd-tv-secret";
var GD_FILENAME="game-vault-backup.json";
var GD_SCOPE="https://www.googleapis.com/auth/drive.file";
var gdTokenClient=null, gdRefreshing=false, gdTvPollTimer=null;
/* Baked-in Google OAuth Client ID (public by design — its security is the
   Authorized JavaScript origins list, not secrecy). Lets a fresh/wiped device
   connect Drive and pull everything back with no manual entry. A value saved
   in Settings still overrides it. */
var GD_CLIENT_DEFAULT="898110284062-76km1uptkth506kgaecoafohu15js0rh.apps.googleusercontent.com";
function gdClientId(){ try{ return localStorage.getItem(GD_CLIENT_STORE)||GD_CLIENT_DEFAULT; }catch(e){ return GD_CLIENT_DEFAULT; } }
function gdTvClientId(){ try{ return localStorage.getItem(GD_TV_CLIENT_STORE)||""; }catch(e){ return ""; } }
function gdTvSecret(){ try{ return localStorage.getItem(GD_TV_SECRET_STORE)||""; }catch(e){ return ""; } }
function gdTok(){ try{ return JSON.parse(localStorage.getItem(GD_TOKEN_STORE)||"null"); }catch(e){ return null; } }
function gdSaveTok(t){ try{ if(t) localStorage.setItem(GD_TOKEN_STORE,JSON.stringify(t)); else localStorage.removeItem(GD_TOKEN_STORE); }catch(e){} }
function gdConnected(){ return !!(gdClientId() && gdTok()); }
function cloudMode(){ return gdConnected() ? "drive" : (getJB().key ? "jsonbin" : ""); }

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
function gdRefreshFromDeviceToken(t){
  if(!t || !t.refresh_token || !gdTvClientId()) return Promise.reject(new Error("No TV refresh token"));
  var body=new URLSearchParams();
  body.set("client_id",gdTvClientId());
  if(gdTvSecret()) body.set("client_secret",gdTvSecret());
  body.set("refresh_token",t.refresh_token);
  body.set("grant_type","refresh_token");
  return fetch("https://oauth2.googleapis.com/token",{
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:body.toString()
  }).then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error_description||j.error||("Drive token refresh failed "+r.status)); return j; }); })
  .then(function(j){
    var nt={access_token:j.access_token, exp:Date.now()+(Number(j.expires_in)||3600)*1000, refresh_token:t.refresh_token, tv:true};
    gdSaveTok(nt); gdSetStatus();
    return nt.access_token;
  });
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
  if(t && t.refresh_token && gdTvClientId()) return gdRefreshFromDeviceToken(t);
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
  return fetch(url,opts).then(function(r){
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
    var body=JSON.stringify(data),uploadedAt=Number(data.updatedAt)||0;
    return gdToken().then(function(tok){
      return gdFind(tok).then(function(fid){
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
      }).then(function(){ return gdMaybeHistory(tok,body); })
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
  var out=document.getElementById("gdSignOutBtn");
  var inn=document.getElementById("gdSignInBtn");
  if(!el) return;
  if(!gdClientId()){ el.textContent="Paste your Client ID above, then sign in."; out.style.display="none"; inn.style.display=""; return; }
  var t=gdTok();
  if(!t){ el.textContent="Not connected."; out.style.display="none"; inn.style.display=""; return; }
  el.textContent = Date.now()<(t.exp||0)-60000 ? "✓ Connected — auto-sync to Drive is on." : "✓ Connected — session renews on your next tap.";
  out.style.display=""; inn.style.display="none";
}
function gdSignIn(){
  if(!gdClientId()){ flash("Paste your Google OAuth Client ID first"); return; }
  var el=document.getElementById("gdStatus");
  if(el) el.textContent="Loading Google sign-in...";
  gdToken().then(function(){
    flash("Google Drive connected — it is now your primary sync");
    gdSetStatus(); silentPullOnLoad();
  }).catch(function(e){ flash("Google sign-in failed — "+e.message); });
}
function gdSignOut(){
  var t=gdTok();
  try{ if(t && t.access_token && window.google && google.accounts && google.accounts.oauth2) google.accounts.oauth2.revoke(t.access_token,function(){}); }catch(e){}
  gdSaveTok(null);
  try{ localStorage.removeItem(GD_FILE_STORE); }catch(e){}
  gdSetStatus(); setSyncStatus("");
  flash("Google Drive disconnected"+(getJB().key?" — JSONBin fallback is active":""));
}
function gdTvSetStatus(msg){
  var el=document.getElementById("gdTvStatus");
  if(el) el.textContent=msg||"";
}
function gdTvStop(){
  if(gdTvPollTimer){ clearTimeout(gdTvPollTimer); gdTvPollTimer=null; }
  var cancel=document.getElementById("gdTvCancelBtn");
  if(cancel) cancel.style.display="none";
}
function gdTvQrUrl(url){
  return "https://quickchart.io/qr?size=280&text="+encodeURIComponent(url);
}
function gdTvRenderCode(info){
  var box=document.getElementById("gdTvBox");
  if(!box) return;
  var url=info.verification_url_complete||info.verification_uri_complete||info.verification_url||info.verification_uri;
  var base=info.verification_url||info.verification_uri||"https://www.google.com/device";
  box.style.display="block";
  box.innerHTML=
    '<b style="color:var(--text)">Scan with your phone</b>'+
    '<img src="'+gdTvQrUrl(url)+'" alt="Google TV login QR">'+
    '<div class="meta">If the QR does not open, go to <a href="'+esc(base)+'" target="_blank" rel="noopener">'+esc(base)+'</a> and enter:</div>'+
    '<div class="tv-code">'+esc(info.user_code||"")+'</div>'+
    '<div class="meta">Waiting for approval on your phone...</div>';
}
function gdTvPoll(deviceCode, interval, expiresAt){
  if(Date.now()>expiresAt){ gdTvStop(); gdTvSetStatus("QR login expired - start again."); return; }
  var body=new URLSearchParams();
  body.set("client_id",gdTvClientId());
  if(gdTvSecret()) body.set("client_secret",gdTvSecret());
  body.set("device_code",deviceCode);
  body.set("grant_type","urn:ietf:params:oauth:grant-type:device_code");
  fetch("https://oauth2.googleapis.com/token",{
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:body.toString()
  }).then(function(r){ return r.json().then(function(j){ j._ok=r.ok; return j; }); })
  .then(function(j){
    if(j._ok && j.access_token){
      gdTvStop();
      gdSaveTok({access_token:j.access_token, exp:Date.now()+(Number(j.expires_in)||3600)*1000, refresh_token:j.refresh_token||"", tv:true});
      gdSetStatus(); gdTvSetStatus("Connected - pulling Drive backup...");
      var box=document.getElementById("gdTvBox"); if(box) box.style.display="none";
      flash("Google Drive connected on TV");
      silentPullOnLoad();
      return;
    }
    if(j.error==="authorization_pending"){
      gdTvPollTimer=setTimeout(function(){ gdTvPoll(deviceCode, interval, expiresAt); }, interval*1000);
      return;
    }
    if(j.error==="slow_down"){
      gdTvPollTimer=setTimeout(function(){ gdTvPoll(deviceCode, interval+5, expiresAt); }, (interval+5)*1000);
      return;
    }
    gdTvStop();
    gdTvSetStatus(j.error_description||j.error||"QR login failed");
  }).catch(function(e){
    gdTvStop();
    gdTvSetStatus("QR login failed: "+e.message);
  });
}
function gdTvStart(){
  gdTvStop();
  var cid=gdTvClientId();
  if(!cid){ gdTvSetStatus("Save the TV OAuth Client ID first."); return; }
  gdTvSetStatus("Creating QR login...");
  var body=new URLSearchParams();
  body.set("client_id",cid);
  body.set("scope",GD_SCOPE);
  fetch("https://oauth2.googleapis.com/device/code",{
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:body.toString()
  }).then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error_description||j.error||("Device login failed "+r.status)); return j; }); })
  .then(function(info){
    gdTvRenderCode(info);
    gdTvSetStatus("Scan the QR with your phone.");
    var cancel=document.getElementById("gdTvCancelBtn"); if(cancel) cancel.style.display="";
    gdTvPoll(info.device_code, Math.max(5,Number(info.interval)||5), Date.now()+(Number(info.expires_in)||1800)*1000);
  }).catch(function(e){
    gdTvSetStatus(e.message);
  });
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

/* ---------- cloud dispatch: Google Drive primary, JSONBin fallback ---------- */
var cloudChecked=false; // true once this session has compared against the cloud copy
function silentPush(keepalive){
  // never auto-push an empty vault before we've seen what the cloud holds —
  // a cache-wiped device must pull the backup, not overwrite it
  if(vaultSize(data)===0 && !cloudChecked){ silentPullOnLoad(); return; }
  if(cloudMode()==="drive"){
    gdUpload(keepalive).then(function(uploadedAt){
      lastSyncedAt=Math.max(lastSyncedAt,uploadedAt||0);
      setSyncStatus("Synced to Drive just now");
      if((data.updatedAt||0)>(uploadedAt||0)) schedulePush();
    }).catch(function(){ setSyncStatus("Drive sync failed — will retry on next change"); });
    return;
  }
  jbSilentPush(keepalive);
}
function silentPullOnLoad(){
  if(cloudMode()==="drive"){
    setSyncStatus("Checking Google Drive…");
    gdDownload().then(function(d){
      cloudChecked=true;
      if(!d){ silentPush(); return; } // no backup file yet — seed Drive from this device
      if(!d.rentals||!d.upcoming||!d.played){ setSyncStatus(""); return; }
      var cloudTime=d.updatedAt||0, localTime=data.updatedAt||0;
      // empty-vault guard: whatever the timestamps say, a device holding no
      // games must adopt a cloud copy that has them — never the reverse
      var mustAdopt = vaultSize(data)===0 && vaultSize(d)>0;
      if(cloudTime>localTime || mustAdopt){
        adoptVault(d,"Google Drive automatic pull"); var rkA=reconcileKeys(d);
        lastSyncedAt=data.updatedAt;
        render();
        setSyncStatus("Synced from Google Drive");
        flash("Pulled the newer data from Google Drive");
        setTimeout(backfillImages,800);
        if(rkA.push) persist(); // we hold keys the cloud lacked → push them up
      } else if(localTime>cloudTime){
        lastSyncedAt=cloudTime;
        reconcileKeys(d);
        silentPush(); // this device is ahead (incl. its keys), push it up
      } else {
        lastSyncedAt=cloudTime;
        var rkC=reconcileKeys(d);
        if(rkC.changed) render();           // a key arrived from the cloud → reflect it
        if(rkC.push){ persist(); setSyncStatus("Synced keys to Drive"); }
        else setSyncStatus("Up to date");
      }
    }).catch(function(){ setSyncStatus("Drive check failed — tap ↻ to retry"); });
    return;
  }
  jbSilentPullOnLoad();
}
function pushCloud(confirmed){
  if(vaultSize(data)===0&&!confirmed){
    var emptyWarning="This device's vault is empty. Pushing now would overwrite the cloud backup with nothing. Pull from cloud instead unless this is intentional.";
    if(TV_MODE){tvConfirm(emptyWarning,"Push empty vault",function(){pushCloud(true);});return;}
    if(!confirm(emptyWarning)) return;
  }
  if(cloudMode()==="drive"){
    flash("Uploading to Google Drive…");
    gdUpload().then(function(uploadedAt){
      lastSyncedAt=Math.max(lastSyncedAt,uploadedAt||0);
      setSyncStatus("Synced to Drive just now");
      flash("Pushed to Google Drive");
      if((data.updatedAt||0)>(uploadedAt||0)) schedulePush();
    }).catch(function(e){ flash("Drive push failed — "+e.message); });
    return;
  }
  if(!cloudMode()){ flash("Connect Google Drive (or JSONBin) in Settings first"); toggleSettings(true); return; }
  jbPushCloud();
}
function pullCloud(confirmed){
  if(cloudMode()==="drive"){
    if(!confirmed){
      if(TV_MODE){tvConfirm("Replace the data on this device with the Google Drive copy?","Replace local data",function(){pullCloud(true);});return;}
      if(!confirm("Replace the data on THIS device with the Google Drive copy?")) return;
    }
    gdDownload().then(function(d){
      if(d && d.rentals && d.upcoming && d.played){
        adoptVault(d,"Google Drive manual pull"); lastSyncedAt=data.updatedAt; render();
        flash("Pulled from Google Drive — this device is up to date");
      } else flash(d ? "Drive data doesn't look like a Game Vault backup" : "No backup in Drive yet — push first");
    }).catch(function(e){ flash("Drive pull failed — "+e.message); });
    return;
  }
  if(!cloudMode()){ flash("Connect Google Drive (or JSONBin) in Settings first"); toggleSettings(true); return; }
  jbPullCloud();
}

/* ---------- RAWG live updates ---------- */
function refreshUpcoming(){
  var key=getKey();
  if(!key){ flash("Add your free RAWG API key in Settings first"); toggleSettings(true); return; }
  if(busy) return; busy=true; render();
  var t=today(); var end=new Date(t); end.setFullYear(end.getFullYear()+1);
  var url="https://api.rawg.io/api/games?key="+encodeURIComponent(key)+
    "&platforms=187&dates="+localISO(t)+","+localISO(end)+
    "&ordering=-added&page_size=30";
  rawgFetch(url).then(function(json){
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
    busy=false; save();
    flash("Watchlist updated — "+added+" new release"+(added===1?"":"s")+" from the internet");
  }).catch(function(err){
    busy=false; render();
    flash("Update failed — check internet connection and API key");
  });
}

function refreshCatalog(){
  var key=getKey();
  if(!key){ flash("Add your free RAWG API key in Settings first"); toggleSettings(true); return; }
  if(busy) return; busy=true; render();
  var url="https://api.rawg.io/api/games?key="+encodeURIComponent(key)+
    "&platforms=187&dates="+PS5_LAUNCH+","+localISO(today())+
    "&ordering=-metacritic&metacritic=80,100&page_size=40";
  rawgFetch(url).then(function(json){
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
        genre:(g.genres&&g.genres[0]&&g.genres[0].name)||"Other",
        note:(g.genres||[]).slice(0,3).map(function(x){return x.name;}).join(" · "),
        img:g.background_image||"",
        tier:(g.added>=8000?"AAA":g.added>=2500?"AA":"Indie")
      });
      have[norm(g.name)]=1; added++;
    });
    data.catalogExtra=extra;
    data.lastCatalogSync=new Date().toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
    busy=false; save();
    flash("Suggestions catalog updated — "+added+" extra top-rated games added");
  }).catch(function(err){
    busy=false; render();
    flash("Update failed — check internet connection and API key");
  });
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
  if(u) return '<img class="cover'+(cls?" "+cls:"")+'" src="'+esc(thumb(u))+'" onerror="this.onerror=null;this.src=\''+esc(u)+'\'" alt="'+esc((x&&x.name)||"Game")+' cover" loading="lazy">';
  return '<div class="cover ph'+(cls?" "+cls:"")+'">□</div>';
}
function gameCoverHero(x){
  var u=coverUrl(x);
  return u?'<img src="'+esc(thumb(u))+'" onerror="this.onerror=null;this.src=\''+esc(u)+'\'" alt="'+esc((x&&x.name)||"Game")+' cover" loading="lazy">':'<div class="game-cover-ph">□</div>';
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
  var score=x&&x.score?("Critic "+x.score):(x&&x.rrating?x.rrating+"★":(x&&x.rating?Math.round(x.rating*10)/10+"★":"Game"));
  var state=gameTileState(x,id,sub);
  return '<div class="card game-tile">'+(state?'<span class="title-state state-game-'+state[1]+'">'+state[0]+'</span>':'')+'<div class="game-tile-main" role="button" tabindex="0" data-act="game-open" data-id="'+esc(String(id))+'">'+
    '<div class="game-cover-wrap">'+gameCoverHero(x)+'</div>'+
    '<div class="game-tile-info"><div class="game-tile-title">'+esc(x.name)+'</div>'+
    '<div class="game-tile-meta"><span class="game-pill">'+esc(score)+'</span><span class="game-pill">'+esc(x.genre||tierFor(x.name)||"PS5")+'</span>'+(sub?'<span class="game-pill">'+sub+'</span>':'')+'</div>'+
    (detailHtml?'<div class="game-tile-detail">'+detailHtml+'</div>':'')+'</div>'+
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
  return '<div class="game-page">'+detailToolbar("game",x)+
    '<div class="game-page-head"><div class="game-page-cover">'+gameCoverHero(x)+'</div>'+
    '<div><div class="game-page-title">'+esc(x.name)+'</div>'+
    '<div class="game-page-sub">'+badges(x.name)+'<span class="game-pill">'+esc(x.genre||tierFor(x.name)||"PS5")+'</span>'+(x.score?'<span class="game-pill">Critic '+x.score+'</span>':'')+(x.rrating?'<span class="game-pill">'+x.rrating+'★ users</span>':'')+'</div>'+
    (x.note?'<div class="media-page-overview">'+esc(x.note)+'</div>':'')+'</div></div>'+
    (tab==="playing"?plotBlock(x.name):"")+(extraHtml||"")+'<div class="actions">'+(actionsHtml||"")+linkBtns(x.name)+'</div></div>';
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
  if(/image\.tmdb\.org\/t\/p\//.test(url)) return url.replace(/\/t\/p\/(?:w\d+|original)\//,"/t/p/"+((TV_MODE||window.innerWidth>=900)?"original":"w1280")+"/");
  return url;
}
function mediaBgUrl(x){
  if(!x) return "";
  if(x.backdrop) return tmdbBackdropUrl(x.backdrop);
  return (!TV_MODE&&window.innerWidth<900)?(x.poster||""):"";
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
  add(seriesCache[seriesTab]&&seriesCache[seriesTab].items);
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
  if(section==="films"){
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
      detail=g.date?fmt(g.date)+(dl!==null&&dl>=0?' Â· in '+dl+' day'+(dl===1?"":"s"):''):"Date TBC";
      extra=badges(g.name);
    }
  }
  setAppBackground(el,u);
  if(!hero) return;
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
function savePlots(){ try{ localStorage.setItem(PLOTS_KEY, JSON.stringify(plotCache)); }catch(e){} }
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
    if(key==="watched") return (data.watchedMovies||[]).length;
    return ((filmCache[key]||{}).items||[]).length;
  }
  if(kind==="series"){
    if(key==="serieswatchlist") return (data.seriesWatchlist||[]).length;
    if(key==="serieswatching") return (data.watchingSeries||[]).length;
    if(key==="serieswatched") return (data.watchedSeries||[]).length;
    return ((seriesCache[key]||{}).items||[]).length;
  }
  return 0;
}
function tabCountHtml(kind,key){
  var n=tabCount(kind,key);
  return n?'<span class="tab-count">'+n+'</span>':'';
}

function renderTabs(){
  if(section==="biglybt"){
    document.getElementById("tabs").innerHTML="";
    return;
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
    document.getElementById("tabs").innerHTML = sd.map(function(d){
      return '<button class="tab '+(seriesTab===d[0]?"on":"")+'" data-stab="'+d[0]+'"><span class="shp">'+d[1]+'</span>'+d[2]+tabCountHtml("series",d[0])+'</button>';
    }).join("");
    finishTabRender();
    return;
  }
  if(section==="films"){
    var fd=[["watchlist","♥","My Watchlist"],["uphw","△","Coming Soon"],["bluray","◉","New on Blu-ray"],["relhw","★","Discover"],["mlott","▶","Malayalam OTT"],["watched","✓","Watched"]];
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
function renderRentals(){
  if(TV_MODE) formOpen[tab]=false;
  var t0=today();
  var list=data.rentals.map(function(r){
    var used=daysBetween(parseD(r.start),t0);
    return Object.assign({},r,{used:used,left:r.days-used});
  }).filter(function(r){ return matchQ(r.name) && vendorMatch(r); })
    .sort(function(a,b){ return a.start<b.start?1:a.start>b.start?-1:0; }); // latest rented first

  var html = toolbar("Add rental","Search rentals & history…");
  if(TV_MODE){
    html=html.replace(/<button class="btn[^>]*data-act="toggle-form"[\s\S]*?<\/button>/,"");
    html+='<div class="syncnote" style="margin:-6px 0 12px">Rental details are view-only on Android TV. Edit rentals on PC or mobile.</div>';
  }

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
        scoreBits(r)+'</div>'+
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
        (h.note?'<br>“'+esc(h.note)+'”':'')+'</div>'+
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
    vendor:r.vendor||"", cost:Number(r.cost)||0, note:r.note||"", img:coverUrl(r)||""
  });
  if(toPlayed){
    var exP=inList(data.played,r.name);
    if(exP){
      exP.status="Finished";
      if(!exP.vendor) exP.vendor=r.vendor||"";
      if(!exP.score && r.score) exP.score=r.score;
      if(!exP.rrating && r.rrating) exP.rrating=r.rrating;
      save(); flash("Returned — history saved, existing Played entry updated");
    } else {
      var pid=uid();
      data.played.unshift({id:pid,name:r.name,rating:0,status:"Finished",added:localISO(),cost:0,vendor:r.vendor||"",note:"",score:r.score||null,rrating:r.rrating||null,img:coverUrl(r)||undefined});
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
        '<div class="grow"><div class="gname">'+esc(x.name)+'</div><div class="meta">'+badges(x.name)+sub+scoreBits(x)+'</div></div>'+
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
  return fetch(PROXIES[pi]+encodeURIComponent(url))
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
  return fetch(u).then(function(r){ return r.json(); }).then(function(j){
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
  return fetch("https://n8n.thegamehub.in/webhook/availability?internal_game_key="+encodeURIComponent(sku))
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
        '<div class="meta">'+badges(q1.name)+'Queued '+fmt(q1.added)+scoreBits(q1)+(q1.note?' · '+esc(q1.note):'')+availBits+'</div>'+
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
function addToQueue(name, note, score, rrating, avail){
  if(!name) return;
  var n=norm(name);
  for(var i=0;i<data.queue.length;i++){
    if(norm(data.queue[i].name)===n){ flash("Already in your queue at #"+(i+1)); return; }
  }
  var qid=uid();
  data.queue.push({id:qid, name:name, note:note||"", score:score||null, rrating:rrating||null, avail:avail||null, added:localISO()});
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
      var d=g.date?parseD(g.date):null, dleft=d?daysBetween(t0,d):null;
      html+=gameTile(g,g.id,dleft!==null?(dleft<0?"Out now":dleft+" days"):"TBC");
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
    var when=d?fmt(g.date):"Date TBC";
    var extra="";
    if(dleft!==null&&!out) extra=' <span style="color:#2D7FF9;font-weight:700">· in '+dleft+' day'+(dleft===1?"":"s")+'</span>';
    if(out) extra=' <span style="color:#3ECF8E;font-weight:700">· Out now</span>';
    html+=
    '<div class="card"><div class="row">'+
      coverImg(g)+
      '<div class="grow"><div class="gname">'+esc(g.name)+'</div><div class="meta">'+badges(g.name)+'<b style="color:var(--text)">'+when+'</b>'+extra+(g.note?'<br>'+esc(g.note):'')+'</div></div>'+
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
function genreOf(name){
  var n=norm(name), cat=fullCatalog();
  for(var i=0;i<cat.length;i++) if(norm(cat[i].name)===n) return cat[i].genre||null;
  return null;
}
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
        '<div class="meta">'+prefChip+tierHtml+'<span style="color:'+scoreColor(g.score)+';font-weight:700">'+(g.score?("Critic "+g.score):"Unrated")+'</span> · '+(g.year||"")+' · '+esc(g.genre||"")+(g.rating?' · '+(Math.round(g.rating*10)/10)+'★ users':'')+(g.note?'<br>'+esc(g.note):'')+'</div>'+
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
    scoreBits(p)+'</div></div>'+
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
var biglyToken="";
try{ biglyToken=sessionStorage.getItem("gamevault-biglybt-token")||""; }catch(e){}
var biglyItems=[], biglyBusy=false, biglyErr="";
function biglyProxyUrl(){
  try{ return (localStorage.getItem(BIGLY_PROXY_KEY)||"").trim().replace(/\/+$/,""); }catch(e){ return ""; }
}
function setBiglyProxyUrl(v){
  try{ localStorage.setItem(BIGLY_PROXY_KEY,(v||"").trim().replace(/\/+$/,"")); }catch(e){}
}
var BIGLY_MODE_KEY="gamevault-biglybt-mode";
var BIGLY_NATIVE_TOKEN_KEY="gamevault-biglybt-native-token";
function biglyMode(){ try{ return localStorage.getItem(BIGLY_MODE_KEY)||"iframe"; }catch(e){ return "iframe"; } }
function setBiglyMode(v){ try{ localStorage.setItem(BIGLY_MODE_KEY, v==="iframe"?"iframe":"api"); }catch(e){} }
function biglyFrameUrl(){ return biglyProxyUrl()+(biglyMode()==="api"?"/__native":""); }
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
  }
});
/* Existing installs used the API dashboard by default. Move them once to the
   internal browser; users can still explicitly select API mode afterwards. */
try{
  if(!localStorage.getItem("gamevault-biglybt-browser-v1")){
    setBiglyMode("iframe");
    localStorage.setItem("gamevault-biglybt-browser-v1","1");
  }
}catch(e){}
function biglyHeaders(){
  var h={"Content-Type":"application/json"};
  if(biglyToken) h.Authorization="Bearer "+biglyToken;
  return h;
}
function biglyApi(path, opts){
  var base=biglyProxyUrl();
  if(!base) return Promise.reject(new Error("Add your HTTPS BiglyBT proxy URL in Settings first."));
  if(location.protocol==="https:" && /^http:\/\//i.test(base)){
    return Promise.reject(new Error("Your saved BiglyBT URL starts with http://. GameVault runs on HTTPS, so the browser blocks it before login. Use an HTTPS proxy URL in Settings; the direct BiglyBT Web UI URL cannot be called from GitHub Pages."));
  }
  opts=opts||{};
  opts.headers=Object.assign(biglyHeaders(), opts.headers||{});
  return fetchWithPolicy(base+path,opts,{timeout:15000,retries:0}).then(function(r){
    return r.text().then(function(t){
      var j={}; try{ j=t?JSON.parse(t):{}; }catch(e){ j={message:t}; }
      if(!r.ok) throw new Error(j.message||j.error||("BiglyBT proxy returned "+r.status));
      return j;
    });
  }).catch(function(e){
    if(e && e.message && e.message!=="Failed to fetch") throw e;
    throw new Error("Cannot reach the BiglyBT proxy. Check that Settings contains an HTTPS proxy, not the direct BiglyBT Web UI URL; also confirm the proxy is online and allows requests from https://sinuksml.github.io.");
  });
}
function biglyLogin(user, pass){
  biglyBusy=true; biglyErr=""; render();
  return biglyApi("/login",{method:"POST",body:JSON.stringify({username:user,password:pass})}).then(function(j){
    biglyToken=j.token||j.session||"";
    if(!biglyToken) throw new Error("Proxy did not return a session token.");
    try{ sessionStorage.setItem("gamevault-biglybt-token",biglyToken); }catch(e){}
    return biglyRefresh();
  }).catch(function(e){
    biglyToken=""; try{ sessionStorage.removeItem("gamevault-biglybt-token"); }catch(err){}
    biglyErr=e.message||"Login failed";
    biglyBusy=false; render();
  });
}
function biglyLogout(){
  biglyToken=""; biglyItems=[]; biglyErr="";
  try{ sessionStorage.removeItem("gamevault-biglybt-token"); }catch(e){}
  render();
}
function biglyRefresh(){
  if(!biglyToken){ render(); return Promise.resolve(); }
  biglyBusy=true; biglyErr=""; render();
  return biglyApi("/torrents").then(function(j){
    biglyItems=Array.isArray(j)?j:(j.items||j.torrents||[]);
    biglyBusy=false; render();
  }).catch(function(e){
    biglyErr=e.message||"BiglyBT server is offline, unreachable, or login details are incorrect.";
    biglyBusy=false; render();
  });
}
function biglyAction(id, action, extra){
  var confirmed=extra&&extra.__confirmed;
  if((action==="remove"||action==="remove-data")&&!confirmed){
    var warning=action==="remove-data"?"Delete this torrent and all of its downloaded files? This cannot be undone.":"Remove this torrent from BiglyBT? Downloaded files will be kept.";
    if(TV_MODE){tvConfirm(warning,action==="remove-data"?"Delete files":"Remove torrent",function(){biglyAction(id,action,{__confirmed:true});});return Promise.resolve();}
    if(!confirm(warning)) return Promise.resolve();
  }
  var payload=Object.assign({action:action},extra||{});delete payload.__confirmed;
  biglyBusy=true; render();
  return biglyApi("/torrents/"+encodeURIComponent(id)+"/action",{
    method:"POST",
    body:JSON.stringify(payload)
  }).then(function(){ return biglyRefresh(); }).catch(function(e){ biglyErr=e.message||"Action failed"; biglyBusy=false; render(); });
}
function biglyBytes(n){
  n=Number(n)||0;
  var u=["B","KB","MB","GB","TB"], i=0;
  while(n>=1024 && i<u.length-1){ n/=1024; i++; }
  return (i?n.toFixed(n>=10?1:2):Math.round(n))+u[i];
}
function biglySpeed(n){ return biglyBytes(n)+"/s"; }
function biglyPct(x){
  x=Number(x)||0;
  if(x>0 && x<=1) x*=100;
  return Math.max(0,Math.min(100,x));
}
function biglyTorrentCard(t){
  var id=t.id||t.hash||t.infoHash||t.name;
  var pct=biglyPct(t.progress!=null?t.progress:t.percentDone);
  var status=t.status||t.state||"Unknown";
  var total=Number(t.totalSize||t.size||0),downloaded=Number(t.downloaded||t.haveValid||t.downloadedEver||0);
  if(!downloaded && total) downloaded=total*pct/100;
  return '<div class="card torrent-card">'+
    '<div class="torrent-head"><div class="torrent-name">'+esc(t.name||"Untitled torrent")+'</div><span class="torrent-status">'+esc(status)+'</span></div>'+
    '<div class="torrent-meter"><div class="torrent-fill" style="width:'+pct.toFixed(1)+'%"></div></div>'+
    '<div class="torrent-meta">'+
      '<div>Progress <b style="color:var(--text)">'+pct.toFixed(1)+'%</b></div>'+
      '<div>Downloaded <b style="color:var(--text)">'+biglyBytes(downloaded)+' / '+biglyBytes(total)+'</b></div>'+
      '<div>ETA <b style="color:var(--text)">'+esc(t.eta||t.remaining||"TBC")+'</b></div>'+
      '<div>Down <b style="color:var(--text)">'+biglySpeed(t.downloadSpeed||t.downSpeed||0)+'</b></div>'+
      '<div>Up <b style="color:var(--text)">'+biglySpeed(t.uploadSpeed||t.upSpeed||0)+'</b></div>'+
      '<div>Seeds <b style="color:var(--text)">'+esc(String(t.seeds!=null?t.seeds:"-"))+'</b></div>'+
      '<div>Peers <b style="color:var(--text)">'+esc(String(t.peers!=null?t.peers:"-"))+'</b></div>'+
    '</div>'+
    '<div class="actions">'+
      '<button class="btn" data-act="bigly-action" data-id="'+esc(String(id))+'" data-bigly="start">Start</button>'+
      '<button class="btn" data-act="bigly-action" data-id="'+esc(String(id))+'" data-bigly="pause">Pause</button>'+
      '<button class="btn" data-act="bigly-action" data-id="'+esc(String(id))+'" data-bigly="resume">Resume</button>'+
      '<button class="btn" data-act="bigly-action" data-id="'+esc(String(id))+'" data-bigly="stop">Stop</button>'+
      '<button class="btn ghost danger" data-act="bigly-action" data-id="'+esc(String(id))+'" data-bigly="remove">Remove</button>'+
      '<button class="btn ghost danger" data-act="bigly-action" data-id="'+esc(String(id))+'" data-bigly="remove-data">Delete files</button>'+
      '<select class="selectmini bigly-priority" data-id="'+esc(String(id))+'"><option value="">Priority...</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select>'+
    '</div>'+
  '</div>';
}
function renderBiglyBT(){
  var proxy=biglyProxyUrl();
  var html='<div class="sechead">BiglyBT</div>';
  if(!proxy){
    return html+'<div class="card torrent-login"><h3>Proxy required</h3><p class="meta">For security, GameVault cannot connect directly to your public BiglyBT IP from this public GitHub Pages frontend. Add an HTTPS proxy URL in Settings. The proxy keeps the real BiglyBT server address in its backend environment/config.</p><button class="btn blue" data-act="bigly-settings">Open Settings</button></div>';
  }
  if(location.protocol==="https:" && /^http:\/\//i.test(proxy)){
    return html+'<div class="card torrent-login"><h3>HTTPS proxy required</h3><p class="meta">The saved BiglyBT URL starts with <b>http://</b>. Because GameVault is loaded from HTTPS GitHub Pages, the browser blocks that request before login. Add an HTTPS proxy URL in Settings. The proxy should privately connect to your BiglyBT Web UI.</p><div class="actions"><button class="btn blue" data-act="bigly-settings">Open Settings</button><a class="btn" href="'+esc(proxy)+'" target="_blank" rel="noopener">Open BiglyBT directly</a></div></div>';
  }
  if(/^https:\/\//i.test(proxy)){
    var nativeMode=biglyMode()==="api";
    return html+'<div class="card bigly-browser" id="biglyBrowser"><div class="bigly-browser-bar"><button class="btn" data-act="bigly-home" title="Open the BiglyBT home page">Home</button>'+(nativeMode?'<button class="btn blue" data-act="bigly-native" title="Return to the native dashboard">Switch to Native UI</button>':'')+'<button class="btn" data-act="bigly-reload" title="Reload BiglyBT">Reload</button><button class="btn" data-act="bigly-fullscreen" title="Use the full screen">Full screen</button><button class="btn" data-act="bigly-settings" title="BiglyBT settings">Settings</button><span class="syncnote" style="align-self:center">'+(nativeMode?'Optional native dashboard':'BiglyBT Web UI')+' is open securely inside GameVault</span></div><iframe id="biglyFrame" class="bigly-browser-frame" title="'+(nativeMode?'Native BiglyBT Dashboard':'BiglyBT Web UI')+'" src="'+esc(biglyFrameUrl())+'" allow="clipboard-read; clipboard-write; fullscreen" allowfullscreen referrerpolicy="no-referrer"></iframe></div>';
  }
  if(!biglyToken){
    return html+'<div class="card torrent-login"><h3>Sign in to BiglyBT</h3><p class="meta">Credentials are not saved. They are sent only to your configured proxy for this browser session.</p><div class="fields"><input class="f-name" id="biglyUser" placeholder="BiglyBT username" autocomplete="username"><input class="f-name" id="biglyPass" placeholder="BiglyBT password" type="password" autocomplete="current-password"><button class="btn blue" data-act="bigly-login">Login</button></div>'+(biglyErr?'<div class="empty">'+esc(biglyErr)+'</div>':'')+'</div>';
  }
  html+='<div class="toolbar" style="margin-top:14px"><button class="btn blue" data-act="bigly-refresh"'+(biglyBusy?' disabled':'')+'>'+(biglyBusy?'Refreshing...':'Refresh')+'</button><button class="btn ghost danger" data-act="bigly-logout">Logout</button><span class="syncnote" style="align-self:center">Connected through proxy. Private server address is not stored in GameVault.</span></div>';
  if(biglyErr) html+='<div class="empty">'+esc(biglyErr)+'</div>';
  if(!biglyItems.length) html+=biglyBusy?loadingSkeletons("game",4):'<div class="empty">No torrents returned by the proxy yet.</div>';
  else html+='<div class="torrent-grid">'+biglyItems.map(biglyTorrentCard).join("")+'</div>';
  return html;
}

/* ---------- Plex library (direct secure Plex Media Server API) ---------- */
var PLEX_URL_KEY="gamevault-plex-url", PLEX_TOKEN_KEY="gamevault-plex-token", PLEX_CACHE_KEY="gamevault-plex-cache";
var PLEX_ORDER=["home","continue","movies","shows","recent"], plexTab="home", plexItems=[], plexBusy=false, plexErr="", plexConnected=false, plexAllowDelete=false, plexSearch="";
try{
  plexTab=localStorage.getItem("gamevault-plex-tab")||"home";
  if(PLEX_ORDER.indexOf(plexTab)<0) plexTab="home";
  var savedPlex=JSON.parse(localStorage.getItem(PLEX_CACHE_KEY)||"null");
  if(savedPlex&&Array.isArray(savedPlex.items)) plexItems=savedPlex.items;
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
  return {ratingKey:String(x.ratingKey||""),type:kind,title:x.title||"Untitled",year:x.year||"",summary:x.summary||"",thumb:x.thumb||"",art:x.art||"",
    duration:duration,viewOffset:offset,viewCount:Number(x.viewCount)||0,leafCount:Number(x.leafCount)||0,viewedLeafCount:Number(x.viewedLeafCount)||0,
    addedAt:Number(x.addedAt)||0,lastViewedAt:Number(x.lastViewedAt)||0,watched:watched};
}
function plexSaveCache(){
  try{ localStorage.setItem(PLEX_CACHE_KEY,JSON.stringify({at:Date.now(),items:plexItems})); }catch(e){}
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
    plexConnected=true; plexBusy=false; plexSaveCache(); render();
  }).catch(function(e){ plexConnected=false; plexBusy=false; plexErr=e.message||"Plex is unavailable"; render(); });
}
function plexDiscover(){
  var input=document.getElementById("plexTokenInput"), token=(input&&input.value.trim())||plexToken();
  var status=document.getElementById("plexSettingsStatus");
  if(!token){ if(status) status.textContent="Enter your X-Plex-Token first."; return; }
  if(status) status.textContent="Discovering your Plex Media Server...";
  fetch("https://plex.tv/api/resources?includeHttps=1&includeRelay=1&X-Plex-Token="+encodeURIComponent(token),{headers:{Accept:"application/xml"}}).then(function(r){ if(!r.ok) throw new Error("Plex account rejected the token"); return r.text(); }).then(function(t){
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
function plexCard(item){
  var pct=Math.max(0,Math.min(100,plexProgress(item)));
  var status=item.type==="show"?(item.viewedLeafCount+" / "+item.leafCount+" episodes watched"):(item.watched?"Watched":pct?pct+"% watched":"Unwatched");
  return '<div class="card plex-card">'+mediaPoster(plexMediaUrl(item.thumb),item.title||item.type)+
    '<div class="media-info"><div class="media-title">'+esc(item.title)+'</div><div class="media-meta">'+(item.year?'<span class="media-pill">'+esc(String(item.year))+'</span>':'')+'<span class="media-pill">'+(item.type==="show"?"TV Show":"Movie")+'</span></div>'+
    '<div class="plex-progress"><span style="width:'+pct+'%"></span></div><div class="plex-status '+(item.watched?'watched':'')+'">'+(item.watched?'✓ ':'')+esc(status)+'</div></div>'+
    (item.watched?'<div class="actions"><button class="btn ghost danger" data-act="plex-delete" data-id="'+esc(item.ratingKey)+'">Delete media file</button></div>':'')+'</div>';
}
function renderPlex(){
  var configured=plexServerUrl()&&plexToken();
  var searchLabel=plexTab==="shows"?"TV shows":plexTab==="movies"?"movies":"library";
  var html='<div class="toolbar" style="margin-top:14px"><div class="searchwrap"><span class="sic">⌕</span><input class="tab-search" id="plexSearch" placeholder="Search Plex '+searchLabel+'..." value="'+esc(plexSearch)+'" autocomplete="off"></div><button class="btn blue" data-act="plex-refresh"'+(plexBusy?' disabled':'')+'>'+(plexBusy?'Connecting...':'Refresh Plex')+'</button><button class="btn" data-act="plex-settings">Settings</button></div>';
  if(!configured) return html+'<div class="empty">Connect your Plex owner account in Settings. Your token stays only on this device.</div>';
  if(plexErr) html+='<div class="empty">'+esc(plexErr)+'</div>';
  if(plexConnected && !plexAllowDelete) html+='<div class="meta" style="margin-bottom:10px">Viewing is connected. To delete watched media files, enable <b>Allow media deletion</b> in Plex Server Settings → Library.</div>';
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
  if(!item||!item.watched) return;
  if(!plexConnected){ flash("Reconnect Plex before deleting media"); return; }
  if(!plexAllowDelete){ flash("Enable Allow media deletion in Plex Server Settings first"); return; }
  var what=item.type==="show"?"the entire TV series and all of its media files":"this movie and its media file";
  var warning='Permanently delete "'+item.title+'"? Plex will remove '+what+' from the Shield storage. This cannot be undone in GameVault.';
  if(!confirmed){
    if(TV_MODE){tvConfirm(warning,"Delete from Plex",function(){plexDeleteItem(id,true);});return;}
    if(!confirm(warning)) return;
  }
  plexBusy=true; render();
  plexRequest("/library/metadata/"+encodeURIComponent(item.ratingKey),{method:"DELETE"}).then(function(){
    plexItems=plexItems.filter(function(x){ return x.ratingKey!==item.ratingKey; }); plexBusy=false; plexSaveCache(); render(); flash("Deleted from Plex and removed the media file");
  }).catch(function(e){ plexBusy=false; plexErr=e.message||"Plex delete failed"; render(); });
}

function renderPageContext(){
  var el=document.getElementById("pageContext"); if(!el) return;
  var parent="Games",key=tab,title="",desc="",count="";
  var labels={rentals:"Rentals",playing:"Now Playing",queue:"Rental Queue",upcoming:"Upcoming Releases",suggest:"Discover",played:"Completed",watchlist:"My Watchlist",bluray:"New on Blu-ray",uphw:"Coming Soon",relhw:"Discover",mlott:"Malayalam OTT",watched:"Watched",serieswatchlist:"My Watchlist",serieswatching:"Watching",seriesnew:"New Episodes",seriesupcoming:"Upcoming",enseries:"English",mlseries:"Malayalam",taseries:"Tamil",hiseries:"Hindi",serieswatched:"Watched",home:"Home",continue:"Continue Watching",movies:"Movies",shows:"TV Shows",recent:"Recently Added"};
  var descriptions={rentals:"Active rentals, return dates and complete history",playing:"Games in progress, saved for later, or on hold",queue:"Your prioritized rental queue and vendor availability",upcoming:"Upcoming game releases and release countdowns",suggest:"Recommendations shaped by your ratings and library",played:"Finished games, ratings and personal history",watchlist:"Movies saved for later",bluray:"Major new Hollywood physical-media releases",uphw:"Major movies in every language with a confirmed U.S. theatrical release",relhw:"Critically acclaimed Hollywood movies to discover",mlott:"Latest and upcoming Malayalam streaming releases",watched:"Your completed movie library",serieswatchlist:"TV shows saved for later",serieswatching:"TV shows you are currently watching",seriesnew:"Latest episodes from shows you are watching",seriesupcoming:"New and returning TV shows coming soon",enseries:"Highly rated English TV shows",mlseries:"Malayalam TV shows, newest first",taseries:"Tamil TV shows, newest first",hiseries:"Hindi TV shows, newest first",serieswatched:"Your completed TV shows",home:"A summary of your Plex library",continue:"Partially watched movies and TV shows",movies:"Movies available on your Plex server",shows:"TV shows available on your Plex server",recent:"The latest media added to your Plex server"};
  if(section==="films"){ parent="Movies"; key=filmTab; }
  else if(section==="series"){ parent="TV Shows"; key=seriesTab; }
  else if(section==="plex"){ parent="Plex Library"; key=plexTab; }
  else if(section==="biglybt"){ parent="BiglyBT"; key="biglybt"; }
  title=labels[key]||(section==="biglybt"?"BiglyBT":"Library");
  desc=descriptions[key]||(section==="biglybt"?"Downloads, progress, speed and torrent controls":"Your personal media library");
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
  if((section==="games"&&expandedId)||(section==="films"&&filmExpanded)||(section==="series"&&seriesExpanded)) desc="Full details and available actions";
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
  if(!list.length || filmExpanded || seriesExpanded || expandedId || section==="biglybt"){ el.innerHTML=""; el.style.display="none"; return; }
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

/* ---------- dedicated Android TV application ----------
   The Shield is a view-only, 10-foot experience. It deliberately does not
   reuse desktop forms, filters or settings so every D-pad move is predictable. */
var TV_HOME_KEY="gamevault-tv-home-section";
var TV_SECTIONS=["home","games","films","series","plex","biglybt","system"];
var tvSection="home",tvDetail=null,tvItemRegistry={},tvLastCardBySection={},tvLastRowBySection={};
try{tvSection=localStorage.getItem(TV_HOME_KEY)||"home";}catch(e){}
if(TV_SECTIONS.indexOf(tvSection)<0)tvSection="home";

function tvSectionDefs(){
  return [
    ["home","⌂","Home"],["games","▣","Games"],["films","●","Movies"],
    ["series","▤","TV Shows"],["plex","▶","Plex"],["biglybt","⇩","BiglyBT"],
    ["system","⚙","System"]
  ];
}
function tvSectionLabel(name){
  var labels={home:"Home",games:"Games",films:"Movies",series:"TV Shows",plex:"Plex",biglybt:"BiglyBT",system:"System"};
  return labels[name]||"GameVault";
}
function tvStableId(x){
  if(x&&x.id!=null)return String(x.id);
  if(x&&x.ratingKey!=null)return String(x.ratingKey);
  return "name:"+norm((x&&(x.name||x.title))||"item");
}
function tvDedupe(items){
  var seen={};return (items||[]).filter(function(item){
    if(!item||!item.title)return false;
    var key=item.kind+":"+norm(item.title);
    if(seen[key])return false;seen[key]=1;return true;
  });
}
function tvRegister(item){
  if(!item)return null;
  item.key=item.kind+":"+item.source+":"+item.id;
  tvItemRegistry[item.key]=item;
  return item;
}
function tvRentalDue(r){
  var due=parseD(r.end||"");
  if(!due&&r.start){due=parseD(r.start);if(due)due.setDate(due.getDate()+(Number(r.days)||0));}
  return due?daysBetween(today(),due):null;
}
function tvGameItem(x,source,label,options){
  options=options||{};
  var due=source==="rental"?tvRentalDue(x):null;
  var status=label||x.status||tierFor(x.name)||"PS5";
  if(due!=null)status=due<0?"Return overdue":due===0?"Return today":due+" days left";
  var score=x.score?("Critic "+x.score):(x.rrating?x.rrating+"★":(x.rating?x.rating+"★":"PS5"));
  return tvRegister({kind:"game",source:source,id:tvStableId(x),title:x.name||"Untitled game",art:coverUrl(x),backdrop:coverUrl(x),
    eyebrow:status,meta:[score,x.genre||tierFor(x.name)||"Game"].filter(Boolean).join(" · "),raw:x,due:due,plot:!!options.plot});
}
function tvFilmItem(m,source,label){
  var date=m.ottDate||m.date||"",countdown="";
  if(date){var left=daysBetween(today(),parseD(date));if(left>=0)countdown=left===0?"Today":left+" days";}
  return tvRegister({kind:"film",source:source,id:tvStableId(m),title:m.title||"Untitled movie",art:m.poster||"",backdrop:m.backdrop||m.poster||"",
    eyebrow:label||(countdown?countdown:(m.year||"Movie")),meta:[mediaRatingLabel(m),genreLabel(m.genres,MOVIE_GENRES)].filter(Boolean).join(" · "),raw:m});
}
function tvSeriesItem(s,source,label){
  var date=s.latestDate||s.date||"";
  return tvRegister({kind:"series",source:source,id:tvStableId(s),title:s.title||"Untitled series",art:s.poster||"",backdrop:s.backdrop||s.poster||"",
    eyebrow:label||(date?fmt(date):(s.year||"TV Series")),meta:[mediaRatingLabel(s),genreLabel(s.genres,SERIES_GENRES)].filter(Boolean).join(" · "),raw:s});
}
function tvPlexItem(x,source,label){
  var pct=Math.max(0,Math.min(100,plexProgress(x)));
  return tvRegister({kind:"plex",source:source,id:tvStableId(x),title:x.title||"Untitled",art:plexMediaUrl(x.thumb),backdrop:plexMediaUrl(x.art||x.thumb),
    eyebrow:label||(x.type==="show"?"TV Series":"Movie"),meta:(x.year?x.year+" · ":"")+(pct?pct+"% watched":"Unwatched"),progress:pct,raw:x});
}
function tvGameExistingNames(){
  var out={};[data.rentals,data.playing,data.queue,data.played].forEach(function(list){(list||[]).forEach(function(x){out[norm(x.name)]=1;});});return out;
}
function tvRowsForSection(name){
  var rows=[],items=[],existing;
  if(name==="home"){
    items=[];
    (data.rentals||[]).forEach(function(x){items.push(tvGameItem(x,"rental","Active rental",{plot:true}));});
    (data.playing||[]).forEach(function(x){items.push(tvGameItem(x,"playing",x.status==="Dropped"?"On hold":"Now playing",{plot:true}));});
    (data.played||[]).filter(function(x){return x.status==="Playing"||x.status==="Dropped";}).forEach(function(x){items.push(tvGameItem(x,"playing",x.status==="Dropped"?"On hold":"Resume later",{plot:true}));});
    if(items.length)rows.push({id:"continue-games",title:"Continue Playing",items:tvDedupe(items)});
    items=(data.rentals||[]).slice().sort(function(a,b){return (tvRentalDue(a)||9999)-(tvRentalDue(b)||9999);}).map(function(x){return tvGameItem(x,"rental","Active rental",{plot:true});});
    if(items.length)rows.push({id:"rentals-due",title:"Rentals Due Soon",items:items});
    items=(data.movieWatchlist||[]).map(function(x){return tvFilmItem(x,"watchlist","Watchlist");});
    if(items.length)rows.push({id:"movie-watchlist",title:"Movie Watchlist",items:items});
    items=(data.watchingSeries||[]).map(function(x){return tvSeriesItem(x,"serieswatching","Watching");});
    if(!items.length)items=(data.seriesWatchlist||[]).map(function(x){return tvSeriesItem(x,"serieswatchlist","Watchlist");});
    if(items.length)rows.push({id:"series-continue",title:"Continue Watching",items:items});
    items=(plexItems||[]).filter(function(x){var p=plexProgress(x);return p>0&&p<100;}).sort(function(a,b){return (b.lastViewedAt||0)-(a.lastViewedAt||0);}).map(function(x){return tvPlexItem(x,"continue","Continue watching");});
    if(items.length)rows.push({id:"plex-continue",title:"Continue on Plex",items:items.slice(0,20)});
    items=(((filmCache.uphw||{}).items)||[]).slice().sort(function(a,b){return String(a.date||"").localeCompare(String(b.date||""));}).map(function(x){return tvFilmItem(x,"uphw","Coming soon");});
    if(items.length)rows.push({id:"coming-soon",title:"Coming Soon",items:items.slice(0,20)});
    return rows;
  }
  if(name==="games"){
    items=[];
    (data.rentals||[]).forEach(function(x){items.push(tvGameItem(x,"rental","Active rental",{plot:true}));});
    (data.playing||[]).forEach(function(x){items.push(tvGameItem(x,"playing",x.status==="Dropped"?"On hold":"Now playing",{plot:true}));});
    (data.played||[]).filter(function(x){return x.status==="Playing"||x.status==="Dropped";}).forEach(function(x){items.push(tvGameItem(x,"playing",x.status==="Dropped"?"On hold":"Resume later",{plot:true}));});
    if(items.length)rows.push({id:"games-playing",title:"Now Playing",items:tvDedupe(items)});
    items=(data.rentals||[]).map(function(x){return tvGameItem(x,"rental","Active rental",{plot:true});});if(items.length)rows.push({id:"games-rentals",title:"Active Rentals",items:items});
    items=(data.queue||[]).map(function(x){return tvGameItem(x,"queue","Rental queue");});if(items.length)rows.push({id:"games-queue",title:"Rental Queue",items:items});
    items=(data.upcoming||[]).slice().sort(function(a,b){return String(a.date||"9999").localeCompare(String(b.date||"9999"));}).map(function(x){return tvGameItem(x,"upcoming",x.date?fmt(x.date):"Date TBC");});if(items.length)rows.push({id:"games-upcoming",title:"Upcoming Releases",items:items.slice(0,30)});
    items=(data.played||[]).filter(function(x){return x.status!=="Playing"&&x.status!=="Dropped";}).map(function(x){return tvGameItem(x,"completed",x.status||"Completed");});if(items.length)rows.push({id:"games-completed",title:"Completed",items:items});
    existing=tvGameExistingNames();items=fullCatalog().filter(function(x){return !existing[norm(x.name)]&&!data.dismissedNames[norm(x.name)];}).slice(0,30).map(function(x){return tvGameItem(x,"discover",tierFor(x.name)||"Recommended");});if(items.length)rows.push({id:"games-discover",title:"Recommended",items:items});
    return rows;
  }
  if(name==="films"){
    items=(data.movieWatchlist||[]).map(function(x){return tvFilmItem(x,"watchlist","Watchlist");});if(items.length)rows.push({id:"films-watchlist",title:"My Watchlist",items:items});
    items=(((filmCache.uphw||{}).items)||[]).slice().sort(function(a,b){return String(a.date||"").localeCompare(String(b.date||""));}).map(function(x){return tvFilmItem(x,"uphw","Coming soon");});if(items.length)rows.push({id:"films-coming",title:"Coming Soon",items:items});
    items=(((filmCache.bluray||{}).items)||[]).map(function(x){return tvFilmItem(x,"bluray","Blu-ray");});if(items.length)rows.push({id:"films-bluray",title:"New on Blu-ray",items:items});
    items=(((filmCache.mlott||{}).items)||[]).map(function(x){return tvFilmItem(x,"mlott","Malayalam OTT");});if(items.length)rows.push({id:"films-mlott",title:"Malayalam OTT",items:items});
    items=(((filmCache.relhw||{}).items)||[]).map(function(x){return tvFilmItem(x,"relhw","Recommended");});if(items.length)rows.push({id:"films-discover",title:"Discover",items:items});
    items=(data.watchedMovies||[]).map(function(x){return tvFilmItem(x,"watched","Watched");});if(items.length)rows.push({id:"films-watched",title:"Watched",items:items});
    return rows;
  }
  if(name==="series"){
    items=(data.seriesWatchlist||[]).map(function(x){return tvSeriesItem(x,"serieswatchlist","Watchlist");});if(items.length)rows.push({id:"series-watchlist",title:"My Watchlist",items:items});
    items=(data.watchingSeries||[]).map(function(x){return tvSeriesItem(x,"serieswatching","Watching");});if(items.length)rows.push({id:"series-watching",title:"Watching",items:items});
    [["seriesnew","New Episodes"],["seriesupcoming","Upcoming"],["enseries","English"],["mlseries","Malayalam"],["taseries","Tamil"],["hiseries","Hindi"]].forEach(function(def){
      var list=(((seriesCache[def[0]]||{}).items)||[]).map(function(x){return tvSeriesItem(x,def[0],def[1]);});if(list.length)rows.push({id:"series-"+def[0],title:def[1],items:list});
    });
    items=(data.watchedSeries||[]).map(function(x){return tvSeriesItem(x,"serieswatched","Watched");});if(items.length)rows.push({id:"series-watched",title:"Watched",items:items});
    return rows;
  }
  if(name==="plex"){
    items=(plexItems||[]).filter(function(x){var p=plexProgress(x);return p>0&&p<100;}).sort(function(a,b){return (b.lastViewedAt||0)-(a.lastViewedAt||0);}).map(function(x){return tvPlexItem(x,"continue","Continue watching");});if(items.length)rows.push({id:"plex-continue",title:"Continue Watching",items:items});
    items=(plexItems||[]).slice().sort(function(a,b){return (b.addedAt||0)-(a.addedAt||0);}).slice(0,30).map(function(x){return tvPlexItem(x,"recent","Recently added");});if(items.length)rows.push({id:"plex-recent",title:"Recently Added",items:items});
    items=(plexItems||[]).filter(function(x){return x.type==="movie";}).map(function(x){return tvPlexItem(x,"movies","Movie");});if(items.length)rows.push({id:"plex-movies",title:"Movies",items:items});
    items=(plexItems||[]).filter(function(x){return x.type==="show";}).map(function(x){return tvPlexItem(x,"shows","TV Series");});if(items.length)rows.push({id:"plex-shows",title:"TV Series",items:items});
    return rows;
  }
  return rows;
}
function tvCardHtml(item,rowIndex,colIndex){
  var portrait=item.kind==="film"||item.kind==="series"||item.kind==="plex";
  return '<button class="tv-title-card '+(portrait?'portrait':'landscape')+'" type="button" data-tv-card="1" data-tv-row="'+rowIndex+'" data-tv-col="'+colIndex+'" data-tv-item="'+esc(item.key)+'" data-tv-key="card:'+esc(item.key)+'">'+
    '<span class="tv-card-art">'+(item.art?'<img src="'+esc(item.art)+'" alt="" loading="lazy">':'<span class="tv-art-placeholder">'+(portrait?'GV':'PS5')+'</span>')+(item.progress!=null?'<span class="tv-card-progress"><i style="width:'+item.progress+'%"></i></span>':'')+'</span>'+
    '<span class="tv-card-copy"><strong>'+esc(item.title)+'</strong><span>'+esc(item.eyebrow||item.meta||"")+'</span></span></button>';
}
function tvRowsHtml(rows){
  if(!rows.length)return '<div class="tv-empty-state"><strong>Nothing to show yet</strong><span>Your synced library will appear here automatically.</span></div>';
  return rows.map(function(row,ri){
    return '<section class="tv-shelf" data-tv-shelf="'+ri+'" data-tv-row-id="'+esc(row.id)+'"><div class="tv-shelf-head"><h2>'+esc(row.title)+'</h2><span>'+row.items.length+'</span></div><div class="tv-card-row">'+row.items.slice(0,40).map(function(item,ci){return tvCardHtml(item,ri,ci);}).join("")+'</div></section>';
  }).join("");
}
function tvRailHtml(){
  return '<aside class="tv-rail" aria-label="GameVault TV navigation"><div class="tv-rail-brand">GV</div><nav>'+tvSectionDefs().map(function(def){
    return '<button type="button" class="tv-nav-item '+(tvSection===def[0]?'on':'')+'" data-tv-nav="'+def[0]+'" data-tv-key="nav:'+def[0]+'"><span>'+def[1]+'</span><b>'+def[2]+'</b></button>';
  }).join("")+'</nav></aside>';
}
function tvSyncLabel(){
  if(cloudMode()==="drive")return gdTok()?"Google Drive connected":"Drive sign-in required";
  if(cloudMode()==="jsonbin")return "JSONBin fallback";
  return "Local data";
}
function tvHeaderHtml(){
  return '<header class="tv-page-head"><div><span class="tv-breadcrumb">SINU GAME VAULT</span><h1>'+esc(tvSectionLabel(tvSection))+'</h1></div><div class="tv-head-status"><span class="tv-status-dot '+(navigator.onLine?'online':'')+'"></span>'+esc(tvSyncLabel())+'<b>v'+APP_VERSION+'</b></div></header>';
}
function tvSystemHtml(){
  var syncTime=lastSyncedAt?new Date(lastSyncedAt).toLocaleString():"Not synced in this session";
  return '<div class="tv-system-grid"><div class="tv-system-card"><span>Cloud</span><strong>'+esc(tvSyncLabel())+'</strong><small>'+esc(syncTime)+'</small></div>'+
    '<div class="tv-system-card"><span>Library</span><strong>'+vaultSize(data)+' saved items</strong><small>View-only on this TV</small></div>'+
    '<div class="tv-system-card"><span>Display</span><strong>'+Math.round(tvZoomValue()*100)+'%</strong><small>Optimized for 4K television</small></div></div>'+
    '<div class="tv-system-actions"><button type="button" data-tv-system="sync" data-tv-key="system:sync">↻ Sync now</button><button type="button" data-tv-system="zoom-out" data-tv-key="system:zoom-out">− Smaller</button><button type="button" data-tv-system="zoom-reset" data-tv-key="system:zoom-reset">Reset size</button><button type="button" data-tv-system="zoom-in" data-tv-key="system:zoom-in">+ Larger</button><button type="button" data-tv-system="reload" data-tv-key="system:reload">Reload app</button></div><p class="tv-system-note">Library editing, API keys, backup and advanced settings remain available on your phone and PC.</p>';
}
function tvBiglyHtml(){
  if(!biglyProxyUrl())return '<div class="tv-empty-state"><strong>BiglyBT is not configured</strong><span>Configure the secure gateway on your phone or PC. TV access is view-only.</span></div>';
  if(!biglyToken)return '<div class="tv-empty-state"><strong>Native BiglyBT status is not connected</strong><span>Sign in to the native dashboard once on this device, or use GameVault on your phone or PC.</span></div>';
  if(biglyErr)return '<div class="tv-empty-state"><strong>BiglyBT is unavailable</strong><span>'+esc(biglyErr)+'</span><button type="button" data-tv-system="bigly-refresh" data-tv-key="bigly:refresh">Try again</button></div>';
  if(!biglyItems.length)return '<div class="tv-empty-state"><strong>'+(biglyBusy?'Refreshing BiglyBT…':'No active torrents')+'</strong><span>Downloads will appear here automatically.</span>'+(biglyBusy?'':'<button type="button" data-tv-system="bigly-refresh" data-tv-key="bigly:refresh">Refresh</button>')+'</div>';
  return '<div class="tv-download-list">'+biglyItems.map(function(t,i){
    var pct=biglyPct(t.progress!=null?t.progress:t.percentDone),total=Number(t.totalSize||t.size||0),downloaded=Number(t.downloaded||t.haveValid||t.downloadedEver||0);if(!downloaded&&total)downloaded=total*pct/100;
    return '<div class="tv-download-card"><div><strong>'+esc(t.name||"Untitled torrent")+'</strong><span>'+esc(t.status||t.state||"Unknown")+' · '+biglyBytes(downloaded)+' / '+biglyBytes(total)+'</span></div><b>'+pct.toFixed(1)+'%</b><div class="tv-download-meter"><i style="width:'+pct+'%"></i></div><small>↓ '+biglySpeed(t.downloadSpeed||t.downSpeed||0)+' · ↑ '+biglySpeed(t.uploadSpeed||t.upSpeed||0)+' · ETA '+esc(t.eta||t.remaining||"TBC")+'</small></div>';
  }).join("")+'</div>';
}
function tvDetailLinks(item){
  var x=item.raw||{},q=item.title+" "+(x.year||"");
  if(item.kind==="game"){
    var out='<a href="https://www.youtube.com/results?search_query='+encodeURIComponent(item.title+' PS5 trailer')+'">▶ Trailer</a><a href="https://www.youtube.com/results?search_query='+encodeURIComponent(item.title+' review IGN')+'">★ IGN Review</a><a href="https://www.google.com/search?q='+encodeURIComponent(item.title+' PS5')+'">Google</a>';
    if(item.plot)out+=fandomBtn(item.title);return out;
  }
  if(item.kind==="film")return '<a href="https://www.youtube.com/results?search_query='+encodeURIComponent(q+' trailer')+'">▶ Trailer</a>'+reeloadReviewLink(item.title,x.year,"movie")+imdbLink(x)+'<a href="https://en.wikipedia.org/wiki/Special:Search?search='+encodeURIComponent(q+' film')+'">Wikipedia</a>';
  if(item.kind==="series")return '<a href="https://www.youtube.com/results?search_query='+encodeURIComponent(q+' trailer')+'">▶ Trailer</a>'+reeloadReviewLink(item.title,x.year,"series")+seriesImdbLink(x)+'<a href="https://en.wikipedia.org/wiki/Special:Search?search='+encodeURIComponent(q+' TV series')+'">Wikipedia</a>';
  return "";
}
function tvDetailFacts(item){
  var x=item.raw||{},facts=[];
  if(item.kind==="game"){
    if(x.genre)facts.push(x.genre);if(x.score)facts.push("Critic "+x.score);if(x.rating)facts.push(x.rating+"★");if(tierFor(item.title))facts.push(tierFor(item.title));
    if(item.source==="rental"){var due=tvRentalDue(x);facts.push(due==null?"Return date TBC":due<0?"Return overdue":due===0?"Return today":due+" days remaining");if(x.vendor)facts.push(x.vendor);}
  }else if(item.kind==="plex"){
    if(x.year)facts.push(String(x.year));facts.push(x.type==="show"?"TV Series":"Movie");facts.push(Math.round(plexProgress(x))+"% watched");
  }else{
    if(x.year)facts.push(String(x.year));facts.push(mediaRatingLabel(x));facts.push(genreLabel(x.genres,item.kind==="film"?MOVIE_GENRES:SERIES_GENRES));
  }
  return facts.filter(Boolean).map(function(f){return '<span>'+esc(f)+'</span>';}).join("");
}
function tvDetailPlot(item){
  var x=item.raw||{};
  if(item.kind==="game"&&item.plot)return plotBlock(item.title,"video game");
  if(item.kind==="film")return plotBlock(moviePlotName(x),"film");
  if(item.kind==="series")return plotBlock(seriesPlotName(x),"TV series");
  return x.summary?'<div class="tv-detail-overview">'+esc(x.summary)+'</div>':"";
}
function tvDetailHtml(item){
  var x=item.raw||{},overview=x.overview||x.note||"";
  return '<div class="tv-detail" data-tv-detail="1"><div class="tv-detail-backdrop" style="background-image:url(&quot;'+esc(item.backdrop||item.art||"")+'&quot;)"></div><div class="tv-detail-shade"></div><button class="tv-detail-close" type="button" data-tv-close="1" data-tv-key="detail:close" aria-label="Close">×</button><div class="tv-detail-content">'+
    '<div class="tv-detail-poster '+((item.kind==="game")?'landscape':'portrait')+'">'+(item.art?'<img src="'+esc(item.art)+'" alt="">':'<span>GV</span>')+'</div><div class="tv-detail-copy"><span class="tv-detail-kicker">'+esc(item.eyebrow||tvSectionLabel(tvSection))+'</span><h1>'+esc(item.title)+'</h1><div class="tv-detail-facts">'+tvDetailFacts(item)+'</div>'+(overview?'<p>'+esc(overview)+'</p>':'')+'<div class="tv-detail-actions">'+tvDetailLinks(item)+'</div></div></div><div class="tv-detail-story">'+tvDetailPlot(item)+'</div></div>';
}
function tvEnsureShell(){
  var shell=document.getElementById("tvShell");if(shell)return shell;
  shell=document.createElement("div");shell.id="tvShell";shell.className="tv-shell";document.body.appendChild(shell);document.body.classList.add("tv-shell-ready");
  shell.addEventListener("click",function(e){
    var nav=e.target.closest("[data-tv-nav]");if(nav){tvOpenSection(nav.getAttribute("data-tv-nav"));return;}
    var card=e.target.closest("[data-tv-item]");if(card){tvOpenDetail(card.getAttribute("data-tv-item"));return;}
    if(e.target.closest("[data-tv-close]")){tvCloseDetail();return;}
    var action=e.target.closest("[data-tv-system]");if(action)tvSystemAction(action.getAttribute("data-tv-system"));
  });
  shell.addEventListener("focusin",function(e){
    var card=e.target.closest&&e.target.closest("[data-tv-item]");if(card){
      var item=tvItemRegistry[card.getAttribute("data-tv-item")];if(item)tvSetAmbient(item);
      tvLastCardBySection[tvSection]=card.getAttribute("data-tv-key")||"";tvLastRowBySection[tvSection]=Number(card.getAttribute("data-tv-row"))||0;
    }
  });
  return shell;
}
function tvSetAmbient(item){
  var ambient=document.getElementById("tvAmbient");if(!ambient)return;
  ambient.style.backgroundImage=item&&item.backdrop?'url("'+String(item.backdrop).replace(/"/g,"%22")+'")':"";
}
function tvOpenSection(name){
  if(TV_SECTIONS.indexOf(name)<0)return;
  tvSection=name;tvDetail=null;try{localStorage.setItem(TV_HOME_KEY,name);}catch(e){}
  if(["games","films","series","plex","biglybt"].indexOf(name)>-1)section=name;
  renderTvApp();tvPrimeSection(name);
}
function tvPrimeSection(name){
  if(name==="home"||name==="films"){
    ["uphw","bluray","relhw","mlott"].forEach(function(k){ensureFilms(k);});
  }
  if(name==="home"||name==="series"){
    ["seriesnew","seriesupcoming","enseries","mlseries","taseries","hiseries"].forEach(function(k){ensureSeries(k);});
  }
  if((name==="home"||name==="plex")&&plexServerUrl()&&plexToken()&&!plexItems.length)plexRefresh();
  if(name==="biglybt"&&biglyToken&&!biglyBusy)biglyRefresh();
}
function tvOpenDetail(key){
  var item=tvItemRegistry[key];if(!item)return;tvDetail=item;
  if(item.kind==="game"&&item.plot)ensurePlot(item.title,"video game");
  if(item.kind==="film")ensurePlot(moviePlotName(item.raw),"film");
  if(item.kind==="series")ensurePlot(seriesPlotName(item.raw),"TV series");
  renderTvApp("detail:close");
}
function tvCloseDetail(){tvDetail=null;renderTvApp(tvLastCardBySection[tvSection]||("nav:"+tvSection));}
function tvSystemAction(action){
  if(action==="sync"){silentPullOnLoad();flash("Checking Google Drive…");}
  else if(action==="reload")location.reload();
  else if(action==="zoom-out"){setTvZoom(tvZoomValue()-.05);renderTvApp("system:zoom-out");}
  else if(action==="zoom-reset"){setTvZoom(.90);renderTvApp("system:zoom-reset");}
  else if(action==="zoom-in"){setTvZoom(tvZoomValue()+.05);renderTvApp("system:zoom-in");}
  else if(action==="bigly-refresh")biglyRefresh();
}
function tvFocusShell(el){
  if(!el)return false;try{el.focus({preventScroll:true});}catch(e){el.focus();}
  var row=el.closest&&el.closest(".tv-card-row");if(row){var er=el.getBoundingClientRect(),rr=row.getBoundingClientRect();if(er.left<rr.left+18)row.scrollLeft-=rr.left+18-er.left;else if(er.right>rr.right-24)row.scrollLeft+=er.right-(rr.right-24);}
  var shelf=el.closest&&el.closest(".tv-shelf");if(shelf){var main=document.getElementById("tvMainScroll"),sr=shelf.getBoundingClientRect(),mr=main&&main.getBoundingClientRect();if(main&&mr){if(sr.top<mr.top+100)main.scrollTop-=mr.top+100-sr.top;else if(sr.bottom>mr.bottom-30)main.scrollTop+=sr.bottom-(mr.bottom-30);}}
  return true;
}
function renderTvApp(preferredKey){
  if(!TV_MODE)return;
  var shell=tvEnsureShell(),active=document.activeElement,remember=preferredKey||(active&&active.getAttribute&&active.getAttribute("data-tv-key"))||tvLastCardBySection[tvSection]||("nav:"+tvSection);
  tvItemRegistry={};document.body.classList.toggle("detail-open",!!tvDetail);
  if(tvDetail){shell.innerHTML=tvDetailHtml(tvDetail);setTimeout(function(){tvFocusShell(shell.querySelector('[data-tv-key="'+remember+'"]')||shell.querySelector('[data-tv-key="detail:close"]'));},0);return;}
  var rows=tvRowsForSection(tvSection),first=rows[0]&&rows[0].items[0];
  shell.innerHTML='<div class="tv-ambient" id="tvAmbient"></div><div class="tv-ambient-shade"></div>'+tvRailHtml()+'<main class="tv-main" id="tvMainScroll">'+tvHeaderHtml()+'<div class="tv-view">'+(tvSection==="system"?tvSystemHtml():tvSection==="biglybt"?tvBiglyHtml():tvRowsHtml(rows))+'</div></main>';
  tvSetAmbient(first);
  setTimeout(function(){var target=shell.querySelector('[data-tv-key="'+remember.replace(/"/g,"\\\"")+'"]')||shell.querySelector('[data-tv-key="nav:'+tvSection+'"]')||shell.querySelector('[data-tv-card]');tvFocusShell(target);},0);
}

function render(){
  if(TV_MODE){
    renderTvApp();
    return;
  }
  var detailOpen=!!((section==="games"&&gameView==="grid"&&expandedId)||(section==="films"&&filmExpanded)||(section==="series"&&seriesExpanded));
  document.body.classList.toggle("detail-open",detailOpen);
  renderPageContext();
  renderRecentStrip();
  var statsEl=document.getElementById("stats");
  document.body.classList.toggle("bigly-active",section==="biglybt");
  if(section==="biglybt"){
    statsEl.style.display="none";
    renderTabs();
    if(document.getElementById("biglyBrowser")){
      applyBackground();
      tvAfterRender();
      return;
    }
    document.getElementById("content").innerHTML=renderBiglyBT();
    applyBackground();
    tvAfterRender();
    return;
  }
  if(section==="plex"){
    statsEl.style.display="none";
    renderTabs();
    document.getElementById("content").innerHTML=renderPlex();
    applyBackground();
    tvAfterRender();
    return;
  }
  if(section==="films" || section==="series"){
    statsEl.style.display="none";
    renderTabs();
    document.getElementById("content").innerHTML=section==="films" ? renderFilms() : renderSeries();
    applyBackground();
    tvAfterRender();
    return;
  }
  statsEl.style.display="";
  renderStats();
  renderTabs();
  var c=document.getElementById("content");
  if(gameView==="grid" && expandedId){
    c.innerHTML=renderGameDetail();
    applyBackground();
    tvAfterRender();
    return;
  }
  c.innerHTML =
    tab==="rentals" ? renderRentals() :
    tab==="playing" ? renderPlaying() :
    tab==="queue"   ? renderQueue() :
    tab==="upcoming"? renderUpcoming() :
    tab==="suggest" ? renderSuggest() : renderPlayed();
  applyBackground();
  tvAfterRender();
}

/* ================= FILMS SECTION (TMDB + OMDb) =================
   Live movie data, cached in localStorage only (public data — kept out of the
   synced game vault). Three tabs: upcoming Hollywood, released Hollywood
   (filtered to exact IMDb >= 7.0 via OMDb), and weekly Malayalam OTT. */
var TMDB_KEY_STORE="ps5-tmdb-key", OMDB_KEY_STORE="ps5-omdb-key";
var SECTION_KEY="ps5-section", FILMTAB_KEY="ps5-filmtab", FILM_CACHE_KEY="ps5-films-cache", MEDIA_CACHE_VERSION_KEY="gamevault-media-cache-version";
var section="games", filmTab="watchlist";
try{ section=localStorage.getItem(SECTION_KEY)||"games"; }catch(e){}
try{ filmTab=localStorage.getItem(FILMTAB_KEY)||"watchlist"; }catch(e){}
function tmdbKey(){ try{ return localStorage.getItem(TMDB_KEY_STORE)||""; }catch(e){ return ""; } }
function omdbKey(){ try{ return localStorage.getItem(OMDB_KEY_STORE)||""; }catch(e){ return ""; } }
var FILM_ORDER=["watchlist","uphw","bluray","relhw","mlott","watched"];
if(filmTab==="mlup") filmTab="mlott";
if(FILM_ORDER.indexOf(filmTab)<0) filmTab="watchlist";
var FILM_TTL={bluray:24*3600*1000, uphw:24*3600*1000, relhw:24*3600*1000, mlott:6*3600*1000, mlup:6*3600*1000};
var filmCache={}, filmBusy={}, filmErr={};
try{ filmCache=JSON.parse(localStorage.getItem(FILM_CACHE_KEY)||"{}")||{}; }catch(e){ filmCache={}; }
try{
  if(localStorage.getItem(MEDIA_CACHE_VERSION_KEY)!=="4"){
    filmCache={}; localStorage.setItem(MEDIA_CACHE_VERSION_KEY,"4");
  }
}catch(e){}
function saveFilmCache(){ try{ localStorage.setItem(FILM_CACHE_KEY, JSON.stringify(filmCache)); }catch(e){} }
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
  '</div>';
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
function mediaPoster(src, label){
  return '<div class="poster-wrap">'+(src?'<img class="poster-img" src="'+esc(src)+'" alt="'+esc(label||"Media")+' poster" loading="lazy">':'<div class="poster-ph">'+esc(label||"")+'</div>')+'</div>';
}
function mediaSummary(title, rating, genre, extra){
  return '<div class="media-info"><div class="media-title">'+esc(title)+'</div><div class="media-meta">'+
    '<span class="media-pill imdb">'+esc(rating)+'</span><span class="media-pill">'+esc(genre)+'</span></div>'+(extra||'')+'</div>';
}
function mediaClose(kind){
  return '<button class="detail-close" data-act="media-close" data-kind="'+kind+'" aria-label="Close details" title="Close details (Esc)">&times;</button>';
}
function closeMediaStateDetail(kind,id){
  var wasOpen=kind==="film"?String(filmExpanded)===String(id):String(seriesExpanded)===String(id);
  if(!wasOpen) return false;
  if(kind==="film") filmExpanded=null; else seriesExpanded=null;
  aiOpen=null;
  if(!TV_MODE&&history.state&&history.state.gameVaultDetail) history.replaceState(null,"",location.href.split("#")[0]);
  return true;
}
function seriesLanguageOptions(selected){
  return [["","All languages"],["en","English"],["ml","Malayalam"],["ta","Tamil"],["hi","Hindi"]].map(function(p){
    return '<option value="'+p[0]+'"'+(selected===p[0]?' selected':'')+'>'+p[1]+'</option>';
  }).join("");
}
function detailNeighbors(kind,current){
  var list=[];
  if(kind==="film") list=filmTab==="watchlist"?(data.movieWatchlist||[]):filmTab==="watched"?(data.watchedMovies||[]):((filmCache[filmTab]||{}).items||[]);
  else if(kind==="series") list=seriesTab==="serieswatchlist"?(data.seriesWatchlist||[]):seriesTab==="serieswatching"||seriesTab==="seriesnew"?(data.watchingSeries||[]):seriesTab==="serieswatched"?(data.watchedSeries||[]):((seriesCache[seriesTab]||{}).items||[]);
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
function mapMovie(m){
  return { id:m.id, title:m.title||m.name||"Untitled",
    date:m.release_date||"", originalDate:m.release_date||"", year:(m.release_date||"").slice(0,4),
    originalLanguage:m.original_language||"",
    overview:m.overview||"", tmdb:Math.round((m.vote_average||0)*10)/10,
    genres:m.genre_ids||[],
    votes:m.vote_count||0, popularity:m.popularity||0,
    poster:m.poster_path?("https://image.tmdb.org/t/p/w185"+m.poster_path):"",
    backdrop:m.backdrop_path?("https://image.tmdb.org/t/p/w1280"+m.backdrop_path):"" };
}
/* OMDb exact IMDb rating by title + year */
function omdbRating(title, year){
  var k=omdbKey(); if(!k) return Promise.resolve(null);
  return fetchWithPolicy("https://www.omdbapi.com/?apikey="+encodeURIComponent(k)+"&t="+encodeURIComponent(title)+(year?"&y="+year:""),{},{timeout:12000,retries:1})
    .then(function(r){ return r.json(); })
    .then(function(j){ return (j&&j.imdbRating&&j.imdbRating!=="N/A") ? parseFloat(j.imdbRating) : null; })
    .catch(function(){ return null; });
}
/* OMDb rating by IMDb id (exact match — used for regional films where title lookup is unreliable) */
function omdbRatingById(imdbId){
  var k=omdbKey(); if(!k||!imdbId) return Promise.resolve(null);
  return fetchWithPolicy("https://www.omdbapi.com/?apikey="+encodeURIComponent(k)+"&i="+encodeURIComponent(imdbId),{},{timeout:12000,retries:1})
    .then(function(r){ return r.json(); })
    .then(function(j){ return (j&&j.imdbRating&&j.imdbRating!=="N/A") ? parseFloat(j.imdbRating) : null; })
    .catch(function(){ return null; });
}
function refreshImdbIfStale(x){
  if(!x || !x.imdbId || !omdbKey()) return;
  if(x.imdbAt && (Date.now()-x.imdbAt)<30*60*1000) return;
  x.imdbAt=Date.now();
  omdbRatingById(x.imdbId).then(function(rt){
    if(typeof rt==="number"){
      x.imdb=rt;
      x.imdbAt=Date.now();
      saveFilmCache(); saveSeriesCache(); persistSilent();
      if(section==="films"||section==="series") render();
    }
  });
}
function imdbBadge(m){ return (typeof m.imdb==="number") ? '<span class="prov imdb">IMDb '+m.imdb.toFixed(1)+'</span> ' : ''; }
/* OMDb lookup returning both rating and the IMDb id (for a direct IMDb link) */
function omdbLookup(title, year){
  var k=omdbKey(); if(!k) return Promise.resolve(null);
  return fetchWithPolicy("https://www.omdbapi.com/?apikey="+encodeURIComponent(k)+"&t="+encodeURIComponent(title)+(year?"&y="+year:""),{},{timeout:12000,retries:1})
    .then(function(r){ return r.json(); })
    .then(function(j){ return j ? { rating:(j.imdbRating&&j.imdbRating!=="N/A")?parseFloat(j.imdbRating):null, imdbId:j.imdbID||null } : null; })
    .catch(function(){ return null; });
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
/* run an async step over a list one at a time, with a small gap (rate-limit safe) */
function serialEach(list, gap, fn){
  var i=0;
  return (function step(){
    if(i>=list.length) return Promise.resolve(list);
    return Promise.resolve(fn(list[i++])).then(function(){
      return new Promise(function(res){ setTimeout(res, gap); });
    }).then(step);
  })();
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
function ensureFilms(key, force){
  if(!FILM_FETCH[key]) return; // e.g. the Watched tab renders from the vault, no fetch
  if(filmBusy[key]) return;
  if(!tmdbKey()) return;
  var c=filmCache[key];
  if(!force && c && (Date.now()-c.t)<FILM_TTL[key]) return;
  filmErr[key]=0; filmBusy[key]=1; filmsMaybeRender();
  FILM_FETCH[key]().then(function(items){
    filmCache[key]={t:Date.now(), items:items};
    saveFilmCache(); delete filmBusy[key]; filmsMaybeRender();
  }).catch(function(e){ reportError("films:"+key,e); delete filmBusy[key]; filmErr[key]=1; filmsMaybeRender(); });
}
function filmsMaybeRender(){
  if(TV_MODE){ if(tvSection==="home"||tvSection==="films") renderTvApp(); return; }
  if(section!=="films") return;
  var ae=document.activeElement;
  if(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
  document.getElementById("content").innerHTML=renderFilms();
  applyBackground();
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
  return m.poster ? '<img class="cover" src="'+esc(m.poster)+'" alt="" loading="lazy">' : '<div class="cover ph">🎬</div>';
}
function mediaDate(x){ return (x&&(x.ottDate||x.date||(x.year?x.year+"-12-31":"")))||""; }
function newerFirst(a,b){ var aa=mediaDate(a), bb=mediaDate(b); return aa<bb?1:aa>bb?-1:0; }
/* ---- movie Watched status (synced, never re-shown) ---- */
function movieWatchKey(m){ return "tmdb:"+(m.id!=null?m.id:norm(m.title)); }
function watchedMovieKeys(){ var s={}; (data.watchedMovies||[]).forEach(function(w){ s[w.key]=1; }); return s; }
function watchlistMovieKeys(){ var s={}; (data.movieWatchlist||[]).forEach(function(w){ s[w.key||movieWatchKey(w)]=1; }); return s; }
function isMovieWatched(m, set){ return !!(set||watchedMovieKeys())[movieWatchKey(m)]; }
function hiddenMovieKeys(){ var s={}; (data.hiddenMovies||[]).forEach(function(w){ s[w.key]=1; }); return s; }
function moviePlotName(m){ return m.title+(m.year?(" "+m.year):""); }
function captureVaultLists(keys){
  var snapshot={};
  keys.forEach(function(key){ snapshot[key]=JSON.parse(JSON.stringify(data[key]||[])); });
  return snapshot;
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
  var undo=captureVaultLists(["movieWatchlist","watchedMovies","hiddenMovies"]);
  var key=movieWatchKey(m);
  if(!data.watchedMovies) data.watchedMovies=[];
  data.movieWatchlist=(data.movieWatchlist||[]).filter(function(x){ return movieWatchKey(x)!==key; });
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
function hideMovie(m){
  if(!m) return;
  var undo=captureVaultLists(["movieWatchlist","hiddenMovies"]);
  var key=movieWatchKey(m);
  if(!data.hiddenMovies) data.hiddenMovies=[];
  data.movieWatchlist=(data.movieWatchlist||[]).filter(function(x){ return movieWatchKey(x)!==key; });
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
  return findSearchMovie(id)||findWatchlistMovie(id)||findCachedMovie(id)||(data.watchedMovies||[]).filter(function(x){ return String(x.id)===String(id); })[0]||(data.hiddenMovies||[]).filter(function(x){ return String(x.id)===String(id); })[0]||null;
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
  if(TV_MODE){ renderTvApp(); return; }
  var el=document.getElementById("mwSearch");
  var had=el && document.activeElement===el, pos=had?el.selectionStart:0;
  document.getElementById("content").innerHTML=renderFilms();
  if(had){ var n=document.getElementById("mwSearch"); if(n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch(e){} } }
  tvAfterRender();
}
function findSearchMovie(id){ for(var i=0;i<movieSearchItems.length;i++){ if(String(movieSearchItems[i].id)===String(id)) return movieSearchItems[i]; } return null; }
function findWatchlistMovie(id){ return (data.movieWatchlist||[]).filter(function(x){ return String(x.id)===String(id); })[0]||null; }
function inWatchlist(m){ return (data.movieWatchlist||[]).some(function(x){ return String(x.id)===String(m.id); }); }
function addToWatchlist(m){
  if(!m) return;
  var undo=captureVaultLists(["movieWatchlist","hiddenMovies"]);
  if(!data.movieWatchlist) data.movieWatchlist=[];
  data.hiddenMovies=(data.hiddenMovies||[]).filter(function(x){ return movieWatchKey(x)!==movieWatchKey(m); });
  if(inWatchlist(m)){ flash("Already in your watchlist"); return; }
  data.movieWatchlist.unshift({key:movieWatchKey(m), id:m.id, title:m.title, year:m.year||"", poster:m.poster||"",
    imdb:(typeof m.imdb==="number"?m.imdb:null), imdbId:m.imdbId||null, tmdb:m.tmdb||null, overview:m.overview||"", genres:m.genres||[], added:Date.now()});
  commitVaultUndo(undo,"Added to your watchlist");
}
function removeFromWatchlist(id){
  var undo=captureVaultLists(["movieWatchlist"]);
  data.movieWatchlist=(data.movieWatchlist||[]).filter(function(x){ return String(x.id)!==String(id); });
  commitVaultUndo(undo,"Removed from watchlist");
}
function titleOverflow(label,items){
  return '<details class="title-menu"><summary aria-label="More actions for '+esc(label)+'" title="More actions">&#8943;<span>More</span></summary><div class="title-menu-pop">'+items.join("")+'</div></details>';
}
function moviePrimaryAction(m,key,compact){
  var id=esc(String(m.id)),cls=compact?'btn title-primary compact':'btn blue title-primary';
  if(key==="watched") return '<button class="'+cls+'" data-act="movie-primary" data-state="unwatch" data-id="'+id+'">&#8634; Restore</button>';
  if(key==="watchlist") return '<button class="'+cls+'" data-act="movie-primary" data-state="watched" data-id="'+id+'">&#10003; Mark Watched</button>';
  return '<button class="'+cls+'" data-act="movie-primary" data-state="watchlist" data-id="'+id+'">+ Watchlist</button>';
}
function movieMoreMenu(m,key){
  var id=esc(String(m.id)),items=[];
  if(key!=="watchlist"&&key!=="watched") items.push('<button type="button" data-act="movie-state" data-state="watched" data-id="'+id+'">&#10003; Mark Watched</button>');
  if(key!=="watchlist") items.push('<button type="button" data-act="movie-state" data-state="watchlist" data-id="'+id+'">+ Add to Watchlist</button>');
  if(key!=="watched") items.push('<button type="button" data-act="movie-state" data-state="hide" data-id="'+id+'">Not Interested</button>');
  if(key==="watchlist") items.push('<button type="button" class="danger" data-act="movie-state" data-state="remove" data-id="'+id+'">Remove from Watchlist</button>');
  if(key==="watched") items.push('<button type="button" data-act="movie-state" data-state="unwatch" data-id="'+id+'">Restore to suggestions</button>');
  return titleOverflow(m.title,items);
}
function movieStateBadge(key){
  var labels={watchlist:"WATCHLIST",watched:"WATCHED",uphw:"UPCOMING",bluray:"BLU-RAY",mlott:"OTT"};
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
function filmReleaseMeta(m,key){
  if(key==="uphw") return '<div class="media-release">Theatrical release: '+esc(m.date?fmt(m.date):"Date TBC")+'<br>'+releaseCountdown(m.date)+'</div>';
  if(key==="bluray") return '<div class="media-release">Blu-ray release: '+esc(m.date?fmt(m.date):"Date TBC")+'</div>';
  if(key==="mlott") return '<div class="media-release">OTT release: '+esc(m.ottDate?fmt(m.ottDate):"Date TBC")+'</div>';
  if(key==="mlup") return '<div class="media-release">OTT release: '+esc(m.ottDate?fmt(m.ottDate):"Date TBC")+'<br>'+releaseCountdown(m.ottDate)+'</div>';
  return "";
}
function movieMain(m,key){
  var details=genreLabel(m.genres,MOVIE_GENRES);
  if(m.originalLanguage&&m.originalLanguage!=="en") details+=(details?" · ":"")+m.originalLanguage.toUpperCase();
  return mediaPoster(m.poster,m.title)+mediaSummary(m.title,mediaRatingLabel(m),details,filmReleaseMeta(m,key));
}
function mediaPageHero(kind,x,genreList){
  return detailToolbar(kind,x)+'<div class="media-page-head">'+
    '<div class="media-page-poster">'+(x.poster?'<img src="'+esc(x.poster)+'" alt="'+esc(x.title||kind)+' poster" loading="lazy">':'<div class="poster-ph">'+(kind==="film"?"FILM":"TV")+'</div>')+'</div>'+
    '<div><div class="media-page-title">'+esc(x.title)+'</div>'+
    '<div class="media-page-sub"><span class="media-pill imdb">'+esc(mediaRatingLabel(x))+'</span><span class="media-pill">'+esc(genreLabel(x.genres,genreList))+'</span>'+(x.year?'<span class="media-pill">'+esc(x.year)+'</span>':'')+'</div>'+
    (x.overview?'<div class="media-page-overview">'+esc(x.overview)+'</div>':'')+
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
  return '<div class="media-page">'+mediaPageHero("film",m,MOVIE_GENRES)+filmReleaseMeta(m,key)+actions+mediaProvidersBlock(m)+plotBlock(moviePlotName(m),"film")+aiPanel("film",m)+'</div>';
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

  // Watched tab: rendered straight from the synced vault, no internet needed
  if(key==="watched"){
    var wm=applyMediaSort((data.watchedMovies||[]).filter(function(m){ return matchMediaYear(m, filmYear); }).slice().sort(newerFirst),"film");
    var wh='<div class="toolbar" style="margin-top:14px"><select class="selectmini film-year" title="Filter by year">'+yearOptions(filmYear)+'</select>'+mediaSortSelect("film")+'</div>'+mediaViewToggle("film")+'<div class="meta" style="margin:14px 0 10px">'+blurbs.watched+'</div>';
    if(!wm.length) return wh+'<div class="empty">No watched films yet. On any film, pick <b>✓ Watched</b> from its dropdown to file it here.</div>';
    wh+='<div class="'+mediaWrapClass("film")+'">';
    wm.forEach(function(m){ wh+=movieCard(m,"watched"); });
    return wh+'</div>';
  }

  var last=filmCache[key];
  var mlUpcoming=key==="mlott"?filmCache.mlup:null;
  var html=
    '<div class="toolbar" style="margin-top:14px">'+
    '<select class="selectmini film-genre" title="Filter by genre">'+genreOptions(MOVIE_GENRES, filmGenre)+'</select>'+
    '<select class="selectmini film-year" title="Filter by year">'+yearOptions(filmYear)+'</select>'+
    mediaSortSelect("film")+
    '<button class="btn blue" data-act="film-refresh"'+((filmBusy[key]||(key==="mlott"&&filmBusy.mlup))?' disabled':'')+'>'+((filmBusy[key]||(key==="mlott"&&filmBusy.mlup))?"Updating…":"↻ Refresh from internet")+'</button>'+
    '<span class="syncnote" style="align-self:center">'+(last?("Updated "+new Date(last.t).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})):"")+'</span>'+
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
  var hset2=hiddenMovieKeys();
  var hidePersonal=(key!=="uphw" && key!=="mlup");
  var items=((last&&last.items)||[]).filter(function(m){
    var mk=movieWatchKey(m);
    return matchMediaYear(m, filmYear) && !hset2[mk] && (!hidePersonal || (!wset[mk] && !wlset[mk]));
  }); // watched/watchlist/hidden stay out of suggestion lists, except Upcoming
  if(key==="bluray"||key==="relhw"||key==="mlott") items.sort(newerFirst);
  items=applyMediaSort(items,"film");
  var upcomingItems=[];
  if(key==="mlott") upcomingItems=((mlUpcoming&&mlUpcoming.items)||[]).filter(function(m){
    var mk=movieWatchKey(m); return matchMediaYear(m,filmYear)&&!hset2[mk];
  }).sort(function(a,b){return (a.ottDate||a.date||"").localeCompare(b.ottDate||b.date||"");});
  upcomingItems=applyMediaSort(upcomingItems,"film");
  if(!items.length && !upcomingItems.length){
    setTimeout(function(){ ensureFilms(key); },60);
    return html+'<div class="empty">'+(filmBusy[key]?"Loading…":(last?"Nothing left here — everything shown is marked Watched.":"Nothing to show yet — tap ↻ Refresh."))+'</div>';
  }
  setTimeout(function(){ ensureFilms(key); },60); // refresh silently if stale
  if(key==="mlott") setTimeout(function(){ensureFilms("mlup");},120);
  if(key==="mlott") html+='<div class="sechead">Now Streaming · '+items.length+'</div>';
  if(items.length){ html+='<div class="'+mediaWrapClass("film")+'">'; items.forEach(function(m){ html+=movieCard(m,key); }); html+='</div>'; }
  if(key==="mlott"){
    html+='<div class="sechead">Coming to Malayalam OTT · '+upcomingItems.length+'</div>';
    if(upcomingItems.length){ html+='<div class="'+mediaWrapClass("film")+'">'; upcomingItems.forEach(function(m){ html+=movieCard(m,"mlup"); }); html+='</div>'; }
    else html+='<div class="empty">No confirmed upcoming Malayalam OTT dates are available yet.</div>';
  }
  if(filmBusy[key]) html+='<div class="meta" style="margin-top:8px">Refreshing…</div>';
  return html;
}
/* ================= TV SERIES SECTION (TMDB + OMDb) =================
   Public lists cache locally; personal watchlist, watched state and ratings
   live in the synced vault beside the game and film data. */
var SERIESTAB_KEY="ps5-seriestab", SERIES_CACHE_KEY="ps5-series-cache-v2";
var seriesTab="serieswatchlist";
try{ seriesTab=localStorage.getItem(SERIESTAB_KEY)||"serieswatchlist"; }catch(e){}
var SERIES_ORDER=["serieswatchlist","serieswatching","seriesnew","seriesupcoming","enseries","mlseries","taseries","hiseries","serieswatched"];
if(seriesTab==="seriesdiscover") seriesTab="enseries";
if(SERIES_ORDER.indexOf(seriesTab)<0) seriesTab="serieswatchlist";
var SERIES_TTL={enseries:24*3600*1000,mlseries:24*3600*1000,taseries:24*3600*1000,hiseries:24*3600*1000,seriesdiscover:24*3600*1000,seriesupcoming:12*3600*1000};
var seriesCache={}, seriesBusy={}, seriesErr={};
try{ seriesCache=JSON.parse(localStorage.getItem(SERIES_CACHE_KEY)||"{}")||{}; }catch(e){ seriesCache={}; }
function saveSeriesCache(){ try{ localStorage.setItem(SERIES_CACHE_KEY, JSON.stringify(seriesCache)); }catch(e){} }
var seriesEpisodeCache={}, seriesSeasonSel={}, seriesEpisodeSel={}, seriesEpisodeBusy={};
function mapSeries(s){
  return { id:s.id, title:s.name||s.original_name||"Untitled",
    date:s.first_air_date||"", firstAirDate:s.first_air_date||"", latestDate:s.last_air_date||"", year:(s.first_air_date||"").slice(0,4),
    overview:s.overview||"", tmdb:Math.round((s.vote_average||0)*10)/10,
    votes:s.vote_count||0, popularity:s.popularity||0, genres:s.genre_ids||[],
    poster:s.poster_path?("https://image.tmdb.org/t/p/w185"+s.poster_path):"",
    backdrop:s.backdrop_path?("https://image.tmdb.org/t/p/w1280"+s.backdrop_path):"" };
}
function enrichSeriesIds(s){
  return tmdbGet("/tv/"+s.id, {append_to_response:"external_ids,watch/providers"}).then(function(d){
    if(d&&d.external_ids&&d.external_ids.imdb_id) s.imdbId=d.external_ids.imdb_id;
    if(d&&d.number_of_seasons) s.seasons=d.number_of_seasons;
    s.seriesType=d.type||"";
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
function regionalTvSeriesOnly(s){
  var text=(s.title+" "+(s.overview||"")).toLowerCase();
  var networks=(s.networks||[]).join(" ").toLowerCase();
  if(networks.indexOf("youtube")>-1 || /\byou\s*tube\b/.test(text)) return false;
  if(/\b(daily soap|soap opera|television serial|tv serial|mega serial|daily serial)\b/.test(text)) return false;
  if(s.seriesType && s.seriesType!=="Scripted" && s.seriesType!=="Miniseries") return false;
  if((s.episodeCount||0)>120) return false;
  return true;
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
        seen[s.id]=1; var mapped=mapSeries(s); mapped.providerRegion=regionalOnly?"IN":"US"; cands.push(mapped);
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
      return regionalOnly ? cands.filter(regionalTvSeriesOnly).sort(function(a,b){return (b.latestDate||b.date||"").localeCompare(a.latestDate||a.date||"");}) : cands;
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
function fetchMlSeries(){ return fetchSeriesLang("ml", 1, 0, "first_air_date.desc", 6, true); }
function fetchTaSeries(){ return fetchSeriesLang("ta", 1, 0, "first_air_date.desc", 8, true); }
function fetchHiSeries(){ return fetchSeriesLang("hi", 1, 0, "first_air_date.desc", 8, true); }
function fetchSeriesDiscover(){
  if(seriesLanguage==="ml") return fetchMlSeries();
  if(seriesLanguage==="ta") return fetchTaSeries();
  if(seriesLanguage==="hi") return fetchHiSeries();
  if(seriesLanguage==="en") return fetchEnSeries();
  return Promise.all([
    fetchSeriesLang("en",350,7.2,"vote_average.desc",1),
    fetchSeriesLang("ml",1,0,"first_air_date.desc",1,true),
    fetchSeriesLang("ta",1,0,"first_air_date.desc",1,true),
    fetchSeriesLang("hi",20,6.5,"popularity.desc",1)
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
var seriesPersonalRefreshAt=0;
function ensureSeries(key, force){
  if(key==="serieswatching"||key==="seriesnew"){
    if(!tmdbKey()||seriesBusy[key]) return;
    if(!force&&Date.now()-seriesPersonalRefreshAt<6*3600*1000) return;
    var personal=(data.watchingSeries||[]).slice(0,30);
    if(!personal.length) return;
    seriesBusy[key]=1;
    serialEach(personal,120,enrichSeriesIds).then(function(){seriesPersonalRefreshAt=Date.now();delete seriesBusy[key];persistSilent();seriesMaybeRender();}).catch(function(e){delete seriesBusy[key];reportError("series:"+key,e);seriesMaybeRender();});
    return;
  }
  if(!SERIES_FETCH[key]) return;
  if(seriesBusy[key]) return;
  if(!tmdbKey()) return;
  var c=seriesCache[key];
  if(!force && c && (Date.now()-c.t)<SERIES_TTL[key]) return;
  seriesErr[key]=0; seriesBusy[key]=1; seriesMaybeRender();
  SERIES_FETCH[key]().then(function(items){
    seriesCache[key]={t:Date.now(), items:items};
    saveSeriesCache(); delete seriesBusy[key]; seriesMaybeRender();
  }).catch(function(e){ reportError("series:"+key,e); delete seriesBusy[key]; seriesErr[key]=1; seriesMaybeRender(); });
}
function seriesMaybeRender(){
  if(TV_MODE){ if(tvSection==="home"||tvSection==="series") renderTvApp(); return; }
  if(section!=="series") return;
  var ae=document.activeElement;
  if(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
  document.getElementById("content").innerHTML=renderSeries();
  applyBackground();
}
function seriesPoster(s){
  return s.poster ? '<img class="cover" src="'+esc(s.poster)+'" alt="" loading="lazy">' : '<div class="cover ph">TV</div>';
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
  return findSearchSeries(id)||findWatchlistSeries(id)||(data.watchingSeries||[]).filter(function(x){ return String(x.id)===String(id); })[0]||findCachedSeries(id)||(data.watchedSeries||[]).filter(function(x){ return String(x.id)===String(id); })[0]||(data.hiddenSeries||[]).filter(function(x){ return String(x.id)===String(id); })[0]||null;
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
function ensureSeriesEpisodes(s, seasonNo){
  if(!s||!s.id||!seasonNo||!tmdbKey()) return;
  var key=s.id+":"+seasonNo;
  if(seriesEpisodeCache[key] || seriesEpisodeBusy[key]) return;
  seriesEpisodeBusy[key]=1;
  tmdbGet("/tv/"+s.id+"/season/"+seasonNo, {}).then(function(j){
    seriesEpisodeCache[key]=(j.episodes||[]).map(function(e){
      return {n:e.episode_number, title:e.name||("Episode "+e.episode_number), overview:e.overview||"", air:e.air_date||""};
    });
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
  var key=s.id+":"+selected, eps=seriesEpisodeCache[key]||[];
  var epSel=seriesEpisodeSel[sid]||((eps[0]&&String(eps[0].n))||"");
  var h='<div class="plot"><b>Episodes</b><div class="fields" style="margin-top:10px">'+
    '<select class="selectmini sr-season" data-id="'+esc(sid)+'">'+seasons.map(function(se){ return '<option value="'+se.n+'"'+(String(se.n)===String(selected)?" selected":"")+'>'+esc(se.name)+' '+(se.episodes?("("+se.episodes+")"):"")+'</option>'; }).join("")+'</select>'+
    '<select class="selectmini sr-episode" data-id="'+esc(sid)+'">'+(eps.length?eps.map(function(ep){ return '<option value="'+ep.n+'"'+(String(ep.n)===String(epSel)?" selected":"")+'>'+ep.n+'. '+esc(ep.title)+'</option>'; }).join(""):'<option>Loading episodes...</option>')+'</select></div>';
  var ep=eps.filter(function(e){ return String(e.n)===String(epSel); })[0];
  if(ep){
    h+='<div style="margin-top:10px"><b>S'+selected+' E'+ep.n+': '+esc(ep.title)+'</b>'+(ep.air?' <span style="color:var(--muted)">· '+fmt(ep.air)+'</span>':'')+'<br>'+
      (ep.overview?esc(ep.overview):'No episode overview available from TMDB.')+'</div></div>'+
      episodePlotBlock(s,selected,ep);
    return h;
  }
  return h+'</div>';
}
function seriesMeta(s, key){
  var parts=[];
  if(typeof s.imdb==="number") parts.push('<span class="prov imdb">IMDb '+s.imdb.toFixed(1)+'</span>');
  if(s.tmdb) parts.push('<span class="prov">TMDB '+s.tmdb+'</span>');
  if(s.year) parts.push(esc(s.year));
  if(s.seasons) parts.push(esc(s.seasons)+" season"+(Number(s.seasons)===1?"":"s"));
  if(s.providers&&s.providers.length) parts.push('<br>'+provChips(s.providers));
  if(key==="serieswatched") parts.unshift('<span style="color:#9AA6BC">✓ Watched</span>');
  return parts.join(" ");
}
function seriesReleaseMeta(s){
  var date=s&&(s.ottDate||s.latestDate||s.date);
  if(!date) return "";
  var day=parseD(date).toLocaleDateString("en-IN",{weekday:"long"});
  var label=s.ottDate?"OTT premiere":s.latestDate?"Latest episode":"First aired";
  return '<div class="media-release">'+label+': '+esc(fmt(date))+' · '+esc(day)+'</div>';
}
function seriesMain(s){
  return mediaPoster(s.poster,s.title)+mediaSummary(s.title,mediaRatingLabel(s),genreLabel(s.genres,SERIES_GENRES),seriesReleaseMeta(s));
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
  if(TV_MODE){ renderTvApp(); return; }
  var el=document.getElementById("swSearch");
  var had=el && document.activeElement===el, pos=had?el.selectionStart:0;
  document.getElementById("content").innerHTML=renderSeries();
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
  data.seriesWatchlist.unshift({key:seriesKey(s), id:s.id, title:s.title, year:s.year||"", poster:s.poster||"",
    imdb:(typeof s.imdb==="number"?s.imdb:null), imdbId:s.imdbId||null, tmdb:s.tmdb||null,
    overview:s.overview||"", genres:s.genres||[], date:s.date||"", latestDate:s.latestDate||"", seasons:s.seasons||"", seasonList:s.seasonList||[], providers:s.providers||[], added:Date.now()});
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
  return '<div class="media-page">'+mediaPageHero("series",s,SERIES_GENRES)+seriesReleaseMeta(s)+actions+mediaProvidersBlock(s)+seriesEpisodeBlock(s)+aiPanel("series",s)+'</div>';
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
    mlseries:"Malayalam TV series only, newest first. Television serials and YouTube series are excluded.",
    taseries:"Tamil TV series only, newest first. Television serials and YouTube series are excluded.",
    hiseries:"Hindi TV series and streaming originals only, newest first. Television serials and YouTube series are excluded.",
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
  var last=seriesCache[key];
  var html='<div class="toolbar" style="margin-top:14px">'+
    (key==="seriesupcoming"?'<select class="selectmini series-language" title="Filter by language">'+seriesLanguageOptions(seriesLanguage)+'</select>':'')+
    '<select class="selectmini series-genre" title="Filter by genre">'+genreOptions(SERIES_GENRES, seriesGenre)+'</select>'+
    '<select class="selectmini series-year" title="Filter by year">'+yearOptions(seriesYear)+'</select>'+
    '<select class="selectmini series-provider" title="Filter by streaming platform">'+providerOptions(seriesProvider)+'</select>'+
    mediaSortSelect("series")+
    '<button class="btn blue" data-act="series-refresh"'+(seriesBusy[key]?' disabled':'')+'>'+(seriesBusy[key]?"Updating...":"↻ Refresh from internet")+'</button>'+
    '<span class="syncnote" style="align-self:center">'+(last?("Updated "+new Date(last.t).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})):"")+'</span>'+
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
    return matchMediaYear(s, seriesYear) && !wset[sk] && !wlset[sk] && !wingSet[sk] && !hset2[sk];
  });
  if(key==="seriesupcoming") items.sort(function(a,b){return (a.date||"").localeCompare(b.date||"");});
  else if(key==="mlseries"||key==="taseries"||key==="hiseries") items.sort(function(a,b){return (b.latestDate||b.date||"").localeCompare(a.latestDate||a.date||"");});
  else items.sort(function(a,b){ return (b.imdb||b.tmdb||0)-(a.imdb||a.tmdb||0); });
  items=applyMediaSort(items,"series");
  if(!items.length){
    setTimeout(function(){ ensureSeries(key); },60);
    return html+'<div class="empty">'+(seriesBusy[key]?"Loading...":(last?"Nothing left here - everything shown is marked Watched.":"Nothing to show yet - tap Refresh."))+'</div>';
  }
  setTimeout(function(){ ensureSeries(key); },60);
  html+='<div class="'+mediaWrapClass("series")+'">'; items.forEach(function(s){ html+=seriesCard(s,key); }); html+='</div>';
  if(seriesBusy[key]) html+='<div class="meta" style="margin-top:8px">Refreshing...</div>';
  return html;
}
function switchSeriesTab(next){
  tabScroll["series:"+seriesTab]=window.scrollY;
  seriesTab=next; seriesExpanded=null; try{ localStorage.setItem(SERIESTAB_KEY,next); }catch(e){}
  render();
  window.scrollTo(0, tabScroll["series:"+next]||0);
  ensureSeries(next);
}
function switchFilmTab(next){
  tabScroll["film:"+filmTab]=window.scrollY;
  filmTab=next; filmExpanded=null; try{ localStorage.setItem(FILMTAB_KEY,next); }catch(e){}
  render();
  window.scrollTo(0, tabScroll["film:"+next]||0);
  ensureFilms(next);
  if(next==="mlott") ensureFilms("mlup");
}
function switchPlexTab(next){
  tabScroll["plex:"+plexTab]=window.scrollY;
  plexTab=next; try{ localStorage.setItem("gamevault-plex-tab",next); }catch(e){}
  render();
  window.scrollTo(0,tabScroll["plex:"+next]||0);
}
function switchSection(s){
  if(section===s) return;
  if(section==="films") tabScroll["film:"+filmTab]=window.scrollY;
  else if(section==="series") tabScroll["series:"+seriesTab]=window.scrollY;
  else if(section==="plex") tabScroll["plex:"+plexTab]=window.scrollY;
  else if(section==="biglybt") tabScroll.biglybt=window.scrollY;
  else tabScroll[tab]=window.scrollY;
  section=s; try{ localStorage.setItem(SECTION_KEY,s); }catch(e){}
  expandedId=null; filmExpanded=null; seriesExpanded=null;
  [].forEach.call(document.querySelectorAll("#sectionSw button"),function(b){
    var active=b.getAttribute("data-section")===s;
    b.classList.toggle("on",active);
    if(active) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current");
  });
  render();
  window.scrollTo(0, section==="films" ? (tabScroll["film:"+filmTab]||0) : section==="series" ? (tabScroll["series:"+seriesTab]||0) : section==="plex" ? (tabScroll["plex:"+plexTab]||0) : section==="biglybt" ? (tabScroll.biglybt||0) : (tabScroll[tab]||0));
  if(section==="films") ensureFilms(filmTab);
  if(section==="series") ensureSeries(seriesTab);
  if(section==="plex" && plexServerUrl() && plexToken() && !plexItems.length) plexRefresh();
  if(section==="biglybt" && biglyToken) biglyRefresh();
}
document.getElementById("sectionSw").addEventListener("click",function(e){
  var b=e.target.closest("[data-section]"); if(b) switchSection(b.getAttribute("data-section"));
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
    ["plex","▶","Plex Library"],["biglybt","⇩","BiglyBT"]
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
    ["plex","shows","Plex TV Shows"],["plex","recent","Recently Added to Plex"]
  ];
  pages.forEach(function(x){commandPush(list,seen,{kind:"page",section:x[0],tab:x[1],icon:"↗",title:x[2],meta:"Open page",label:"Page"});});
  [
    [data.rentals||[],"rentals","Rental"],[data.playing||[],"playing","Now Playing"],
    [data.queue||[],"queue","Rental Queue"],[data.upcoming||[],"upcoming","Upcoming Game"],
    [data.played||[],"played","Completed Game"]
  ].forEach(function(group){group[0].forEach(function(x){commandPush(list,seen,{kind:"game",id:String(x.id||""),tab:group[1],icon:"🎮",title:x.name,meta:group[2],label:"Game"});});});
  [data.movieWatchlist||[],data.watchedMovies||[]].forEach(function(items,idx){items.forEach(function(x){commandPush(list,seen,{kind:"film",id:String(x.id||""),tab:idx?"watched":"watchlist",icon:"🎬",title:x.title,meta:idx?"Watched movie":"Movie watchlist",label:"Movie"});});});
  Object.keys(filmCache||{}).forEach(function(key){var destination=key==="mlup"?"mlott":key;if(FILM_ORDER.indexOf(destination)<0)destination="relhw";((filmCache[key]&&filmCache[key].items)||[]).slice(0,180).forEach(function(x){commandPush(list,seen,{kind:"film",id:String(x.id||""),tab:destination,icon:"🎬",title:x.title,meta:"Movies · "+(key==="uphw"?"Coming Soon":key==="bluray"?"Blu-ray":key==="mlott"||key==="mlup"?"Malayalam OTT":"Discover"),label:"Movie"});});});
  [data.seriesWatchlist||[],data.watchingSeries||[],data.watchedSeries||[]].forEach(function(items,idx){var tabs=["serieswatchlist","serieswatching","serieswatched"];items.forEach(function(x){commandPush(list,seen,{kind:"series",id:String(x.id||""),tab:tabs[idx],icon:"📺",title:x.title,meta:idx===0?"TV watchlist":idx===1?"Watching":"Watched TV show",label:"TV"});});});
  Object.keys(seriesCache||{}).forEach(function(key){var destination=SERIES_ORDER.indexOf(key)>=0?key:"enseries";((seriesCache[key]&&seriesCache[key].items)||[]).slice(0,180).forEach(function(x){commandPush(list,seen,{kind:"series",id:String(x.id||""),tab:destination,icon:"📺",title:x.title,meta:"TV Shows · Discover",label:"TV"});});});
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
function desktopTabs(){return section==="films"?FILM_ORDER:section==="series"?SERIES_ORDER:section==="plex"?PLEX_ORDER:section==="biglybt"?[]:TAB_ORDER;}
function desktopOpenTabByIndex(index){
  var order=desktopTabs(),next=order[index];if(!next)return;
  if(section==="films")switchFilmTab(next);else if(section==="series")switchSeriesTab(next);else if(section==="plex")switchPlexTab(next);else switchTab(next);
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
    if(!document.getElementById("commandPalette").hidden){e.preventDefault();closeCommandPalette(true);return;}
    if(document.body.classList.contains("settings-open")){e.preventDefault();toggleSettings(false);document.getElementById("menuBtn").focus();return;}
    if(document.body.classList.contains("menu-open")){e.preventDefault();setMenuOpen(false);document.getElementById("menuBtn").focus();return;}
    var close=document.querySelector('[data-act="media-close"]');if(close){e.preventDefault();close.click();return;}
  }
  if(editable)return;
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
    if(e.shiftKey)desktopOpenTabByIndex(n);else{var sections=["games","films","series","plex","biglybt"];if(sections[n])switchSection(sections[n]);}
  }
});

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
    var tvClient=document.getElementById("gdTvClientInput"), tvSecret=document.getElementById("gdTvSecretInput");
    if(tvClient) tvClient.value=gdTvClientId();
    if(tvSecret) tvSecret.value=gdTvSecret();
    var biglyProxy=document.getElementById("biglyProxyInput");
    if(biglyProxy) biglyProxy.value=biglyProxyUrl();
    var biglyModeSel=document.getElementById("biglyModeInput");
    if(biglyModeSel) biglyModeSel.value=biglyMode();
    var plexUrlInput=document.getElementById("plexUrlInput"), plexTokenInput=document.getElementById("plexTokenInput"), plexStatus=document.getElementById("plexSettingsStatus");
    if(plexUrlInput) plexUrlInput.value=plexServerUrl();
    if(plexTokenInput) plexTokenInput.value=plexToken();
    if(plexStatus) plexStatus.textContent=plexServerUrl()&&plexToken()?(plexConnected?"Connected to Plex on this device.":"Plex is configured; refresh when the Shield is reachable."):"Not configured.";
    gdSetStatus();
    var jb=getJB();
    document.getElementById("jbKeyInput").value=jb.key;
    document.getElementById("jbBinInput").value=jb.bin;
    var densityInput=document.getElementById("densityInput"); if(densityInput) densityInput.value=uiDensity;
    refreshRecoveryUi();
  }
  if(desktopMode()){
    if(show)setTimeout(function(){var close=document.getElementById("settingsCloseBtn");if(close)close.focus();},0);
    else{var menu=document.getElementById("menuBtn");if(menu&&document.activeElement&&document.activeElement.closest&&document.activeElement.closest("#settingsBox"))menu.focus();}
  }
  if(TV_MODE) setTimeout(tvEnsureFocus,0);
}

function setMenuOpen(show){
  var panel=document.getElementById("menuPanel");
  panel.classList.toggle("open",!!show);
  document.body.classList.toggle("menu-open",!!show);
  document.getElementById("menuBtn").setAttribute("aria-expanded",show?"true":"false");
  if(show&&desktopMode())setTimeout(function(){var first=panel.querySelector("button:not([style*='display:none'])");if(first)first.focus();},0);
  if(TV_MODE) setTimeout(tvEnsureFocus,0);
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
var tvZoomOutBtn=document.getElementById("tvZoomOutBtn");
if(tvZoomOutBtn) tvZoomOutBtn.addEventListener("click",function(){ setTvZoom(tvZoomValue()-0.05); });
var tvZoomInBtn=document.getElementById("tvZoomInBtn");
if(tvZoomInBtn) tvZoomInBtn.addEventListener("click",function(){ setTvZoom(tvZoomValue()+0.05); });
var tvZoomResetBtn=document.getElementById("tvZoomResetBtn");
if(tvZoomResetBtn) tvZoomResetBtn.addEventListener("click",function(){ setTvZoom(0.90); });
var tvSettingsZoomOutBtn=document.getElementById("tvSettingsZoomOutBtn");
if(tvSettingsZoomOutBtn) tvSettingsZoomOutBtn.addEventListener("click",function(){ setTvZoom(tvZoomValue()-0.05); });
var tvSettingsZoomInBtn=document.getElementById("tvSettingsZoomInBtn");
if(tvSettingsZoomInBtn) tvSettingsZoomInBtn.addEventListener("click",function(){ setTvZoom(tvZoomValue()+0.05); });
var tvSettingsZoomResetBtn=document.getElementById("tvSettingsZoomResetBtn");
if(tvSettingsZoomResetBtn) tvSettingsZoomResetBtn.addEventListener("click",function(){ setTvZoom(0.90); });
document.getElementById("saveKeyBtn").addEventListener("click",function(){
  var v=document.getElementById("apiKeyInput").value.trim();
  setSyncedKey("rawg", v);
  toggleSettings(false);
  flash(v?"API key saved & synced — covers, scores and refresh are live now":"API key cleared");
  render();
  if(v) setTimeout(backfillImages,600);
});
document.getElementById("saveSyncBtn").addEventListener("click",function(){
  try{
    localStorage.setItem(JB_KEY_STORE,document.getElementById("jbKeyInput").value.trim());
    localStorage.setItem(JB_BIN_STORE,document.getElementById("jbBinInput").value.trim());
  }catch(e){}
  flash("Sync settings saved — syncing now…");
  silentPullOnLoad();
});
document.getElementById("pushBtn").addEventListener("click",pushCloud);
document.getElementById("pullBtn").addEventListener("click",pullCloud);
document.getElementById("gdSaveBtn").addEventListener("click",function(){
  var v=document.getElementById("gdClientInput").value.trim();
  try{ localStorage.setItem(GD_CLIENT_STORE,v); }catch(e){}
  gdTokenClient=null; // re-init with the new id on next request
  gdSetStatus();
  flash(v?"Client ID saved — now press Sign in with Google":"Client ID cleared");
});
document.getElementById("gdSignInBtn").addEventListener("click",gdSignIn);
document.getElementById("gdSignOutBtn").addEventListener("click",gdSignOut);
var gdTvSaveBtn=document.getElementById("gdTvSaveBtn");
if(gdTvSaveBtn) gdTvSaveBtn.addEventListener("click",function(){
  try{
    localStorage.setItem(GD_TV_CLIENT_STORE,document.getElementById("gdTvClientInput").value.trim());
    localStorage.setItem(GD_TV_SECRET_STORE,document.getElementById("gdTvSecretInput").value.trim());
  }catch(e){}
  gdTvSetStatus("TV login saved. Press Login with phone QR.");
  flash("TV Google login saved");
});
var gdTvLoginBtn=document.getElementById("gdTvLoginBtn");
if(gdTvLoginBtn) gdTvLoginBtn.addEventListener("click",gdTvStart);
var gdTvCancelBtn=document.getElementById("gdTvCancelBtn");
if(gdTvCancelBtn) gdTvCancelBtn.addEventListener("click",function(){
  gdTvStop();
  gdTvSetStatus("QR login cancelled");
  var box=document.getElementById("gdTvBox"); if(box) box.style.display="none";
});
document.getElementById("saveFilmKeysBtn").addEventListener("click",function(){
  setSyncedKey("tmdb", document.getElementById("tmdbKeyInput").value.trim());
  setSyncedKey("omdb", document.getElementById("omdbKeyInput").value.trim());
  filmCache={}; saveFilmCache(); // force a fresh pull with the new keys
  seriesCache={}; saveSeriesCache();
  toggleSettings(false);
  flash(tmdbKey()?"Film keys saved & synced — open the Films section":"Film keys cleared");
  if(section==="films"){ render(); ensureFilms(filmTab); }
  if(section==="series"){ render(); ensureSeries(seriesTab); }
});
var saveBiglyProxyBtn=document.getElementById("saveBiglyProxyBtn");
if(saveBiglyProxyBtn) saveBiglyProxyBtn.addEventListener("click",function(){
  setBiglyProxyUrl(document.getElementById("biglyProxyInput").value);
  var mSel=document.getElementById("biglyModeInput"); if(mSel) setBiglyMode(mSel.value);
  var existingBigly=document.getElementById("biglyBrowser"); if(existingBigly) existingBigly.remove();
  biglyLogout();
  toggleSettings(false);
  flash(biglyProxyUrl()?"BiglyBT proxy saved":"BiglyBT proxy cleared");
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
  setPlexConfig("",""); plexConnected=false; plexAllowDelete=false; plexErr=""; toggleSettings(false); render(); flash("Plex disconnected; cached titles were kept");
});
var densityInput=document.getElementById("densityInput");
if(densityInput) densityInput.addEventListener("change",function(){
  uiDensity=this.value==="compact"?"compact":"comfortable";
  try{ localStorage.setItem(DENSITY_KEY,uiDensity); }catch(e){}
  applyDensity(); render(); flash(uiDensity==="compact"?"Compact layout enabled":"Comfortable layout enabled");
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
  if(act==="recent-open"){
    openRecent(b.getAttribute("data-kind"),id,b.getAttribute("data-subtab")||""); return;
  }
  if(act==="plex-settings"){ toggleSettings(true); return; }
  if(act==="plex-refresh"){ plexRefresh(); return; }
  if(act==="plex-delete"){ plexDeleteItem(id); return; }
  if(act==="bigly-settings"){ toggleSettings(true); return; }
  if(act==="bigly-home"){ var bh=document.getElementById("biglyFrame"); if(bh) bh.src=biglyFrameUrl(); return; }
  if(act==="bigly-native"){ var bn=document.getElementById("biglyFrame"); if(bn) bn.src=biglyProxyUrl()+"/__native"; return; }
  if(act==="bigly-reload"){ var bf=document.getElementById("biglyFrame"); if(bf) bf.src=bf.src; return; }
  if(act==="bigly-fullscreen"){
    var browser=document.getElementById("biglyBrowser");
    if(browser && browser.requestFullscreen) browser.requestFullscreen().catch(function(){ flash("Full screen is not supported by this browser"); });
    return;
  }
  if(act==="bigly-login"){
    var user=(document.getElementById("biglyUser")||{}).value||"";
    var pass=(document.getElementById("biglyPass")||{}).value||"";
    biglyLogin(user.trim(),pass);
    return;
  }
  if(act==="bigly-refresh"){ biglyRefresh(); return; }
  if(act==="bigly-logout"){ biglyLogout(); return; }
  if(act==="bigly-action"){ biglyAction(id,b.getAttribute("data-bigly")); return; }
  if(TV_MODE && tab==="rentals" && /^(toggle-form|add-rental|return-played|return-only|remove-rental|hist-again|hist-del|extend)$/.test(act)){
    flash("Rental tab is view-only on TV");
    return;
  }

  if(act==="film-refresh"){ ensureFilms(filmTab,true); if(filmTab==="mlott") ensureFilms("mlup",true); return; }
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
    if(!TV_MODE && history.state && history.state.gameVaultDetail) history.replaceState({gameVaultDetail:neighborKind,id:id},"",location.href);
    render(); window.scrollTo(0,0); return;
  }
  if(act==="media-close"){
    if(!TV_MODE && history.state && history.state.gameVaultDetail){ history.back(); return; }
    var mk=b.getAttribute("data-kind");
    var returnY=mk==="film"?filmDetailReturnY:mk==="series"?seriesDetailReturnY:gameDetailReturnY;
    if(mk==="film") filmExpanded=null;
    if(mk==="series") seriesExpanded=null;
    if(mk==="game") expandedId=null;
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
    if(!TV_MODE) history.pushState({gameVaultDetail:"game",id:expandedId},"",location.href.split("#")[0]+"#game-detail");
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
    var movieWasOpen=closeMediaStateDetail("film",id);
    if(ms==="watched") markMovieWatched(ma);
    else if(ms==="watchlist") addToWatchlist(ma);
    else if(ms==="hide") hideMovie(ma);
    else if(ms==="remove") removeFromWatchlist(id);
    else if(ms==="unwatch") unwatchMovie(ma.key||movieWatchKey(ma));
    if(movieWasOpen) restoreDetailScroll(filmDetailReturnY);
    return;
  }
  if(act==="series-primary"||act==="series-state"){
    var sa=findSeriesAny(id),ssv=b.getAttribute("data-state");
    if(!sa) return;
    var seriesWasOpen=closeMediaStateDetail("series",id);
    if(ssv==="watching") markSeriesWatching(sa);
    else if(ssv==="watched") markSeriesWatched(sa);
    else if(ssv==="watchlist") addSeriesWatchlist(sa);
    else if(ssv==="hide") hideSeries(sa);
    else if(ssv==="remove") removeSeriesWatchlist(id);
    else if(ssv==="unwatch") unwatchSeries(sa.key||seriesKey(sa));
    if(seriesWasOpen) restoreDetailScroll(seriesDetailReturnY);
    return;
  }
  if(act==="mv-unwatch"){ unwatchMovie(b.getAttribute("data-key")); return; }
  if(act==="mw-add"){ addToWatchlist(findSearchMovie(id)); return; }
  if(act==="mw-remove"){ removeFromWatchlist(id); return; }
  if(act==="mw-clear"){ movieSearchQ=""; movieSearchItems=[]; movieSearchSeq++; render(); return; }
  if(act==="mw-toggle"){
    if(String(filmExpanded)!==String(id)) filmDetailReturnY=window.scrollY;
    filmExpanded = String(filmExpanded)===String(id) ? null : id;
    if(filmExpanded && !TV_MODE) history.pushState({gameVaultDetail:"film",id:id},"",location.href.split("#")[0]+"#film-detail");
    var wm=findMovieAny(id);
    if(filmExpanded && wm){ rememberViewed("film",id,wm.title,filmTab); ensurePlot(moviePlotName(wm),"film"); }
    render(); if(filmExpanded) window.scrollTo(0,0); return;
  }
  if(act==="mw-watched"){
    var wmv=findWatchlistMovie(id);
    if(wmv){ removeFromWatchlist(id); markMovieWatched(wmv); }  // → Watched tab, out of the watchlist
    return;
  }
  if(act==="mv-unhide"){ unhideMovie(b.getAttribute("data-key")); return; }
  if(act==="series-refresh"){ ensureSeries(seriesTab,true); return; }
  if(act==="sw-add"){ addSeriesWatchlist(findSearchSeries(id)); return; }
  if(act==="sw-remove"){ removeSeriesWatchlist(id); return; }
  if(act==="sw-clear"){ seriesSearchQ=""; seriesSearchItems=[]; seriesSearchSeq++; render(); return; }
  if(act==="sr-unwatch"){ unwatchSeries(b.getAttribute("data-key")); return; }
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
    if(seriesExpanded && !TV_MODE) history.pushState({gameVaultDetail:"series",id:id},"",location.href.split("#")[0]+"#series-detail");
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
    data.upcoming=data.upcoming.filter(function(x){return x.id!==id;});
    if(gd){
      if(!data.upcomingRemoved) data.upcomingRemoved=[];
      if(!data.upcomingRemoved.some(function(x){return norm(x.name)===norm(gd.name);})) data.upcomingRemoved.unshift(gd);
    }
    save(); flash("Removed — it won’t come back on refresh"+(gd?" (restore below)":""));
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
    data.upcomingRemoved=(data.upcomingRemoved||[]).filter(function(x){return x.id!==id;});
    save(); flash(gp?"Deleted for good — refresh may re-add it later":"Deleted");
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
        data.played.unshift({id:tpId,name:g2.name,rating:0,status:"Playing",added:localISO(),img:coverUrl(g2)||undefined});
        save(); flash("Moved to Played");
        enrichScore("played",tpId);
      }
    }
  }
  else if(act==="up-queue"){
    var gq=byId(data.upcoming,id);
    if(gq) addToQueue(gq.name, gq.note||"");
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
      data.rentals.push({id:rid,name:qr.name,start:localISO(),days:30,cost:0,vendor:"",note:qr.note||"",score:qr.score||null,rrating:qr.rrating||null,img:coverUrl(qr)||undefined});
      tabScroll[tab]=window.scrollY; tab="rentals"; save(); window.scrollTo(0,0);
      flash("Rental started today — set the cost and vendor below");
      enrichScore("rentals",rid);
    }
  }
  else if(act==="q-del"){ data.queue=data.queue.filter(function(x){return x.id!==id;}); save(); }

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
  else if(act==="pl-del"){ data.playing=data.playing.filter(function(x){return x.id!==id;}); save(); }

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
  else if(act==="del-played"){ data.played=data.played.filter(function(x){return x.id!==id;}); save(); }
});

function handleVendorNew(sel){
  var v=prompt("New vendor name (e.g. Mayank, GameHub, CEX):");
  v=v?v.trim():"";
  if(v && data.vendors.indexOf(v)<0){ data.vendors.push(v); data.vendors.sort(); persist(); }
  sel.innerHTML=vendorOptions(v);
  return v;
}

document.getElementById("content").addEventListener("change",function(e){
  var bp=e.target.closest(".bigly-priority");
  if(bp && bp.value){
    biglyAction(bp.getAttribute("data-id"),"priority",{priority:bp.value});
    return;
  }
  var fs=e.target.closest(".film-sort");
  if(fs){ filmSort=fs.value; try{localStorage.setItem(FILM_SORT_KEY,filmSort);}catch(err){} render(); return; }
  var ssrt=e.target.closest(".series-sort");
  if(ssrt){ seriesSort=ssrt.value; try{localStorage.setItem(SERIES_SORT_KEY,seriesSort);}catch(err){} render(); return; }
  var fg=e.target.closest(".film-genre");
  if(fg){
    filmGenre=fg.value;
    try{ localStorage.setItem(FILM_GENRE_KEY,filmGenre); }catch(err){}
    filmCache={}; filmBusy={}; filmErr={}; saveFilmCache();
    render(); ensureFilms(filmTab,true);
    return;
  }
  var fy=e.target.closest(".film-year");
  if(fy){
    filmYear=fy.value;
    try{ localStorage.setItem(FILM_YEAR_KEY,filmYear); }catch(err){}
    filmCache={}; filmBusy={}; filmErr={}; saveFilmCache();
    render(); ensureFilms(filmTab,true);
    return;
  }
  var sg=e.target.closest(".series-genre");
  if(sg){
    seriesGenre=sg.value;
    try{ localStorage.setItem(SERIES_GENRE_KEY,seriesGenre); }catch(err){}
    seriesCache={}; seriesBusy={}; seriesErr={}; saveSeriesCache();
    render(); ensureSeries(seriesTab,true);
    return;
  }
  var sy=e.target.closest(".series-year");
  if(sy){
    seriesYear=sy.value;
    try{ localStorage.setItem(SERIES_YEAR_KEY,seriesYear); }catch(err){}
    seriesCache={}; seriesBusy={}; seriesErr={}; saveSeriesCache();
    render(); ensureSeries(seriesTab,true);
    return;
  }
  var sp=e.target.closest(".series-provider");
  if(sp){
    seriesProvider=sp.value;
    try{ localStorage.setItem(SERIES_PROVIDER_KEY,seriesProvider); }catch(err){}
    seriesCache={}; seriesBusy={}; seriesErr={}; saveSeriesCache();
    render(); ensureSeries(seriesTab,true);
    return;
  }
  var sl=e.target.closest(".series-language");
  if(sl){
    seriesLanguage=sl.value;
    try{localStorage.setItem(SERIES_LANGUAGE_KEY,seriesLanguage);}catch(err){}
    delete seriesCache.seriesdiscover; delete seriesCache.seriesupcoming; saveSeriesCache();
    render(); ensureSeries(seriesTab,true);
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

/* ---------- Android TV remote navigation (?tv=1 only) ---------- */
var tvReturnFocus=null;
var tvReturnFocusKey="";
var tvEditingInput=null;
var tvFocusMemory={};
var tvLastMoveAt=0;
var tvSelectReturnKey="";
var TV_MOVE_DELAY=135;
function tvIsEditable(el){
  return !!(el && /^(INPUT|TEXTAREA|SELECT)$/i.test(el.tagName));
}
function tvIsTextInput(el){
  return !!(el && /^(INPUT|TEXTAREA)$/i.test(el.tagName));
}
function tvIsSearchInput(el){
  if(!tvIsTextInput(el)) return false;
  var text=((el.id||"")+" "+(el.name||"")+" "+(el.placeholder||"")+" "+(el.getAttribute("aria-label")||"")).toLowerCase();
  return /search|find title|autocomplete/.test(text);
}
function tvViewKey(){
  if(section==="films") return "films:"+filmTab;
  if(section==="series") return "series:"+seriesTab;
  if(section==="plex") return "plex:"+plexTab;
  if(section==="biglybt") return "biglybt";
  return "games:"+tab;
}
function tvElementKey(el){
  if(!el) return "";
  if(el.getAttribute("data-tv-key")) return el.getAttribute("data-tv-key");
  var names=["id","data-section","data-tab","data-ftab","data-stab","data-ptab","data-act","data-id","data-view","data-key","data-vendor","data-genre","data-tier","href"];
  var bits=[];
  names.forEach(function(name){ var value=el.getAttribute&&el.getAttribute(name); if(value) bits.push(name+"="+value); });
  if(!bits.length){
    var label=(el.getAttribute&&el.getAttribute("aria-label"))||el.textContent||el.tagName||"item";
    bits.push("label="+label.trim().replace(/\s+/g," ").slice(0,80));
  }
  var key=bits.join("|");
  try{ el.setAttribute("data-tv-key",key); }catch(e){}
  return key;
}
function tvFindByKey(key,list){
  if(!key) return null;
  list=list||tvFocusable();
  for(var i=0;i<list.length;i++) if(tvElementKey(list[i])===key) return list[i];
  return null;
}
function tvPrepareInputs(){
  if(!TV_MODE) return;
  [].forEach.call(document.querySelectorAll("input,textarea"),function(el){
    if(tvIsSearchInput(el)){
      el.setAttribute("data-tv-search","1");
      el.setAttribute("data-tv-skip","1");
      el.tabIndex=-1;
      return;
    }
    if(el===tvEditingInput) return;
    if(!el.hasAttribute("data-tv-readonly")){
      el.setAttribute("data-tv-readonly","1");
      el.readOnly=true;
    }
  });
}
function tvStartInputEdit(el){
  if(!TV_MODE || !tvIsTextInput(el)) return false;
  tvEditingInput=el;
  el.readOnly=false;
  el.removeAttribute("data-tv-readonly");
  try{ el.focus(); }catch(e){}
  try{
    var n=(el.value||"").length;
    el.setSelectionRange(n,n);
  }catch(e){}
  el.click();
  return true;
}
function tvStopInputEdit(el){
  if(!TV_MODE || !tvIsTextInput(el)) return false;
  el.readOnly=true;
  el.setAttribute("data-tv-readonly","1");
  if(tvEditingInput===el) tvEditingInput=null;
  el.blur();
  return true;
}
function tvCloseSelect(){
  var old=document.getElementById("tvSelectMenu");
  if(old) old.remove();
}
function tvOpenSelect(sel){
  if(!TV_MODE || !sel || sel.tagName!=="SELECT") return false;
  tvCloseSelect();
  tvSelectReturnKey=tvElementKey(sel);
  var overlay=document.createElement("div");
  overlay.id="tvSelectMenu";
  overlay.className="tv-select-menu";
  var panel=document.createElement("div");
  panel.className="tv-select-panel";
  [].forEach.call(sel.options,function(opt){
    var btn=document.createElement("button");
    btn.type="button";
    btn.className="btn"+(opt.selected?" on":"");
    btn.textContent=opt.textContent || opt.value || "Option";
    btn.addEventListener("click",function(){
      sel.value=opt.value;
      tvCloseSelect();
      sel.dispatchEvent(new Event("change",{bubbles:true}));
      setTimeout(function(){ var target=tvFindByKey(tvSelectReturnKey); if(target) tvFocus(target); else tvEnsureFocus(); },0);
    });
    panel.appendChild(btn);
  });
  overlay.appendChild(panel);
  overlay.addEventListener("click",function(e){
    if(e.target===overlay){ tvCloseSelect(); var target=tvFindByKey(tvSelectReturnKey); if(target) tvFocus(target); else tvEnsureFocus(); }
  });
  document.body.appendChild(overlay);
  setTimeout(function(){
    var on=panel.querySelector(".on") || panel.querySelector("button");
    if(on) tvFocus(on);
  },0);
  return true;
}
function tvRememberFocus(el){
  if(!TV_MODE || !el || tvIsEditable(el)) return;
  tvReturnFocus=el;
  tvReturnFocusKey=tvElementKey(el);
  tvFocusMemory[tvViewKey()]=tvReturnFocusKey;
}
function tvFocusRoot(){
  var overlay=document.getElementById("tvSelectMenu")||document.getElementById("tvConfirmMenu");
  if(overlay) return overlay;
  var settings=document.getElementById("settingsBox");
  if(document.body.classList.contains("settings-open")&&settings) return settings;
  var menu=document.getElementById("menuPanel");
  if(document.body.classList.contains("menu-open")&&menu) return menu;
  if(document.body.classList.contains("detail-open")) return document.getElementById("content")||document;
  return document;
}
function tvBringIntoView(el){
  if(!el) return;
  var horizontal=el.closest&&el.closest(".tabs,.recent-strip,.viewbar");
  if(horizontal){
    var er=el.getBoundingClientRect(), hr=horizontal.getBoundingClientRect();
    if(er.left<hr.left+16) horizontal.scrollLeft-=hr.left+16-er.left;
    else if(er.right>hr.right-16) horizontal.scrollLeft+=er.right-(hr.right-16);
  }
  var r=el.getBoundingClientRect();
  var topSafe=Math.max(72,window.innerHeight*.10), bottomSafe=window.innerHeight-Math.max(72,window.innerHeight*.10);
  var delta=0;
  if(r.top<topSafe) delta=r.top-topSafe;
  else if(r.bottom>bottomSafe) delta=r.bottom-bottomSafe;
  if(delta) window.scrollBy({top:Math.round(delta),behavior:"auto"});
}
function tvFocus(el, opts){
  if(!TV_MODE || !el) return false;
  try{ el.focus({preventScroll:!!(opts&&opts.preventScroll)}); }catch(e){ try{ el.focus(); }catch(err){} }
  [].forEach.call(document.querySelectorAll(".tv-focus"),function(x){ if(x!==el) x.classList.remove("tv-focus"); });
  el.classList.add("tv-focus");
  if(!(opts&&opts.preventScroll)) tvBringIntoView(el);
  if(!tvIsEditable(el)) tvReturnFocus=el;
  if(!tvIsEditable(el)) tvRememberFocus(el);
  return true;
}
function tvFocusable(){
  if(!TV_MODE) return [];
  var sel='button,a[href],input,select,textarea,summary,[role="button"],[data-act],.clickrow,[tabindex="0"]';
  var root=tvFocusRoot();
  return [].filter.call(root.querySelectorAll(sel),function(el){
    if(el.disabled || el.getAttribute("aria-hidden")==="true" || el.getAttribute("data-tv-skip")==="1" || el.tabIndex<0) return false;
    var closed=el.closest&&el.closest("details:not([open])");
    if(closed && el.tagName!=="SUMMARY") return false;
    var st=getComputedStyle(el), r=el.getBoundingClientRect();
    return st.display!=="none" && st.visibility!=="hidden" && st.pointerEvents!=="none" && r.width>0 && r.height>0;
  });
}
function tvMakeFocusable(){
  if(!TV_MODE) return;
  tvPrepareInputs();
  [].forEach.call(document.querySelectorAll('.clickrow,[data-act],summary,[role="button"]'),function(el){
    if(!/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/i.test(el.tagName)){
      el.tabIndex=0;
      el.setAttribute("role","button");
    }
  });
  tvFocusable().forEach(tvElementKey);
}
function tvEnsureFocus(){
  if(!TV_MODE) return;
  tvMakeFocusable();
  var list=tvFocusable();
  if(!list.length) return;
  if(document.activeElement && list.indexOf(document.activeElement)>-1) return;
  var activeTab=document.querySelector(".tab.on"),activeSection=document.querySelector("#sectionSw button.on");
  var preferred=tvFindByKey(tvFocusMemory[tvViewKey()],list)||tvFindByKey(tvReturnFocusKey,list)||(tvReturnFocus&&list.indexOf(tvReturnFocus)>-1&&tvReturnFocus)||(list.indexOf(activeTab)>-1&&activeTab)||(list.indexOf(activeSection)>-1&&activeSection)||list[0];
  setTimeout(function(){ tvFocus(preferred,{preventScroll:true}); },0);
}
function tvAfterRender(){
  if(!TV_MODE) return;
  requestAnimationFrame(function(){ requestAnimationFrame(tvEnsureFocus); });
}
function tvRectGap(a1,a2,b1,b2){
  if(a2>=b1 && b2>=a1) return 0;
  return a2<b1 ? b1-a2 : a1-b2;
}
function tvDirectionalScore(curRect, nextRect, dir){
  var cx=curRect.left+curRect.width/2,cy=curRect.top+curRect.height/2;
  var nx=nextRect.left+nextRect.width/2,ny=nextRect.top+nextRect.height/2;
  var primary, secondary, overlap;
  if(dir==="left"){
    if(nx>=cx-3) return Infinity;
    primary=cx-nx;
    secondary=tvRectGap(curRect.top,curRect.bottom,nextRect.top,nextRect.bottom);
    overlap=secondary===0;
  } else if(dir==="right"){
    if(nx<=cx+3) return Infinity;
    primary=nx-cx;
    secondary=tvRectGap(curRect.top,curRect.bottom,nextRect.top,nextRect.bottom);
    overlap=secondary===0;
  } else if(dir==="up"){
    if(ny>=cy-3) return Infinity;
    primary=cy-ny;
    secondary=tvRectGap(curRect.left,curRect.right,nextRect.left,nextRect.right);
    overlap=secondary===0;
  } else {
    if(ny<=cy+3) return Infinity;
    primary=ny-cy;
    secondary=tvRectGap(curRect.left,curRect.right,nextRect.left,nextRect.right);
    overlap=secondary===0;
  }
  return primary + secondary*3 + (overlap?0:420);
}
function tvGroup(el){
  if(!el||!el.closest) return document;
  return el.closest("#sectionSw,#tabs,.stats,.toolbar,.viewbar,.media-grid,.game-grid,.plex-grid,.torrent-grid,.actions,.title-menu-pop,.menupanel,.settings-group,.settings,.tv-select-panel,.tv-confirm-actions,.tv-confirm-panel")||document;
}
function tvGroupAxis(group){
  if(!group||group===document) return "spatial";
  if(group.matches("#sectionSw,.settings,.settings-group,.title-menu-pop,.tv-select-panel")) return "vertical";
  if(group.matches("#tabs,.viewbar,.actions,.tv-confirm-actions")) return "horizontal";
  return "spatial";
}
function tvOrderedMove(cur,list,dir,axis){
  if(!list.length) return null;
  var forward=(axis==="horizontal"&&(dir==="right"))||(axis==="vertical"&&(dir==="down"));
  var backward=(axis==="horizontal"&&(dir==="left"))||(axis==="vertical"&&(dir==="up"));
  if(!forward&&!backward) return null;
  var idx=list.indexOf(cur),next=idx+(forward?1:-1);
  return next>=0&&next<list.length?list[next]:null;
}
function tvBestDirectional(cur,list,dir){
  var cr=cur.getBoundingClientRect(),best=null,bestScore=Infinity;
  list.forEach(function(el){
    if(el===cur) return;
    var score=tvDirectionalScore(cr,el.getBoundingClientRect(),dir);
    if(score<bestScore){bestScore=score;best=el;}
  });
  return best;
}
function tvPreferredTransition(cur,group,list,dir){
  if(group&&group.id==="sectionSw"&&dir==="right"){
    return document.querySelector("#tabs .tab.on")||document.querySelector("#tabs .tab")||document.querySelector("#content button,#content [data-act],#content .clickrow");
  }
  if(group&&group.id==="tabs"&&dir==="up") return document.querySelector("#sectionSw button.on");
  if(group&&group.id==="tabs"&&dir==="down"){
    var below=[].filter.call(document.querySelectorAll(".toolbar button,.toolbar select,.viewbar button,#content button,#content select,#content [data-act],#content .clickrow"),function(el){return list.indexOf(el)>-1;});
    return tvBestDirectional(cur,below,"down")||below[0]||null;
  }
  return null;
}
function tvMove(dir){
  var now=Date.now();
  if(now-tvLastMoveAt<TV_MOVE_DELAY) return;
  tvLastMoveAt=now;
  var list=tvFocusable();
  if(!list.length) return;
  var cur=document.activeElement;
  if(list.indexOf(cur)<0){ tvEnsureFocus(); return; }
  var group=tvGroup(cur);
  var same=list.filter(function(el){return tvGroup(el)===group;});
  var axis=tvGroupAxis(group);
  var best=tvOrderedMove(cur,same,dir,axis)||tvPreferredTransition(cur,group,list,dir)||tvBestDirectional(cur,same,dir);
  if(!best){
    var outside=list.filter(function(el){return tvGroup(el)!==group;});
    best=tvBestDirectional(cur,outside,dir);
  }
  if(!best && dir==="left" && group!==document){
    var activeSection=document.querySelector("#sectionSw button.on");
    if(activeSection&&list.indexOf(activeSection)>-1) best=activeSection;
  }
  if(!best && dir==="up" && group!==document){
    var activeTab=document.querySelector("#tabs .tab.on");
    if(activeTab&&list.indexOf(activeTab)>-1) best=activeTab;
  }
  if(best) tvFocus(best);
}
function tvMoveTextCursor(el,dir){
  if(!el || typeof el.selectionStart!=="number") return;
  var start=el.selectionStart,end=el.selectionEnd;
  var pos=dir==="left"?Math.max(0,start-1):Math.min((el.value||"").length,end+1);
  try{el.setSelectionRange(pos,pos);}catch(e){}
}
function tvCloseConfirm(result){
  var overlay=document.getElementById("tvConfirmMenu");
  if(!overlay) return;
  var callback=overlay._confirmCallback,returnKey=overlay._returnKey;
  overlay.remove();
  if(result&&callback) callback();
  setTimeout(function(){var target=tvFindByKey(returnKey);if(target)tvFocus(target);else tvEnsureFocus();},0);
}
function tvConfirm(message,confirmLabel,callback){
  if(!TV_MODE){if(window.confirm(message))callback();return;}
  tvCloseConfirm(false);
  var overlay=document.createElement("div");
  overlay.id="tvConfirmMenu";overlay.className="tv-confirm-menu";overlay._confirmCallback=callback;overlay._returnKey=tvElementKey(document.activeElement);
  var panel=document.createElement("div");panel.className="tv-confirm-panel";
  var title=document.createElement("h2");title.textContent="Confirm action";
  var copy=document.createElement("p");copy.textContent=message;
  var actions=document.createElement("div");actions.className="tv-confirm-actions";
  var cancel=document.createElement("button");cancel.className="btn blue";cancel.type="button";cancel.textContent="Cancel";cancel.addEventListener("click",function(){tvCloseConfirm(false);});
  var accept=document.createElement("button");accept.className="btn ghost danger";accept.type="button";accept.textContent=confirmLabel||"Confirm";accept.addEventListener("click",function(){tvCloseConfirm(true);});
  actions.appendChild(cancel);actions.appendChild(accept);panel.appendChild(title);panel.appendChild(copy);panel.appendChild(actions);overlay.appendChild(panel);document.body.appendChild(overlay);
  tvMakeFocusable();setTimeout(function(){tvFocus(cancel);},0);
}
function gameVaultTvBack(){
  if(!TV_MODE) return "clear";
  if(document.getElementById("tvShell")){
    if(tvDetail){tvCloseDetail();return "handled";}
    if(tvSection!=="home"){tvOpenSection("home");return "handled";}
    return "clear";
  }
  if(document.getElementById("tvConfirmMenu")){
    tvCloseConfirm(false);
    return "handled";
  }
  if(document.getElementById("tvSelectMenu")){
    tvCloseSelect();
    var selectReturn=tvFindByKey(tvSelectReturnKey);if(selectReturn)tvFocus(selectReturn);else tvEnsureFocus();
    return "handled";
  }
  var el=document.activeElement;
  if(tvIsEditable(el)){
    if(tvIsTextInput(el)) tvStopInputEdit(el);
    else el.blur();
    var list=tvFocusable();
    var returnTarget=tvFindByKey(tvReturnFocusKey,list);
    if(returnTarget) tvFocus(returnTarget);
    else if(tvReturnFocus && list.indexOf(tvReturnFocus)>-1) tvFocus(tvReturnFocus);
    else tvEnsureFocus();
    return "handled";
  }
  var panel=document.getElementById("menuPanel");
  if(panel && panel.classList.contains("open")){
    setMenuOpen(false);
    tvEnsureFocus();
    return "handled";
  }
  var settings=document.getElementById("settingsBox");
  if(settings && settings.style.display!=="none"){
    toggleSettings(false);
    tvEnsureFocus();
    return "handled";
  }
  if(section==="films" && filmExpanded){
    filmExpanded=null; aiOpen=null; render(); restoreDetailScroll(filmDetailReturnY);
    return "handled";
  }
  if(section==="series" && seriesExpanded){
    seriesExpanded=null; aiOpen=null; render(); restoreDetailScroll(seriesDetailReturnY);
    return "handled";
  }
  if(section==="games" && expandedId){
    expandedId=null; aiOpen=null; render(); restoreDetailScroll(gameDetailReturnY);
    return "handled";
  }
  return "clear";
}
window.gameVaultTvBack=gameVaultTvBack;

window.addEventListener("popstate",function(){
  if(filmExpanded){ filmExpanded=null; aiOpen=null; render(); restoreDetailScroll(filmDetailReturnY); return; }
  if(seriesExpanded){ seriesExpanded=null; aiOpen=null; render(); restoreDetailScroll(seriesDetailReturnY); return; }
  if(expandedId){ expandedId=null; aiOpen=null; render(); restoreDetailScroll(gameDetailReturnY); }
});
document.addEventListener("click",function(e){
  if(!TV_MODE) return;
  var a=e.target.closest&&e.target.closest("a[href]");
  if(!a) return;
  var href=a.getAttribute("href")||"";
  if(!/^https?:\/\//i.test(href)) return;
  e.preventDefault();
  window.location.href=a.href;
},true);
document.addEventListener("focusin",function(e){
  if(!TV_MODE) return;
  if(tvIsEditable(e.target)) return;
  tvRememberFocus(e.target);
},true);
document.addEventListener("focusout",function(e){
  if(!TV_MODE || !e.target || !e.target.classList) return;
  if(tvIsTextInput(e.target)){
    if(e.target===tvEditingInput){
      e.target.readOnly=true;
      e.target.classList.remove("tv-editing");
      tvEditingInput=null;
    }else if(!e.target.readOnly){
      e.target.readOnly=true;
    }
  }
  e.target.classList.remove("tv-focus");
},true);
function tvShellFocusables(){
  var shell=document.getElementById("tvShell");if(!shell)return [];
  return [].filter.call(shell.querySelectorAll("button,a[href]"),function(el){
    var r=el.getBoundingClientRect(),s=getComputedStyle(el);return !el.disabled&&s.display!=="none"&&s.visibility!=="hidden"&&r.width>0&&r.height>0;
  });
}
function tvShellMove(dir){
  var list=tvShellFocusables();if(!list.length)return true;
  var cur=document.activeElement;if(list.indexOf(cur)<0){tvFocusShell(list[0]);return true;}
  var nav=cur.closest&&cur.closest("[data-tv-nav]");
  if(nav){
    var navs=[].slice.call(document.querySelectorAll("#tvShell [data-tv-nav]")),ni=navs.indexOf(nav);
    if(dir==="up"&&ni>0)tvFocusShell(navs[ni-1]);
    else if(dir==="down"&&ni<navs.length-1)tvFocusShell(navs[ni+1]);
    else if(dir==="right"){
      var remembered=document.querySelector('#tvShell [data-tv-key="'+String(tvLastCardBySection[tvSection]||"").replace(/"/g,'\\"')+'"]');
      var rowIndex=tvLastRowBySection[tvSection]||0;
      tvFocusShell(remembered||document.querySelector('#tvShell [data-tv-row="'+rowIndex+'"][data-tv-card]')||document.querySelector("#tvShell [data-tv-card],#tvShell [data-tv-system]"));
    }
    return true;
  }
  var card=cur.closest&&cur.closest("[data-tv-card]");
  if(card){
    var row=Number(card.getAttribute("data-tv-row"))||0,col=Number(card.getAttribute("data-tv-col"))||0,target=null;
    if(dir==="left")target=col>0?document.querySelector('#tvShell [data-tv-row="'+row+'"][data-tv-col="'+(col-1)+'"]'):document.querySelector('#tvShell [data-tv-nav="'+tvSection+'"]');
    else if(dir==="right")target=document.querySelector('#tvShell [data-tv-row="'+row+'"][data-tv-col="'+(col+1)+'"]');
    else if(dir==="up"&&row>0){
      var prev=[].slice.call(document.querySelectorAll('#tvShell [data-tv-row="'+(row-1)+'"][data-tv-card]'));target=prev[Math.min(col,prev.length-1)]||null;
    }else if(dir==="down"){
      var next=[].slice.call(document.querySelectorAll('#tvShell [data-tv-row="'+(row+1)+'"][data-tv-card]'));target=next[Math.min(col,next.length-1)]||null;
    }
    if(target)tvFocusShell(target);return true;
  }
  var best=tvBestDirectional(cur,list,dir);
  if(!best&&dir==="left")best=document.querySelector('#tvShell [data-tv-nav="'+tvSection+'"]');
  if(best)tvFocusShell(best);return true;
}
function tvHandleShellKey(key){
  if(!document.getElementById("tvShell"))return false;
  if(key.indexOf("Arrow")===0)return tvShellMove(key.replace("Arrow","").toLowerCase());
  if((key==="Enter"||key===" ")&&document.activeElement&&document.activeElement.matches("button,a[href]")){document.activeElement.click();return true;}
  return false;
}
function tvHandleTvKey(key){
  if(!TV_MODE) return false;
  if(document.getElementById("tvShell")) return tvHandleShellKey(key);
  var tag=(document.activeElement&&document.activeElement.tagName)||"";
  var editingText=tvEditingInput&&document.activeElement===tvEditingInput;
  var editing=/^(INPUT|TEXTAREA|SELECT)$/i.test(tag);
  if(key==="ArrowLeft"||key==="ArrowRight"||key==="ArrowUp"||key==="ArrowDown"){
    if(editingText){
      if(key==="ArrowLeft"||key==="ArrowRight") tvMoveTextCursor(document.activeElement,key==="ArrowLeft"?"left":"right");
      else{
        var editEl=document.activeElement;
        tvStopInputEdit(editEl);
        var editReturn=tvFindByKey(tvReturnFocusKey);if(editReturn)tvFocus(editReturn,{preventScroll:true});else tvEnsureFocus();
        tvMove(key==="ArrowUp"?"up":"down");
      }
      return true;
    }
    tvMove(key.replace("Arrow","").toLowerCase());
    return true;
  }
  if((key==="Enter"||key===" ") && document.activeElement && tvIsTextInput(document.activeElement)){
    if(document.activeElement!==tvEditingInput || document.activeElement.readOnly){
      tvStartInputEdit(document.activeElement);
    }
    return true;
  }
  if((key==="Enter"||key===" ") && document.activeElement && document.activeElement.tagName==="SELECT"){
    tvOpenSelect(document.activeElement);
    return true;
  }
  if((key==="Enter"||key===" ") && document.activeElement && !editing){
    var el=document.activeElement;
    if(el.matches && el.matches('[data-act],.clickrow,button,a[href],summary,[role="button"]')){
      el.click();
      if(el.tagName==="SUMMARY") setTimeout(tvAfterRender,0);
      return true;
    }
  }
  return false;
}
window.gameVaultTvKey=tvHandleTvKey;
document.addEventListener("keydown",function(e){
  if(!TV_MODE) return;
  if(tvHandleTvKey(e.key)){
    e.preventDefault();
    e.stopPropagation();
  }
},true);
document.addEventListener("toggle",function(e){
  if(TV_MODE && e.target && e.target.tagName==="DETAILS") tvAfterRender();
},true);

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
    return crypto.subtle.encrypt({name:"AES-GCM",iv:iv},key,new TextEncoder().encode(JSON.stringify(data)));
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
  if(summary) summary.textContent="Version "+APP_VERSION+" · "+APP_RELEASE_CHANNEL+" · build "+APP_BUILD_DATE+" · data schema "+SCHEMA_VERSION+" · "+vaultSize(data)+" saved items · "+snaps.length+" recovery points · "+(cloudMode()==="drive"?"Google Drive primary":cloudMode()==="jsonbin"?"JSONBin fallback":"local only");
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
  var report={app:"Sinu Game Vault",version:APP_VERSION,buildDate:APP_BUILD_DATE,releaseChannel:APP_RELEASE_CHANNEL,schema:SCHEMA_VERSION,generatedAt:new Date().toISOString(),device:deviceId(),userAgent:navigator.userAgent,online:navigator.onLine,storageItems:vaultSize(data),revision:data.revision||0,updatedAt:data.updatedAt||0,cloudMode:cloudMode()||"none",connections:{drive:!!gdTok(),jsonBin:!!getJB().bin,rawg:!!getKey(),tmdb:!!tmdbKey(),omdb:!!omdbKey(),plex:!!(plexServerUrl()&&plexToken()),biglybt:!!biglyProxyUrl()},collections:{},runtimeErrors:runtimeErrors.slice(),recentAudit:(data.audit||[]).slice(0,50)};
  VAULT_ARRAY_FIELDS.forEach(function(k){ report.collections[k]=(data[k]||[]).length; });
  downloadBlob(new Blob([JSON.stringify(report,null,2)],{type:"application/json"}),"game-vault-diagnostics-"+localISO()+".json");
}
document.getElementById("exportBtn").addEventListener("click",function(){
  createRecoverySnapshot("Before manual export",data);
  downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),"game-vault-backup-"+localISO()+".json");
  if(cloudMode()==="drive"){ silentPush(); flash("Backup downloaded — Google Drive copy refreshed too"); }
  flash("Backup downloaded");
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
  if(TV_MODE){tvConfirm(warning,"Restore recovery point",restoreSelected);return;}
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
  flash("Refreshing GameVault data...");
  plotPending={}; plotErr={};
  triedCovers={};
  silentPullOnLoad();
  if(tmdbKey()){
    ensureFilms(filmTab,true);
    if(filmTab==="mlott") ensureFilms("mlup",true);
    ensureSeries(seriesTab,true);
  }
  if(plexServerUrl() && plexToken()) plexRefresh();
  if(section==="biglybt"){
    var biglyFrame=document.getElementById("biglyFrame");
    if(biglyMode()==="api") biglyRefresh();
    else if(biglyFrame) biglyFrame.src=biglyFrame.src;
  }
  applyBackground();
  render();
  setTimeout(backfillImages,600);
}
document.getElementById("refreshBtn").addEventListener("click",globalRefresh);
var menuRefreshBtn=document.getElementById("menuRefreshBtn");
if(menuRefreshBtn) menuRefreshBtn.addEventListener("click",function(){ setMenuOpen(false); globalRefresh(); });

/* ---------- swipe between tabs (phone) ---------- */
var TAB_ORDER=["rentals","playing","queue","upcoming","suggest","played"];
var swX=null,swY=0,swT=0;
document.addEventListener("touchstart",function(e){
  if(e.touches.length!==1){ swX=null; return; }
  var startX=e.touches[0].clientX;
  if(startX<24 || startX>window.innerWidth-24 || document.body.classList.contains("detail-open") || document.body.classList.contains("settings-open")){ swX=null; return; }
  // don't hijack horizontal gestures on inputs or scrollable strips
  if(e.target && e.target.closest && e.target.closest("input,textarea,select,.chipbar,#tabs,.sectionsw,.recent-strip,.viewbar,.actions,.ac-drop")){ swX=null; return; }
  swX=startX; swY=e.touches[0].clientY; swT=Date.now();
},{passive:true});
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
document.addEventListener("visibilitychange",function(){
  if(document.visibilityState==="visible") silentPullOnLoad();
  else flushPendingPush();
});
window.addEventListener("pagehide",flushPendingPush);
/* iOS restores pages from the back-forward cache with in-flight fetches dead —
   clear the pending flags so plot loads restart instead of spinning forever */
window.addEventListener("pageshow",function(e){
  if(e.persisted){ plotPending={}; render(); }
});

applyKeysFromData();     // synced keys (from the cached vault) → localStorage
backfillKeysToData();    // any pre-existing local keys → data.keys for future sync
if("serviceWorker" in navigator && location.protocol.indexOf("http")===0){
  navigator.serviceWorker.register("sw.js").then(function(reg){
    function offerUpdate(worker){
      if(!worker) return;
      flash("A GameVault update is ready - tap here to install",function(){ worker.postMessage({type:"SKIP_WAITING"}); });
    }
    if(reg.waiting) offerUpdate(reg.waiting);
    reg.addEventListener("updatefound",function(){
      var worker=reg.installing;
      if(worker) worker.addEventListener("statechange",function(){ if(worker.state==="installed" && navigator.serviceWorker.controller) offerUpdate(worker); });
    });
    var reloading=false;
    navigator.serviceWorker.addEventListener("controllerchange",function(){ if(!reloading){ reloading=true; location.reload(); } });
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
},1000);
[].forEach.call(document.querySelectorAll("#sectionSw button"),function(b){
  var active=b.getAttribute("data-section")===section;
  b.classList.toggle("on",active);
  if(active) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current");
});
render();
refreshRecoveryUi();
if(TV_MODE) setTimeout(function(){tvPrimeSection(tvSection);},80);
if(section==="films") ensureFilms(filmTab);
if(section==="series") ensureSeries(seriesTab);
if(section==="plex" && plexServerUrl() && plexToken()) plexRefresh();
silentPullOnLoad();
setTimeout(backfillImages,1500);
