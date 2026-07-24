import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";

const html=fs.readFileSync("index.html","utf8");
const js=fs.readFileSync("app.js","utf8");
const coreJs=fs.readFileSync("core.js","utf8");
const financeJs=fs.readFileSync("finance.js","utf8");
const css=fs.readFileSync("app.css","utf8");
const sw=fs.readFileSync("sw.js","utf8");
const release=JSON.parse(fs.readFileSync("release.json","utf8"));
const biglyWorker=fs.readFileSync("biglybt-worker/worker.js","utf8");
const manifest=JSON.parse(fs.readFileSync("manifest.webmanifest","utf8"));
const pkg=JSON.parse(fs.readFileSync("package.json","utf8"));
const nativeTvActivity=fs.readFileSync("android-tv-native/app/src/main/java/in/sinu/gamevault/nativetv/MainActivity.java","utf8");
const nativeTvView=fs.readFileSync("android-tv-native/app/src/main/java/in/sinu/gamevault/nativetv/VaultTvView.java","utf8");
const nativeTvData=fs.readFileSync("android-tv-native/app/src/main/java/in/sinu/gamevault/nativetv/VaultData.java","utf8");
const version=(js.match(/var APP_VERSION\s*=\s*"(\d+\.\d+\.\d+)"/)||[])[1];

