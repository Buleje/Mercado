import MotionProvider from "@/components/MotionProvider";
import MaintenancePage from "@/components/MaintenancePage";
import StoreClientShell from "@/components/StoreClientShell";
import StoreProviders from "@/components/StoreProviders";
import LocalBusinessJsonLd from "@/components/store/LocalBusinessJsonLd";
import StoreFloatingWidgets from "@/components/store/StoreFloatingWidgets";
import { SettingsDB } from "@/lib/jsondb";
import {
  GoogleAnalytics,
  GoogleTagManager,
  GTMNoScript,
  MicrosoftClarity,
} from "@/components/Analytics";

// ISR: re-render at most once per 60s — keeps maintenance check fresh
// while allowing pages to be cached (was force-dynamic, blocking all caching)
export const revalidate = 60;

export default async function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check maintenance mode
  let maintenanceMode = false;
  let maintenanceMessage: string | undefined;
  try {
    const settings = await SettingsDB.get();
    maintenanceMode = !!settings.maintenanceMode;
    maintenanceMessage = settings.maintenanceMessage;
  } catch { /* continue normally */ }
  if (maintenanceMode) return <MaintenancePage message={maintenanceMessage} />;

  return (
    <>
      <GTMNoScript />
      <GoogleAnalytics />
      <GoogleTagManager />
      <MicrosoftClarity />
      {/* Skip-to-content link for keyboard and screen-reader users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-9999 focus:rounded-xl focus:bg-primary focus:px-5 focus:py-3 focus:text-sm focus:font-bold focus:text-white focus:shadow-xl"
      >
        Saltar al contenido principal
      </a>
      <StoreProviders>
        <MotionProvider>
          {children}
          <StoreClientShell />
          <StoreFloatingWidgets />
        </MotionProvider>
      </StoreProviders>
      <LocalBusinessJsonLd />
    </>
  );
}
