import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";

const html=fs.readFileSync("index.html","utf8");
const js=fs.readFileSync("app.js","utf8");
const coreJs=fs.readFileSync("core.js","utf8");
const css=fs.readFileSync("app.css","utf8");
const sw=fs.readFileSync("sw.js","utf8");
const release=JSON.parse(fs.readFileSync("release.json","utf8"));
const biglyWorker=fs.readFileSync("biglybt-worker/worker.js","utf8");
const manifest=JSON.parse(fs.readFileSync("manifest.webmanifest","utf8"));
const pkg=JSON.parse(fs.readFileSync("package.json","utf8"));
const vaultSchema=JSON.parse(fs.readFileSync("shared/game-vault.schema.json","utf8"));
const vaultFixture=JSON.parse(fs.readFileSync("shared/fixtures/vault-v14.json","utf8"));
const nativeTvActivity=fs.readFileSync("android-tv-native/app/src/main/java/in/sinu/gamevault/nativetv/MainActivity.java","utf8");
const nativeTvView=fs.readFileSync("android-tv-native/app/src/main/java/in/sinu/gamevault/nativetv/VaultTvView.java","utf8");
const nativeTvData=fs.readFileSync("android-tv-native/app/src/main/java/in/sinu/gamevault/nativetv/VaultData.java","utf8");
const nativeTvDrive=fs.readFileSync("android-tv-native/app/src/main/java/in/sinu/gamevault/nativetv/DriveRepository.java","utf8");
const version=(js.match(/var APP_VERSION\s*=\s*"(\d+\.\d+\.\d+)"/)||[])[1];

assert.equal(vaultSchema.$schema,"https://json-schema.org/draft/2020-12/schema","vault contract must use a current JSON Schema draft");
assert.equal(vaultSchema.additionalProperties,true,"future client fields must remain valid");
assert.equal(vaultFixture.version,release.schema,"fixture and release schema must agree");
assert.ok(vaultFixture.futureClientField?.mustSurvive,"fixture must exercise forward-compatible field preservation");
for(const key of ["rentals","rentalHistory","subscriptions","subscriptionGames","playing","queue","upcoming","upcomingRemoved","played","hiddenGames","movieWatchlist","watchingMovies","watchedMovies","hiddenMovies","seriesWatchlist","watchingSeries","watchedSeries","hiddenSeries","deletions"]){
  assert.ok(Array.isArray(vaultFixture[key]),`shared fixture must include ${key}`);
  assert.ok(vaultSchema.properties[key],`shared schema must define ${key}`);
}

