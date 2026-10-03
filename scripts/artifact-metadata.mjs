import { readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const directory = process.argv[2] ?? "validated-artifacts";
const revision = process.env.GITHUB_SHA;
if (!/^[a-f0-9]{40}$/.test(revision ?? "")) throw new Error("Exact validated revision required");
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (/\.(apk|ipa|aab)$/.test(file)) files.push(file);
  }
}
await walk(directory);
if (!files.some((file) => file.endsWith(".apk")) || !files.some((file) => file.endsWith(".ipa")))
  throw new Error("Both phone artifacts required");
const artifacts = [];
const report = await readFile(path.join(directory, "release-metadata.txt"), "utf8");
if (!report.includes(revision))
  throw new Error("Release signing report belongs to a different revision");
const signing = report.match(/^signing:\s*(.+)$/m)?.[1];
if (!signing) throw new Error("Android signing identity must be labeled");
for (const file of files)
  artifacts.push({
    file: path.relative(directory, file).replaceAll("\\", "/"),
    sha256: createHash("sha256")
      .update(await readFile(file))
      .digest("hex"),
    signing: file.endsWith(".ipa") ? "unsigned; re-sign with your sideloading app" : signing,
  });
await writeFile(
  path.join(directory, "SHA256SUMS"),
  artifacts.map((a) => `${a.sha256}  ${a.file}`).join("\n") + "\n",
);
await writeFile(
  path.join(directory, "build-metadata.json"),
  JSON.stringify(
    {
      revision,
      nativeCapabilityVersion: 2,
      expectedWebRevision: revision,
      hostedUrl: "https://savaje-com.lovable.app",
      websiteDeployment: "Publish separately in Lovable",
      artifacts,
    },
    null,
    2,
  ) + "\n",
);
