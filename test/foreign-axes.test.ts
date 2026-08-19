import { beforeEach, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { _clearCacheForTesting } from "../src/token-context.js";
import { setupTools } from "./mock-server.js";

/**
 * A design system whose theme axes are not the ones this server was first
 * built against. See fixtures/foreign-axes/EXPECTED.md.
 */
const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/foreign-axes"
);

beforeEach(() => _clearCacheForTesting());

describe("foreign axes pass the declared inputSchema", () => {
  it("resolve_token accepts an axis no built-in enum contains", async () => {
    const m = setupTools();
    const out = await m.callTool("resolve_token", {
      tokens_path: FIXTURE,
      path: "color.accent",
      theme: { Brand: "Globex" },
    });
    expect(out.finalValue).toBe("#ec4899");
  });

  it("resolve_batch accepts foreign axes", async () => {
    const m = setupTools();
    const out = await m.callTool("resolve_batch", {
      tokens_path: FIXTURE,
      paths: ["color.accent", "spacing.gap"],
      theme: { Brand: "Globex", Density: "Compact" },
    });
    const results = out.results as Record<string, { finalValue: unknown }>;
    expect(results["color.accent"]!.finalValue).toBe("#ec4899");
    expect(results["spacing.gap"]!.finalValue).toBe("8px");
  });

  it("compose_theme accepts foreign axes", async () => {
    const m = setupTools();
    const out = await m.callTool("compose_theme", {
      tokens_path: FIXTURE,
      axes: { Brand: "Globex" },
    });
    expect(out.enabled).toEqual(["brand/globex"]);
    expect(out.source).toEqual(["core"]);
  });

  it("compare_themes accepts foreign axes", async () => {
    const m = setupTools();
    const out = await m.callTool("compare_themes", {
      tokens_path: FIXTURE,
      theme_a: { Brand: "Acme" },
      theme_b: { Brand: "Globex" },
    });
    const changed = out.changed as Array<{ path: string }>;
    expect(changed.map((c) => c.path)).toContain("color.accent");
  });

  it("find_token_by_value accepts foreign axes", async () => {
    const m = setupTools();
    const out = await m.callTool("find_token_by_value", {
      tokens_path: FIXTURE,
      value: "#ec4899",
      theme: { Brand: "Globex" },
    });
    expect(JSON.stringify(out)).toContain("color.accent");
  });
});

describe("themes without a group", () => {
  it("list_themes collects them under Ungrouped, never 'undefined'", async () => {
    const m = setupTools();
    const out = await m.callTool("list_themes", { tokens_path: FIXTURE });
    const axes = out.axes as Record<string, Array<{ name: string }>>;
    expect(Object.keys(axes)).toEqual(["Brand", "Density", "Ungrouped"]);
    expect(axes.Ungrouped!.map((t) => t.name)).toEqual(["Light", "Dark"]);
  });

  it("list_themes reports the default value per axis", async () => {
    const m = setupTools();
    const out = await m.callTool("list_themes", { tokens_path: FIXTURE });
    expect(out.defaults).toEqual({
      Brand: "Acme",
      Density: "Cozy",
      Ungrouped: "Light",
    });
  });

  it("are addressable through the collector axis", async () => {
    const m = setupTools();
    const out = await m.callTool("resolve_token", {
      tokens_path: FIXTURE,
      path: "color.background",
      theme: { Ungrouped: "Dark" },
    });
    expect(out.finalValue).toBe("#171717");
  });

  it("resolve_token echoes no 'undefined' axis", async () => {
    const m = setupTools();
    const out = await m.callTool("resolve_token", {
      tokens_path: FIXTURE,
      path: "color.accent",
    });
    expect(out.theme).toEqual({
      Brand: "Acme",
      Density: "Cozy",
      Ungrouped: "Light",
    });
  });
});

describe("runtime validation replaces the schema enums", () => {
  it("rejects an axis this system does not define, naming what exists", async () => {
    const m = setupTools();
    await expect(
      m.callTool("resolve_token", {
        tokens_path: FIXTURE,
        path: "color.accent",
        theme: { Semantic: "Light" },
      })
    ).rejects.toThrow(/Semantic[\s\S]*Brand/);
  });

  it("rejects a value the axis does not define, naming what exists", async () => {
    const m = setupTools();
    await expect(
      m.callTool("resolve_token", {
        tokens_path: FIXTURE,
        path: "color.accent",
        theme: { Brand: "Initech" },
      })
    ).rejects.toThrow(/Initech[\s\S]*Globex/);
  });

  it("suggests the correct casing", async () => {
    const m = setupTools();
    await expect(
      m.callTool("resolve_token", {
        tokens_path: FIXTURE,
        path: "color.accent",
        theme: { Brand: "globex" },
      })
    ).rejects.toThrow(/did you mean "Globex"/);
  });

  it("validates compose_theme, compare_themes and find_token_by_value too", async () => {
    const m = setupTools();
    await expect(
      m.callTool("compose_theme", { tokens_path: FIXTURE, axes: { Nope: "x" } })
    ).rejects.toThrow(/Nope/);
    await expect(
      m.callTool("compare_themes", {
        tokens_path: FIXTURE,
        theme_a: { Brand: "Acme" },
        theme_b: { Nope: "x" },
      })
    ).rejects.toThrow(/Nope/);
    await expect(
      m.callTool("find_token_by_value", {
        tokens_path: FIXTURE,
        value: "#ec4899",
        theme: { Nope: "x" },
      })
    ).rejects.toThrow(/Nope/);
  });
});
