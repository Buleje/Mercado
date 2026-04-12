// @capacitor/cli no está en devDependencies — se define el tipo inline
type CapacitorConfig = {
  appId: string;
  appName: string;
  webDir: string;
  server?: { androidScheme?: string; hostname?: string; url?: string };
  plugins?: Record<string, unknown>;
};

const isProduction = process.env.NODE_ENV === "production";

const config: CapacitorConfig = {
  appId: "pe.buleje.app",
  appName: "Buleje",
  webDir: "out",
  server: {
    androidScheme: "https",
    hostname: "buleje.pe",
    ...(isProduction ? {} : { url: "http://localhost:3000" }),
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#0a0f0d",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a0f0d",
    },
  },
};

export default config;
