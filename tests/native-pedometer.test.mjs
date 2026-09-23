// This executes the production Java plugin against instrumented platform
// doubles. This does not replace Android SDK or physical-device validation.
import { before, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { platformSources } from "./fixtures/pedometer/platform.mjs";

const java = spawnSync("java", ["--list-modules"], { encoding: "utf8" });
const compilerAvailable = java.status === 0 && java.stdout.includes("jdk.compiler");
let temporary;
describe(
  "real VjPedometerPlugin lifecycle (JVM platform doubles)",
  { skip: !compilerAvailable },
  () => {
    before(async () => {
      temporary = await mkdtemp(join(tmpdir(), "svj-native-"));
      const sources = [];
      for (const [path, source] of Object.entries(platformSources)) {
        const target = join(temporary, path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, source);
        sources.push(target);
      }
      const compile = spawnSync(
        "java",
        [
          "com.sun.tools.javac.Main",
          "-d",
          temporary,
          ...sources,
          resolve("android/app/src/main/java/app/lovable/svj/VjPedometerPlugin.java"),
          resolve("android/app/src/main/java/app/lovable/svj/AccelStepDetector.java"),
          resolve("tests/fixtures/pedometer/NativeLifecycleHarness.java"),
        ],
        { encoding: "utf8" },
      );
      assert.equal(compile.status, 0, compile.stderr);
    });
    after(async () => {
      if (temporary) await rm(temporary, { recursive: true, force: true });
    });
    for (const name of [
      "passive",
      "baseline",
      "duplicate_start",
      "stop",
      "second_start",
      "reset",
      "stale_samples",
      "detector",
      "accelerometer",
      "pause_destroy_reopen",
      "failed_start",
      "failed_stop",
      "midnight",
      "permission_unavailable",
    ]) {
      it(name, () => {
        const result = spawnSync(
          "java",
          ["-cp", temporary, "app.lovable.svj.NativeLifecycleHarness", name],
          { encoding: "utf8" },
        );
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /PASS/);
      });
    }
  },
);
