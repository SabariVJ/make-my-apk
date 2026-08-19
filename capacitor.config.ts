import type { CapacitorConfig } from "@capacitor/cli";

const publicAppUrl = process.env.VITE_PUBLIC_APP_URL?.trim();

const config: CapacitorConfig = {
  appId: "app.lovable.svj",
  appName: "SVJ",
  webDir: "dist/client",
  // Bundle web assets by default. A remote shell must use the final HTTPS
  // production origin, supplied at build time (never a preview/localhost URL).
  ...(publicAppUrl
    ? { server: { url: publicAppUrl, cleartext: false } }
    : {}),
  android: {
    backgroundColor: "#0B0B0C",
  },
};

export default config;
