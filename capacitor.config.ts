import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "pe.buleje.app",
  appName: "Buleje",
  webDir: "out",
  server: {
    androidScheme: "https",
  },
};

export default config;
