import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerBrowseTools } from "../src/tools/browse.js";
import { registerResolveTools } from "../src/tools/resolve.js";
import { registerThemeTools } from "../src/tools/themes.js";
import { registerValidateTools } from "../src/tools/validate.js";

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/foreign-axes"
);

/**
 * What a client may send is decided by the *generated JSON Schema*, so the mock
 * server in mock-server.ts cannot be the outermost boundary — these run a real
 * MCP client against a real McpServer over an in-memory transport.
 */
async function connect() {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerBrowseTools(server);
  registerResolveTools(server);
  registerThemeTools(server);
  registerValidateTools(server);

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
  return client;
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  return (result.content as Array<{ text: string }>)[0]!.text;
}

describe("real MCP client roundtrip", () => {
  it("advertises theme as an open string map, not a fixed enum set", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const schema = tools.find((t) => t.name === "resolve_token")!.inputSchema;
    const theme = (schema.properties as Record<string, unknown>).theme as {
      properties: object;
      additionalProperties: object;
    };

    expect(theme.properties).toEqual({});
    expect(theme.additionalProperties).toEqual({ type: "string" });
    await client.close();
  });

  it("resolves an axis no built-in enum contains", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "resolve_token",
      arguments: {
        tokens_path: FIXTURE,
        path: "color.accent",
        theme: { Brand: "Globex" },
      },
    });

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(textOf(result)).finalValue).toBe("#ec4899");
    await client.close();
  });

  it("returns a tool error naming the real axes for an unknown one", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "resolve_token",
      arguments: {
        tokens_path: FIXTURE,
        path: "color.accent",
        theme: { Semantic: "Light" },
      },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Unknown theme axis "Semantic"');
    expect(textOf(result)).toContain("Brand: Acme (default), Globex");
    await client.close();
  });
});
