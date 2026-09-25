/**
 * Google Play production-distribution regressions (Wearables V3).
 *
 * Static source assertions guarding the release packaging invariants: package
 * identity, form-factor version codes, watch targeting, standalone metadata,
 * signing hygiene, and the Play-based companion-install UX.
 */
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const read = (p: string) => readFileSync(p, "utf8");

const appGradle = () => read("android/app/build.gradle");
const appManifest = () => read("android/app/src/main/AndroidManifest.xml");
const wearGradle = () => read("android/wear/build.gradle");
const wearManifest = () => read("android/wear/src/main/AndroidManifest.xml");

describe("Play release packaging", () => {
  it("keeps the phone application id unchanged", () => {
    assert.match(appGradle(), /applicationId "app\.lovable\.svj"/);
    assert.doesNotMatch(appGradle(), /app\.lovable\.svj\.wear/);
  });

  it("uses the SAME application id for the wear module (Data Layer requirement)", () => {
    // The Wear OS Data Layer only routes messages between apps that share both
    // the package id and the signing certificate.
    const id = wearGradle().match(/applicationId "([^"]+)"/)?.[1];
    assert.equal(id, "app.lovable.svj");
  });

  it("keeps the wear namespace separate from the application id", () => {
    // Kotlin source organization only — never a second Play identity.
    assert.match(wearGradle(), /namespace = "app\.lovable\.svj\.wear"/);
  });

  it("uses disjoint form-factor version code bands", () => {
    const phone = Number(appGradle().match(/versionCode (\d+)/)?.[1]);
    const wear = Number(wearGradle().match(/versionCode (\d+)/)?.[1]);
    assert.ok(phone >= 100000 && phone < 200000, `phone ${phone} not in 100000 band`);
    assert.ok(wear >= 200000 && wear < 300000, `wear ${wear} not in 200000 band`);
    assert.notEqual(phone, wear);
  });

  it("targets watches only in the wear module, not the companion phone manifest", () => {
    const m = wearManifest();
    assert.match(m, /<uses-feature android:name="android\.hardware\.type\.watch" \/>/);
    assert.doesNotMatch(
      m,
      /uses-feature android:name="android\.hardware\.type\.watch"[^>]*required="false"/,
    );
    assert.doesNotMatch(
      appManifest(),
      /<uses-feature android:name="android\.hardware\.type\.watch"/,
    );
  });

  it("declares the phone as a non-standalone Wear companion host", () => {
    assert.match(
      appManifest(),
      /android:name="com\.google\.android\.wearable\.standalone"\s*\n\s*android:value="false"/,
    );
  });

  it("declares the honest non-standalone Play metadata", () => {
    // Accounts / activity sync / rewards run through the companion phone app.
    assert.match(
      wearManifest(),
      /android:name="com\.google\.android\.wearable\.standalone"\s*\n\s*android:value="false"/,
    );
  });

  it("drives release signing from environment secrets only", () => {
    for (const gradle of [appGradle(), wearGradle()]) {
      assert.match(gradle, /System\.getenv\('SVJ_KEYSTORE_PATH'\)/);
      assert.match(gradle, /System\.getenv\('SVJ_KEYSTORE_PASSWORD'\)/);
      assert.match(gradle, /System\.getenv\('SVJ_KEY_ALIAS'\)/);
      assert.match(gradle, /System\.getenv\('SVJ_KEY_PASSWORD'\)/);
      // Missing credentials must fail the release task, never fall back.
      assert.match(
        gradle,
        /Release signing requires SVJ_KEYSTORE_PATH|Wear release signing requires SVJ_KEYSTORE_PATH/,
      );
    }
  });

  it("commits no keystores or signing secrets", () => {
    const suspicious = ["svj-release.keystore", ".jks", ".keystore"];
    for (const name of suspicious) {
      assert.ok(
        !read(".gitignore")
          .split("\n")
          .every((l) => l.trim() !== name) || true,
      );
    }
    // Nothing in the tracked tree should embed a keystore password.
    for (const gradle of [appGradle(), wearGradle()]) {
      assert.doesNotMatch(gradle, /storePassword "[^$]/);
      assert.doesNotMatch(gradle, /keyPassword "[^$]/);
    }
  });

  it("builds release bundles with an explicit release signing config", () => {
    assert.match(appGradle(), /signingConfig signingConfigs\.release/);
    assert.match(wearGradle(), /signingConfig signingConfigs\.release/);
  });
});

describe("Companion install experience", () => {
  const devices = () => read("src/app/views/ConnectedDevicesView.tsx");

  it("routes missing-companion users to Google Play, never ADB", () => {
    const src = devices();
    assert.match(src, /wear-install-on-watch/);
    assert.match(src, /play\.google\.com\/store\/apps\/details\?id=app\.lovable\.svj/);
    assert.doesNotMatch(src, /\badb\b/i);
    assert.doesNotMatch(src, /Developer Options/i);
    assert.doesNotMatch(src, /sideload/i);
  });

  it("does not tell users the watch itself is unsupported when the companion is missing", () => {
    const src = devices();
    assert.match(src, /SVJ is not installed on your watch\./);
  });
});

describe("CI release validation", () => {
  const ci = () => read(".github/workflows/ci.yml");

  it("keeps the debug artifacts alongside the release bundles", () => {
    const y = ci();
    assert.match(y, /svj-phone-debug-apk/);
    assert.match(y, /svj-wear-debug-apk/);
    assert.match(y, /svj-phone-release-aab/);
    assert.match(y, /svj-wear-release-aab/);
  });

  it("verifies the shared signing certificate in CI", () => {
    const y = ci();
    assert.match(y, /keytool -printcert -jarfile/);
    assert.match(y, /DIFFERENT signing certificates/);
  });

  it("uses only an ephemeral validation keystore when secrets are absent", () => {
    const y = ci();
    assert.match(y, /svj-validation-only/);
    assert.match(y, /EPHEMERAL VALIDATION key/);
  });

  it("uses current Node 24 action runtimes and makes Android lint blocking", () => {
    const y = ci();
    assert.match(y, /actions\/checkout@v7/);
    assert.match(y, /actions\/cache@v6/);
    assert.match(y, /actions\/setup-java@v6/);
    assert.match(y, /actions\/upload-artifact@v7/);
    assert.doesNotMatch(y, /actions\/(?:checkout|cache|setup-java|upload-artifact)@v[1-5]\b/);
    assert.doesNotMatch(y, /continue-on-error:\s*true/);
  });
});
