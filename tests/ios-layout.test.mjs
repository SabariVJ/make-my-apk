import { after, afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://svj.test" });
for (const key of ["window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node", "MutationObserver"]) {
  Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? dom.window : dom.window[key] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now()), 0);
globalThis.cancelAnimationFrame = clearTimeout;
dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
const observers = [];
globalThis.ResizeObserver = class {
  constructor(callback) { this.callback = callback; observers.push(this); }
  observe(element) { this.element = element; }
  disconnect() { this.disconnected = true; }
};
const { render, cleanup, fireEvent, screen, act } = await import("@testing-library/react");
let temporary;
let Header;
let calls;

before(async () => {
  temporary = await mkdtemp(path.resolve(".ios-layout-test-"));
  const outfile = path.join(temporary, "header.mjs");
  await build({
    stdin: { contents: "export { Header } from './src/app/components/Header';", loader: "tsx", resolveDir: process.cwd() },
    outfile, bundle: true, format: "esm", platform: "node", packages: "external",
    plugins: [{ name: "isolated-header", setup(builder) {
      builder.onResolve({ filter: /context\/SVJContext$/ }, () => ({ path: "context", namespace: "mock" }));
      builder.onResolve({ filter: /^\.\/AvatarImage$/ }, () => ({ path: "avatar", namespace: "mock" }));
      builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: name }) => ({ loader: "js", contents: name === "context"
        ? "export const useSVJ = () => globalThis.headerTestState;"
        : "export const AvatarImage = () => null;" }));
    }}],
  });
  ({ Header } = await import(pathToFileURL(outfile).href));
});

afterEach(() => { cleanup(); observers.length = 0; });
after(async () => { await rm(temporary, { recursive: true, force: true }); dom.window.close(); });

function mount() {
  calls = [];
  globalThis.headerTestState = {
    user: { isPremium: true, isFounder: false, tier: "Obsidian", memberId: "SVJ-1001-A", currentStreak: 9999,
      totalXP: 1234567890123, email: "very.long.account.name@example.test", name: "Test account", avatar: null },
    setIsPaywallOpen: () => calls.push("plus"),
    setIsEditProfileOpen: () => calls.push("profile"),
    setIsGoogleAuthModalOpen: () => calls.push("account"),
  };
  return render(React.createElement(Header, { onOpenUtilityMenu: () => calls.push("menu") }));
}

describe("iPhone header layout lifecycle", () => {
  it("updates the sticky offset when safe-area padding, wrapping or rotation changes its height", () => {
    mount();
    const observer = observers[0];
    assert.equal(observer.element, screen.getByTestId("app-header"));
    for (const height of [110, 169.2, 58]) {
      observer.element.getBoundingClientRect = () => ({ height });
      act(() => observer.callback());
      assert.equal(document.documentElement.style.getPropertyValue("--svj-header-height"), `${Math.ceil(height)}px`);
    }
  });

  it("disconnects on unmount and measures a newly mounted header", () => {
    const first = mount();
    const observer = observers[0];
    first.unmount();
    assert.equal(observer.disconnected, true);
    assert.equal(document.documentElement.style.getPropertyValue("--svj-header-height"), "");
    mount();
    assert.equal(observers.length, 2);
    assert.equal(observers[1].element, screen.getByTestId("app-header"));
  });

  it("keeps account, menu and profile actions working with large XP and long account details", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Account settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Open SVJ menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    assert.deepEqual(calls, ["account", "menu", "profile"]);
    assert.ok(screen.getByTestId("header-xp").textContent.includes((1234567890123).toLocaleString()));
  });

  it("enables safe-area layout without suppressing browser accessibility zoom", async () => {
    const root = await readFile("src/routes/__root.tsx", "utf8");
    assert.match(root, /width=device-width, initial-scale=1, viewport-fit=cover/);
    assert.doesNotMatch(root, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/);
  });
});
