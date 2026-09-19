import { defineConfig, devices } from "@playwright/test";

declare const process: {
  env: Record<string, string | undefined>;
};

const baseURL = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testMatch: "e2e/**/*.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "api",
      testMatch: "api/**/*.spec.ts",
      use: { baseURL: "http://127.0.0.1:5100" },
    },
    {
      name: "schema",
      testMatch: "schema/**/*.spec.ts",
      timeout: 60_000,
    },
  ],
  webServer: [
    {
      command:
        "npm run build && npm run start --workspace @specthread/web -- --hostname 127.0.0.1 --port 3100",
      url: baseURL,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command:
        "npm run build:api && dotnet run --project app/api --configuration Release --no-build --no-launch-profile -- --urls http://127.0.0.1:5100 --environment Development",
      url: "http://127.0.0.1:5100/health",
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ConnectionStrings__Database: "" },
    },
  ],
});
