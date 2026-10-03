import { after, before, beforeEach, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

let app, temporary, device;
const settle = () => new Promise((resolve) => setImmediate(resolve));
before(async () => {
  temporary = await mkdtemp(path.resolve(".ios-compatibility-test-"));
  const output = path.join(temporary, "app.mjs");
  const modules = {
    "@capacitor/core": `export const Capacitor={getPlatform:()=>globalThis.__ios.platform,isNativePlatform:()=>globalThis.__ios.platform!=='web',isPluginAvailable:name=>globalThis.__ios.plugins.has(name)};export const registerPlugin=name=>new Proxy({}, {get:(_,method)=>async()=>{globalThis.__ios.calls.push(name+'.'+String(method));return {granted:true,location:'granted',backgroundLocation:'granted',notifications:'granted'}}});`,
    "@capacitor/app": `export const App={addListener:async(_,fn)=>{globalThis.__ios.listeners.add(fn);return {remove:async()=>globalThis.__ios.listeners.delete(fn)}},getLaunchUrl:async()=>globalThis.__ios.launch};`,
    "@capacitor/browser": `export const Browser={close:async()=>{globalThis.__ios.closed++}};`,
    "@/integrations/supabase/client": `export const supabase={auth:{exchangeCodeForSession:async(code)=>{globalThis.__ios.codes.push(code);return {error:globalThis.__ios.authError}},setSession:async(tokens)=>{globalThis.__ios.sessions.push(tokens);return {error:null}}}};`,
    "@/lib/googleAuth": `export const emitOAuthError=error=>globalThis.__ios.errors.push(error);`,
    "@capacitor-community/admob": `export const AdMob=new Proxy({}, {get:(_,key)=>async()=>globalThis.__ios.calls.push('AdMob.'+String(key))});export const BannerAdSize={},BannerAdPosition={};export const AdmobConsentStatus={};`,
  };
  await build({
    stdin: {
      contents: `export * from './src/app/lib/nativeAuth';export * from './src/app/lib/healthConnect';export * from './src/app/lib/nativeWorkout';export * from './src/app/lib/notifications';export * from './src/app/lib/locationAdapters';export * from './src/app/lib/wearable';export {isNativeWearAvailable} from './src/app/lib/wearOs';export {showPrivacyChoices} from './src/app/components/NativeBannerAd';`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    outfile: output,
    bundle: true,
    format: "esm",
    platform: "node",
    packages: "external",
    plugins: [
      {
        name: "native-hardware",
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, (args) =>
            Object.hasOwn(modules, args.path) ? { path: args.path, namespace: "mock" } : null,
          );
          builder.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
            contents: modules[args.path],
            loader: "js",
          }));
        },
      },
    ],
  });
  app = await import(pathToFileURL(output).href);
});
beforeEach(() => {
  device = {
    platform: "ios",
    plugins: new Set(["App", "Browser", "CapacitorPedometer"]),
    calls: [],
    listeners: new Set(),
    launch: undefined,
    codes: [],
    sessions: [],
    errors: [],
    closed: 0,
    authError: null,
  };
  globalThis.__ios = device;
});
after(async () => {
  await rm(temporary, { recursive: true, force: true });
  delete globalThis.__ios;
});

it("missing Android bridges cannot advertise availability or execute on iOS", async () => {
  assert.equal(app.healthConnectAvailable(), false);
  assert.equal(app.workoutPluginAvailable(), false);
  assert.equal(app.nativeNotificationsAvailable(), false);
  assert.equal(app.isNativeWearAvailable(), false);
  assert.equal(app.isNativeWearableAvailable(), false);
  assert.equal((await app.checkWorkoutPermissions()).location, "unavailable");
  assert.equal(
    (await app.startNativeWorkout({ activityId: "test", activityType: "walk" })).ok,
    false,
  );
  assert.equal(await app.notificationPermission(), false);
  assert.equal(await app.requestNotificationPermission(), false);
  assert.equal(await app.sendTestNotification(), false);
  await app.replaceNativeNotificationSchedules([]);
  await app.cancelNativeNotifications();
  await app.stopNativeWorkout();
  await app.openHealthConnectSettings();
  assert.deepEqual(device.calls, []);
});
it("Android bridges remain usable when actually registered", async () => {
  device.platform = "android";
  device.plugins.add("VjWorkout");
  device.plugins.add("VjNotifications");
  assert.equal(app.workoutPluginAvailable(), true);
  assert.equal(await app.requestNotificationPermission(), true);
  assert.equal((await app.checkWorkoutPermissions()).location, "granted");
  assert.deepEqual(device.calls, [
    "VjNotifications.requestPermission",
    "VjWorkout.checkPermissions",
  ]);
});
it("iPhone GPS adapter reports unavailable instead of silently starting browser recording", async () => {
  const samples = [],
    errors = [];
  const adapter = app.createDefaultLocationAdapter();
  await adapter.start(
    (sample) => samples.push(sample),
    (error) => errors.push(error),
  );
  await adapter.stop();
  assert.match(errors[0], /unavailable.*iPhone/);
  assert.deepEqual(samples, []);
  assert.deepEqual(device.calls, []);
});
it("iPhone does not request advertising consent even if an AdMob proxy is present", async () => {
  device.plugins.add("AdMob");
  assert.equal(await app.showPrivacyChoices(), false);
  assert.deepEqual(device.calls, []);
});
it("cold and warm login callbacks share one code exchange and clean up listeners", async () => {
  const url = "app.lovable.svj://auth/callback?code=login-code";
  device.launch = { url };
  const dispose = app.installNativeAuthCallbacks();
  await settle();
  for (const listener of device.listeners) listener({ url });
  await settle();
  assert.deepEqual(device.codes, ["login-code"]);
  assert.equal(device.closed, 1);
  dispose();
  await settle();
  assert.equal(device.listeners.size, 0);
});
it("StrictMode disposal ignores stale launch callbacks, and untrusted URLs cannot log in", async () => {
  device.launch = { url: "app.lovable.svj://auth/callback?code=real" };
  const disposed = app.installNativeAuthCallbacks();
  disposed();
  const dispose = app.installNativeAuthCallbacks();
  await settle();
  for (const url of [
    "not-a-url",
    "https://evil.test/app.lovable.svj://auth/callback?code=evil",
    "app.lovable.svj://evil/callback?code=evil",
    "app.lovable.svj://auth/other?code=evil",
  ]) {
    for (const listener of device.listeners) listener({ url });
  }
  await settle();
  assert.deepEqual(device.codes, ["real"]);
  assert.equal(device.listeners.size, 1);
  dispose();
});
it("legacy login tokens and provider/exchange failures are handled without an unhandled rejection", async () => {
  const dispose = app.installNativeAuthCallbacks();
  await settle();
  const listener = [...device.listeners][0];
  listener({ url: "app.lovable.svj://auth/callback#access_token=access&refresh_token=refresh" });
  listener({ url: "app.lovable.svj://auth/callback?error_description=Access%20denied" });
  device.authError = new Error("Invalid sign-in code");
  listener({ url: "app.lovable.svj://auth/callback?code=invalid" });
  await settle();
  assert.deepEqual(device.sessions, [{ access_token: "access", refresh_token: "refresh" }]);
  assert.deepEqual(device.errors.sort(), ["Access denied", "Invalid sign-in code"]);
  assert.equal(device.closed, 3);
  dispose();
});
it("web sessions install no native login listeners", async () => {
  device.platform = "web";
  app.installNativeAuthCallbacks()();
  await settle();
  assert.equal(device.listeners.size, 0);
});
