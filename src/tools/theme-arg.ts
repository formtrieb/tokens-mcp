import { z } from "zod";
import { describeAxes, validateAxes } from "@formtrieb/tokens-core";
import type { AxisProblem, ThemeAxes } from "@formtrieb/tokens-core";
import type { ThemeLoader } from "../loader/theme-loader.js";

/**
 * Theme axes are a property of the loaded $themes.json, not of this server —
 * a design system may use Brand/Density just as well as Semantic/Device/Shape.
 * An MCP tool schema is static per server, not per tokens_path, so the shape
 * stays open here and the axes get checked against the loaded themes in
 * assertAxes() instead.
 */
export const themeAxesArg = z.object({}).catchall(z.string());

export const THEME_AXES_DESCRIPTION =
  "Theme axes as { axis: value } — e.g. { \"Semantic\": \"Light\", \"Device\": \"Desktop\" } for a design system that defines those axes. Axis names and their values come from the loaded $themes.json and differ per design system; call list_themes to discover them. Omitted axes fall back to their default.";

function describeProblem(problem: AxisProblem): string {
  const head =
    problem.kind === "unknown-axis"
      ? `Unknown theme axis "${problem.axis}"`
      : `Unknown value "${problem.value}" for theme axis "${problem.axis}"`;
  return problem.suggestion
    ? `${head} — did you mean "${problem.suggestion}"?`
    : `${head}.`;
}

/**
 * Reject axes the loaded token system does not define.
 * Without this an unknown axis is silently dropped and the caller gets values
 * for the default theme instead of the one it asked for.
 */
export function assertAxes(
  selection: Record<string, string>,
  themeLoader: ThemeLoader
): void {
  const problems = validateAxes(themeLoader.getAxes(), selection);
  if (problems.length === 0) return;

  const catalogue = describeAxes(themeLoader.getAxes()).map(
    (axis) =>
      `  ${axis.axis}: ${axis.values
        .map((v) => (v === axis.default ? `${v} (default)` : v))
        .join(", ")}`
  );

  throw new Error(
    [
      ...problems.map(describeProblem),
      "",
      "Axes available in this token system (from $themes.json):",
      ...catalogue,
    ].join("\n")
  );
}

/** Validate a partial axis selection, then fill the rest with defaults. */
export function resolveAxes(
  selection: Record<string, string> | undefined,
  themeLoader: ThemeLoader
): ThemeAxes {
  const axes = selection ?? {};
  assertAxes(axes, themeLoader);
  return { ...themeLoader.getDefaultAxes(), ...axes };
}
