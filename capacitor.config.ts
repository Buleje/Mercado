// @capacitor/cli no está en devDependencies — se define el tipo inline
type CapacitorConfig = {
  appId: string;
  appName: string;
  webDir: string;
  server?: { androidScheme?: string; hostname?: string; url?: string };
};

const config: CapacitorConfig = {
  appId: "pe.buleje.app",
  appName: "Buleje",
  webDir: "out",
  server: {
    androidScheme: "https",
  },
};

export default config;
