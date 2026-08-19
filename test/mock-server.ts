import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerBrowseTools } from "../src/tools/browse.js";
import { registerResolveTools } from "../src/tools/resolve.js";
import { registerThemeTools } from "../src/tools/themes.js";
import { registerValidateTools } from "../src/tools/validate.js";

interface RegisteredTool {
  config: { inputSchema?: Record<string, unknown> };
  handler: (args: Record<string, unknown>) => Promise<{
    content: { type: string; text: string }[];
  }>;
}

/**
 * Minimal stand-in for McpServer that records registrations.
 *
 * callTool() parses args against the tool's declared `inputSchema` before
 * invoking the handler — a real MCP client rejects at the schema boundary, so
 * a mock that skips it cannot see schema bugs.
 */
export function createMockServer() {
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
      const shape = tool.config.inputSchema as
        | Parameters<typeof z.object>[0]
        | undefined;
      const parsed = shape
        ? (z.object(shape).parse(args) as Record<string, unknown>)
        : args;
      const result = await tool.handler(parsed);
      return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    },
    inputSchemaOf: (name: string) => tools.get(name)?.config.inputSchema,
    has: (name: string) => tools.has(name),
  };
}

/** A mock server with every tool the real entrypoint registers. */
export function setupTools() {
  const m = createMockServer();
  registerBrowseTools(m.server);
  registerResolveTools(m.server);
  registerThemeTools(m.server);
  registerValidateTools(m.server);
  return m;
}
