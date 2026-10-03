import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const appPath = "src/app/App.tsx";
const original = await readFile(appPath, "utf8");
await writeFile("performance-App-backup.txt", original);
const eager = original.replace(
  /const (\w+) = lazy\(\s*\(\) =>\s*import\("([^"]+)"\)[\s\S]*?\n\);/g,
  (_, name, path) => `import { ${name} } from "${path}";`,
);
if (eager === original) throw new Error("Lazy screen baseline not found");
const executable = process.env.SVJ_BUN_EXECUTABLE || "bun";
async function run(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: "ignore", windowsHide: true });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("Build failed"))));
    child.on("error", reject);
  });
}
const results = [];
let server;
async function stopServer() {
  if (!server) return;
  if (process.platform === "win32")
    await new Promise((resolve) => {
      const stop = spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      stop.on("exit", resolve);
    });
  else server.kill("SIGTERM");
  server = null;
}
try {
  for (const [variant, source] of [
    ["before: eager screens", eager],
    ["after: lazy screens", original],
  ]) {
    await writeFile(appPath, source);
    await run(["run", "build:responsive"]);
    server = spawn(executable, ["run", "preview:responsive"], {
      stdio: "ignore",
      windowsHide: true,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    });
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      try {
        const response = await fetch("http://127.0.0.1:4173");
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!ready) throw new Error("Preview did not start");
    const browser = await chromium.launch();
    try {
      const samples = [];
      for (let i = 0; i < 3; i++) {
        const context = await browser.newContext({
          baseURL: "http://127.0.0.1:4173",
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 2,
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        await page.route("**/*", (route) =>
          new URL(route.request().url()).origin === "http://127.0.0.1:4173"
            ? route.continue()
            : route.abort(),
        );
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
        await cdp.send("Network.emulateNetworkConditions", {
          offline: false,
          latency: 150,
          downloadThroughput: 1600000 / 8,
          uploadThroughput: 750000 / 8,
        });
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        let bytes = 0;
        cdp.on("Network.loadingFinished", (event) => {
          bytes += event.encodedDataLength;
        });
        const start = performance.now();
        await page.goto("/?tab=challenges", { waitUntil: "domcontentloaded" });
        await page
          .locator('[data-responsive-screen="challenges"]')
          .waitFor({ state: "visible", timeout: 90000 });
        samples.push({ readyMs: Math.round(performance.now() - start), transferredBytes: bytes });
        await context.close();
      }
      results.push({ variant, samples });
    } finally {
      await browser.close();
    }
    // Stop the entire helper tree on Windows, or its process group on Unix.
    await stopServer();
  }
} finally {
  await writeFile(appPath, original);
  await stopServer();
}
await writeFile(
  "performance-loading.json",
  JSON.stringify(
    {
      scope: "Controlled Chromium browser profile; not a physical-phone timing claim",
      profile: {
        viewport: "390x844",
        deviceScaleFactor: 2,
        cpuSlowdown: 4,
        latencyMs: 150,
        downloadMbps: 1.6,
        uploadMbps: 0.75,
        cache: "disabled",
        backend: "deterministic responsive session",
        samples: 3,
      },
      results,
    },
    null,
    2,
  ) + "\n",
);
process.stdout.write(JSON.stringify(results) + "\n");
