import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerBrowseTools } from "./tools/browse.js";
import { registerResolveTools } from "./tools/resolve.js";
import { registerThemeTools } from "./tools/themes.js";
import { registerValidateTools } from "./tools/validate.js";

/**
 * The version reported in the MCP handshake. Read from package.json rather
 * than written out here, where it silently went stale from 2.0.0 through
 * 2.5.0. `../package.json` resolves to the package root from both
 * `src/index.ts` (tsx) and `dist/index.js` (published).
 */
const { version } = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

const server = new McpServer({
  name: "formtrieb-tokens",
  version,
});

registerBrowseTools(server);
registerResolveTools(server);
registerThemeTools(server);
registerValidateTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
