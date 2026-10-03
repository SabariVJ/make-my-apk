import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

if (process.env.SVJ_RESPONSIVE_LOCAL !== "1") process.exit(0);

const port = await findAvailablePort();
const wranglerScript = path.resolve("node_modules", "wrangler", "bin", "wrangler.js");
const wrangler = spawn(
  process.execPath,
  [
    wranglerScript,
    "--config",
    path.join(".output", "server", "wrangler.json"),
    "dev",
    "--ip",
    "127.0.0.1",
    "--port",
    String(port),
    "--show-interactive-dev-session=false",
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      XDG_CONFIG_HOME: path.resolve(".wrangler-home"),
      WRANGLER_SEND_METRICS: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let serverOutput = "";
wrangler.stdout.setEncoding("utf8").on("data", (chunk) => (serverOutput += chunk));
wrangler.stderr.setEncoding("utf8").on("data", (chunk) => (serverOutput += chunk));
let serverExit;
wrangler.once("close", (code, signal) => {
  serverExit = { code, signal };
});

try {
  const html = await fetchBuiltDocument(
    `http://127.0.0.1:${port}/?tab=challenges&responsiveNativeSmoke=1`,
  );
  if (!html.includes('name="svj-build-revision"')) {
    throw new Error("Built HTML is missing the SVJ build revision marker.");
  }

  const clientDirectory = path.join("dist", "client");
  await mkdir(clientDirectory, { recursive: true });
  await cp(path.join(".output", "public"), clientDirectory, { recursive: true, force: true });
  await writeFile(path.join(clientDirectory, "index.html"), html);
  process.stdout.write("Prepared the local responsive-test bundle for Capacitor.\n");
} finally {
  wrangler.kill("SIGTERM");
}

async function findAvailablePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  if (!address || typeof address === "string") {
    probe.close();
    throw new Error("Could not allocate a local port for the responsive bundle.");
  }
  await new Promise((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function fetchBuiltDocument(url) {
  const deadline = Date.now() + 120_000;
  let lastError;
  while (Date.now() < deadline) {
    if (serverExit) {
      throw new Error(
        `Wrangler exited before serving the built app (${JSON.stringify(serverExit)}).\n${serverOutput}`,
      );
    }
    try {
      const response = await fetch(url);
      const html = await response.text();
      if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
        return html;
      }
      lastError = new Error(`Wrangler returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  throw new Error(`Timed out loading the built app. ${lastError ?? ""}\n${serverOutput}`);
}
