/**
 * Support-email regressions: Email Us must work reliably on native Android
 * (VjSupport intent plugin) and in browser previews (Gmail compose + copy
 * fallback), never relying on a bare mailto anchor alone.
 */
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const profile = readFileSync("src/app/views/ProfileView.tsx", "utf8");
const support = readFileSync("src/app/lib/supportEmail.ts", "utf8");
const mainActivity = readFileSync(
  "android/app/src/main/java/app/lovable/svj/MainActivity.java",
  "utf8",
);
const plugin = readFileSync(
  "android/app/src/main/java/app/lovable/svj/VjSupportPlugin.java",
  "utf8",
);

describe("support email (Profile → Email Us)", () => {
  it("Profile uses a button, not a raw mailto anchor", () => {
    assert.match(profile, /onClick=\{handleEmailSupport\}/);
    assert.doesNotMatch(profile, /href="mailto:/);
  });

  it("support address and subject are correct", () => {
    assert.match(support, /SUPPORT_EMAIL = "sabarivj777@gmail\.com"/);
    assert.match(support, /SUPPORT_SUBJECT = "SVJ Support \/ Account Verification"/);
  });

  it("native Android uses the VjSupport plugin", () => {
    assert.match(support, /registerPlugin<VjSupportPlugin>\("VjSupport"\)/);
    assert.match(support, /Capacitor\.isNativePlatform\(\)/);
    assert.match(plugin, /@CapacitorPlugin\(name = "VjSupport"\)/);
    assert.match(plugin, /Intent\.ACTION_SENDTO/);
    assert.match(plugin, /ActivityNotFoundException/);
  });

  it("plugin registered in MainActivity before super.onCreate", () => {
    const registerIdx = mainActivity.indexOf("registerPlugin(VjSupportPlugin.class)");
    const superIdx = mainActivity.indexOf("super.onCreate(savedInstanceState)");
    assert.ok(registerIdx > -1, "VjSupportPlugin registered");
    assert.ok(superIdx > registerIdx, "registered before super.onCreate()");
  });

  it("web path opens Gmail compose with URLSearchParams encoding", () => {
    assert.match(support, /new URL\("https:\/\/mail\.google\.com\/mail\/"\)/);
    assert.match(support, /searchParams\.set\("view", "cm"\)/);
    assert.match(support, /searchParams\.set\("su", subject\)/);
    assert.match(support, /window\.open\(composeUrl, "_blank", "noopener,noreferrer"\)/);
  });

  it("popup/native failure surfaces the copy fallback", () => {
    assert.match(support, /copyEmail\(\)/);
    assert.match(support, /"copied"/);
    assert.match(profile, /Copy support email|Copy email/);
    assert.match(profile, /sabarivj777@gmail\.com/);
  });

  it("never sends email automatically", () => {
    assert.doesNotMatch(plugin, /SEND_MULTIPLE|send\(|ACTION_SEND"/);
    assert.doesNotMatch(support, /smtp|SMTP/);
  });

  it("no new manifest permissions added", () => {
    const manifest = readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");
    assert.doesNotMatch(manifest, /android\.permission\.(READ_CONTACTS|GET_ACCOUNTS|SEND_SMS)/);
  });

  it("button shows opening feedback and is disabled while pending", () => {
    assert.match(profile, /Opening email\.\.\./);
    assert.match(profile, /disabled=\{supportState === "opening"\}/);
  });
});
