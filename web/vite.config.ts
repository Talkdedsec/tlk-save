import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// GitHub Pages serves the site from /tlk-save/.
export default defineConfig({
  base: "/tlk-save/",
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: false,
    assetsInlineLimit: 0,
  },
  server: { port: 5173 },
  test: {
    environment: "node",
  },
});
