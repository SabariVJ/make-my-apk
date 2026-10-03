import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.svj",
  appName: "SVJ",
  webDir: "dist/client",
  // The native responsive smoke app uses the generated local bundle so its
  // WebView can measure this branch before the separately hosted site deploys.
  ...(process.env.SVJ_RESPONSIVE_LOCAL === "1"
    ? {}
    : {
        server: {
          url: "https://savaje-com.lovable.app",
          // SVJ is served exclusively over HTTPS. Leaving cleartext enabled
          // would let a compromised network redirect or downgrade the hosted app.
          cleartext: false,
        },
      }),
  android: {
    backgroundColor: "#0B0B0C",
  },
  ios: {
    backgroundColor: "#0B0B0C",
    preferredContentMode: "mobile",
    includePlugins: ["@capacitor/app", "@capacitor/browser", "@capgo/capacitor-pedometer"],
  },
};

export default config;
