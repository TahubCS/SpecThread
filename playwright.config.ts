import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";

declare const process: {
  env: Record<string, string | undefined>;
};

const baseURL = "http://127.0.0.1:3100";

export default defineConfig({
  globalSetup: "./scripts/build-api.mjs",
  globalTeardown: "./scripts/stop-test-web-database.mjs",
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
        "node scripts/start-test-web.mjs",
      url: baseURL,
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
        BETTER_AUTH_URL: baseURL,
        DATABASE_URL: "postgres://placeholder:placeholder@127.0.0.1:1/offline",
        BETTER_AUTH_DATABASE_URL: "",
        DATABASE_CA_CERT: "",
        BETTER_AUTH_API_KEY: "",
        GITHUB_CLIENT_ID: "",
        GITHUB_CLIENT_SECRET: "",
        GOOGLE_CLIENT_ID: "",
        GOOGLE_CLIENT_SECRET: "",
        EMAIL_DELIVERY: "log",
      },
    },
    {
      command:
        "dotnet app/api/bin/Release/net10.0/SpecThread.Api.dll --urls http://127.0.0.1:5100 --environment Development",
      url: "http://127.0.0.1:5100/health",
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ConnectionStrings__Database: "" },
    },
  ],
});
