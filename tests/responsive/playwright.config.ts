import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const baseURL = "http://127.0.0.1:4173";

export default defineConfig({
  testDir: ".",
  testMatch: "geometry.spec.ts",
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], browserName: "chromium" } },
    { name: "webkit", use: { ...devices["Desktop Safari"], browserName: "webkit" } },
  ],
  webServer: {
    command: "bun run build:responsive && bun run preview:responsive",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { XDG_CONFIG_HOME: resolve(".wrangler-home"), WRANGLER_SEND_METRICS: "false" },
  },
});
