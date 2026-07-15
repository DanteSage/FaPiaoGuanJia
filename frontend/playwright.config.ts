import { defineConfig } from "@playwright/test";

const previewCommand = process.platform === "win32"
  ? "npm.cmd run build && npm.cmd run preview:e2e"
  : "npm run build && npm run preview:e2e";

export default defineConfig({
  testDir: "./src/tests/e2e",
  testMatch: ["**/*.e2e.ts"],
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
  },
  webServer: {
    command: previewCommand,
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
