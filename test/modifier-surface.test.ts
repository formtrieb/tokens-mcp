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
  "fixtures/modifiers"
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

describe("modifier-surface: $extensions visible in tool outputs", () => {
  it("search_tokens returns $extensions on a token that has studio.tokens.modify", async () => {
    const m = setup();
    const out = await m.callTool("search_tokens", {
      tokens_path: FIXTURE,
      query: "brandHalf",
    });
    const results = out.results as Array<{
      path: string;
      $extensions?: { "studio.tokens"?: { modify?: unknown } };
    }>;
    const half = results.find((r) => r.path === "color.brandHalf");
    expect(half).toBeDefined();
    expect(half?.$extensions?.["studio.tokens"]?.modify).toEqual({
      type: "alpha",
      value: "0.5",
      space: "lch",
    });
  });

  it("browse_tokens tree leaf includes $extensions when present", async () => {
    const m = setup();
    const out = await m.callTool("browse_tokens", {
      tokens_path: FIXTURE,
      set: "Foundation",
      depth: 5,
    });
    const tree = out.tokens as Record<
      string,
      Record<string, { $extensions?: { "studio.tokens"?: { modify?: unknown } } }>
    >;
    const halfLeaf = tree.color?.brandHalf;
    expect(halfLeaf).toBeDefined();
    expect(halfLeaf?.$extensions?.["studio.tokens"]?.modify).toEqual({
      type: "alpha",
      value: "0.5",
      space: "lch",
    });
  });

  it("resolve_token chain step records the applied modifier", async () => {
    const m = setup();
    const out = await m.callTool("resolve_token", {
      tokens_path: FIXTURE,
      path: "color.brandHalf",
    });
    const chain = out.chain as Array<{
      tokenPath: string;
      modifier?: { type: string; value: string; space: string };
    }>;
    const halfStep = chain.find((s) => s.tokenPath === "color.brandHalf");
    expect(halfStep).toBeDefined();
    expect(halfStep?.modifier).toEqual({
      type: "alpha",
      value: "0.5",
      space: "lch",
    });
    // brand is the resolution target — no modifier of its own
    const brandStep = chain.find((s) => s.tokenPath === "color.brand");
    expect(brandStep?.modifier).toBeUndefined();
  });
});
