// End-to-end tests (tests/e2e): the app in Chromium, on the test server (tools/ui-test), whose
// adapters are local: the library from admin-data, signed in as the admin only with ?admin.
import { defineConfig, devices } from "@playwright/test";

const PORT = 5197;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, ...devices["Desktop Chrome"] },
  webServer: {
    command: `npx vite --config tools/ui-test/vite.config.js --port ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
});
