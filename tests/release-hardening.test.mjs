import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(path, "utf8");
}

describe("final release hardening", { concurrency: false }, () => {
  it("keeps account creation and legal terms aligned to an adult-only service", async () => {
    const [auth, terms, checklist] = await Promise.all([
      source("src/app/components/AuthScreen.tsx"),
      source("src/routes/terms.tsx"),
      source("PLAY_RELEASE_CHECKLIST.md"),
    ]);
    assert.match(auth, /18 or older/);
    assert.match(auth, /This is a declaration, not\s*\/\/ identity verification/);
    assert.match(terms, /at least 18 years old/);
    assert.doesNotMatch(terms, /at least 13 years old/);
    assert.doesNotMatch(checklist, /13\+ recommended/);
  });

  it("describes Plus as a one-time manually activated purchase", async () => {
    const paywall = await source("src/app/components/PaywallModal.tsx");
    assert.match(paywall, /One-time payment/);
    assert.match(paywall, /No auto-renewal/);
    assert.match(paywall, /turned\s*on manually after the payment is verified/);
    assert.match(paywall, /activate your SVJ Plus access/);
    assert.doesNotMatch(paywall, /activate your subscription/);
  });

  it("ships a Play Console data-deletion path backed by the real deletion flow", async () => {
    const [route, tree, page, checklist] = await Promise.all([
      source("src/routes/data-deletion.tsx"),
      source("src/routeTree.gen.ts"),
      source("src/routes/delete-account.tsx"),
      source("PLAY_RELEASE_CHECKLIST.md"),
    ]);
    assert.match(route, /createFileRoute\("\/data-deletion"\)/);
    assert.match(route, /<DeleteAccountPage \/>/);
    assert.match(tree, /DataDeletionRoute/);
    assert.match(page, /deleteAccount\(\{ data: \{ confirmation \} \}\)/);
    assert.match(checklist, /\/data-deletion/);
  });

  it("packages the built app locally and disables Android app-data backup", async () => {
    const [config, manifest] = await Promise.all([
      source("capacitor.config.ts"),
      source("android/app/src/main/AndroidManifest.xml"),
    ]);
    assert.match(config, /webDir: "dist\/client"/);
    assert.doesNotMatch(config, /server:\s*\{/);
    assert.doesNotMatch(config, /savaje-com\.lovable\.app/);
    assert.match(manifest, /android:allowBackup="false"/);
  });

  it("registers native notifications and the first-run permission setup", async () => {
    const [main, manifest, app, setup] = await Promise.all([
      source("android/app/src/main/java/app/lovable/svj/MainActivity.java"),
      source("android/app/src/main/AndroidManifest.xml"),
      source("src/app/App.tsx"),
      source("src/app/components/NativePermissionSetup.tsx"),
    ]);
    assert.match(main, /registerPlugin\(VjNotificationsPlugin\.class\)/);
    assert.match(manifest, /VjNotificationReceiver/);
    assert.match(app, /<NativePermissionSetup \/>/);
    for (const label of [
      "Physical activity",
      "Notifications",
      "Health & fitness",
      "Location",
      "Nearby devices & Bluetooth",
    ]) {
      assert.match(setup, new RegExp(label.replace(/[&]/g, "\\&")));
    }
  });
});
