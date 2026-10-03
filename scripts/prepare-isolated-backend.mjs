import { copyFile, writeFile, readdir, readFile, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";

if (process.env.CI !== "true") throw new Error("Disposable CI checkout required");

// CI creates disposable local services. Never link or reset the hosted project.
await writeFile(
  "supabase/config.toml",
  `project_id = "svj-stability-ci"
[api]
port = 54321
[db]
port = 54322
major_version = 17
[auth]
site_url = "http://127.0.0.1:4174"
additional_redirect_urls = ["http://127.0.0.1:4174/auth/callback", "svj://auth/callback"]
[auth.email]
enable_confirmations = false
`,
);
await copyFile(
  "supabase/pending/20260902_earned_plus.sql",
  "supabase/migrations/20260919000000_ci_earned_plus.sql",
);
await copyFile(
  "supabase/pending/20260903_earned_plus_qualifying_days_7.sql",
  "supabase/migrations/20260919010000_ci_earned_plus_days.sql",
);
// Historical migrations contain duplicate 8-digit versions. Do not rewrite
// published history: assign temporary CLI versions to the same ordered SQL
// exclusively in this disposable checkout, and keep a content-hash manifest.
const names = (await readdir("supabase/migrations")).filter((name) => name.endsWith(".sql")).sort();
const migrationSources = await Promise.all(
  names.map(async (name) => ({ name, sql: await readFile(`supabase/migrations/${name}`) })),
);
const manifest = [];
for (let i = 0; i < migrationSources.length; i++) {
  const { name, sql } = migrationSources[i];
  const version = new Date(Date.UTC(2000, 0, 1, 0, 0, i))
    .toISOString()
    .replace(/\D/g, "")
    .slice(0, 14);
  const temporary = `${version}_ci_${name}`;
  await unlink(`supabase/migrations/${name}`);
  await writeFile(`supabase/migrations/${temporary}`, sql);
  manifest.push({
    source: name,
    temporary,
    sha256: createHash("sha256").update(sql).digest("hex"),
  });
}
await writeFile("isolated-migration-manifest.json", JSON.stringify(manifest, null, 2) + "\n");
