import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerBrowseTools } from "./tools/browse.js";
import { registerResolveTools } from "./tools/resolve.js";
import { registerThemeTools } from "./tools/themes.js";
import { registerValidateTools } from "./tools/validate.js";

const server = new McpServer({
  name: "formtrieb-tokens",
  version: "2.0.0",
});

registerBrowseTools(server);
registerResolveTools(server);
registerThemeTools(server);
registerValidateTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
