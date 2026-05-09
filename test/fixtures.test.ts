import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { TokenLoader } from "../src/loader/token-loader.js";
import { ThemeLoader } from "../src/loader/theme-loader.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("fixture: tokens-studio/", () => {
  const path = join(fixturesDir, "tokens-studio");

  it("TokenLoader loads metadata + all 3 sets without crash", () => {
    const loader = new TokenLoader(path);
    loader.load();
    expect(loader.getTokenSetOrder()).toEqual(["Foundation", "Light", "Dark"]);
    expect(loader.getAllSets().size).toBe(3);
    expect(loader.getSet("Foundation")).toBeDefined();
  });

  it("ThemeLoader produces a Theme axis with Light + Dark", () => {
    const loader = new ThemeLoader(path);
    expect(loader.getAxisGroups()).toEqual(["Theme"]);
    expect(loader.getThemesForGroup("Theme").map((t) => t.name)).toEqual([
      "Light",
      "Dark",
    ]);
    expect(loader.getDefaultAxes()).toEqual({ Theme: "Light" });
  });

  it("getActiveSets routes Foundation as source, Light/Dark as enabled", () => {
    const loader = new ThemeLoader(path);
    expect(loader.getActiveSets({ Theme: "Light" })).toEqual({
      enabled: ["Light"],
      source: ["Foundation"],
    });
    expect(loader.getActiveSets({ Theme: "Dark" })).toEqual({
      enabled: ["Dark"],
      source: ["Foundation"],
    });
  });
});

describe("fixture: edge-cases/circular-refs/", () => {
  const path = join(fixturesDir, "edge-cases", "circular-refs");

  it("TokenLoader loads the circular set without resolving (loaders are structural)", () => {
    const loader = new TokenLoader(path);
    loader.load();
    expect(loader.getTokenSetOrder()).toEqual(["circular"]);
    expect(loader.getSet("circular")).toBeDefined();
  });

  it("ThemeLoader handles empty $themes.json", () => {
    const loader = new ThemeLoader(path);
    expect(loader.getAllThemes()).toEqual([]);
    expect(loader.getAxisGroups()).toEqual([]);
  });
});

describe("fixture: edge-cases/missing-set/", () => {
  const path = join(fixturesDir, "edge-cases", "missing-set");

  it("TokenLoader silently skips missing files (Real loaded, Ghost absent)", () => {
    const loader = new TokenLoader(path);
    loader.load();
    expect(loader.getTokenSetOrder()).toEqual(["Real", "Ghost"]);
    expect(loader.getAllSets().size).toBe(1);
    expect(loader.getSet("Real")).toBeDefined();
    expect(loader.getSet("Ghost")).toBeUndefined();
  });

  it("ThemeLoader keeps Ghost in selectedTokenSets — failure surfaces downstream, not at load", () => {
    const loader = new ThemeLoader(path);
    expect(loader.getActiveSets({ Theme: "Default" })).toEqual({
      enabled: ["Real", "Ghost"],
      source: [],
    });
  });
});

describe("fixture: edge-cases/empty/", () => {
  const path = join(fixturesDir, "edge-cases", "empty");

  it("TokenLoader handles empty tokenSetOrder", () => {
    const loader = new TokenLoader(path);
    loader.load();
    expect(loader.getTokenSetOrder()).toEqual([]);
    expect(loader.getAllSets().size).toBe(0);
  });

  it("ThemeLoader handles empty $themes.json", () => {
    const loader = new ThemeLoader(path);
    expect(loader.getAllThemes()).toEqual([]);
    expect(loader.getDefaultAxes()).toEqual({});
  });
});
