import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(path, "utf8");
}

describe("final release hardening", { concurrency: false }, () => {
  it("loads the Framer celebration only in the browser with a native fallback", async () => {
    const [frame, modal] = await Promise.all([
      source("src/app/components/FramerLevelUp.tsx"),
      source("src/app/components/LevelUpModal.tsx"),
    ]);
    assert.match(frame, /https:\/\/framer\.com\/m\/Forged-gK9Ssu\.js@HF3NoCK8a3lBwTeVSaXp/);
    assert.doesNotMatch(frame, /import\s+Forged\s+from\s+["']https:/);
    assert.match(
      frame,
      /useEffect\(\(\) => \{[\s\S]*setDocument\(createFramerLevelUpDocument\(level\)\)/,
    );
    assert.match(frame, /sandbox="allow-scripts"/);
    assert.match(frame, /if \(reducedMotion\) return/);
    assert.match(modal, /fallback={<NativeLevelUp level={levelUpModalData\.newLevel} \/>}/);
  });

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

  it("classifies Paywall Plus status from server membership state", async () => {
    const [context, paywall] = await Promise.all([
      source("src/app/context/SVJContext.tsx"),
      source("src/app/components/PaywallModal.tsx"),
    ]);
    assert.match(context, /plusActive: boolean \| null/);
    assert.match(context, /plusActive,/);
    assert.match(paywall, /plusActive,/);
    assert.match(paywall, /const hasActivePlus = plusActive === true/);
    assert.doesNotMatch(paywall, /const hasActivePlus = user\.isPremium === true/);
    assert.match(paywall, /plusActive === null && hasFuturePlusExpiry/);
    assert.match(paywall, /SVJ Plus Active/);
    assert.match(paywall, /Your previous SVJ Plus membership has expired/);
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

  it("does not permit cleartext hosting or Android app-data backup", async () => {
    const [config, manifest] = await Promise.all([
      source("capacitor.config.ts"),
      source("android/app/src/main/AndroidManifest.xml"),
    ]);
    assert.match(config, /url: "https:\/\/savaje-com\.lovable\.app"/);
    assert.match(config, /cleartext: false/);
    assert.match(manifest, /android:allowBackup="false"/);
  });
});
