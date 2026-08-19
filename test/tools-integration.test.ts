import { beforeEach, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { _clearCacheForTesting } from "../src/token-context.js";
import { setupTools } from "./mock-server.js";

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/tokens-studio"
);

beforeEach(() => _clearCacheForTesting());

describe("tools-integration: tokens_path parameter present in every tool", () => {
  const TOOL_NAMES = [
    "list_token_sets",
    "list_themes",
    "browse_tokens",
    "resolve_token",
    "resolve_batch",
    "search_tokens",
    "find_token_by_value",
    "compose_theme",
    "compare_themes",
    "find_placeholders",
    "check_design_rules",
  ] as const;

  it.each(TOOL_NAMES)("%s declares tokens_path in inputSchema", (name) => {
    const m = setupTools();
    expect(m.has(name)).toBe(true);
    const schema = m.inputSchemaOf(name);
    expect(schema).toBeDefined();
    expect(schema).toHaveProperty("tokens_path");
  });
});

describe("tools-integration: routing via tokens_path against tokens-studio fixture", () => {
  it("list_token_sets returns the fixture's three sets", async () => {
    const m = setupTools();
    const out = await m.callTool("list_token_sets", { tokens_path: FIXTURE });
    expect(out.order).toEqual(["Foundation", "Light", "Dark"]);
  });

  it("list_themes returns the fixture's Theme axis with Light + Dark", async () => {
    const m = setupTools();
    const out = await m.callTool("list_themes", { tokens_path: FIXTURE });
    const axes = out.axes as Record<string, Array<{ name: string }>>;
    expect(Object.keys(axes)).toContain("Theme");
    expect(axes.Theme!.map((t) => t.name)).toEqual(["Light", "Dark"]);
  });

  it("browse_tokens scoped to Foundation finds gray + blue + spacing branches", async () => {
    const m = setupTools();
    const out = await m.callTool("browse_tokens", {
      tokens_path: FIXTURE,
      set: "Foundation",
      depth: 3,
    });
    expect(out.count).toBe(6);
  });

  it("search_tokens finds 'gray' tokens from Foundation", async () => {
    const m = setupTools();
    const out = await m.callTool("search_tokens", {
      tokens_path: FIXTURE,
      query: "gray",
    });
    expect(out.count).toBeGreaterThanOrEqual(3);
    const results = out.results as Array<{ path: string }>;
    expect(results.every((r) => r.path.includes("gray"))).toBe(true);
  });

  it("resolve_token resolves Light's color.background through the Foundation source", async () => {
    const m = setupTools();
    const out = await m.callTool("resolve_token", {
      tokens_path: FIXTURE,
      path: "color.background",
    });
    expect(out.finalValue).toBe("#f5f5f5");
  });

  it("resolve_token renders finalValue in the requested format (rgba)", async () => {
    const m = setupTools();
    const out = await m.callTool("resolve_token", {
      tokens_path: FIXTURE,
      path: "color.background",
      format: "rgba",
    });
    expect(out.finalValue).toBe("rgb(245, 245, 245)");
  });

  it("resolve_token renders finalValue in the requested format (hex8)", async () => {
    const m = setupTools();
    const out = await m.callTool("resolve_token", {
      tokens_path: FIXTURE,
      path: "color.background",
      format: "hex8",
    });
    expect(out.finalValue).toBe("#f5f5f5ff");
  });

  it("resolve_batch renders finalValue in the requested format", async () => {
    const m = setupTools();
    const out = await m.callTool("resolve_batch", {
      tokens_path: FIXTURE,
      paths: ["color.background"],
      format: "rgba",
    });
    const results = out.results as Record<string, { finalValue: unknown }>;
    expect(results["color.background"]!.finalValue).toBe("rgb(245, 245, 245)");
  });

  it("resolve_batch resolves multiple paths in one call", async () => {
    const m = setupTools();
    const out = await m.callTool("resolve_batch", {
      tokens_path: FIXTURE,
      paths: ["color.background", "color.foreground"],
    });
    const results = out.results as Record<string, { finalValue: unknown }>;
    expect(results["color.background"]!.finalValue).toBe("#f5f5f5");
    expect(results["color.foreground"]!.finalValue).toBe("#171717");
  });

  it("resolve_batch omits the full chain by default (count only)", async () => {
    const m = setupTools();
    const out = await m.callTool("resolve_batch", {
      tokens_path: FIXTURE,
      paths: ["color.background"],
    });
    const results = out.results as Record<
      string,
      { steps: unknown; chain?: unknown }
    >;
    expect(typeof results["color.background"]!.steps).toBe("number");
    expect(results["color.background"]!.chain).toBeUndefined();
  });

  it("resolve_batch returns the full reference chain when verbose", async () => {
    const m = setupTools();
    const out = await m.callTool("resolve_batch", {
      tokens_path: FIXTURE,
      paths: ["color.background"],
      verbose: true,
    });
    const results = out.results as Record<
      string,
      { chain?: Array<{ tokenPath: string }> }
    >;
    const chain = results["color.background"]!.chain;
    expect(Array.isArray(chain)).toBe(true);
    expect(chain!.length).toBeGreaterThan(0);
    expect(chain![0]).toHaveProperty("tokenPath");
  });

  it("find_token_by_value finds the token whose resolved colour matches a raw hex", async () => {
    const m = setupTools();
    const out = await m.callTool("find_token_by_value", {
      tokens_path: FIXTURE,
      value: "#f5f5f5",
    });
    expect(out.exact).toContain("color.background");
    expect(out.queryHex).toBe("#f5f5f5ff");
  });

  it("find_token_by_value returns a nearest match for a near-miss hex when requested", async () => {
    const m = setupTools();
    const out = await m.callTool("find_token_by_value", {
      tokens_path: FIXTURE,
      value: "#3b82f7", // one step off color.blue.500 (#3b82f6), the fixture's unique blue
      nearest: true,
    });
    expect(out.exact).toEqual([]);
    const nearest = out.nearest as {
      value: string;
      deltaE: number;
    } | null;
    expect(nearest?.value).toBe("#3b82f6");
    expect(nearest?.deltaE).toBeLessThan(1);
  });

  it("compose_theme returns valid enabled/source structure with default axes", async () => {
    const m = setupTools();
    const out = await m.callTool("compose_theme", {
      tokens_path: FIXTURE,
      axes: {},
    });
    expect(out).toHaveProperty("enabled");
    expect(out).toHaveProperty("source");
  });

  it("compare_themes returns a valid summary structure", async () => {
    const m = setupTools();
    const out = await m.callTool("compare_themes", {
      tokens_path: FIXTURE,
      theme_a: {},
      theme_b: {},
    });
    expect(out).toHaveProperty("summary");
    expect(out).toHaveProperty("changed");
  });

  it("find_placeholders returns count=0 for the placeholder-free fixture", async () => {
    const m = setupTools();
    const out = await m.callTool("find_placeholders", {
      tokens_path: FIXTURE,
    });
    expect(out.count).toBe(0);
  });

  it("check_design_rules returns a summary against the fixture (any violations OK)", async () => {
    const m = setupTools();
    const out = await m.callTool("check_design_rules", {
      tokens_path: FIXTURE,
    });
    expect(out).toHaveProperty("summary");
    expect(out).toHaveProperty("byRule");
  });
});

describe("tools-integration: cache hot path", () => {
  it("two consecutive calls with the same tokens_path reuse the cached context", async () => {
    const m = setupTools();
    const a = await m.callTool("list_token_sets", { tokens_path: FIXTURE });
    const b = await m.callTool("list_token_sets", { tokens_path: FIXTURE });
    expect(a).toEqual(b);
  });
});
