import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.svj",
  appName: "SVJ",
  webDir: "dist/client",
  server: {
    url: "https://savaje-com.lovable.app",
    cleartext: true,
  },
  android: {
    backgroundColor: "#0B0B0C",
  },
};

export default config;
