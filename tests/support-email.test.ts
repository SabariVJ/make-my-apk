/**
 * Support-email regressions: the native/web support-email helper must keep
 * working reliably on native Android (VjSupport intent plugin) and in browser
 * previews (Gmail compose + copy fallback), never relying on a bare mailto
 * anchor alone. Profile itself now raises in-app tickets, so that hand-off is
 * pinned here too.
 */
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const profile = readFileSync("src/app/views/ProfileView.tsx", "utf8");
const support = readFileSync("src/app/lib/supportEmail.ts", "utf8");
const tickets = readFileSync("src/app/components/SupportTickets.tsx", "utf8");
const mainActivity = readFileSync(
  "android/app/src/main/java/app/lovable/svj/MainActivity.java",
  "utf8",
);
const plugin = readFileSync(
  "android/app/src/main/java/app/lovable/svj/VjSupportPlugin.java",
  "utf8",
);

describe("support email helper (native + web)", () => {
  it("never ships a raw mailto anchor in Profile", () => {
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
  });

  it("falls back to a mailto redirect when the compose popup is blocked", () => {
    assert.match(support, /window\.location\.href = buildMailtoUrl/);
  });

  it("never sends email automatically", () => {
    assert.doesNotMatch(plugin, /SEND_MULTIPLE|send\(|ACTION_SEND"/);
    assert.doesNotMatch(support, /smtp|SMTP/);
  });

  it("no new manifest permissions added", () => {
    const manifest = readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");
    assert.doesNotMatch(manifest, /android\.permission\.(READ_CONTACTS|GET_ACCOUNTS|SEND_SMS)/);
  });
});

describe("Profile raises in-app tickets instead of email", () => {
  it("mounts the raise-ticket form and the ticket list", () => {
    assert.match(profile, /<RaiseTicketForm \/>/);
    assert.match(profile, /<MyTicketsList \/>/);
    assert.match(profile, /My Tickets/);
  });

  it("drops the old Email Us handler and its pending state", () => {
    assert.doesNotMatch(profile, /handleEmailSupport|supportState|Copy support email/);
  });

  it("both surfaces go through the ticket server functions", () => {
    assert.match(tickets, /createSupportTicket/);
    assert.match(tickets, /listMySupportTickets/);
  });
});