assert.match(html,/href="app\.css(?:\?v=\d+\.\d+\.\d+)?"/);
assert.match(html,/src="app\.js(?:\?v=\d+\.\d+\.\d+)?"/);
assert.ok(version,"application version must be present");
assert.equal(pkg.version,version,"package version must match APP_VERSION");
assert.ok(html.includes(`app.css?v=${version}`),"CSS asset version must match APP_VERSION");
assert.ok(html.includes(`app.js?v=${version}`),"JavaScript asset version must match APP_VERSION");
assert.match(html,/viewport-fit=cover/);
assert.match(html,/maximum-scale=1/);
assert.match(html,/user-scalable=no/);
assert.match(css,/safe-area-inset-left/);
assert.match(css,/-webkit-text-size-adjust:100%/);
assert.match(css,/touch-action:pan-x pan-y/);
assert.match(js,/gesturestart/);
assert.match(css,/@media \(max-width:520px\)/);
assert.ok(html.length<50000,"index.html should stay a small application shell");
assert.ok(css.length>10000,"application styles are unexpectedly empty");
assert.ok(js.length>100000,"application script is unexpectedly empty");
new vm.Script(js,{filename:"app.js"});
new vm.Script(coreJs,{filename:"core.js"});
new vm.Script(sw,{filename:"sw.js"});
const biglyDashboardStart=biglyWorker.indexOf("function nativeDashboardPage() {");
const biglyDashboardEnd=biglyWorker.indexOf("async function nativeRpc",biglyDashboardStart);
assert.ok(biglyDashboardStart>=0&&biglyDashboardEnd>biglyDashboardStart,"BiglyBT native dashboard must be present");
const biglyDashboardFactory=new Function(`${biglyWorker.slice(biglyDashboardStart,biglyDashboardEnd)};return nativeDashboardPage;`)();
const biglyDashboardHtml=biglyDashboardFactory();
const biglyScriptStart=biglyDashboardHtml.indexOf("<script>")+8;
const biglyScriptEnd=biglyDashboardHtml.lastIndexOf("</script>");
assert.ok(biglyScriptStart>=8&&biglyScriptEnd>biglyScriptStart,"BiglyBT dashboard script must be embedded");
new vm.Script(biglyDashboardHtml.slice(biglyScriptStart,biglyScriptEnd),{filename:"biglybt-native-dashboard.js"});
for(const marker of ['data-filter="error"',"historyExport",'id="sort"','id="pasteMagnet"',"navigator.clipboard.readText"]){
  assert.ok(biglyWorker.includes(marker),`BiglyBT dashboard must include ${marker}`);
}
assert.ok(!biglyWorker.includes("gvbt-switch-mode"),"BiglyBT must expose one native dashboard rather than duplicate modes");
assert.match(js,/function confirmDestructive\(/);
assert.match(js,/function ensureSeriesEpisodeRatings\(/);
assert.match(js,/episode-summary-rating/);
assert.match(js,/home-overview/);
for(const name of ["movieCard","watchlistCard","watchlistSearchCard","seriesCard","seriesSearchCard"]){
  const count=(js.match(new RegExp("function\\s+"+name+"\\s*\\(","g"))||[]).length;
  assert.equal(count,1,`${name} should have one canonical implementation`);
}
for(const asset of ["./index.html","./release.json","./manifest.webmanifest"]){
  assert.ok(sw.includes(`"${asset}"`),`service worker must cache ${asset}`);
}
for(const asset of ["app.css","core.js","app.js"]){
  assert.ok(sw.includes(`"./${asset}?v=${version}"`),`service worker must cache the exact ${asset} release asset`);
}
assert.ok(html.includes(`core.js?v=${version}`),"Core asset version must match APP_VERSION");
assert.equal(release.version,version,"release manifest version must match APP_VERSION");
assert.equal(release.schema,14,"release manifest must expose the current data schema");
assert.equal(manifest.name,"Sinu Game Vault");
assert.match(html,/name="description"/);
assert.match(html,/Content-Security-Policy/);
assert.match(html,/object-src 'none'/);
assert.doesNotMatch(html,/property="og:title"/);
assert.doesNotMatch(html,/rel="canonical"/);
assert.match(html,/id="syncNowBtn"/);
for(const obsolete of ["shareBtn","pushBtn","pullBtn","jsonbin","JSONBin"]){
  assert.ok(!html.includes(obsolete),`application shell must not expose obsolete ${obsolete}`);
}
assert.match(js,/function validateVault\(/);
assert.match(js,/function createRecoverySnapshot\(/);
assert.match(js,/var APP_VERSION\s*=/);
assert.match(js,/var APP_VERSION\s*=\s*"\d+\.\d+\.\d+"/);
assert.match(js,/function gameKnownReleaseDate\s*\(/,"Game release dates must remain available across tabs");
assert.match(js,/subscriptionGames/,"Subscription games must be part of the synced vault");
assert.match(js,/function syncSubscriptionPlaying\(/,"Active subscription games must feed Now Playing");
assert.match(js,/data-act="add-subscription-game"/,"Subscriptions must allow Xbox and PC games to be added");
assert.match(js,/platforms=187,186,4/,"RAWG feeds must include PS5, Xbox Series and PC");
assert.match(js,/function gameExclusive\(/,"Game cards must support Xbox and PS5 exclusivity labels");
assert.match(js,/thegamehub\.in\/\?s=/,"Game details must link directly to The Game Hub search");
assert.match(js,/gamerplanet\.in\/search\?q=/,"Game details must link directly to Gamer Planet search");
assert.match(js,/Released · /,"Released upcoming-list games must be grouped at the bottom");
assert.match(js,/function gameReleaseMeta\s*\(/,"Games must keep their release-date countdown renderer");
assert.match(js,/game-tile-info[\s\S]*gameReleaseMeta\(x\)/,"Every game grid card must show known release information");
assert.match(js,/var selected=ott\|\|date,label=ott\?"OTT release":"Release date"/,"Film cards in every tab must show known release dates");
assert.match(js,/var countdown=daysBetween\(today\(\),parseD\(date\)\)>=0\?releaseCountdown\(date\)/,"TV Series cards must show future-date countdowns");
assert.match(js,/movieWatchlist\.unshift\([\s\S]*date:m\.date\|\|"", ottDate:m\.ottDate\|\|""/,"Movie Watchlist must preserve release dates");
assert.ok(js.indexOf('Coming to Malayalam OTT · ')<js.indexOf('Now Streaming · '),"Upcoming Malayalam OTT releases must render before current releases");
assert.match(css,/\.home-card-rentals[\s\S]*\.home-card-vault/,"Home dashboard must retain its section color themes");
assert.match(css,/\.release-countdown\.urgent[\s\S]*\.release-countdown\.soon[\s\S]*\.release-countdown\.later/,"Release countdown color thresholds must remain available");
assert.match(js,/var APP_BUILD_DATE\s*=\s*"\d{4}-\d{2}-\d{2}"/);
assert.match(html,/id="appVersionBadge"/);
assert.match(js,/primary_release_date\.gte/);
assert.match(js,/function pickReleaseEvent\(/);
const upcomingSource=js.match(/function fetchUpHw\([\s\S]*?function pickReleaseEvent/)[0];
assert.match(upcomingSource,/region:\s*"US"/);
assert.match(upcomingSource,/with_release_type:\s*"2\|3"/);
assert.doesNotMatch(upcomingSource,/with_original_language/);
assert.match(js,/var gdUploadQueue=Promise\.resolve\(\)/);
assert.doesNotMatch(sw,/install[\s\S]{0,250}skipWaiting/);
assert.match(sw,/if \(res\.ok\)/);
assert.ok(biglyWorker.includes('data-delete="1"'),"native BiglyBT dashboard must retain explicit torrent-and-file deletion");
assert.doesNotMatch(js,/plot\.length>12000/);
for(const label of ["Movies","TV Shows","Plex Library"]){ assert.ok(html.includes(label),`primary navigation must include ${label}`); }
assert.doesNotMatch(html,/data-section="finance"/);
assert.doesNotMatch(html,/finance\.js/);
for(const key of ["serieswatching","seriesnew","seriesupcoming","enseries","mlseries","taseries","hiseries"]){ assert.ok(js.includes(key),`TV navigation must include ${key}`); }
assert.match(js,/watchingSeries/);
assert.match(js,/PLEX_ORDER=\["home","continue","movies","shows","recent"\]/);
assert.match(html,/id="desktopRailBtn"/);
assert.match(html,/id="commandPalette"/);
assert.match(html,/class="workspace-main"/);
for(const group of ["Library","Connected","Personal"]){
  assert.ok(html.includes(`>${group}</span>`),`desktop navigation must include the ${group} group`);
}
assert.match(html,/data-section="home"/);
assert.match(js,/statsEl\.style\.display=phoneUi\(\)\?"none":""/,"Mobile game tabs must keep dashboard totals on Home only");
assert.match(css,/\.movie-hidden-card \.gname/,"Not Interested movie titles must use bounded typography");
assert.match(css,/@media \(min-width:900px\)/);
assert.match(css,/html \.sectionsw/);
assert.match(css,/html \.workspace-main/);
assert.match(css,/html \.empty-state/);
assert.match(js,/function openCommandPalette\(/);
assert.match(js,/function applyDesktopShell\(/);
assert.match(js,/document\.body\.classList\.remove\("command-open"\)/);
assert.match(js,/function moviePrimaryAction\(/);
assert.match(js,/function seriesPrimaryAction\(/);
assert.match(js,/function applyMediaSort\(/);
assert.match(html,/id="desktopRailSync"/);
assert.match(css,/\.title-menu-pop/);
assert.match(html,/class="hamburger-icon"/);
assert.match(js,/function detailToolbar\(/);
assert.match(js,/var SERIES_ORDER=\["serieswatchlist","serieswatching","seriesnew","seriesupcoming","enseries","mlseries","taseries","hiseries","serieswatched"\]/);
for(const obsolete of ["renderTvApp","tvRowsForSection","tvHeroHtml","tvHandleShellKey","TV_MODE","gameVaultTvKey"]){
  assert.ok(!js.includes(obsolete),`browser bundle must not retain obsolete TV implementation ${obsolete}`);
}
assert.ok(!css.includes(".tv-shell"),"browser stylesheet must not retain obsolete TV shell");
assert.match(nativeTvActivity,/class MainActivity/);
assert.match(nativeTvActivity,/saveHandler\.postDelayed\(pendingDriveSave,2500L\)/);
assert.match(nativeTvView,/KEYCODE_DPAD_DOWN/);
assert.match(nativeTvView,/Connect Google Drive/);
assert.match(nativeTvView,/REELOAD Review/);
assert.match(nativeTvData,/days left/);
assert.match(nativeTvData,/DATA_SCHEMA = 14/,"TV edits must use the shared data schema");
assert.match(nativeTvDrive,/drive_last_synced_updated_at/,"TV Drive sync must persist the last observed remote revision");
assert.match(nativeTvDrive,/cacheRecovery\(local, "drive-conflict"\)/,"TV sync must preserve local data before resolving a conflict");
assert.match(nativeTvDrive,/Empty TV data was not allowed to replace your Drive library/);
assert.doesNotMatch(js,/window\.innerHeight\*\.48/);
assert.match(sw,/gamevault-shell-v\d+/);
assert.match(js,/function scheduleMediaWarmup\(/);
assert.match(js,/function scheduleGameWarmup\(/);
assert.match(js,/function pooledEach\(/);
assert.match(js,/function filmCacheKey\(/);
assert.match(js,/function seriesCacheKey\(/);
assert.match(sw,/cachedPromise/);
assert.match(sw,/gamevault-images-v1/);
assert.match(js,/function warmVisibleContent\(/);
assert.match(js,/function refreshAllData\(/);
assert.match(js,/function plexDetailPage\(/);
assert.match(js,/data-act=\"plex-open\"/);
assert.match(js,/PLEX_CACHE_TTL=30\*60\*1000/);
assert.match(js,/PLEX_PAGE_SIZE=250/);
assert.match(js,/function plexFetchSection\(/);
assert.match(js,/if\(section!==\"plex\"\) return Promise\.resolve\(\)/);
assert.match(js,/if\(section===\"plex\" && plexServerUrl\(\) && plexToken\(\)\) plexRefresh\(false\)/);
assert.doesNotMatch(js,/setTimeout\(plexRefresh,500\)/);
assert.doesNotMatch(js,/X-Plex-Container-Size=5000/);
assert.match(js,/if\(!plexDeletionEnabled\(\)\)/);
assert.match(html,/id="plexDeleteEnabledInput"/);
assert.match(html,/id="plexPlaybackSyncInput"/);
assert.doesNotMatch(js,/if\(!item\|\|!item\.watched\) return/);
assert.ok(biglyWorker.includes("recordHistory(t,'Completed',false)"),"completed downloads must be recorded to history");
assert.ok(biglyWorker.includes("data-hdelete="),"history must offer delete torrent + files");
assert.ok(biglyWorker.includes("'delete-local-data':true"),"history delete must permanently remove local data");
assert.ok(!biglyWorker.includes("data-hremove"),"history records must not be removable");
assert.match(biglyWorker,/id="historyView"/);
assert.match(biglyWorker,/Manually removed before completion/);
assert.match(js,/function plexReconcilePlayback\(/);
assert.match(js,/watchingMovies/);
assert.match(js,/function gdRefreshUsage\(/);
assert.match(html,/data-section="health"/);
assert.match(js,/function renderHealth\(/);
assert.match(js,/healthfood/);
assert.match(js,/function vaultCopyForCloud\(/);
assert.match(js,/delete copy\.keys/);
assert.match(js,/delete copy\.trustedDeviceConfig/);
assert.doesNotMatch(js,/copy\.trustedDeviceConfig\s*=/);
assert.match(js,/if\(!healthCloudSyncEnabled\(\)\) delete copy\.health/);
assert.match(html,/id="healthCloudInput"/);
assert.doesNotMatch(js,/Absolute eosinophils were/);

assert.doesNotMatch(html,/id="appLockOverlay"/);
assert.match(html,/id="secureConfigSaveBtn"/);
for(const marker of ["function normalizeStoredLibrary(","function mergeAutomaticCloud(","function hydrateIndexedStorage(","function checkReleaseVersion("]){
  assert.ok(js.includes(marker),`application must include ${marker}`);
}
for(const removed of ["function appLockEnable(","function appLockBiometric(","function appLockInitialCheck(","JSONBin","jsonbin"]){
  assert.ok(!js.includes(removed),`application must not include ${removed}`);
}
assert.match(js,/if\(remoteSize===0&&localSize>0\)return \{changedLocal:false,needsPush:true\}/,"an empty cloud file must never replace a populated device");
assert.match(coreJs,/indexedDB\.open/);
assert.match(coreJs,/AES-GCM/);
assert.match(coreJs,/function mergeVault\(/);
assert.match(coreJs,/function renderInto\(/);
assert.equal((js.match(/\bfetch\(/g)||[]).length,1,"all application requests except the fetch-helper fallback must use the request manager");
assert.doesNotMatch(js,/\bc\.innerHTML\s*=/,"game views must use focus-preserving partial rendering");
for(const legacyKey of ["PLOTS_KEY","FILM_CACHE_KEY","SERIES_CACHE_KEY","PLEX_CACHE_KEY"]){
  assert.ok(js.includes(`localStorage.removeItem(${legacyKey})`),`${legacyKey} must migrate out of localStorage after IndexedDB persistence`);
}

const coreContext={
  window:{crypto:webcrypto},
  crypto:webcrypto,
  TextEncoder,
  TextDecoder,
  Uint8Array,
  Date,
  Math,
  JSON,
  Promise,
  setTimeout,
  clearTimeout,
  btoa:value=>Buffer.from(value,"binary").toString("base64"),
  atob:value=>Buffer.from(value,"base64").toString("binary")
};
vm.createContext(coreContext);
new vm.Script(coreJs,{filename:"core.js"}).runInContext(coreContext);
const core=coreContext.window.GameVaultCore;
const collections=["queue"];
const local={updatedAt:200,revision:2,queue:[{id:"a",name:"Alpha"},{id:"local",name:"Local edit"}],_sync:{version:1,records:{queue:{"id:a":100,"id:local":200}},tombstones:{queue:{}}}};
const remote={updatedAt:210,revision:3,queue:[{id:"a",name:"Alpha"},{id:"remote",name:"Remote edit"}],_sync:{version:1,records:{queue:{"id:a":100,"id:remote":210}},tombstones:{queue:{}}}};
const merged=core.sync.merge(local,remote,collections);
assert.deepEqual(Array.from(merged.queue,x=>x.name).sort(),["Alpha","Local edit","Remote edit"],"concurrent device additions must converge");
const deleted=core.sync.merge({...merged,updatedAt:300,queue:merged.queue.filter(x=>x.id!=="remote"),_sync:{version:1,records:{queue:{"id:a":100,"id:local":200}},tombstones:{queue:{"id:remote":300}}}},remote,collections);
assert.ok(!deleted.queue.some(x=>x.id==="remote"),"newer tombstones must prevent deleted records from returning");
/* A list only the desktop application knows about used to be copied wholesale
   from whichever vault was newer, so changes made there were dropped. */
const desktopLocal={updatedAt:200,queue:[],hiddenGames:[{id:"g1",name:"Already hidden"}]};
const desktopRemote={updatedAt:100,queue:[],hiddenGames:[{id:"g1",name:"Already hidden"},{id:"g2",name:"Hidden on the desktop"}]};
const desktopMerged=core.sync.merge(desktopLocal,desktopRemote,collections);
assert.deepEqual(Array.from(desktopMerged.hiddenGames,x=>x.name).sort(),["Already hidden","Hidden on the desktop"],
  "lists owned by the other client must merge, not be replaced by the newer vault");

/* The desktop application records deletions in a "deletions" list. Ignoring it
   meant a title deleted there was treated as one this device merely still had,
   and it returned on the next merge. */
const desktopDeleted={updatedAt:100,watchingMovies:[],deletions:[
  {collection:"watchingMovies",identity:"canonicalId:tmdb:movie:plex-movie-191",at:1785692189821}
]};
const stillHere={updatedAt:300,watchingMovies:[
  {canonicalId:"tmdb:movie:plex-movie-191",title:"Deleted on the desktop"},
  {canonicalId:"tmdb:movie:701387",title:"Still watching"}
],deletions:[]};
const afterDelete=core.sync.merge(stillHere,desktopDeleted,["watchingMovies"]);
assert.deepEqual(Array.from(afterDelete.watchingMovies,x=>x.title),["Still watching"],
  "a title deleted on the desktop must not return on the next merge");

const envelope=await core.crypto.seal({token:"private-value"},"correct horse battery staple");
assert.ok(!JSON.stringify(envelope).includes("private-value"),"encrypted configuration must not contain plaintext credentials");
assert.deepEqual(await core.crypto.open(envelope,"correct horse battery staple"),{token:"private-value"},"encrypted configuration must round-trip");
const verifier=await core.crypto.pinVerifier("2468");
assert.equal(await core.crypto.verifyPin("2468",verifier),true,"correct secure-vault PIN must verify");
assert.equal(await core.crypto.verifyPin("1357",verifier),false,"incorrect secure-vault PIN must fail");
console.log("GameVault smoke checks passed");
