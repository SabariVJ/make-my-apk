/**
 * Branded blocking-state regressions:
 *  - one shared StatusScreen used by 404, crash, offline and session expiry
 *  - offline state comes from real online/offline events and auto-dismisses
 *  - session expiry is detected from real auth errors, not guessed
 *  - retry/go-home behaviour is preserved from the old unbranded boundary
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isSessionExpiredError } from "../src/app/lib/sessionExpired";

const status = readFileSync("src/app/components/StatusScreen.tsx", "utf8");
const root = readFileSync("src/routes/__root.tsx", "utf8");
const app = readFileSync("src/app/App.tsx", "utf8");
const gate = readFileSync("src/app/components/TrialGate.tsx", "utf8");
const online = readFileSync("src/app/lib/useOnlineStatus.ts", "utf8");

describe("StatusScreen", () => {
  it("is the single branded screen with the SVJ design tokens", () => {
    // A real full-viewport gate using the dynamic viewport unit, so the centred
    // card is never measured against a browser-chrome-inflated 100vh.
    assert.match(status, /min-h-\[100dvh\]/);
    assert.match(status, /bg-\[#0B0B0C\]/);
    // A real elevation step rather than one flat card shell shared with
    // ordinary content, and a lit top edge so near-black surfaces read as lit.
    assert.match(status, /svj-radius-card svj-lit-top svj-elev-3/);
    assert.match(status, /bg-\[#17171A\]/);
    assert.match(status, /font-inter text-xl font-semibold/); // sentence-case title
    assert.doesNotMatch(status, /font-anton/); // caps headings are badge-only now
    assert.match(status, /font-inter/); // Inter body
    assert.match(status, /bg-\[#C81E3A\] hover:bg-\[#A0182E\]/); // crimson primary
  });

  it("supports icon, title, message, primary and optional secondary actions", () => {
    assert.match(status, /icon: LucideIcon/);
    assert.match(status, /primaryAction\?: StatusAction/);
    assert.match(status, /secondaryAction\?: StatusAction/);
    assert.match(status, /tone\?: Tone/);
  });
});

describe("root route blocking states", () => {
  it("404 uses StatusScreen and keeps a go-home path", () => {
    assert.match(root, /notFoundComponent: NotFoundComponent/);
    const notFound = root.slice(root.indexOf("function NotFoundComponent"));
    assert.match(notFound.slice(0, 900), /<StatusScreen/);
    assert.match(notFound.slice(0, 900), /Go home/);
  });

  it("crash boundary keeps retry + go-home and reports the error", () => {
    assert.match(root, /errorComponent: ErrorComponent/);
    const crash = root.slice(root.indexOf("function ErrorComponent"));
    assert.match(crash.slice(0, 1600), /<StatusScreen/);
    assert.match(crash.slice(0, 1600), /router\.invalidate\(\)/);
    assert.match(crash.slice(0, 1600), /reset\(\)/);
    assert.match(crash.slice(0, 1600), /reportLovableError/);
    assert.match(crash.slice(0, 1600), /Go home/);
  });

  it("no unbranded bg-background error markup remains", () => {
    assert.doesNotMatch(root, /text-7xl font-bold/);
    assert.doesNotMatch(root, /bg-background px-4/);
  });
});

describe("no-internet state", () => {
  it("listens for real browser online/offline events", () => {
    assert.match(online, /addEventListener\("online"/);
    assert.match(online, /addEventListener\("offline"/);
    assert.match(online, /navigator\.onLine/);
  });

  it("renders StatusScreen with the required copy and a retry action", () => {
    assert.match(app, /testId="no-internet-screen"/);
    assert.match(app, /No connection — check your internet and try again\./);
    assert.match(app, /label: "Retry"/);
    assert.match(app, /useOnlineStatus\(\)/);
  });

  it("auto-dismisses when the connection returns", () => {
    // The gate is purely state-driven: restoring `online` re-renders the app.
    const gateBlock = app.slice(app.indexOf("if (!online)"), app.indexOf("if (sessionExpired"));
    assert.ok(gateBlock.length > 0);
    assert.doesNotMatch(gateBlock, /sessionExpired = false/);
  });
});

describe("session-expired state", () => {
  it("detects expired/invalid sessions from real auth errors", () => {
    assert.equal(isSessionExpiredError({ status: 401 }), true);
    assert.equal(isSessionExpiredError(new Error("JWT expired")), true);
    assert.equal(isSessionExpiredError(new Error("Invalid Refresh Token")), true);
    assert.equal(isSessionExpiredError({ name: "AuthSessionMissingError" }), true);
    assert.equal(isSessionExpiredError({ cause: { statusCode: 401 } }), true);
    assert.equal(isSessionExpiredError(new Error("Network request failed")), false);
    assert.equal(isSessionExpiredError(null), false);
    assert.equal(isSessionExpiredError(undefined), false);
  });

  it("does not treat a deliberate sign-out as expiry", async () => {
    const { markIntentionalSignOut, consumeIntentionalSignOut } =
      await import("../src/app/lib/sessionExpired");
    markIntentionalSignOut();
    assert.equal(consumeIntentionalSignOut(), true);
    assert.equal(consumeIntentionalSignOut(), false);
  });

  it("wires 'Log in again' to a real sign-out in both guards", () => {
    assert.match(app, /testId="session-expired-screen"/);
    assert.match(app, /label: "Log in again"/);
    assert.match(app, /supabase\.auth\.signOut/);
    assert.match(gate, /isSessionExpiredError\(statusQuery\.error\)/);
    assert.match(gate, /label: "Log in again"/);
  });

  it("watches unhandled auth/401 rejections", () => {
    assert.match(app, /installSessionExpiryWatcher\(\)/);
    const helper = readFileSync("src/app/lib/sessionExpired.ts", "utf8");
    assert.match(helper, /unhandledrejection/);
  });
});

describe("no business-logic drift", () => {
  it("touches no RPC, migration or XP code", () => {
    assert.doesNotMatch(status, /supabase|\.rpc\(|\bXP\b/);
    assert.doesNotMatch(app, /supabase\.rpc\(/);
    assert.doesNotMatch(gate, /supabase\.rpc\(/);
  });
});
