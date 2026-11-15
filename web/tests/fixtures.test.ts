/**
 * shared/fixtures/merge-cases.json is the contract between the website's core.js,
 * this site's merge and the Android TV app's merge. These tests keep that file
 * honest: it must be exactly what core.js produces today, and this site's port
 * must agree with it.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { clone, mergeVault, stable } from "../src/lib/syncMerge";

const fixtureDir = resolve(__dirname, "../../shared/fixtures");
const committed = JSON.parse(readFileSync(resolve(fixtureDir, "merge-cases.json"), "utf8"));

describe("shared merge fixtures", () => {
  it("are up to date with core.js (run: node shared/fixtures/merge-cases.mjs)", async () => {
    const generator: any = await import(/* @vite-ignore */ pathToFileURL(resolve(fixtureDir, "merge-cases.mjs")).href);
    expect(stable(generator.build())).toBe(stable(committed.cases));
  });

  for (const entry of committed.cases) {
    it(`the web port agrees: ${entry.name}`, () => {
      expect(stable(mergeVault(clone(entry.local), clone(entry.remote), committed.collections))).toBe(stable(entry.merged));
      expect(stable(mergeVault(clone(entry.remote), clone(entry.local), committed.collections))).toBe(stable(entry.mergedFromRemote));
    });
  }
});
