import { defineNitroConfig } from "nitro/config";

// Reproducible builds must not select a future Worker date from the local clock.
export default defineNitroConfig({ compatibilityDate: "2026-09-01" });
