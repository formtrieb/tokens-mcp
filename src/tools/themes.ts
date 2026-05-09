import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ReferenceResolver } from "@formtrieb/tokens-core";
import type { ThemeAxes } from "@formtrieb/tokens-core";
import { resolveAndLoad, TOKENS_PATH_DESCRIPTION } from "../token-context.js";

/**
 * Zod shape for Formtrieb's user-selectable theme axes.
 * Matches the three axes with user choices in $themes.json.
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

export function registerThemeTools(server: McpServer) {
  server.registerTool(
    "list_themes",
    {
      description:
        "List all available themes grouped by axis (Semantic, Device, Shape, Foundation, Typography, Components-*). Use this to discover which values are valid for theme arguments in other tools.",
      inputSchema: {
        tokens_path: z.string().optional().describe(TOKENS_PATH_DESCRIPTION),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (args) => {
      const { themeLoader } = resolveAndLoad(args);
      const axes: Record<
        string,
        Array<{
          name: string;
          id: string;
          enabledSets: string[];
          sourceSets: string[];
        }>
      > = {};

      for (const [group, themes] of themeLoader.getAxes()) {
        axes[group] = themes.map((t) => ({
          name: t.name,
          id: t.id,
          enabledSets: Object.entries(t.selectedTokenSets)
            .filter(([, v]) => v === "enabled")
            .map(([k]) => k),
          sourceSets: Object.entries(t.selectedTokenSets)
            .filter(([, v]) => v === "source")
            .map(([k]) => k),
        }));
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ axes }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    "compose_theme",
    {
      description:
        "Show which token sets are active for a given theme combination. Returns enabled sets, source sets, and any unspecified axes falling back to defaults.",
      inputSchema: {
        axes: z
          .object(themeAxesShape)
          .describe(
            "Theme axis selections (e.g. { Semantic: 'Light', Device: 'Desktop' })"
          ),
        tokens_path: z.string().optional().describe(TOKENS_PATH_DESCRIPTION),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ axes, tokens_path }) => {
      const { themeLoader } = resolveAndLoad({ tokens_path });
      const typedAxes = axes as ThemeAxes;
      const { enabled, source } = themeLoader.getActiveSets(typedAxes);
      const allGroups = themeLoader.getAxisGroups();
      const specifiedGroups = Object.keys(typedAxes);
      const missingAxes = allGroups.filter(
        (g) => !specifiedGroups.includes(g)
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                axes: typedAxes,
                enabled,
                source,
                missingAxes: missingAxes.length > 0 ? missingAxes : undefined,
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
    "compare_themes",
    {
      description:
        "Compare resolved token values between two theme configurations. Returns which paths differ and their values. Hard cap: 200 changed paths, 50 per only-in-A/B list.",
      inputSchema: {
        theme_a: z
          .object(themeAxesShape)
          .describe("First theme axes (e.g. { Semantic: 'Light' })"),
        theme_b: z
          .object(themeAxesShape)
          .describe("Second theme axes (e.g. { Semantic: 'Dark' })"),
        path_prefix: z
          .string()
          .optional()
          .describe("Narrow comparison to a dot-path subtree (e.g. 'color.text')"),
        type: z
          .string()
          .optional()
          .describe("Filter by DTCG $type (e.g. 'color')"),
        tokens_path: z.string().optional().describe(TOKENS_PATH_DESCRIPTION),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ theme_a, theme_b, path_prefix, type, tokens_path }) => {
      const { tokenTree, themeLoader } = resolveAndLoad({ tokens_path });
      const axesA = theme_a as ThemeAxes;
      const axesB = theme_b as ThemeAxes;
      const { enabled: enabledA, source: sourceA } = themeLoader.getActiveSets(axesA);
      const { enabled: enabledB, source: sourceB } = themeLoader.getActiveSets(axesB);
      const mergedA = tokenTree.buildMergedTree(enabledA, sourceA);
      const mergedB = tokenTree.buildMergedTree(enabledB, sourceB);

      const resolverA = new ReferenceResolver(mergedA);
      const resolverB = new ReferenceResolver(mergedB);

      const allPaths = new Set([...mergedA.keys(), ...mergedB.keys()]);
      const changed: Array<{
        path: string;
        valueA: unknown;
        valueB: unknown;
      }> = [];
      const onlyInA: string[] = [];
      const onlyInB: string[] = [];

      for (const path of allPaths) {
        if (path_prefix && !path.startsWith(path_prefix)) continue;

        const tokenA = mergedA.get(path);
        const tokenB = mergedB.get(path);

        if (type) {
          if (tokenA && tokenA.$type !== type) continue;
          if (tokenB && tokenB.$type !== type) continue;
        }

        if (tokenA && tokenA.isSource && tokenB && tokenB.isSource) continue;

        if (!tokenA || tokenA.isSource) {
          if (tokenB && !tokenB.isSource) onlyInB.push(path);
          continue;
        }
        if (!tokenB || tokenB.isSource) {
          if (tokenA && !tokenA.isSource) onlyInA.push(path);
          continue;
        }

        const chainA = resolverA.resolve(path);
        const chainB = resolverB.resolve(path);

        const valA = JSON.stringify(chainA.finalValue);
        const valB = JSON.stringify(chainB.finalValue);

        if (valA !== valB) {
          changed.push({
            path,
            valueA: chainA.finalValue,
            valueB: chainB.finalValue,
          });
        }
      }

      const CHANGED_LIMIT = 200;
      const ONLY_LIMIT = 50;
      const changedTruncated = changed.length > CHANGED_LIMIT;
      const onlyATruncated = onlyInA.length > ONLY_LIMIT;
      const onlyBTruncated = onlyInB.length > ONLY_LIMIT;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                theme_a: axesA,
                theme_b: axesB,
                summary: {
                  changed: changed.length,
                  onlyInA: onlyInA.length,
                  onlyInB: onlyInB.length,
                },
                ...(changedTruncated && {
                  note: `Showing ${CHANGED_LIMIT} of ${changed.length} changed paths. Refine path_prefix to narrow down.`,
                }),
                changed: changed.slice(0, CHANGED_LIMIT),
                onlyInA: onlyATruncated
                  ? {
                      showing: ONLY_LIMIT,
                      total: onlyInA.length,
                      paths: onlyInA.slice(0, ONLY_LIMIT),
                    }
                  : onlyInA,
                onlyInB: onlyBTruncated
                  ? {
                      showing: ONLY_LIMIT,
                      total: onlyInB.length,
                      paths: onlyInB.slice(0, ONLY_LIMIT),
                    }
                  : onlyInB,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
