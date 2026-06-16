import { defineConfig, devices } from "@playwright/test";

const e2ePort = process.env.E2E_PORT || "3100";
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${e2ePort}`;
const webServer = process.env.E2E_BASE_URL
  ? undefined
  : {
      command: `npm run start -- --port ${e2ePort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      url: baseURL,
    };

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(webServer ? { webServer } : {}),
});
