import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "es2022",
  outDir: "dist",
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
