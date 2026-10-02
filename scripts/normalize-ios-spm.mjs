import { readFile, writeFile } from "node:fs/promises";

// Capacitor 8 uses Windows path separators in generated Swift string literals.
// Keep the checked-in manifest usable on Mac even after a Windows sync.
const path = "ios/App/CapApp-SPM/Package.swift";
const source = await readFile(path, "utf8");
await writeFile(
  path,
  source.replace(/path: "([^"]+)"/g, (_, value) => `path: "${value.replaceAll("\\", "/")}"`),
);
