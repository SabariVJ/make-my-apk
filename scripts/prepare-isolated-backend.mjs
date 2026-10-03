import { copyFile, writeFile } from "node:fs/promises";

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
