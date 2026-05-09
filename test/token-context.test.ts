import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  cpSync,
  mkdtempSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  getTokenContext,
  _clearCacheForTesting,
} from "../src/token-context.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const tokensStudio = join(fixturesDir, "tokens-studio");

const tempDirs: string[] = [];

function makeWritableFixture(srcRelative: string): string {
  const dir = mkdtempSync(join(tmpdir(), "tokens-mcp-fixture-"));
  cpSync(join(fixturesDir, srcRelative), dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

describe("getTokenContext", () => {
  beforeEach(() => _clearCacheForTesting());
  afterEach(() => {
    for (const d of tempDirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("T-load: first call to a path returns context with all three loaders working", () => {
    const ctx = getTokenContext(tokensStudio);
    expect(ctx.tokenLoader.getTokenSetOrder()).toEqual([
      "Foundation",
      "Light",
      "Dark",
    ]);
    expect(ctx.themeLoader.getAxisGroups()).toEqual(["Theme"]);
    expect(ctx.tokenTree.countTokensInSet("Foundation")).toBeGreaterThan(0);
  });

  it("T-hit: second call to the same path returns the cached context (instance identity)", () => {
    const ctx1 = getTokenContext(tokensStudio);
    const ctx2 = getTokenContext(tokensStudio);
    expect(ctx2).toBe(ctx1);
  });

  it("T-mtime-stable: lastMtime is populated from the on-disk tree on first load and stays stable on subsequent calls", () => {
    const ctx1 = getTokenContext(tokensStudio);
    expect(ctx1.lastMtime).toBeGreaterThan(0);
    const ctx2 = getTokenContext(tokensStudio);
    expect(ctx2).toBe(ctx1);
    expect(ctx2.lastMtime).toBe(ctx1.lastMtime);
  });

  it("T-mtime-changed: when ANY .json file's mtime advances, cache is evicted and reloaded", () => {
    const dir = makeWritableFixture("tokens-studio");
    const ctx1 = getTokenContext(dir);

    // Advance mtime on Foundation.json by 5s (granularity-safe on all FS)
    const future = new Date(Date.now() + 5000);
    utimesSync(join(dir, "Foundation.json"), future, future);

    const ctx2 = getTokenContext(dir);
    expect(ctx2).not.toBe(ctx1);
    expect(ctx2.lastMtime).toBeGreaterThan(ctx1.lastMtime);
  });

  it("T-mtime-new-file: a newly added .json file evicts the cache even when its mtime is backdated below the existing max", () => {
    const dir = makeWritableFixture("tokens-studio");
    const ctx1 = getTokenContext(dir);

    // Add Extra.json, then backdate it to a day ago — strictly less than any
    // mtime currently captured in ctx1.lastMtime. A pure max-mtime check
    // would incorrectly keep the cache; file-list-tracking must catch it.
    const extra = join(dir, "Extra.json");
    writeFileSync(extra, "{}");
    const past = new Date(Date.now() - 86400000);
    utimesSync(extra, past, past);
    expect(statSync(extra).mtimeMs).toBeLessThan(ctx1.lastMtime);

    const ctx2 = getTokenContext(dir);
    expect(ctx2).not.toBe(ctx1);
  });

  it("T-lru-cap-8: a 9th distinct path evicts the least-recently-used entry", () => {
    const dirs = Array.from({ length: 9 }, () =>
      makeWritableFixture("tokens-studio")
    );
    const ctx0First = getTokenContext(dirs[0]!);
    for (let i = 1; i < 9; i++) {
      getTokenContext(dirs[i]!);
    }
    // dirs[0] was first-in, no subsequent access — it is the LRU. After
    // dirs[8] (the 9th distinct path) was loaded, dirs[0] must be evicted,
    // so re-accessing it produces a fresh context.
    const ctx0Again = getTokenContext(dirs[0]!);
    expect(ctx0Again).not.toBe(ctx0First);
  });

  it("T-lru-recency: re-accessing a cached entry bumps it to MRU so it survives subsequent eviction pressure", () => {
    const dirs = Array.from({ length: 9 }, () =>
      makeWritableFixture("tokens-studio")
    );
    // Fill the cache to capacity (8 entries: dirs[0..7])
    const ctx0First = getTokenContext(dirs[0]!);
    const ctx1First = getTokenContext(dirs[1]!);
    for (let i = 2; i < 8; i++) {
      getTokenContext(dirs[i]!);
    }
    // Bump dirs[0] to MRU. Without LRU-bump, dirs[0] would still be oldest.
    expect(getTokenContext(dirs[0]!)).toBe(ctx0First);
    // Now insert dirs[8] (the 9th path) — eviction must drop dirs[1]
    // (now the LRU), not dirs[0].
    getTokenContext(dirs[8]!);

    expect(getTokenContext(dirs[0]!)).toBe(ctx0First);
    expect(getTokenContext(dirs[1]!)).not.toBe(ctx1First);
  });

  it("T-mtime-perf: cache-hit cost (fingerprint walk over the tokens-studio fixture) averages well under 50ms", () => {
    getTokenContext(tokensStudio);

    const iterations = 100;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      getTokenContext(tokensStudio);
    }
    const avgMs = (performance.now() - start) / iterations;
    expect(avgMs).toBeLessThan(50);
  });
});
