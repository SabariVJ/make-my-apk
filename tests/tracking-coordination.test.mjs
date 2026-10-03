import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";

const dom = new JSDOM("<body></body>", { url: "https://svj.test", pretendToBeVisual: true });
for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "Event"])
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let hidden = false,
  online = true,
  temporary,
  app;
Object.defineProperty(document, "hidden", { get: () => hidden });
Object.defineProperty(navigator, "onLine", { get: () => online });
const fixture = {
  session: { user: { id: "alice" }, access_token: "alice-token" },
  auth: null,
  unsubscribed: 0,
};
globalThis.__svjSyncFixture = fixture;
const originalFetch = globalThis.fetch;
before(async () => {
  temporary = await mkdtemp(path.resolve(".svj-coordination-test-"));
  await build({
    stdin: {
      contents:
        "export { withAccountRpcClient } from './src/app/lib/accountSync'; export { TabErrorBoundary } from './src/app/components/TabErrorBoundary';",
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    outfile: path.join(temporary, "test.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["react", "react-dom", "@supabase/supabase-js", "lucide-react"],
    plugins: [
      {
        name: "isolated-auth",
        setup(b) {
          b.onResolve({ filter: /integrations\/supabase\/client$/ }, () => ({
            path: "auth",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: `const f=globalThis.__svjSyncFixture; export const getSupabaseConfig=()=>({url:'https://backend.test',publishableKey:'public-test-key'}); export const supabase={auth:{getSession:async()=>({data:{session:f.session}}),onAuthStateChange:fn=>{f.auth=fn;return{data:{subscription:{unsubscribe(){f.unsubscribed++}}}}}}};`,
            loader: "js",
          }));
        },
      },
    ],
  });
  app = await import(pathToFileURL(path.join(temporary, "test.mjs")).href);
});
after(async () => {
  globalThis.fetch = originalFetch;
  delete globalThis.__svjSyncFixture;
  await rm(temporary, { recursive: true, force: true });
  dom.window.close();
});

test("sync binds the original account token and removes listeners after exceptions", async () => {
  let authorization;
  globalThis.fetch = async (_input, init) => {
    authorization = new Headers(init.headers).get("authorization");
    return new Response('{"ok":true}', { headers: { "content-type": "application/json" } });
  };
  await app.withAccountRpcClient("alice", async (client) => {
    const result = await client.rpc("test");
    assert.equal(result.error, null);
  });
  assert.equal(authorization, "Bearer alice-token");
  const before = fixture.unsubscribed;
  await assert.rejects(
    app.withAccountRpcClient("alice", async () => {
      throw new Error("storage failed");
    }),
    /storage failed/,
  );
  assert.equal(fixture.unsubscribed, before + 1);
  await assert.rejects(
    app.withAccountRpcClient("bob", async () => assert.fail("wrong account ran")),
    /original account/,
  );
});

test("account changes and backgrounding abort an in-flight sync and prevent retries", async () => {
  for (const interrupt of [
    () => fixture.auth("SIGNED_OUT", null),
    () => {
      hidden = true;
      document.dispatchEvent(new Event("visibilitychange"));
    },
    () => {
      online = false;
      window.dispatchEvent(new Event("offline"));
    },
  ]) {
    hidden = false;
    online = true;
    let reached;
    const started = new Promise((resolve) => {
      reached = resolve;
    });
    globalThis.fetch = async (_input, init) => {
      reached();
      return new Promise((_resolve, reject) =>
        init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }),
      );
    };
    await app.withAccountRpcClient("alice", async (client) => {
      const request = client.rpc("test").then((result) => result);
      await started;
      interrupt();
      assert.ok((await request).error);
      assert.ok((await client.rpc("test")).error);
    });
  }
  hidden = false;
  online = true;
});

test("each tab can fail and retry while its tracking coordinator stays mounted", async () => {
  let mounted = 0,
    removed = 0,
    fails = true;
  function Coordinator() {
    useEffect(() => {
      mounted++;
      return () => {
        removed++;
      };
    }, []);
    return React.createElement("span", null, "Tracking active");
  }
  function Screen({ name }) {
    if (fails) throw new Error("injected tab failure");
    return React.createElement("span", null, name);
  }
  const previousError = console.error;
  console.error = () => {};
  try {
    for (const name of [
      "challenges",
      "activity",
      "earn",
      "workouts",
      "recovery",
      "nutrition",
      "community",
      "leaderboard",
      "sixty",
      "profile",
      "plan",
      "transform",
      "admin",
    ]) {
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      fails = true;
      await act(async () =>
        root.render(
          React.createElement(
            React.Fragment,
            null,
            React.createElement(Coordinator),
            React.createElement(app.TabErrorBoundary, null, React.createElement(Screen, { name })),
          ),
        ),
      );
      assert.match(host.textContent, /Could not load this screen/);
      assert.match(host.textContent, /Tracking active/);
      const before = removed;
      fails = false;
      await act(async () => host.querySelector("button").click());
      assert.match(host.textContent, new RegExp(name));
      assert.equal(removed, before);
      await act(async () => root.unmount());
      host.remove();
    }
    assert.equal(mounted, 13);
    assert.equal(removed, 13);
  } finally {
    console.error = previousError;
  }
});
