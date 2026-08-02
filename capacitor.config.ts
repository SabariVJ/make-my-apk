import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.svj",
  appName: "SVJ",
  webDir: "dist/client",
  server: {
    // Loads the live Lovable build inside the Android shell.
    url: "https://make-my-apk.lovable.app",
    cleartext: true,
  },
  android: {
    backgroundColor: "#0B0B0C",
  },
};

export default config;