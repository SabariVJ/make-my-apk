// SVJ is a self-contained platform: it records and owns its own activity data.
// This suite pins two things statically:
//
//   1. No external fitness provider integration (Strava or otherwise) survives
//      anywhere in runtime/source code — no OAuth route, no sync/token/webhook
//      module, no provider-branded UI, no provider-specific env vars.
//   2. The native SVJ activity platform is actually present and wired: the
//      Android foreground workout service, the Health Connect bridge, and the
//      public Live Share page.
//
// It reads shipped source only; it never touches the network or a database.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      out.push(...(await walk(full)));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

async function exists(relativePath) {
  try {
    await stat(join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

const SOURCE_DIRS = ["src", "android/app/src/main/java", "supabase/migrations"];

// The specific integration surface the removed commit introduced. Any of these
// returning would mean an external provider is wired back into SVJ.
const FORBIDDEN = [
  { pattern: /\bstrava\b/i, why: "Strava branding/reference" },
  { pattern: /STRAVA_[A-Z_]+/, why: "provider-specific environment variable" },
  { pattern: /svj_strava_/i, why: "provider-specific database object" },
  { pattern: /strava[._-]?callback/i, why: "provider OAuth callback route" },
  { pattern: /provider[_ -]?webhook/i, why: "external provider webhook" },
  {
    pattern: /(garmin|fitbit|wahoo|whoop|coros|suunto)\b/i,
    why: "external fitness provider reference",
  },
];

describe("no external fitness provider integration remains", () => {
  it("no provider references exist in runtime source or migrations", async () => {
    const offenders = [];
    for (const dir of SOURCE_DIRS) {
      for (const file of await walk(join(root, dir))) {
        if (!/\.(ts|tsx|js|jsx|mjs|java|kt|sql|json|xml)$/.test(file)) continue;
        const source = await readFile(file, "utf8");
        for (const { pattern, why } of FORBIDDEN) {
          if (pattern.test(source)) {
            offenders.push(`${file.slice(root.length)}: ${why}`);
          }
        }
      }
    }
    assert.deepEqual(offenders, [], `provider integration found:\n${offenders.join("\n")}`);
  });

  it("no provider OAuth callback route or provider module exists", async () => {
    const routeFiles = await readdir(join(root, "src/routes"));
    assert.equal(
      routeFiles.some((name) => /(strava|garmin|fitbit|wahoo|whoop|coros|suunto)/i.test(name)),
      false,
      "an external provider route file is present",
    );
    const libFiles = await readdir(join(root, "src/app/lib"));
    assert.equal(
      libFiles.some((name) => /(strava|garmin|fitbit|wahoo|whoop|coros|suunto)/i.test(name)),
      false,
      "an external provider client module is present",
    );
  });

  it("the generated route tree contains no provider route", async () => {
    const tree = await readFile(join(root, "src/routeTree.gen.ts"), "utf8");
    assert.doesNotMatch(tree, /strava/i);
  });
});

describe("the native SVJ activity platform is wired", () => {
  it("the Android foreground workout service and plugin exist", async () => {
    assert.ok(await exists("android/app/src/main/java/app/lovable/svj/VjWorkoutService.java"));
    assert.ok(await exists("android/app/src/main/java/app/lovable/svj/VjWorkoutPlugin.java"));
  });

  it("the Health Connect bridge exists", async () => {
    assert.ok(await exists("android/app/src/main/java/app/lovable/svj/VjHealthConnectPlugin.kt"));
  });

  it("MainActivity registers both app-local native plugins", async () => {
    const main = await readFile(
      join(root, "android/app/src/main/java/app/lovable/svj/MainActivity.java"),
      "utf8",
    );
    assert.match(main, /registerPlugin\(VjWorkoutPlugin\.class\)/);
    assert.match(main, /registerPlugin\(VjHealthConnectPlugin\.class\)/);
    // Registration must happen before the bridge is built.
    assert.ok(
      main.indexOf("registerPlugin(VjWorkoutPlugin.class)") <
        main.indexOf("super.onCreate(savedInstanceState)"),
    );
  });

  it("the foreground service is declared with a location type", async () => {
    const manifest = await readFile(join(root, "android/app/src/main/AndroidManifest.xml"), "utf8");
    assert.match(manifest, /android:name="\.VjWorkoutService"/);
    assert.match(manifest, /foregroundServiceType="location"/);
    assert.match(manifest, /android\.permission\.FOREGROUND_SERVICE_LOCATION/);
    assert.match(manifest, /android\.permission\.ACCESS_FINE_LOCATION/);
  });

  it("background location is NOT requested (foreground service is sufficient)", async () => {
    const manifest = await readFile(join(root, "android/app/src/main/AndroidManifest.xml"), "utf8");
    assert.doesNotMatch(manifest, /ACCESS_BACKGROUND_LOCATION/);
  });

  it("the plugin declares no permission SVJ cannot use", async () => {
    const plugin = await readFile(
      join(root, "android/app/src/main/java/app/lovable/svj/VjWorkoutPlugin.java"),
      "utf8",
    );
    // The bridge must not declare or request background location either.
    assert.doesNotMatch(
      plugin,
      /requestPermissionForAlias\("backgroundLocation"/,
      "background location must never be requested",
    );
  });

  it("location is only collected between an explicit start and stop", async () => {
    const service = await readFile(
      join(root, "android/app/src/main/java/app/lovable/svj/VjWorkoutService.java"),
      "utf8",
    );
    // The service must create a persistent recording notification...
    assert.match(service, /SVJ is recording your activity/);
    // ...and must not start collecting before an explicit start command.
    assert.match(service, /if \(!active \|\| paused \|\| location == null\) return;/);
  });
});

describe("Health Connect is read-only and matches the supported record types", () => {
  const manifestPath = join(root, "android/app/src/main/AndroidManifest.xml");

  // One manifest permission per record type the Kotlin bridge can read.
  const REQUIRED_READ_PERMISSIONS = [
    "android.permission.health.READ_STEPS",
    "android.permission.health.READ_DISTANCE",
    "android.permission.health.READ_EXERCISE",
    "android.permission.health.READ_HEART_RATE",
    "android.permission.health.READ_RESTING_HEART_RATE",
    "android.permission.health.READ_SLEEP",
    "android.permission.health.READ_TOTAL_CALORIES_BURNED",
    "android.permission.health.READ_WEIGHT",
  ];

  it("declares every READ permission for the supported record types", async () => {
    const manifest = await readFile(manifestPath, "utf8");
    const missing = REQUIRED_READ_PERMISSIONS.filter(
      (permission) => !manifest.includes(`<uses-permission android:name="${permission}" />`),
    );
    assert.deepEqual(missing, [], "missing Health Connect read permissions");
  });

  it("declares NO Health Connect write permission", async () => {
    const manifest = await readFile(manifestPath, "utf8");
    assert.doesNotMatch(manifest, /android\.permission\.health\.WRITE_/);
  });

  it("declares the required permission-rationale activity", async () => {
    const manifest = await readFile(manifestPath, "utf8");
    assert.match(manifest, /androidx\.health\.ACTION_SHOW_PERMISSIONS_RATIONALE/);
    assert.match(manifest, /VIEW_PERMISSION_USAGE/);
    assert.match(manifest, /android\.intent\.category\.HEALTH_PERMISSIONS/);
  });

  it("the rationale activity reuses SVJ's own privacy destination", async () => {
    const rationale = await readFile(
      join(root,
        "android/app/src/main/java/app/lovable/svj/HealthPermissionsRationaleActivity.java"),
      "utf8",
    );
    assert.match(rationale, /app\.lovable\.svj:\/\/privacy/);
    // And SVJ ships that privacy destination in the router.
    await stat(join(root, "src/routes/privacy.tsx"));
  });

  it("no background health read is declared or implemented", async () => {
    const manifest = await readFile(manifestPath, "utf8");
    assert.doesNotMatch(manifest, /READ_HEALTH_DATA_IN_BACKGROUND/);
    const plugin = await readFile(
      join(root, "android/app/src/main/java/app/lovable/svj/VjHealthConnectPlugin.kt"),
      "utf8",
    );
    assert.doesNotMatch(plugin, /BackgroundRead|backgroundRead/);
  });

  it("the Kotlin bridge has no duplicate imports and never writes", async () => {
    const plugin = await readFile(
      join(root, "android/app/src/main/java/app/lovable/svj/VjHealthConnectPlugin.kt"),
      "utf8",
    );
    const importLines = plugin
      .split("\n")
      .filter((line) => /^import /.test(line));
    assert.equal(new Set(importLines).size, importLines.length, "duplicate import found");
    // Read-only: insert/update/delete of Health Connect records must not exist.
    assert.doesNotMatch(plugin, /insertRecords|updateRecords|deleteRecords|WriteRecordsRequest/);
    // Revocation is respected: the grant is re-read before every read.
    assert.match(plugin, /grantedPermissions\(\)/);
  });

  it("the client type list matches the manifest permission families", async () => {
    const bridge = await readFile(join(root, "src/app/lib/healthConnect.ts"), "utf8");
    for (const type of [
      "steps", "distance", "exerciseSessions", "heartRate",
      "restingHeartRate", "sleep", "calories", "weight",
    ]) {
      assert.ok(bridge.includes(`"${type}"`), `client type list is missing ${type}`);
    }
  });
});

describe("SVJ Live Share is public and identity-free", () => {
  it("the /live/$token route exists and only uses the public share reader", async () => {
    const source = await readFile(join(root, "src/routes/live.$token.tsx"), "utf8");
    assert.match(source, /createFileRoute\("\/live\/\$token"\)/);
    assert.match(source, /fetchPublicLiveShare/);
    // The public page must not pull in auth or session machinery.
    assert.doesNotMatch(source, /RequireAuth/);
    assert.doesNotMatch(source, /supabase\.auth/);
    assert.doesNotMatch(source, /getSession\(/);
    // Nor may it reach for any owner-only share RPC.
    assert.doesNotMatch(source, /svj_get_my_live_share/);
    assert.doesNotMatch(source, /svj_update_live_share/);
  });

  it("the public reader RPC is granted to anon and exposes no identity", async () => {
    const sql = await readFile(
      join(root, "supabase/migrations/20260923020000_native_activity_live_share.sql"),
      "utf8",
    );
    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.svj_get_public_live_share\(text\) TO anon, authenticated/,
    );
    assert.doesNotMatch(sql, /'user_id',\s*v_share\.user_id/);
  });
});