assert.match(html,/href="app\.css(?:\?v=\d+\.\d+\.\d+)?"/);
assert.match(html,/src="app\.js(?:\?v=\d+\.\d+\.\d+)?"/);
assert.ok(version,"application version must be present");
assert.equal(pkg.version,version,"package version must match APP_VERSION");
assert.ok(html.includes(`app.css?v=${version}`),"CSS asset version must match APP_VERSION");
assert.ok(html.includes(`app.js?v=${version}`),"JavaScript asset version must match APP_VERSION");
assert.ok(html.includes(`finance.js?v=${version}`),"Finance asset version must match APP_VERSION");
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
new vm.Script(financeJs,{filename:"finance.js"});
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
for(const asset of ["app.css","core.js","finance.js","app.js"]){
  assert.ok(sw.includes(`"./${asset}?v=${version}"`),`service worker must cache the exact ${asset} release asset`);
}
assert.ok(html.includes(`core.js?v=${version}`),"Core asset version must match APP_VERSION");
assert.equal(release.version,version,"release manifest version must match APP_VERSION");
assert.equal(release.schema,11,"release manifest must expose the current data schema");
assert.equal(manifest.name,"Sinu Game Vault");
assert.match(html,/name="description"/);
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
assert.match(js,/function gameReleaseMeta\s*\(/,"Games must keep their release-date countdown renderer");
assert.match(js,/game-tile-info[\s\S]*gameReleaseMeta\(x\)/,"Every game grid card must show known release information");
assert.match(js,/var selected=ott\|\|date,label=ott\?"OTT release":"Release date"/,"Film cards in every tab must show known release dates");
assert.match(js,/var countdown=daysBetween\(today\(\),parseD\(date\)\)>=0\?releaseCountdown\(date\)/,"TV Series cards must show future-date countdowns");
assert.match(js,/movieWatchlist\.unshift\([\s\S]*date:m\.date\|\|"", ottDate:m\.ottDate\|\|""/,"Movie Watchlist must preserve release dates");
assert.ok(js.indexOf('Coming to Malayalam OTT · ')<js.indexOf('Now Streaming · '),"Upcoming Malayalam OTT releases must render before current releases");
assert.match(css,/\.home-card-rentals[\s\S]*\.home-card-finance/,"Home dashboard must retain its section color themes");
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
assert.match(html,/data-section="finance"/);
assert.match(financeJs,/gamevault-finance-v1/);
assert.match(financeJs,/AES-GCM/);
assert.match(financeJs,/PBKDF2/);
assert.ok(financeJs.includes("function financeIsCardAccount"),"card accounts must be classifiable");
assert.ok(financeJs.includes('kind==="income"&&financeIsCardAccount'),"card credits must never count as income");
assert.ok(financeJs.includes("Top 10 merchants"),"overview must rank top merchants by usage");
assert.match(financeJs,/extensions:\{prf:/);
assert.match(financeJs,/function financeShouldAutoUnlock\(/);
assert.match(financeJs,/if\(financeBusy\)\{financeTouch\(\);return;\}/);
assert.doesNotMatch(financeJs,/capability\.then\(/);
assert.match(financeJs,/vaultSalt:data\.finance\.salt/);
assert.match(financeJs,/FINANCE_DEVICE_DB/);
assert.match(financeJs,/function financeDeviceKey\(/);
assert.match(financeJs,/mode:parts\[2\]/);
assert.match(financeJs,/finance-pin-show/);
assert.match(financeJs,/FINANCE_LOCK_PREF/);
assert.match(financeJs,/finance-import-confirm/);
assert.match(financeJs,/https:\/\/www\.googleapis\.com\/auth\/gmail\.readonly/);
assert.match(financeJs,/function financeGmailSync\(/);
assert.match(financeJs,/function financeGmailListMessages\(/);
assert.match(financeJs,/function financeGmailQuery\(/);
assert.match(financeJs,/function financeMapLimit\(/);
assert.match(financeJs,/function financeGmailBatchSize\(\)\{return phoneUi\(\)\?6:30;\}/);
assert.match(financeJs,/function financeGmailConcurrency\(\)\{return phoneUi\(\)\?1:2;\}/);
assert.match(financeJs,/initialBackfillComplete/);
assert.match(financeJs,/retryMessageIds/);
assert.match(financeJs,/importedStatementKeys/);
assert.match(financeJs,/function financeGmailReadMessage\(/);
assert.match(financeJs,/function financeGmailEmi\(/);
assert.match(financeJs,/function financeMonthStats\(/);
assert.match(financeJs,/function financeRecurring\(/);
assert.match(financeJs,/function financeKind\(/);
assert.match(financeJs,/finance-toggle-detail/);
assert.match(financeJs,/STATEMENT-ONLY DATA SOURCE/);
assert.match(financeJs,/has:attachment/);
assert.match(financeJs,/subject:\"credit card statement\"/);
assert.match(financeJs,/subject:\"bank statement\"/);
assert.match(financeJs,/function financeGmailIsStatement\(/);
assert.ok(!financeJs.includes("var alert=financeGmailAlertTransaction"),"Statement sync must not import individual Gmail transaction alerts");
assert.match(financeJs,/financeGmailAutoBlocked/);
assert.match(financeJs,/financeGmailSetupRequired/);
assert.match(financeJs,/Enable Gmail API/);
assert.ok(!financeJs.includes('data-act="finance-add-transaction"'),"Finance must not expose manual transaction entry");
assert.ok(!financeJs.includes('data-act="finance-add-loan"'),"Finance must not expose manual loan entry");
assert.match(financeJs,/importedMessageIds/);
assert.match(financeJs,/Access tokens stay only in memory/);
assert.match(css,/\.finance-gmail/);
assert.match(css,/\.finance-auth/);
for(const key of ["serieswatching","seriesnew","seriesupcoming","enseries","mlseries","taseries","hiseries"]){ assert.ok(js.includes(key),`TV navigation must include ${key}`); }
assert.match(js,/watchingSeries/);
assert.match(js,/PLEX_ORDER=\["home","continue","movies","shows","recent"\]/);
assert.match(html,/id="desktopRailBtn"/);
assert.match(html,/id="commandPalette"/);
assert.match(css,/@media \(min-width:900px\)/);
assert.match(css,/html \.sectionsw/);
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
const envelope=await core.crypto.seal({token:"private-value"},"correct horse battery staple");
assert.ok(!JSON.stringify(envelope).includes("private-value"),"encrypted configuration must not contain plaintext credentials");
assert.deepEqual(await core.crypto.open(envelope,"correct horse battery staple"),{token:"private-value"},"encrypted configuration must round-trip");
const verifier=await core.crypto.pinVerifier("2468");
assert.equal(await core.crypto.verifyPin("2468",verifier),true,"correct secure-vault PIN must verify");
assert.equal(await core.crypto.verifyPin("1357",verifier),false,"incorrect secure-vault PIN must fail");
console.log("GameVault smoke checks passed");
