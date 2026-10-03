import { it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import yaml from "js-yaml";
const read = (file) => readFileSync(file, "utf8");

it("iPhone target registers the custom auth scheme and Motion permission with native forwarding", () => {
  const dom = new JSDOM(read("ios/App/App/Info.plist"), { contentType: "text/xml" });
  const document = dom.window.document;
  const entry = (name) =>
    [...document.querySelectorAll("plist > dict > key")].find((key) => key.textContent === name)
      ?.nextElementSibling;
  assert.match(entry("NSMotionUsageDescription").textContent, /steps.*workouts/);
  assert.ok(
    [...entry("CFBundleURLTypes").querySelectorAll("string")].some(
      (value) => value.textContent === "app.lovable.svj",
    ),
  );
  assert.match(
    read("ios/App/App/AppDelegate.swift"),
    /ApplicationDelegateProxy.shared.application\(app, open: url, options: options\)/,
  );
  assert.match(
    read("src/app/components/TrialGate.tsx"),
    /useEffect\(installNativeAuthCallbacks, \[\]\)/,
  );
  dom.window.close();
});
it("Swift package dependencies match Capacitor and only ship the three supported iPhone bridges", () => {
  const manifest = read("ios/App/CapApp-SPM/Package.swift");
  const version = JSON.parse(read("package.json")).dependencies["@capacitor/ios"];
  assert.ok(manifest.includes(`exact: "${version}"`));
  assert.match(manifest, /platforms: \[\.iOS\(\.v15\)\]/);
  assert.doesNotMatch(manifest, /path: "[^"\n]*\\|AdMob/);
  for (const plugin of ["CapacitorApp", "CapacitorBrowser", "CapgoCapacitorPedometer"])
    assert.ok(manifest.includes(plugin));
  const project = read("ios/App/App.xcodeproj/project.pbxproj");
  assert.match(project, /IPHONEOS_DEPLOYMENT_TARGET = 15.0/);
  const scheme = new JSDOM(read("ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme"), {
    contentType: "text/xml",
  });
  const reference = scheme.window.document.querySelector("BuildableReference");
  assert.ok(project.includes(reference.getAttribute("BlueprintIdentifier")));
  scheme.window.close();
});
it("public Mac workflow compiles an unsigned physical-device build and validates its IPA", () => {
  const workflow = yaml.load(read(".github/workflows/ios-test.yml"));
  assert.ok(Object.hasOwn(workflow.on, "workflow_dispatch"));
  assert.deepEqual(workflow.on.push.branches, ["release/play-v1-compliance"]);
  assert.equal(workflow.jobs.iphone["runs-on"], "macos-26");
  assert.deepEqual(workflow.permissions, { contents: "read" });
  const commands = workflow.jobs.iphone.steps.map((step) => step.run ?? "").join("\n");
  assert.match(commands, /bun install --frozen-lockfile/);
  assert.match(commands, /bun run cap:sync:ios/);
  assert.match(commands, /-sdk iphoneos/);
  assert.match(commands, /CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO/);
  assert.match(commands, /ditto -c -k --keepParent Payload SVJ-ios-test.ipa/);
  assert.match(commands, /verify-ios-ipa.py/);
  assert.doesNotMatch(
    read(".github/workflows/ios-test.yml"),
    /secrets\.|APPLE_ID|PASSWORD|runs-on:.*large/,
  );
  assert.ok(
    workflow.jobs.iphone.steps.some((step) => step.with?.path === "ios/output/SVJ-ios-test.ipa"),
  );
});
it("native assets use SVJ branding and no Android-only permissions or paid entitlements", () => {
  const icon = readFileSync("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png");
  assert.equal(icon.readUInt32BE(16), 1024);
  assert.equal(icon.readUInt32BE(20), 1024);
  assert.doesNotMatch(
    read("ios/App/App/Info.plist"),
    /NSHealth|GADApplicationIdentifier/,
  );
  assert.match(read("capacitor.config.ts"), /includePlugins: \[/);
  assert.match(read("docs/iphone-test-build.md"), /seven days/);
});
