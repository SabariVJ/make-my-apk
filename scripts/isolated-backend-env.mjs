import { execFileSync } from "node:child_process";
import { appendFile, writeFile } from "node:fs/promises";
const status = JSON.parse(
  execFileSync("supabase", ["status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
if (new URL(status.API_URL).hostname !== "127.0.0.1") throw new Error("Local services required");
const env = {
  SUPABASE_URL: status.API_URL,
  SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  VITE_SUPABASE_URL: status.API_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
  VITE_SUPABASE_PROJECT_ID: "svj-stability-ci",
  SVJ_TEST_DATABASE_URL: status.DB_URL,
};
for (const key of [status.SERVICE_ROLE_KEY, status.ANON_KEY])
  process.stdout.write(`::add-mask::${key}\n`);
await appendFile(
  process.env.GITHUB_ENV,
  Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n") + "\n",
);
await writeFile(
  ".dev.vars",
  Object.entries(env)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join("\n") + "\n",
);
