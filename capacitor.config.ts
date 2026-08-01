import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.svj",
  appName: "SVJ",
  webDir: "dist/client",
  server: {
    // Loads the live Lovable build inside the Android shell.
    // Replace with your published URL after you hit Publish.
    url: "https://id-preview--33b1119f-3051-482e-90aa-488c5d0681b3.lovable.app",
    cleartext: true,
  },
  android: {
    backgroundColor: "#0B0B0C",
  },
};

export default config;
