import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.svj",
  appName: "SVJ",
  webDir: "dist/client",
  server: {
    url: "https://savaje-com.lovable.app",
    // SVJ is served exclusively over HTTPS. Leaving cleartext enabled would let
    // a compromised network redirect or downgrade the hosted app connection.
    cleartext: false,
  },
  android: {
    backgroundColor: "#0B0B0C",
  },
};

export default config;
