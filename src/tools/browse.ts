import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TokenLoader } from "../loader/token-loader.js";
import {
  ReferenceResolver,
  findColorMatches,
  type TokenTree,
  type ColorCandidate,
} from "@formtrieb/tokens-core";
import { resolveAndLoad, TOKENS_PATH_DESCRIPTION } from "../token-context.js";
import {
  themeAxesArg,
  THEME_AXES_DESCRIPTION,
  resolveAxes,
} from "./theme-arg.js";

/**
 * DTCG-style token types in use in the Formtrieb token system.
 * Derived from actual `$type` values in tokens/**.json.
 */
const TOKEN_TYPE_ENUM = [
  "color",
  "dimension",
  "number",
  "typography",
  "fontFamilies",
  "fontWeights",
  "fontSizes",
  "lineHeights",
  "letterSpacing",
  "paragraphSpacing",
  "textCase",
  "textDecoration",
  "boxShadow",
  "borderRadius",
  "sizing",
  "duration",
  "cubicBezier",
  "text",
  "other",
] as const;

export function registerBrowseTools(server: McpServer) {
  server.registerTool(
    "list_token_sets",
    {
      description:
        "List all token sets in order with their layer assignment and token count. Read-only overview — use browse_tokens to inspect contents of a specific set.",
      inputSchema: {
        tokens_path: z.string().optional().describe(TOKENS_PATH_DESCRIPTION),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (args) => {
      const { tokenLoader, tokenTree } = resolveAndLoad(args);
      const order = tokenLoader.getTokenSetOrder();
      const sets = order.map((name) => ({
        name,
        layer: tokenLoader.getLayerForSet(name),
        tokenCount: tokenTree.countTokensInSet(name),
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ sets, order }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    "browse_tokens",
    {
      description:
        "Browse tokens as a nested tree within a specific set, layer, or across the whole system. Use `path_prefix` to narrow scope and `depth` to control nesting. For fuzzy name matching across all sets, use search_tokens instead.",
      inputSchema: {
        set: z
          .string()
          .optional()
          .describe(
            "Token set name (e.g. 'Semantic/Light') or layer (e.g. 'Foundation'). Omit to browse every set."
          ),
        path_prefix: z
          .string()
          .optional()
          .describe(
            "Dot-path prefix to narrow scope (e.g. 'color.controls.brand')"
          ),
        type: z
          .enum(TOKEN_TYPE_ENUM)
          .optional()
          .describe("Filter by DTCG $type (e.g. 'color', 'dimension')"),
        depth: z
          .number()
          .int()
          .min(1)
          .max(10)
          .default(2)
          .describe("How many levels deep to show (1–10)"),
        tokens_path: z.string().optional().describe(TOKENS_PATH_DESCRIPTION),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ set, path_prefix, type, depth, tokens_path }) => {
      const { tokenLoader, tokenTree } = resolveAndLoad({ tokens_path });
      let tokens = getAllTokensForFilter(tokenLoader, tokenTree, set);

      if (path_prefix) {
        tokens = tokens.filter(
          (t) =>
            t.dotPath === path_prefix ||
            t.dotPath.startsWith(path_prefix + ".")
        );
      }

      if (type) {
        tokens = tokens.filter((t) => t.$type === type);
      }

      const tree = buildTreeView(tokens, path_prefix ?? "", depth);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { count: tokens.length, tokens: tree },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "search_tokens",
    {
      description:
        "Search tokens by name pattern across all sets using case-insensitive substring matching on dot-paths. Returns up to 100 results. For structured tree navigation, use browse_tokens instead.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe("Search term matched as substring against token dot-paths"),
        type: z
          .enum(TOKEN_TYPE_ENUM)
          .optional()
          .describe("Filter by DTCG $type"),
        set: z
          .string()
          .optional()
          .describe("Limit search to a specific set"),
        tokens_path: z.string().optional().describe(TOKENS_PATH_DESCRIPTION),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ query, type, set, tokens_path }) => {
      const { tokenLoader, tokenTree } = resolveAndLoad({ tokens_path });
      let tokens = getAllTokensForFilter(tokenLoader, tokenTree, set);

      const lowerQuery = query.toLowerCase();
      tokens = tokens.filter((t) =>
        t.dotPath.toLowerCase().includes(lowerQuery)
      );

      if (type) {
        tokens = tokens.filter((t) => t.$type === type);
      }

      const showing = Math.min(tokens.length, 100);
      const results = tokens.slice(0, 100).map((t) => ({
        path: t.dotPath,
        type: t.$type,
        value: t.$value,
        sourceSet: t.sourceSet,
        ...(t.$extensions && { $extensions: t.$extensions }),
      }));

      const truncated = tokens.length > showing;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                count: tokens.length,
                showing,
                truncated,
                ...(truncated && {
                  note: `Showing ${showing} of ${tokens.length}. Refine query to narrow down.`,
                }),
                results,
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
    "find_token_by_value",
    {
      description:
        "Reverse-lookup: given a colour value (hex, rgb(), rgba()), find the token dot-paths that resolve to it for a theme. Exact matching is format/casing-insensitive. Pass nearest:true to also get the perceptually closest non-exact token (CIEDE2000 ΔE) — useful when a raw Figma hex like `#2072b6` drifted slightly from any bound token. Complements search_tokens, which matches names not values.",
      inputSchema: {
        value: z
          .string()
          .min(1)
          .describe(
            "Colour value to look up (e.g. '#2072b6', 'rgb(32, 114, 182)')"
          ),
        theme: themeAxesArg.optional().describe(THEME_AXES_DESCRIPTION),
        nearest: z
          .boolean()
          .optional()
          .describe(
            "When true, also return the closest non-exact token by CIEDE2000 ΔE."
          ),
        tokens_path: z.string().optional().describe(TOKENS_PATH_DESCRIPTION),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ value, theme, nearest, tokens_path }) => {
      const { tokenTree, themeLoader } = resolveAndLoad({ tokens_path });
      const axes = resolveAxes(theme, themeLoader);
      const { enabled, source } = themeLoader.getActiveSets(axes);
      const merged = tokenTree.buildMergedTree(enabled, source);
      const resolver = new ReferenceResolver(merged);

      const candidates: ColorCandidate[] = [];
      for (const path of merged.keys()) {
        const final = resolver.resolve(path).finalValue;
        if (typeof final === "string") candidates.push({ path, value: final });
      }

      const result = findColorMatches(value, candidates, { nearest: !!nearest });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ theme: axes, ...result }, null, 2),
          },
        ],
      };
    }
  );
}

function getAllTokensForFilter(
  tokenLoader: TokenLoader,
  tokenTree: TokenTree,
  setOrLayer?: string
) {
  if (!setOrLayer) {
    const allTokens: ReturnType<typeof tokenTree.flattenSet> = [];
    for (const name of tokenLoader.getTokenSetOrder()) {
      allTokens.push(...tokenTree.flattenSet(name));
    }
    return allTokens;
  }

  if (tokenLoader.getSet(setOrLayer)) {
    return tokenTree.flattenSet(setOrLayer);
  }

  const allTokens: ReturnType<typeof tokenTree.flattenSet> = [];
  for (const name of tokenLoader.getTokenSetOrder()) {
    if (tokenLoader.getLayerForSet(name) === setOrLayer) {
      allTokens.push(...tokenTree.flattenSet(name));
    }
  }
  return allTokens;
}

interface TreeNode {
  [key: string]:
    | TreeNode
    | {
        $type: string;
        $value: unknown;
        sourceSet: string;
        $extensions?: unknown;
      };
}

function buildTreeView(
  tokens: {
    dotPath: string;
    $type: string;
    $value: unknown;
    sourceSet: string;
    $extensions?: unknown;
  }[],
  prefix: string,
  maxDepth: number
): TreeNode {
  const tree: TreeNode = {};

  for (const token of tokens) {
    const relativePath = prefix
      ? token.dotPath.slice(prefix.length + 1)
      : token.dotPath;
    const parts = relativePath.split(".");

    if (parts.length <= maxDepth) {
      let current = tree;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!(parts[i] in current)) {
          current[parts[i]] = {};
        }
        current = current[parts[i]] as TreeNode;
      }
      current[parts[parts.length - 1]] = {
        $type: token.$type,
        $value: token.$value,
        sourceSet: token.sourceSet,
        ...(token.$extensions !== undefined && {
          $extensions: token.$extensions,
        }),
      };
    } else {
      let current = tree;
      for (let i = 0; i < maxDepth; i++) {
        if (!(parts[i] in current)) {
          current[parts[i]] = {};
        }
        current = current[parts[i]] as TreeNode;
      }
    }
  }

  return tree;
}
