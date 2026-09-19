import { spawnSync } from "node:child_process";

const connectionString = process.env.SVJ_REWARD_TEST_DATABASE_URL;
if (!connectionString) {
  console.error("SVJ_REWARD_TEST_DATABASE_URL must point to an ephemeral local svj_rewards_test database.");
  process.exit(2);
}

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", "tests/engagement-db.test.mjs"], {
  env: { ...process.env, SVJ_REWARD_REQUIRE_NATIVE: "true" },
  stdio: "inherit",
});
process.exit(result.status ?? 1);
