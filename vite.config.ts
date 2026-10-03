// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { loadEnv } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { execFileSync } from "node:child_process";

// ── Production Supabase project (authoritative SVJ backend) ─────────────────
// The ONLY Supabase project the app is allowed to talk to. A URL/project ID is
// public information, so a fallback here is safe.
const PROD_SUPABASE_URL = "https://oltmnrkceodpyqznfhjb.supabase.co";
const PROD_SUPABASE_PROJECT_ID = "oltmnrkceodpyqznfhjb";

const buildRevision = (() => {
  const configured = process.env.GITHUB_SHA ?? process.env.VITE_APP_REVISION;
  if (configured) return configured.slice(0, 12);
  try {
    const revision = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return dirty ? `${revision}-dirty` : revision;
  } catch {
    return "local-unknown";
  }
})();

// Load .env* files (dev/preview) AND the real process environment (build
// servers inject VITE_* here). Precedence: process env > .env files >
// safe production fallback (URL/project ID/key).
const env = loadEnv(
  process.env.NODE_ENV === "production" ? "production" : "development",
  process.cwd(),
  "",
);

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: {
      "import.meta.env.VITE_APP_REVISION": JSON.stringify(buildRevision),
      // Publishable backend config, baked in at build time.
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
        process.env["VITE_SUPABASE_URL"] ?? env.VITE_SUPABASE_URL ?? PROD_SUPABASE_URL,
      ),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
          env.VITE_SUPABASE_PUBLISHABLE_KEY ??
          "sb_publishable_JbQU0vfJC2iQsnTg08N3XQ_hVBxK8DR",
      ),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(
        process.env["VITE_SUPABASE_PROJECT_ID"] ??
          env.VITE_SUPABASE_PROJECT_ID ??
          PROD_SUPABASE_PROJECT_ID,
      ),
    },
  },
});
