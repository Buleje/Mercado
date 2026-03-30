import type { Metadata } from "next";
import MotionProvider from "@/components/MotionProvider";
import MaintenancePage from "@/components/MaintenancePage";
import StoreClientShell from "@/components/StoreClientShell";
import StoreProviders from "@/components/StoreProviders";
import LocalBusinessJsonLd from "@/components/store/LocalBusinessJsonLd";
import StoreFloatingWidgets from "@/components/store/StoreFloatingWidgets";
import { SettingsDB } from "@/lib/jsondb";
import { headers } from "next/headers";
import {
  GoogleAnalytics,
  GoogleTagManager,
  GTMNoScript,
  MicrosoftClarity,
} from "@/components/Analytics";

// force-dynamic: el tenantId viene del header x-tenant-id que varía por request
export const dynamic = "force-dynamic";

// ── Metadata dinámica desde la DB ─────────────────────────────────────────────
export async function generateMetadata(): Promise<Metadata> {
  try {
    const hdrs = await headers();
    const tenantId = hdrs.get("x-tenant-id") ?? "main";
    const settings = await SettingsDB.get(tenantId);

    const name   = settings.businessName ?? "Mi Tienda";
    const slogan = settings.slogan ?? "Delivery rápido y seguro";
    const desc   = settings.description
      ?? `${name} — compra online con delivery a domicilio. Paga con Yape o efectivo.`;
    const logo   = settings.logoUrl;

    return {
      title:       { default: `${name} | ${slogan}`, template: `%s | ${name}` },
      description: desc,
      openGraph: {
        type:        "website",
        locale:      "es_PE",
        siteName:    name,
        title:       `${name} | ${slogan}`,
        description: desc,
        ...(logo && { images: [{ url: logo, width: 1200, height: 630, alt: name }] }),
      },
      twitter: {
        card:        "summary_large_image",
        title:       `${name} | ${slogan}`,
        description: desc,
        ...(logo && { images: [logo] }),
      },
      ...(logo && { icons: { icon: logo, apple: logo } }),
    };
  } catch {
    // Si falla la DB, Next.js hereda la metadata estática del root layout
    return {};
  }
}

export default async function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Leer tenantId del header inyectado por proxy.ts (cookie active-tenant → x-tenant-id)
  const hdrs = await headers();
  const tenantId = hdrs.get("x-tenant-id") ?? "main";

  // Check maintenance mode para el tenant activo
  let maintenanceMode = false;
  let maintenanceMessage: string | undefined;
  try {
    const settings = await SettingsDB.get(tenantId);
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
