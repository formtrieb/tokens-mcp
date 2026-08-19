import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ReferenceResolver, formatColor } from "@formtrieb/tokens-core";

const FORMAT_DESCRIPTION =
  "Optional colour render format for finalValue: 'rgba' (rgb()/rgba()), 'hex8' (#rrggbbaa), or 'hex' (#rrggbb). Non-colour values pass through unchanged. Omit to keep the raw resolved value (alpha modifiers stay rgba(), everything else hex).";
import { resolveAndLoad, TOKENS_PATH_DESCRIPTION } from "../token-context.js";
import {
  themeAxesArg,
  THEME_AXES_DESCRIPTION,
  resolveAxes,
} from "./theme-arg.js";

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
        theme: themeAxesArg.optional().describe(THEME_AXES_DESCRIPTION),
        format: z
          .enum(["rgba", "hex8", "hex"])
          .optional()
          .describe(FORMAT_DESCRIPTION),
        tokens_path: z.string().optional().describe(TOKENS_PATH_DESCRIPTION),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ path, theme, format, tokens_path }) => {
      const { tokenTree, themeLoader } = resolveAndLoad({ tokens_path });
      const axes = resolveAxes(theme, themeLoader);
      const { enabled, source } = themeLoader.getActiveSets(axes);
      const merged = tokenTree.buildMergedTree(enabled, source);
      const resolver = new ReferenceResolver(merged);
      const chain = resolver.resolve(path);
      const finalValue = format
        ? formatColor(chain.finalValue, format)
        : chain.finalValue;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                token: path,
                theme: axes,
                chain: chain.steps,
                finalValue,
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
        "Resolve multiple token dot-paths in one call against the same theme. Useful for resolving all states of a control variant. Pass verbose:true to include each path's full reference chain (steps + applied colour modifiers) — useful for spotting alpha/lighten/darken modifiers that shape the final value. For a single path with full chain tracing, use resolve_token.",
      inputSchema: {
        paths: z
          .array(z.string().min(1))
          .min(1)
          .describe("Array of token dot-paths to resolve"),
        theme: themeAxesArg.optional().describe(THEME_AXES_DESCRIPTION),
        verbose: z
          .boolean()
          .optional()
          .describe(
            "When true, include each path's full reference chain (steps + modifiers) instead of just a step count."
          ),
        format: z
          .enum(["rgba", "hex8", "hex"])
          .optional()
          .describe(FORMAT_DESCRIPTION),
        tokens_path: z.string().optional().describe(TOKENS_PATH_DESCRIPTION),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ paths, theme, verbose, format, tokens_path }) => {
      const { tokenTree, themeLoader } = resolveAndLoad({ tokens_path });
      const axes = resolveAxes(theme, themeLoader);
      const { enabled, source } = themeLoader.getActiveSets(axes);
      const merged = tokenTree.buildMergedTree(enabled, source);
      const resolver = new ReferenceResolver(merged);

      const results: Record<
        string,
        {
          finalValue: unknown;
          steps: number;
          chain?: ReturnType<typeof resolver.resolve>["steps"];
          errors?: string[];
        }
      > = {};

      for (const path of paths) {
        const chain = resolver.resolve(path);
        results[path] = {
          finalValue: format
            ? formatColor(chain.finalValue, format)
            : chain.finalValue,
          steps: chain.steps.length,
          ...(verbose && { chain: chain.steps }),
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
