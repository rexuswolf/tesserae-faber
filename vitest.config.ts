// Unit tests (tests/unit): the app's logic, in a simulated browser (happy-dom), with no network.
import { defineConfig } from "vitest/config";
import { threeBySource } from "./vite.config.js";

export default defineConfig({
  resolve: { alias: [threeBySource] },
  define: { __BUILD__: JSON.stringify("test") },
  test: { include: ["tests/unit/**/*.test.ts"], environment: "happy-dom", environmentOptions: { happyDOM: { url: "http://localhost/c/test" } } },
});
