import type { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import MotionProvider from "@/components/MotionProvider";
import MaintenancePage from "@/components/MaintenancePage";
import StoreClientShell from "@/components/StoreClientShell";
import StoreProviders from "@/components/StoreProviders";
import { QuickAddProvider } from "@/contexts/quick-add-context";
// Brandon 2026-05-20 v5 — UNIFICACIÓN DE CHROME:
// el usuario reportó que /, /negocios, /abrir-tienda usaban LandingHeader
// propio mientras /tiendas y /marketplace usaban MarketplaceNavbar. 3 navs
// distintos = cliente confundido. Ahora todas las páginas del route group
// (store) heredan el mismo chrome (navbar + promo + secondary nav + bottom
// nav + footer + cart drawer) del layout — único punto de mantenimiento.
import MarketplaceNavbar from "@/components/marketplace/MarketplaceNavbar";
import ConditionalPromoBar from "@/components/marketplace/ConditionalPromoBar";
import ConditionalSecondaryNav from "@/components/marketplace/ConditionalSecondaryNav";
import QuickAddDrawer from "@/components/marketplace/QuickAddDrawer";
import BottomNav from "@/components/marketplace/BottomNav";
import Footer from "@/components/Footer";
import { AddedToCartDrawerProvider } from "@/components/marketplace/AddedToCartDrawer";
import NavModeToast from "@/components/marketplace/NavModeToast";

// Modal centrado de "agregar al carrito" — reemplaza la página de detalle
// de producto en la tienda individual. El cliente NO sale del catálogo: el
// modal aparece centrado, agrega y cierra. Lazy-loaded post-FCP.
const QuickAddModal = dynamic(() => import("@/components/store/QuickAddModal"));
// OrderSuccessModal — modal de éxito post-pedido. Antes vivía en
// MarketplaceStoreProviders (marketplace/tiendas); al unificar bajo este layout
// lo montamos acá para no perderlo. Lazy (sin ssr:false porque este es un
// Server Component) — el modal renderiza null mientras no haya pedido reciente.
const OrderSuccessModal = dynamic(
  () => import("@/components/marketplace/order-success/OrderSuccessModal"),
);
// TenantIndicatorBar removed — public pages shouldn't show tenant context
import LocalBusinessJsonLd from "@/components/store/LocalBusinessJsonLd";
import StoreFloatingWidgets from "@/components/store/StoreFloatingWidgets";
import MarketplaceFloatingWidgets from "@/components/marketplace/MarketplaceFloatingWidgets";
import ConditionalShoppingChrome from "@/components/marketplace/ConditionalShoppingChrome";
import MarketplaceSideRailShell from "@/components/marketplace/MarketplaceSideRailShell";
import { SettingsDB } from "@/lib/db/settings.db";
import { tenantExists } from "@/lib/tenant-check";
import { headers } from "next/headers";
import {
  GoogleAnalytics,
  GoogleTagManager,
  GTMNoScript,
  MicrosoftClarity,
  MetaPixel,
} from "@/components/Analytics";
import { SkipLink } from "@/components/ui-system/SkipLink";

// ── Metadata dinámica desde la DB ─────────────────────────────────────────────
export async function generateMetadata(): Promise<Metadata> {
  try {
    const { getCachedSettings, resolveStoreContext } = await import("@/lib/store-metadata");
    const ctx = await resolveStoreContext();
    const settings = await getCachedSettings(ctx.tenantId);

    // resolveStoreContext ya resolvió el nombre con la cadena de fallback
    // (storeTheme.storeName → businessName → "tu tienda"). Mantenemos el
    // mismo nombre aquí para consistencia con el resto del template.
    const name   = ctx.name === "tu tienda" ? "Mi Tienda" : ctx.name;
    const slogan = settings?.slogan ?? "Delivery rápido y seguro";
    const desc   = settings?.description
      ?? `${name} — compra online con delivery a domicilio. Paga con Yape o efectivo.`;
    const logo   = settings?.logoUrl;

    // En tienda individual usamos `title.absolute` para que el template
    // `%s | Buleje` del root layout no se concatene. Para sub-páginas que
    // usen este layout sin definir su propio title, `default: { absolute }`
    // hace que muestren solo el nombre del comercio sin sufijo Buleje.
    //
    // Brandon 2026-05-20 SEO fix: cuando NO es tenant context (rutas comunes
    // como /, /tiendas, /negocios servidas desde el dominio principal), el
    // template tenía `%s | ${name}` donde `name` era el primer tenant ("Bodega
    // Buleje Test"). Eso causaba títulos en home y /negocios tipo
    // "Foo | Bodega Buleje Test" en lugar del marketing "Foo | Buleje".
    // Ahora forzamos el suffix "Buleje" para no-tenants — la marca pública.
    const titleStr = `${name} | ${slogan}`;
    return {
      title: ctx.isTenant
        ? { absolute: titleStr }
        : { default: titleStr, template: `%s | Buleje` },
      description: desc,
      openGraph: {
        type:        "website",
        locale:      "es_PE",
        // SEO fix 2026-05-20: en rutas no-tenant el siteName debe ser "Buleje"
        // (marca pública), no el nombre del primer tenant resuelto por fallback.
        siteName:    ctx.isTenant ? name : "Buleje",
        title:       titleStr,
        description: desc,
        ...(logo && { images: [{ url: logo, width: 1200, height: 630, alt: name }] }),
      },
      twitter: {
        card:        "summary_large_image",
        title:       titleStr,
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

/**
 * Async inner component que hace tenant validation + maintenance check +
 * provee el árbol de providers. Aislado del layout root para que pueda
 * ir dentro de <Suspense> y Next 16 cacheComponents no warnee sobre
 * "Uncached data accessed outside of Suspense".
 *
 * Fix 2026-04-09: antes el StoreLayout hacía los 2 awaits de DB en el
 * root del layout, bloqueando el render del shell entero. Con cacheComponents
 * el layout debe streamar lo estático y mover el async adentro de Suspense.
 */
async function StoreLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read tenantId inside Suspense to avoid Next 16 blocking route error
  const hdrs = await headers();
  const tenantId = hdrs.get("x-tenant-id") ?? "main";

  // Validate tenant exists — return 404 for invalid slugs
  if (tenantId !== "main") {
    const exists = await tenantExists(tenantId);
    if (!exists) notFound();
  }

  // Check maintenance mode para el tenant activo. Usamos getCachedSettings
  // para deduplar la lectura con generateMetadata + tienda/page.tsx — todos
  // comparten la misma promesa per-request via React.cache().
  let maintenanceMode = false;
  let maintenanceMessage: string | undefined;
  try {
    const { getCachedSettings } = await import("@/lib/store-metadata");
    const settings = await getCachedSettings(tenantId);
    maintenanceMode = !!settings?.maintenanceMode;
    maintenanceMessage = settings?.maintenanceMessage;
  } catch {
    /* continue normally */
  }
  if (maintenanceMode) return <MaintenancePage message={maintenanceMessage} />;

  return (
    <StoreProviders tenantSlug={tenantId}>
      <MotionProvider>
        {/* QuickAddProvider envuelve toda la tienda — al click en producto
            se abre el drawer en lugar de navegar a una PDP.
            AddedToCartDrawerProvider: drawer "agregado al carrito" del
            marketplace, ahora compartido con (store) para que la home y
            /negocios tengan la misma UX que /tiendas. */}
        <QuickAddProvider>
          <AddedToCartDrawerProvider>
            {/* ── Chrome unificado (Brandon 2026-05-20 v5) ──
                Mismos navbar/bottomnav/footer que /tiendas y /marketplace
                para evitar el "3 navs distintos = cliente confundido"
                que reportó el usuario. ConditionalPromoBar y
                ConditionalSecondaryNav internamente deciden si renderizar
                según la ruta (no muestran en checkout, etc). */}
            <ConditionalPromoBar />
            <Suspense fallback={null}>
              <MarketplaceNavbar />
            </Suspense>
            <Suspense fallback={null}>
              <ConditionalSecondaryNav />
            </Suspense>
            {/* Rail de navegación lateral (estilo YouTube) — en la superficie
                marketplace queda AL LADO del contenido; passthrough en el resto
                de rutas. Brandon 2026-06-07. */}
            <MarketplaceSideRailShell>{children}</MarketplaceSideRailShell>
            <Footer />
            <Suspense fallback={null}>
              <QuickAddDrawer />
            </Suspense>
            {/* BottomNav gateado (Brandon 2026-06-07): se oculta en los flujos
                de inscripción del marketplace (/marketplace/repartidor|aplicar|
                onboarding|vender) — antes lo hacía el layout de marketplace.
                En home y resto de (store) se muestra normal. */}
            <ConditionalShoppingChrome>
              <BottomNav />
            </ConditionalShoppingChrome>
            <NavModeToast />
            {/* Widgets legacy de single-tenant — mantenidos por compat con
                rutas de tienda específica (/cuenta, /mis-pedidos, etc). */}
            <StoreClientShell />
            <StoreFloatingWidgets />
            {/* Widgets del marketplace (compare, dock, recently-viewed, tour) —
                se auto-gatean a /marketplace + /tiendas (null en home). */}
            <MarketplaceFloatingWidgets />
            <QuickAddModal />
            {/* Modal de éxito post-pedido — se mantiene tras navegaciones.
                Renderiza null hasta que LastOrderProvider tenga un pedido. */}
            <Suspense fallback={null}>
              <OrderSuccessModal />
            </Suspense>
          </AddedToCartDrawerProvider>
        </QuickAddProvider>
      </MotionProvider>
    </StoreProviders>
  );
}

export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <GTMNoScript />
      <GoogleAnalytics />
      <GoogleTagManager />
      <MicrosoftClarity />
      <MetaPixel />
      {/* Skip-link WCAG 2.4.1 — ADR-075 tokens DS, sin colores hardcodeados. */}
      <SkipLink />
      <Suspense fallback={null}>
        <StoreLayoutContent>{children}</StoreLayoutContent>
        <LocalBusinessJsonLd />
      </Suspense>
    </>
  );
}
