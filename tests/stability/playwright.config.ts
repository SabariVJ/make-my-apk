import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
export default defineConfig({
  testDir: ".",
  testMatch: "backend.spec.mjs",
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 25_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4174",
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  webServer: {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    command:
      "bun run build && node scripts/prepare-isolated-preview.mjs && bunx wrangler --config .output/server/wrangler.json dev --ip 127.0.0.1 --port 4174 --show-interactive-dev-session=false",
    url: "http://127.0.0.1:4174",
    timeout: 180_000,
    reuseExistingServer: false,
    env: { WRANGLER_SEND_METRICS: "false" },
  },
});
