// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { loadEnv } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// ── Production Supabase project (authoritative SVJ backend) ─────────────────
// The ONLY Supabase project the app is allowed to talk to. A URL/project ID is
// public information, so a fallback here is safe.
const PROD_SUPABASE_URL = "https://oltmnrkceodpyqznfhjb.supabase.co";
const PROD_SUPABASE_PROJECT_ID = "oltmnrkceodpyqznfhjb";

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
