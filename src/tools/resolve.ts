import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ReferenceResolver } from "@formtrieb/tokens-core";
import type { ThemeAxes } from "@formtrieb/tokens-core";
import type { ThemeLoader } from "../loader/theme-loader.js";
import { resolveAndLoad, TOKENS_PATH_DESCRIPTION } from "../token-context.js";

/**
 * Zod shape for Formtrieb's user-selectable theme axes.
 * Matches the three axes with user choices in $themes.json.
 * Other axis groups (Foundation, Typography, Components-*) are resolved
 * automatically via getDefaultAxes() and should not be passed here.
 */
const themeAxesShape = {
  Semantic: z
    .enum(["Light", "Dark"])
    .optional()
    .describe("Light/dark mode"),
  Device: z
    .enum(["Desktop", "Tablet", "Mobile"])
    .optional()
    .describe("Device breakpoint"),
  Shape: z
    .enum(["Round", "Sharp"])
    .optional()
    .describe("Corner shape style"),
};

function coerceTheme(
  theme: Partial<ThemeAxes> | undefined,
  themeLoader: ThemeLoader
): ThemeAxes {
  const defaults = themeLoader.getDefaultAxes();
  return { ...defaults, ...theme } as ThemeAxes;
}

export function registerResolveTools(server: McpServer) {
  server.registerTool(
    "resolve_token",
    {
      description:
        "Resolve a single token dot-path to its final computed value for a given theme, returning the full reference chain. For resolving many paths at once (e.g. all states of a variant), use resolve_batch.",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe(
            "Token dot-path (e.g. 'color.controls.brand.background.enabled')"
          ),
        theme: z
          .object(themeAxesShape)
          .optional()
          .describe(
            "Theme axes to resolve against. Any omitted axis uses its default."
          ),
        tokens_path: z.string().optional().describe(TOKENS_PATH_DESCRIPTION),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ path, theme, tokens_path }) => {
      const { tokenTree, themeLoader } = resolveAndLoad({ tokens_path });
      const axes = coerceTheme(theme, themeLoader);
      const { enabled, source } = themeLoader.getActiveSets(axes);
      const merged = tokenTree.buildMergedTree(enabled, source);
      const resolver = new ReferenceResolver(merged);
      const chain = resolver.resolve(path);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                token: path,
                theme: axes,
                chain: chain.steps,
                finalValue: chain.finalValue,
                errors: chain.errors.length > 0 ? chain.errors : undefined,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "resolve_batch",
    {
      description:
        "Resolve multiple token dot-paths in one call against the same theme. Useful for resolving all states of a control variant. For a single path with full chain tracing, use resolve_token.",
      inputSchema: {
        paths: z
          .array(z.string().min(1))
          .min(1)
          .describe("Array of token dot-paths to resolve"),
        theme: z
          .object(themeAxesShape)
          .optional()
          .describe("Theme axes. Any omitted axis uses its default."),
        tokens_path: z.string().optional().describe(TOKENS_PATH_DESCRIPTION),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ paths, theme, tokens_path }) => {
      const { tokenTree, themeLoader } = resolveAndLoad({ tokens_path });
      const axes = coerceTheme(theme, themeLoader);
      const { enabled, source } = themeLoader.getActiveSets(axes);
      const merged = tokenTree.buildMergedTree(enabled, source);
      const resolver = new ReferenceResolver(merged);

      const results: Record<
        string,
        { finalValue: unknown; steps: number; errors?: string[] }
      > = {};

      for (const path of paths) {
        const chain = resolver.resolve(path);
        results[path] = {
          finalValue: chain.finalValue,
          steps: chain.steps.length,
          errors: chain.errors.length > 0 ? chain.errors : undefined,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ theme: axes, results }, null, 2),
          },
        ],
      };
    }
  );
}
