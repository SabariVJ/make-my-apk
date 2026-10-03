import { copyFile } from "node:fs/promises";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(process.env.SUPABASE_URL).hostname))
  throw new Error("Isolated preview refuses hosted backend credentials");
// Wrangler resolves secrets beside its generated config, outside public assets.
await copyFile(".dev.vars", ".output/server/.dev.vars");
