import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseThemes,
  buildAxisMap,
  getActiveSets as coreGetActiveSets,
  getDefaultAxes as coreGetDefaultAxes,
  getAxisGroups as coreGetAxisGroups,
  getThemesForGroup as coreGetThemesForGroup,
  getThemeByName as coreGetThemeByName,
} from "@formtrieb/tokens-core";
import type { ThemeDefinition, ThemeAxes } from "@formtrieb/tokens-core";

export class ThemeLoader {
  private themes: ThemeDefinition[];
  private axisMap: Map<string, ThemeDefinition[]>;

  constructor(tokensPath: string) {
    const themesPath = join(tokensPath, "$themes.json");
    const raw = JSON.parse(readFileSync(themesPath, "utf-8"));
    this.themes = parseThemes(raw);
    this.axisMap = buildAxisMap(this.themes);
  }

  getAllThemes(): ThemeDefinition[] {
    return this.themes;
  }

  getAxes(): Map<string, ThemeDefinition[]> {
    return this.axisMap;
  }

  getAxisGroups(): string[] {
    return coreGetAxisGroups(this.axisMap);
  }

  getThemesForGroup(group: string): ThemeDefinition[] {
    return coreGetThemesForGroup(this.axisMap, group);
  }

  getThemeByName(group: string, name: string): ThemeDefinition | undefined {
    return coreGetThemeByName(this.themes, group, name);
  }

  getActiveSets(axes: ThemeAxes): { enabled: string[]; source: string[] } {
    return coreGetActiveSets(this.themes, axes);
  }

  getDefaultAxes(): ThemeAxes {
    return coreGetDefaultAxes(this.axisMap);
  }
}
