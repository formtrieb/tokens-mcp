import { beforeEach, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerBrowseTools } from "../src/tools/browse.js";
import { registerResolveTools } from "../src/tools/resolve.js";
import { registerThemeTools } from "../src/tools/themes.js";
import { registerValidateTools } from "../src/tools/validate.js";
import { _clearCacheForTesting } from "../src/token-context.js";

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/tokens-studio"
);

interface RegisteredTool {
  config: { inputSchema?: Record<string, unknown> };
  handler: (args: Record<string, unknown>) => Promise<{
    content: { type: string; text: string }[];
  }>;
}

function createMockServer() {
  const tools = new Map<string, RegisteredTool>();
  const server = {
    registerTool: (
      name: string,
      config: RegisteredTool["config"],
      handler: RegisteredTool["handler"]
    ) => {
      tools.set(name, { config, handler });
    },
  };
  return {
    server: server as unknown as McpServer,
    callTool: async (name: string, args: Record<string, unknown>) => {
      const tool = tools.get(name);
      if (!tool) throw new Error(`Tool not registered: ${name}`);
      const result = await tool.handler(args);
      return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    },
    inputSchemaOf: (name: string) => tools.get(name)?.config.inputSchema,
    has: (name: string) => tools.has(name),
  };
}

function setup() {
  const m = createMockServer();
  registerBrowseTools(m.server);
  registerResolveTools(m.server);
  registerThemeTools(m.server);
  registerValidateTools(m.server);
  return m;
}

beforeEach(() => _clearCacheForTesting());

describe("tools-integration: tokens_path parameter present in every tool", () => {
  const TOOL_NAMES = [
    "list_token_sets",
    "list_themes",
    "browse_tokens",
    "resolve_token",
    "resolve_batch",
    "search_tokens",
    "compose_theme",
    "compare_themes",
    "find_placeholders",
    "check_design_rules",
  ] as const;

  it.each(TOOL_NAMES)("%s declares tokens_path in inputSchema", (name) => {
    const m = setup();
    expect(m.has(name)).toBe(true);
    const schema = m.inputSchemaOf(name);
    expect(schema).toBeDefined();
    expect(schema).toHaveProperty("tokens_path");
  });
});

describe("tools-integration: routing via tokens_path against tokens-studio fixture", () => {
  it("list_token_sets returns the fixture's three sets", async () => {
    const m = setup();
    const out = await m.callTool("list_token_sets", { tokens_path: FIXTURE });
    expect(out.order).toEqual(["Foundation", "Light", "Dark"]);
  });

  it("list_themes returns the fixture's Theme axis with Light + Dark", async () => {
    const m = setup();
    const out = await m.callTool("list_themes", { tokens_path: FIXTURE });
    const axes = out.axes as Record<string, Array<{ name: string }>>;
    expect(Object.keys(axes)).toContain("Theme");
    expect(axes.Theme!.map((t) => t.name)).toEqual(["Light", "Dark"]);
  });

  it("browse_tokens scoped to Foundation finds gray + blue + spacing branches", async () => {
    const m = setup();
    const out = await m.callTool("browse_tokens", {
      tokens_path: FIXTURE,
      set: "Foundation",
      depth: 3,
    });
    expect(out.count).toBe(6);
  });

  it("search_tokens finds 'gray' tokens from Foundation", async () => {
    const m = setup();
    const out = await m.callTool("search_tokens", {
      tokens_path: FIXTURE,
      query: "gray",
    });
    expect(out.count).toBeGreaterThanOrEqual(3);
    const results = out.results as Array<{ path: string }>;
    expect(results.every((r) => r.path.includes("gray"))).toBe(true);
  });

  it("resolve_token resolves Light's color.background through the Foundation source", async () => {
    const m = setup();
    const out = await m.callTool("resolve_token", {
      tokens_path: FIXTURE,
      path: "color.background",
    });
    expect(out.finalValue).toBe("#f5f5f5");
  });

  it("resolve_batch resolves multiple paths in one call", async () => {
    const m = setup();
    const out = await m.callTool("resolve_batch", {
      tokens_path: FIXTURE,
      paths: ["color.background", "color.foreground"],
    });
    const results = out.results as Record<string, { finalValue: unknown }>;
    expect(results["color.background"]!.finalValue).toBe("#f5f5f5");
    expect(results["color.foreground"]!.finalValue).toBe("#171717");
  });

  it("compose_theme returns valid enabled/source structure with default axes", async () => {
    const m = setup();
    const out = await m.callTool("compose_theme", {
      tokens_path: FIXTURE,
      axes: {},
    });
    expect(out).toHaveProperty("enabled");
    expect(out).toHaveProperty("source");
  });

  it("compare_themes returns a valid summary structure", async () => {
    const m = setup();
    const out = await m.callTool("compare_themes", {
      tokens_path: FIXTURE,
      theme_a: {},
      theme_b: {},
    });
    expect(out).toHaveProperty("summary");
    expect(out).toHaveProperty("changed");
  });

  it("find_placeholders returns count=0 for the placeholder-free fixture", async () => {
    const m = setup();
    const out = await m.callTool("find_placeholders", {
      tokens_path: FIXTURE,
    });
    expect(out.count).toBe(0);
  });

  it("check_design_rules returns a summary against the fixture (any violations OK)", async () => {
    const m = setup();
    const out = await m.callTool("check_design_rules", {
      tokens_path: FIXTURE,
    });
    expect(out).toHaveProperty("summary");
    expect(out).toHaveProperty("byRule");
  });
});

describe("tools-integration: cache hot path", () => {
  it("two consecutive calls with the same tokens_path reuse the cached context", async () => {
    const m = setup();
    const a = await m.callTool("list_token_sets", { tokens_path: FIXTURE });
    const b = await m.callTool("list_token_sets", { tokens_path: FIXTURE });
    expect(a).toEqual(b);
  });
});
