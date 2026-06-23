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
import { HideInCheckoutMode, CheckoutModeBar } from "@/components/marketplace/CheckoutModeChrome";
// Chrome propio de la TIENDA INDIVIDUAL (aislado del marketplace). Brandon 2026-06-07.
import StorefrontNavbar from "@/components/store/StorefrontNavbar";
// Footer dedicado white-label + marker de "bordes rectos" — solo tienda individual.
import TenantFooter from "@/components/store/TenantFooter";
import TenantStoreChrome from "@/components/store/TenantStoreChrome";
// Barra de progreso "envío gratis" — opt-in por tienda (flag "shipping", ADR-298).
import FreeShippingBar from "@/components/store/tenant/FreeShippingBar";
import { getCachedSettings, resolveStoreContext } from "@/lib/store-metadata";
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

  // Settings del tenant (cacheado per-request, compartido con metadata/páginas).
  const settings = await getCachedSettings(tenantId).catch(() => null);
  if (settings?.maintenanceMode) {
    return <MaintenancePage message={settings.maintenanceMessage} />;
  }

  // ¿Tienda INDIVIDUAL del comerciante? (subdominio/customDomain o /t/<slug>).
  // resolveStoreContext().isTenant = (x-tenant-store-route===1) || (tenantId≠main).
  // Si lo es, montamos chrome propio (StorefrontNavbar/Footer/BottomNav) AISLADO
  // del marketplace. Si no, el chrome del marketplace queda intacto. Brandon 2026-06-07.
  const ctx = await resolveStoreContext();
  const isTenant = ctx.isTenant;
  const storeName = ctx.name;
  const storeLogo =
    (settings as { logoUrl?: string | null } | null)?.logoUrl ?? null;

  // Flags PRO opt-in por tienda (ADR-298) viven en settings.storeTheme.features.
  // "shipping" → barra de progreso de envío gratis con umbral configurable.
  const storeTheme = (settings as { storeTheme?: Record<string, unknown> } | null)?.storeTheme;
  const tenantFeatures = Array.isArray(storeTheme?.features)
    ? (storeTheme!.features as unknown[]).filter((f): f is string => typeof f === "string")
    : [];
  const freeShipThreshold =
    typeof storeTheme?.freeShippingThreshold === "number" ? storeTheme.freeShippingThreshold : 99;
  const showFreeShipBar = isTenant && tenantFeatures.includes("shipping");

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
            {isTenant ? (
              /* ── Chrome AISLADO de la TIENDA INDIVIDUAL (Brandon 2026-06-07) ──
                  Sin navbar/sub-nav/footer/bottom-nav del marketplace ni sus
                  floating widgets. Solo el mundo de la tienda. El carrito y los
                  modales de pedido se mantienen (mismo flujo de checkout). */
              <>
                {/* Marker para bordes rectos de la tienda individual (CSS scoped
                    en globals.css). No afecta el marketplace. Brandon 2026-06-21. */}
                <TenantStoreChrome />
                <StorefrontNavbar name={storeName} logo={storeLogo} />
                {showFreeShipBar && <FreeShippingBar threshold={freeShipThreshold} />}
                {children}
                {/* Footer dedicado de la tienda (white-label) — sin branding del
                    marketplace. Brandon 2026-06-21: revierte el "footer único".
                    QuickAddDrawer (marketplace) removido del chrome tenant: duplicaba
                    el modal con QuickAddModal (ambos useQuickAdd → doble modal). */}
                <TenantFooter slug={tenantId} storeName={storeName} />
                {/* El bottom-nav mobile lo aporta el MobileBottomNav legacy de
                    las páginas single-tenant (TiendaClientShell etc.), que usa el
                    cart legacy correcto. No montamos uno extra acá para no duplicar. */}
                <StoreClientShell />
                <StoreFloatingWidgets />
                <QuickAddModal />
                <Suspense fallback={null}>
                  <OrderSuccessModal />
                </Suspense>
              </>
            ) : (
              /* ── Chrome unificado del MARKETPLACE (Brandon 2026-05-20 v5) ──
                  Mismos navbar/bottomnav/footer que /tiendas y /marketplace. */
              <>
                {/* Header minimal "modo checkout" (solo /marketplace/carrito). */}
                <CheckoutModeBar />
                {/* Chrome del marketplace — OCULTO en modo checkout (carrito) para
                    que el usuario se concentre en continuar. Brandon 2026-06-08. */}
                <HideInCheckoutMode>
                  <ConditionalPromoBar />
                  <Suspense fallback={null}>
                    <MarketplaceNavbar />
                  </Suspense>
                  <Suspense fallback={null}>
                    <ConditionalSecondaryNav />
                  </Suspense>
                </HideInCheckoutMode>
                {/* Rail de navegación lateral (estilo YouTube) — al lado del
                    contenido en marketplace; passthrough en el resto (incluido carrito). */}
                <MarketplaceSideRailShell>{children}</MarketplaceSideRailShell>
                <HideInCheckoutMode>
                  <Footer />
                </HideInCheckoutMode>
                <Suspense fallback={null}>
                  <QuickAddDrawer />
                </Suspense>
                {/* BottomNav gateado: oculto en flujos de inscripción + modo checkout. */}
                <HideInCheckoutMode>
                  <ConditionalShoppingChrome>
                    <BottomNav />
                  </ConditionalShoppingChrome>
                </HideInCheckoutMode>
                <NavModeToast />
                {/* Brandon 2026-06-12: marketplace SIN LiveChatWidget flotante
                    (molesto) — ayuda por "Ayuda" (IA, nav) + "Mensaje" por tienda. */}
                <StoreClientShell liveChat={false} />
                <StoreFloatingWidgets />
                {/* Widgets del marketplace (compare, dock, recently-viewed). */}
                <MarketplaceFloatingWidgets />
                <QuickAddModal />
                {/* Modal de éxito post-pedido (null hasta que haya pedido). */}
                <Suspense fallback={null}>
                  <OrderSuccessModal />
                </Suspense>
              </>
            )}
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
