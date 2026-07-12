import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const html=fs.readFileSync("index.html","utf8");
const js=fs.readFileSync("app.js","utf8");
const css=fs.readFileSync("app.css","utf8");
const sw=fs.readFileSync("sw.js","utf8");
const manifest=JSON.parse(fs.readFileSync("manifest.webmanifest","utf8"));

assert.match(html,/href="app\.css"/);
assert.match(html,/src="app\.js"/);
assert.ok(html.length<50000,"index.html should stay a small application shell");
assert.ok(css.length>10000,"application styles are unexpectedly empty");
assert.ok(js.length>100000,"application script is unexpectedly empty");
new vm.Script(js,{filename:"app.js"});
new vm.Script(sw,{filename:"sw.js"});
for(const name of ["movieCard","watchlistCard","watchlistSearchCard","seriesCard","seriesSearchCard"]){
  const count=(js.match(new RegExp("function\\s+"+name+"\\s*\\(","g"))||[]).length;
  assert.equal(count,1,`${name} should have one canonical implementation`);
}
for(const asset of ["./index.html","./app.css","./app.js","./manifest.webmanifest"]){
  assert.ok(sw.includes(`"${asset}"`),`service worker must cache ${asset}`);
}
assert.equal(manifest.name,"Sinu Game Vault");
assert.match(js,/function validateVault\(/);
assert.match(js,/function createRecoverySnapshot\(/);
assert.match(js,/var APP_VERSION\s*=/);
console.log("GameVault smoke checks passed");
