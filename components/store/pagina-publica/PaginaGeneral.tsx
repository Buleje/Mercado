import "server-only";
import { safeJsonLdStringify } from "@/lib/seo/json-ld";
import { Suspense, Fragment, type ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ShoppingBag, Settings, ExternalLink, MapPin, Sparkles, Tag,
  MessageCircle, Truck, ShieldCheck, ChevronRight, ArrowRight,
  Search as SearchIcon,
} from "@buleje/design-system/icons";
import { Enchufe } from "@/lib/extensiones/Enchufe";
import { resolverPiezas } from "@/lib/extensiones/resolver";
import { pideSinPiezas, type ParametrosDeBusqueda } from "@/extensiones/_contrato";
import TenantPageTracker from "@/app/t/[slug]/_components/TenantPageTracker";
import WebVitalsReporter from "@/components/WebVitalsReporter";
import VendorTrustBadges from "@/components/store/VendorTrustBadges";
import StickyCouponBanner from "@/components/store/StickyCouponBanner";
import StorefrontNavbar from "@/components/store/StorefrontNavbar";
import TenantFooter from "@/components/store/TenantFooter";
import { SettingsProvider } from "@/contexts/settings-context";
import PreviewLiveTheme from "@/components/store/PreviewLiveTheme";
import TenantWelcomePopup from "@/components/store/TenantWelcomePopup";
import TenantExitIntentPopup from "@/components/store/tenant/TenantExitIntentPopup";
import AbHeroTest from "@/components/store/tenant/AbHeroTest";
import TenantPushOptIn from "@/components/store/tenant/TenantPushOptIn";
import SectionViewTracker from "@/components/store/tenant/SectionViewTracker";
import CustomCursor from "@/components/store/tenant/CustomCursor";
import RotatingAnnouncementBar from "@/components/store/tenant/RotatingAnnouncementBar";
import StorefrontEditOverlay from "@/components/store/StorefrontEditOverlay";
import TenantAnalytics from "@/components/store/TenantAnalytics";
import TenantHero, { type HeroVariant } from "@/components/store/tenant/TenantHero";
import WhatsAppFloat from "@/components/store/tenant/WhatsAppFloat";
import ScrollReveal from "@/components/store/tenant/ScrollReveal";
import TenantTextStyles from "@/components/store/tenant/TenantTextStyles";
import TenantSectionStyles from "@/components/store/tenant/TenantSectionStyles";
import CountdownBanner from "@/components/store/tenant/CountdownBanner";
import FreeShipPromoBar from "@/components/store/tenant/FreeShipPromoBar";
import SocialProofToasts from "@/components/store/tenant/SocialProofToasts";
import OpenStatusBadge from "@/components/store/tenant/OpenStatusBadge";
import SeasonalDecor from "@/components/store/tenant/SeasonalDecor";
import TenantTestimonials from "@/components/store/tenant/TenantTestimonials";
import SectionRenderer from "@/components/store/tenant/SectionRenderer";
import ProStoreSections from "@/components/store/tenant/ProStoreSections";
import { deserializePageData, tokensToCssBlock, FONT_FAMILIES, EDITOR_FONT_MAP, EDITOR_BTN_RADIUS } from "@/lib/store-design-tokens";
import { accesoPaginaPublica, previewDe } from "./datos-pagina-general";

export { loadPageData } from "./datos-pagina-general";

/**
 * <PaginaGeneral> — la página pública de `/t/<negocio>` que ven todos los
 * negocios (ADR-458). Salió TAL CUAL de `app/t/[slug]/page.tsx`: mismo HTML.
 *
 * La ruta la dibuja directo, o como respaldo de una «página propia» (enchufe
 * `tienda.pagina`). Una página propia arranca dibujándola a ella y cambia lo
 * que el negocio pida; por eso repite los controles de la ruta (negocio que
 * existe, publicado o vista previa del dueño): dibujada desde cualquier lado,
 * nunca muestra lo que la ruta no mostraría. Los datos se leen una vez por
 * pedido (`cache()` en `datos-pagina-general.ts`).
 *
 * Server component: necesita `await connection()` antes (lo hace la ruta).
 */
export interface PaginaGeneralProps {
  /** El negocio tal como vino en la URL (slug, id o `custom--<host>`). Desde una página propia: `ctx.slug`. */
  slug: string;
  /** La búsqueda de la URL; de acá sale `?preview=true`. */
  searchParams: ParametrosDeBusqueda;
}

export async function PaginaGeneral({ slug, searchParams }: PaginaGeneralProps) {
  const acceso = await accesoPaginaPublica(slug, previewDe(searchParams));
  if (!acceso) notFound();
  const { datos: data, isPreview } = acceso;

  const { tenant, customization, featured, promotions, exclusiveCount, displayName, showcase, productCount, categories, editorTheme, features, socialProof } = data;

  // ADR-457 · ¿qué piezas prendió el superadmin en la portada de este negocio?
  // Una lectura con caché (TenantPieza, por negocio) que nunca tira: ante un
  // error, ninguna. Sin piezas no se monta ningún enchufe y la portada sale igual.
  // `?sinPiezas=1` (ADR-458): la general pura, a donde recarga el navegador si
  // una pieza que reemplaza falló al dibujarse.
  const piezasDeLaPortada = pideSinPiezas(searchParams) ? [] : await resolverPiezas(tenant.id, "tienda.portada");
  const piezasPortada = {
    agrega: piezasDeLaPortada.some((p) => p.entrada.portada?.modo === "agrega"),
    reemplaza: piezasDeLaPortada.some((p) => p.entrada.portada?.modo === "reemplaza"),
  };

  // Design tokens del SectionsBuilder tienen prioridad sobre customization viejo.
  // El bodeguero edita primary/accent desde el tab "Diseño" del admin.
  const pageDataForColors = deserializePageData(customization.footerHtml);
  // settings.storeTheme (editor) manda; luego el diseño viejo (footerHtml),
  // customization y por último el color del tenant.
  const primary = editorTheme.primaryColor || pageDataForColors.design.primaryColor || customization.primaryColor || tenant.primaryColor || "var(--accent)";
  const accent = editorTheme.accentColor || pageDataForColors.design.accentColor || customization.accentColor || "#f4a261";

  // Preview EN VIVO (Brandon 2026-06-08): las inline-styles de color usan estas
  // CSS vars con FALLBACK al valor del server. Así el render normal es idéntico,
  // pero PreviewLiveTheme (en ?preview=true) puede sobrescribir --tenant-primary/
  // accent vía postMessage y la tienda cambia de color sin recargar.
  const cssPrimary = `var(--tenant-primary, ${primary})`;
  const cssAccent = `var(--tenant-accent, ${accent})`;
  // El logo y el título usan el nombre público real (storeTheme.storeName) en
  // lugar de `tenant.name` — para que el comercio nunca vea el nombre raw del
  // tenant ni la marca del marketplace en su propia página.
  const logoText = displayName.slice(0, 2).toUpperCase();
  const heroTitle = customization.heroTitle ?? displayName;
  // Subtítulo: el que cargó el dueño o, si no hay, un tagline derivado de sus
  // categorías reales ("Tecnología, Hogar y Accesorios con delivery rápido").
  const catNames = categories.slice(0, 3).map((c) => c.name);
  const catPhrase =
    catNames.length === 0
      ? ""
      : catNames.length === 1
        ? catNames[0]
        : `${catNames.slice(0, -1).join(", ")} y ${catNames[catNames.length - 1]}`;
  const heroSubtitle =
    customization.heroSubtitle ?? (catPhrase ? `${catPhrase} con delivery rápido a tu puerta.` : undefined);
  const heroImage = customization.heroImageUrl;

  const formatPrice = (n: number) => `S/${n.toFixed(2)}`;

  // Datos del bento del hero de escritorio: 1 producto destacado + tiles de
  // categorías reales. Sin inventar nada — sale del catálogo del comercio.
  const heroFeatured = showcase[0] ?? null;
  const heroTiles = categories.slice(0, 3);

  // Plan badges alineados con plan-tiers.ts mayo 2026 v2.
  // PlanId DB ↔ Label: free→Free, pro→Starter, business→Pro, enterprise→Business.
  const planBadge: Record<string, { label: string; className: string }> = {
    free: {
      label: "Free",
      className: "bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:bg-[var(--surface-sunken)] dark:text-[var(--text-tertiary)]",
    },
    pro: {
      label: "Starter",
      className: "bg-teal-100 text-[var(--accent-dark)] dark:bg-teal-900/30 dark:text-teal-400",
    },
    business: {
      label: "Pro",
      className: "bg-emerald-100 text-[var(--data-success-700)] dark:bg-emerald-900/30 dark:text-emerald-400",
    },
    enterprise: {
      label: "Business",
      className: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-700)]/30 dark:text-amber-400",
    },
  };
  const badge = planBadge[tenant.plan] ?? planBadge.free;

  // ── Design tokens del tenant — pintados via CSS vars en el wrapper .tenant-theme ──
  const pageData = deserializePageData(customization.footerHtml);
  // El editor (settings.storeTheme) manda sobre el diseño viejo (footerHtml):
  // sus colores alimentan los CSS vars --tenant-* que usan las inline-styles.
  // (Fuente única de verdad del tema — Brandon 2026-06-08.) La tipografía del
  // editor usa otra taxonomía → se deja la de footerHtml por ahora.
  const designTokens = {
    ...pageData.design,
    ...(editorTheme.primaryColor ? { primaryColor: editorTheme.primaryColor } : {}),
    ...(editorTheme.secondaryColor ? { secondaryColor: editorTheme.secondaryColor } : {}),
    ...(editorTheme.accentColor ? { accentColor: editorTheme.accentColor } : {}),
  };

  // Tipografía + estilos UI del editor (settings.storeTheme) = fuente de verdad.
  // El editor usa otra taxonomía de fuentes → EDITOR_FONT_MAP. El font-family lo
  // maneja .tenant-theme vía var(--tenant-font), que sobreescribimos abajo (y que
  // PreviewLiveTheme puede pisar en vivo). buttonStyle → --tenant-btn-radius.
  const baseFont = FONT_FAMILIES[designTokens.fontFamily];
  const editorFont = editorTheme.fontFamily ? EDITOR_FONT_MAP[editorTheme.fontFamily] : undefined;
  const fontStack = editorFont?.stack ?? baseFont.stack;
  const fontLabel = editorFont ? editorFont.label : baseFont.label; // null = sistema (sin Google Font)
  // Par de fuentes (Lote A): bodyFontFamily = CUERPO; vacío = misma que títulos.
  const editorBodyFont = editorTheme.bodyFontFamily ? EDITOR_FONT_MAP[editorTheme.bodyFontFamily] : undefined;
  let bodyStack = editorBodyFont?.stack ?? fontStack;
  const bodyLabel = editorBodyFont ? editorBodyFont.label : null;
  // Fuente personalizada (Lote F): URL hosteada → @font-face. Se aplica a títulos
  // y/o cuerpo según customFontTarget. Tiene prioridad como 1ª familia del stack.
  // [SECURITY] customFontUrl se interpola en `url("...")` dentro de un <style> raw.
  // El `.replace(/"/g,"")` viejo NO frena `</style>`/`)` (stored XSS / breakout).
  // Aceptamos solo https a un archivo de fuente, sin chars que rompan el CSS.
  const safeCustomFontUrl = /^https:\/\/[^\s"'()<>;]+\.(woff2?|ttf|otf)(\?[^\s"'()<>;]*)?$/i.test((editorTheme.customFontUrl ?? "").trim())
    ? (editorTheme.customFontUrl as string).trim()
    : "";
  const customFontActive = Boolean(safeCustomFontUrl) && editorTheme.customFontTarget !== "none" && editorTheme.customFontTarget !== "";
  let headingStack = fontStack;
  if (customFontActive) {
    const cf = `"BulejeCustomFont"`;
    const tgt = editorTheme.customFontTarget;
    if (tgt === "headings" || tgt === "all") headingStack = `${cf}, ${fontStack}`;
    if (tgt === "body" || tgt === "all") bodyStack = `${cf}, ${bodyStack}`;
  }
  const btnRadius = editorTheme.buttonStyle ? EDITOR_BTN_RADIUS[editorTheme.buttonStyle] : undefined;
  // Escala tipográfica global (Brandon 2026-06-26): agranda/achica TODO el texto
  // de la tienda escalando el font-size raíz (los text-* de Tailwind son rem).
  // Solo afecta a /t (documento propio), no al admin.
  const fontScalePct = editorTheme.fontScale === "small" ? 92 : editorTheme.fontScale === "large" ? 112 : 100;
  // Lote H: tamaño base en px tiene prioridad sobre la escala %; interlineado opcional.
  const baseFontPx = typeof editorTheme.baseFontSize === "number" && editorTheme.baseFontSize >= 12 && editorTheme.baseFontSize <= 24 && editorTheme.baseFontSize !== 16 ? editorTheme.baseFontSize : null;
  const lineH = typeof editorTheme.lineHeight === "number" && editorTheme.lineHeight >= 1.2 && editorTheme.lineHeight <= 2.2 ? editorTheme.lineHeight : null;

  // cardStyle del editor → tratamiento de las tarjetas de producto de la vitrina.
  const cardClass =
    editorTheme.cardStyle === "minimal"
      ? "border border-[var(--rule-base)]"
      : editorTheme.cardStyle === "border"
        ? "border-2 border-[var(--rule-base)]"
        : editorTheme.cardStyle === "glass"
          ? "border border-white/30 bg-white/70 backdrop-blur-md shadow-sm dark:bg-white/10"
          : "border border-[var(--rule-base)] shadow-sm hover:shadow-xl"; // "shadow"/default

  // Diseño de tarjetas (Brandon 2026-06-27): override inline sobre cardClass.
  const _cd = editorTheme.cardDesign ?? {};
  const _cardShadow: Record<string, string> = { none: "none", soft: "0 4px 16px rgba(0,0,0,0.10)", deep: "0 12px 32px rgba(0,0,0,0.18)" };
  const cardDesignStyle = {
    ...(_cd.bg ? { background: _cd.bg } : {}),
    ...(typeof _cd.radius === "number" ? { borderRadius: _cd.radius } : {}),
    ...(_cd.border ? { border: `${_cd.borderW ?? 2}px solid ${_cd.border}` } : {}),
    ...(_cd.shadow ? { boxShadow: _cardShadow[_cd.shadow] } : {}),
  } as Record<string, string | number>;

  // Override de tokens de marca (--accent/--color-primary) con el color del
  // tenant para que TODO (navbar, eyebrows, botones token-based) use la marca,
  // no solo el hero. Solo si el color es literal (#hex) — los tenants sin tema
  // propio heredan el default. Brandon 2026-06-21.
  const isLitColor = (v: string) => Boolean(v) && !v.trim().startsWith("var(");
  const brandTokenVars = isLitColor(primary)
    ? ({
        "--accent": primary,
        "--accent-600": primary,
        "--accent-dark": primary,
        "--color-primary": primary,
        ...(isLitColor(accent) ? { "--accent-soft": accent } : {}),
      } as React.CSSProperties)
    : undefined;

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] tenant-theme" data-store-chrome="tenant" data-pt={editorTheme.pageTransition !== "none" ? editorTheme.pageTransition : undefined} style={{ ...brandTokenVars, ...(editorTheme.pageBgColor && ({ "--surface-canvas": editorTheme.pageBgColor } as React.CSSProperties)), ...(editorTheme.pageTransition !== "none" && { animation: `buleje-pt-${editorTheme.pageTransition} .45s ease both` }) }}>
      {/* Anuncios rotativos (Lote C) — barra superior con N mensajes. */}
      {editorTheme.announcements.length > 0 && <RotatingAnnouncementBar messages={editorTheme.announcements} intervalMs={(editorTheme.announcementInterval ?? 4) * 1000} />}
      {/* Lote U #6.2: datos estructurados LocalBusiness para Google */}
      {editorTheme.schemaLocalBusiness && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLdStringify({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            name: displayName,
            url: `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe"}/t/${tenant.slug}`,
            ...(customization.whatsappPhone || tenant.ownerPhone ? { telephone: customization.whatsappPhone ?? tenant.ownerPhone } : {}),
            priceRange: "$$",
            areaServed: "Perú",
          }) }}
        />
      )}
      {/* Lote U #7.2: cursor de marca */}
      {editorTheme.customCursor !== "none" && <CustomCursor mode={editorTheme.customCursor} />}
      {/* CSS dinamico generado a partir de los design tokens del tenant.
          Sobreescribe el theme de Buleje solo en el subarbol .tenant-theme. */}
      <style dangerouslySetInnerHTML={{ __html: tokensToCssBlock(designTokens) }} />
      {/* Escala tipográfica global del editor: tamaño base px (prioridad) o escala %. */}
      {baseFontPx ? (
        <style dangerouslySetInnerHTML={{ __html: `html{font-size:${baseFontPx}px}` }} />
      ) : fontScalePct !== 100 ? (
        <style dangerouslySetInnerHTML={{ __html: `html{font-size:${fontScalePct}%}` }} />
      ) : null}
      {/* Lote H: interlineado global opcional. */}
      {lineH && (
        <style dangerouslySetInnerHTML={{ __html: `.tenant-theme{line-height:${lineH}}` }} />
      )}
      {/* Lote J: peso de fuente de los títulos (override de las clases font-bold). */}
      {typeof editorTheme.headingWeight === "number" && editorTheme.headingWeight >= 400 && editorTheme.headingWeight <= 900 && (
        <style dangerouslySetInnerHTML={{ __html: `.tenant-theme .font-display{font-weight:${editorTheme.headingWeight} !important}` }} />
      )}
      {/* Animaciones de entrada al scrollear (Brandon 2026-06-26) — el estado
          oculto lo agrega ScrollReveal (JS), no el server → SEO/no-JS intactos. */}
      {editorTheme.animateOnScroll && (
        <>
          <style dangerouslySetInnerHTML={{ __html: ".pb-reveal{opacity:0;transform:translateY(18px)}.pb-reveal-in{opacity:1;transform:none;transition:opacity .6s ease,transform .6s ease}" }} />
          <ScrollReveal />
        </>
      )}
      {/* Override de tipografía (editor) + radio de botón — sobre .tenant-theme,
          después de tokensToCssBlock para ganar. PreviewLiveTheme pisa en vivo. */}
      <style dangerouslySetInnerHTML={{ __html: `.tenant-theme{--tenant-font:${bodyStack};--font-display-family:${headingStack};${btnRadius ? `--tenant-btn-radius:${btnRadius};` : ""}}` }} />
      {/* Fuente personalizada del dueño (Lote F) — @font-face desde URL hosteada. */}
      {customFontActive && (
        <style dangerouslySetInnerHTML={{ __html: `@font-face{font-family:"BulejeCustomFont";src:url("${safeCustomFontUrl}");font-display:swap;}` }} />
      )}
      {/* Keyframes de animación de entrada por sección (Brandon 2026-06-27 · #4).
          @media reduced-motion las desactiva (a11y). */}
      <style dangerouslySetInnerHTML={{ __html: "@keyframes buleje-fade{from{opacity:0}to{opacity:1}}@keyframes buleje-up{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}@keyframes buleje-zoom{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}@media (prefers-reduced-motion: reduce){[data-pb]{animation:none !important}}" }} />
      {/* Lote U #7.3: transición de entrada de la página */}
      {editorTheme.pageTransition !== "none" && (
        <style dangerouslySetInnerHTML={{ __html: "@keyframes buleje-pt-fade{from{opacity:0}to{opacity:1}}@keyframes buleje-pt-slide{from{opacity:0;transform:translateX(28px)}to{opacity:1;transform:none}}@keyframes buleje-pt-blur{from{opacity:0;filter:blur(10px)}to{opacity:1;filter:none}}@media (prefers-reduced-motion: reduce){[data-pt]{animation:none !important}}" }} />
      )}

      {/* Google Fonts loader — carga solo la fuente que el tenant eligio.
          PERF 2026-05-24: preconnect evita ~200-400ms de DNS+TCP+TLS a Google
          antes de descubrir el stylesheet (display=swap ya evita FOIT). */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {fontLabel && (
        <link
          rel="stylesheet"
          href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontLabel).replace(/%20/g, "+")}:wght@400;600;700;800;900&display=swap`}
        />
      )}
      {/* Fuente de CUERPO (Lote A) — solo si difiere de la de títulos. */}
      {bodyLabel && bodyLabel !== fontLabel && (
        <link
          rel="stylesheet"
          href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(bodyLabel).replace(/%20/g, "+")}:wght@400;600;700;800;900&display=swap`}
        />
      )}
      {/* Fuentes reales POR SECCIÓN (Brandon 2026-06-27 · #3): carga las familias
          Google usadas en sectionStyles[].font (la 1ª entre comillas del stack). */}
      {Array.from(new Set(
        Object.values(editorTheme.sectionStyles ?? {})
          .map((s) => (s as { font?: string }).font)
          .filter((f): f is string => typeof f === "string" && f.includes('"'))
          .map((f) => f.match(/"([^"]+)"/)?.[1])
          .filter((x): x is string => !!x),
      )).map((fam) => (
        <link
          key={fam}
          rel="stylesheet"
          href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam).replace(/%20/g, "+")}:wght@400;600;700;800;900&display=swap`}
        />
      ))}

      {/* Beacon tracker (client component) */}
      <TenantPageTracker tenantSlug={tenant.slug} />

      {/* RUM Core Web Vitals → historial de rendimiento del tab admin (per-tenant).
          El landing white-label renderiza su propio árbol (fuera del (store) shell),
          así que el reporter se monta acá con el slug explícito. No en preview
          (no ensuciar el histórico con el dueño editando). */}
      {!isPreview && <WebVitalsReporter tenantSlug={tenant.slug} />}

      {/* GA4 + Meta Pixel del comerciante (Brandon 2026-06-26) — solo en la tienda
          pública, NUNCA en preview (no contaminar las métricas con el dueño editando). */}
      {!isPreview && (
        <TenantAnalytics
          gaId={editorTheme.analyticsId}
          pixelId={editorTheme.pixelId}
          tiktokPixelId={editorTheme.tiktokPixelId}
        />
      )}

      {/* Preview EN VIVO: escucha al editor y aplica tokens sin recargar. */}
      {isPreview && <PreviewLiveTheme />}

      {/* Page builder Fase 1 (Brandon 2026-06-25): overlay de edición — click en
          un bloque [data-pb] abre su panel en el editor. Solo en preview. */}
      {isPreview && <StorefrontEditOverlay />}

      {/* Estilos por texto (barra de texto flotante) — aplica tamaño/negrita/color/
          alineación sobre los [data-live]. Solo si el dueño configuró alguno. */}
      {Object.keys(editorTheme.textStyles).length > 0 && (
        <TenantTextStyles styles={editorTheme.textStyles} />
      )}

      {/* Estilos por sección (editar componente individual) — aplica fondo/texto/
          espaciado SOLO a la sección [data-pb] elegida. */}
      {Object.keys(editorTheme.sectionStyles).length > 0 && (
        <TenantSectionStyles styles={editorTheme.sectionStyles} />
      )}

      {/* Nav ÚNICO de la tienda — el MISMO StorefrontNavbar del catálogo
          (`/t/<slug>/tienda`). Tenant-aware: Inicio → esta landing, Catálogo →
          el catálogo, buscador → catálogo. El carrito es un enlace al catálogo
          (esta landing está fuera del chrome `(store)`, sin CartProvider). */}
      <StorefrontNavbar
        name={displayName}
        logo={tenant.logoUrl}
        homeHref={`/t/${tenant.slug}`}
        catalogHref={`/t/${tenant.slug}/tienda`}
        searchHref={`/t/${tenant.slug}/tienda#productos`}
        cartHref={`/t/${tenant.slug}/tienda`}
        bgColor={editorTheme.navbarBgColor || undefined}
        textColor={editorTheme.navbarTextColor || undefined}
        catalogLabel={editorTheme.navCatalogLabel || undefined}
        extraLinks={editorTheme.navExtraLinks}
      />

      {/* Tema estacional + envío gratis + estado Abierto/Cerrado (Brandon
          2026-06-26, Modo Creativo > Automatización). */}
      {editorTheme.seasonalTheme && editorTheme.seasonalTheme !== "none" && (
        <SeasonalDecor season={editorTheme.seasonalTheme as "none" | "navidad" | "fiestas_patrias" | "halloween"} />
      )}
      {editorTheme.freeShipEnabled && (
        <FreeShipPromoBar slug={tenant.slug} threshold={editorTheme.freeShipThreshold} text={editorTheme.freeShipText} />
      )}
      {editorTheme.openStatusEnabled && (Object.keys(editorTheme.schedules || {}).length > 0 || editorTheme.scheduleExceptions.length > 0) && (
        <div className="flex justify-center px-4 pt-3">
          <OpenStatusBadge schedules={editorTheme.schedules} exceptions={editorTheme.scheduleExceptions} />
        </div>
      )}

      {/* Contador de oferta (Brandon 2026-06-26) — banda de urgencia arriba.
          Se oculta sola al vencer (client component). */}
      {editorTheme.countdownEnabled && editorTheme.countdownEndsAt && (
        <CountdownBanner
          title={editorTheme.countdownTitle ?? "¡Oferta por tiempo limitado!"}
          endsAt={editorTheme.countdownEndsAt}
        />
      )}

      {/* Banner de anuncio (Brandon 2026-06-25): imagen full-width arriba de la
          tienda, configurable desde Modo Creativo > Secciones. */}
      {editorTheme.announcementImage && (
        <div data-pb="announcement" className="w-full bg-[var(--surface-sunken)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- banner full-width de aspecto variable */}
          <img
            src={editorTheme.announcementImage}
            alt={`Anuncio de ${displayName}`}
            className="block w-full h-auto max-h-[280px] object-cover"
          />
        </div>
      )}

      {/* HERO con variantes (Brandon 2026-06-26, page builder Fase 4) — TenantHero.tsx.
          El dueño elige editorial|centered|split|immersive desde Modo Creativo > Hero. */}
      <TenantHero
        variant={(editorTheme.heroVariant as HeroVariant) || "minimal"}
        heroTitle={heroTitle}
        heroSubtitle={heroSubtitle}
        heroImage={heroImage}
        heroGradientFrom={editorTheme.heroGradientFrom}
        heroGradientTo={editorTheme.heroGradientTo}
        heroGradientAngle={editorTheme.heroGradientAngle}
        heroVideoUrl={editorTheme.heroVideoUrl}
        heroCta2Label={editorTheme.heroCta2Label}
        heroCta2Url={editorTheme.heroCta2Url}
        displayName={displayName}
        slug={tenant.slug}
        ownerPhone={tenant.ownerPhone}
        whatsappPhone={customization.whatsappPhone}
        createdYear={tenant.createdAt ? new Date(tenant.createdAt).getFullYear() : null}
        logoUrl={tenant.logoUrl}
        logoText={logoText}
        primary={primary}
        accent={accent}
        btnRadiusFallback={btnRadius ?? "9999px"}
        exclusiveCount={exclusiveCount}
        productCount={productCount}
        heroFeatured={heroFeatured}
        heroTiles={heroTiles}
        isPreview={isPreview}
        badgeLabel={badge.label}
        badgeClassName={badge.className}
        heroCtaLabel={customization.heroCtaLabel}
        heroCtaUrl={customization.heroCtaUrl}
        overlay={editorTheme.heroOverlay}
        align={(editorTheme.heroAlign as "left" | "center") ?? "left"}
        height={(editorTheme.heroHeight as "compact" | "normal" | "tall") ?? "normal"}
        showBadges={editorTheme.heroShowBadges}
        inlineText={editorTheme.inlineText}
      />
      {/* Lote P: A/B test del hero (variante B de título/subtítulo) — Brandon 2026-06-28. */}
      {editorTheme.abTestEnabled && (editorTheme.heroVariantB?.heroTitle || editorTheme.heroVariantB?.heroSubtitle) && (
        <AbHeroTest slug={tenant.slug} variantB={editorTheme.heroVariantB} />
      )}

      {/* ═══ Cuerpo reordenable (Brandon 2026-06-26, page builder Fase 2):
          trust, promos, featured, info se renderizan en el orden de
          editorTheme.bodyOrder. Default (vacío) = orden histórico → sin cambio
          visual. Los bloques quedan en su sitio; solo cambia el orden de emisión. ═══ */}
      {(() => {
        const __body: Record<string, ReactNode> = {};
        // Trust badges — verificado, ventas, antigüedad
        __body.trust = (
      <div data-pb="trust">
        <VendorTrustBadges
          verified={tenant.active}
          createdYear={tenant.createdAt ? new Date(tenant.createdAt).getFullYear() : 2026}
        />
      </div>
        );
        // Promociones + bandas de imágenes por sección (anidadas a este bloque)
        __body.promos = (
          <>
      {/* Active promotions banner — solo renderea si hay promos reales o en modo preview */}
      {(promotions.length > 0 || isPreview) && (
        <section data-pb="promos" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6 relative z-20">
          {promotions.length > 0 ? (
            <div className="space-y-2">
              {promotions.slice(0, 3).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 p-4 rounded-2xl shadow-lg"
                  style={{
                    background: `linear-gradient(90deg, ${cssAccent} 0%, ${cssPrimary} 100%)`,
                  }}
                >
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                    <Tag className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-white">{p.title}</p>
                    {p.description && (
                      <p className="text-white/85 text-sm truncate">{p.description}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 px-3 py-1 rounded-full bg-white/25 text-white font-extrabold text-sm">
                    {p.discountType === "percent"
                      ? `${p.discountValue}% OFF`
                      : p.discountType === "amount"
                      ? `-S/${p.discountValue}`
                      : `S/${p.discountValue}`}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Placeholder SOLO en modo preview — al público le ocultamos esto */
            <div className="flex items-center gap-3 p-4 rounded-2xl shadow-lg border-2 border-dashed border-[var(--rule-base)] bg-white/80 dark:bg-[var(--surface-canvas)]/80 backdrop-blur">
              <div className="w-10 h-10 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center flex-shrink-0">
                <Tag className="w-5 h-5 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[var(--text-tertiary)]">Promoción destacada</p>
                <p className="text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] text-sm">Vista previa · configura desde Mi Tienda &gt; Promociones</p>
              </div>
              <div className="flex-shrink-0 px-3 py-1 rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] font-extrabold text-sm">
                % OFF
              </div>
            </div>
          )}
        </section>
      )}

      {/* Imágenes por sección (Brandon 2026-06-25): bandas full-width que el dueño
          sube desde Modo Creativo > Secciones (una por sección). */}
      {Object.entries(editorTheme.sectionImages)
        .filter(([, url]) => typeof url === "string" && url.length > 0)
        .map(([key, url]) => (
          <div key={key} className="w-full bg-[var(--surface-sunken)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- banda full-width de aspecto variable */}
            <img
              src={url}
              alt={`${displayName} — ${key}`}
              className="block w-full h-auto max-h-[320px] object-cover"
            />
          </div>
        ))}
          </>
        );
        // Productos al frente + bloques PRO + empty-state (anidados a este bloque)
        __body.featured = (
          <>
      {/* ═══════════════ Productos al frente (Brandon 2026-06-08) ═══════════════
          Vitrina de productos REALES en la landing — destacados si el dueño los
          marcó (tenantPageProductOverride), si no caemos al catálogo real. Es lo
          que más vende: el cliente ve productos sin tener que entrar al catálogo. */}
      {(showcase.length > 0 || isPreview) && (
        <section data-pb="featured" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div style={editorTheme.sectionText?.featured?.align ? { textAlign: editorTheme.sectionText.featured.align } : undefined}>
              <p data-pb-text="featured:eyebrow" data-live="sectionText:featured:eyebrow" className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1.5">
                {editorTheme.sectionText?.featured?.eyebrow || (featured.length > 0 ? "Destacados" : "Nuestro catálogo")}
              </p>
              <h2 data-pb-text="featured:title" data-live="sectionText:featured:title" className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
                {editorTheme.sectionText?.featured?.title || (featured.length > 0 ? "Lo que recomendamos" : `Algunos productos de ${displayName}`)}
              </h2>
            </div>
            <Link
              href={`/t/${tenant.slug}/tienda`}
              className="hidden shrink-0 items-center gap-1.5 text-sm font-extrabold text-[var(--accent)] transition-all hover:gap-2.5 sm:inline-flex"
            >
              <span data-live="inlineText:featured.viewAll">{editorTheme.inlineText?.["featured.viewAll"] || "Ver todo"}</span>
              <ArrowRight className="w-4 h-4" strokeWidth={2.5} aria-hidden />
            </Link>
          </div>

          {showcase.length > 0 ? (
            <div className={
              editorTheme.featuredLayout === "list" ? "flex flex-col gap-3"
              : editorTheme.featuredLayout === "carousel" ? "flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]"
              : `grid gap-4 ${editorTheme.featuredCols === 2 ? "grid-cols-2 sm:grid-cols-2 md:grid-cols-2" : editorTheme.featuredCols === 3 ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"}`
            }>
              {showcase.slice(0, editorTheme.featuredCount ?? 8).map((p) => {
                const isExclusive = p.exclusivePrice != null;
                const shownPrice = isExclusive ? p.exclusivePrice! : p.price;
                const isList = editorTheme.featuredLayout === "list";
                const isCarousel = editorTheme.featuredLayout === "carousel";
                return (
                  <Link
                    key={p.id}
                    href={`/t/${tenant.slug}/tienda`}
                    data-pb-card="1"
                    style={cardDesignStyle}
                    className={`group relative rounded-2xl overflow-hidden bg-[var(--surface-raised)] transition-all hover:-translate-y-0.5 ${cardClass} ${isList ? "sm:flex sm:items-stretch" : ""} ${isCarousel ? "snap-start shrink-0 w-44 sm:w-52" : ""}`}
                  >
                    <div className={`${isList ? "aspect-[4/3] sm:w-44 sm:shrink-0" : "aspect-square"} bg-[var(--surface-sunken)] overflow-hidden relative`}>
                      {p.image ? (
                        <Image
                          src={p.image}
                          alt={p.name}
                          fill
                          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
                          className="object-cover group-hover:scale-105 transition-transform duration-[var(--dur-base)]"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <ShoppingBag className="w-8 h-8 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
                        </div>
                      )}
                    </div>

                    {/* Exclusive badge */}
                    {isExclusive && p.savingsPercent != null && p.savingsPercent > 0 && (
                      <div
                        className="absolute top-2 left-2 px-2 py-1 rounded-full text-white font-extrabold text-xs shadow-lg"
                        style={{ background: cssAccent }}
                      >
                        -{p.savingsPercent}%
                      </div>
                    )}

                    {/* Custom badge */}
                    {p.badge && (
                      <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-white/95 text-[var(--text-primary)] font-bold text-[length:var(--ts-2xs)] shadow">
                        {p.badge}
                      </div>
                    )}

                    <div className={`p-3 ${isList ? "sm:flex-1 sm:flex sm:flex-col sm:justify-center" : ""}`}>
                      <p data-pb-card-name className="font-semibold text-sm truncate text-[var(--text-primary)]" style={_cd.nameColor ? { color: _cd.nameColor } : undefined}>{p.name}</p>
                      <p className="text-xs text-[var(--text-secondary)] mb-2">{p.unit}</p>
                      <div className="flex items-baseline gap-2">
                        <span
                          data-pb-card-price
                          className="font-extrabold text-lg"
                          style={{ color: _cd.priceColor || (isExclusive ? cssPrimary : undefined) }}
                        >
                          {formatPrice(shownPrice)}
                        </span>
                        {isExclusive && (
                          <span className="text-xs text-[var(--text-tertiary)] line-through">
                            {formatPrice(p.price)}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            /* Skeleton SOLO visible en modo preview (no al cliente final) */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl overflow-hidden bg-[var(--surface-raised)] border-2 border-dashed border-[var(--rule-base)]"
                >
                  <div className="aspect-square bg-[var(--surface-sunken)] flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center">
                        <ShoppingBag className="w-6 h-6 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]" />
                      </div>
                      <p className="text-xs font-semibold text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">Producto {i + 1}</p>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="h-4 w-20 bg-[var(--surface-sunken)] rounded" />
                    <div className="h-5 w-14 bg-[var(--surface-sunken)] rounded" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* CTA explorar catálogo completo — siempre visible si hay productos */}
          {showcase.length > 0 && (
            <div className="mt-7 text-center">
              <Link
                href={`/t/${tenant.slug}/tienda`}
                className="inline-flex items-center gap-2 rounded-full text-white px-6 h-12 text-sm font-extrabold shadow-lg transition-all hover:opacity-90"
                style={{ background: cssPrimary }}
              >
                <ShoppingBag className="w-4 h-4" strokeWidth={2.5} aria-hidden />
                <span data-live="inlineText:featured.viewAllFull">{editorTheme.inlineText?.["featured.viewAllFull"] || "Ver catálogo completo"}</span>
                <ChevronRight className="w-4 h-4" strokeWidth={2.5} aria-hidden />
              </Link>
            </div>
          )}
        </section>
      )}

      {/* ═══ Bloques PRO opt-in por tienda (ADR-298 · feature flags) ═══
          Solo se renderizan si el tenant tiene flags en storeTheme.features.
          CompraFácil los prende; las demás tiendas no ven nada de esto. */}
      {features.length > 0 && (
        <ProStoreSections
          features={features}
          displayName={displayName}
          primary={cssPrimary}
          accent={cssAccent}
          tenantSlug={tenant.slug}
          whatsappPhone={customization.whatsappPhone ?? tenant.ownerPhone}
          bestSellers={showcase.map((p) => ({ id: p.id, name: p.name, image: p.image, unit: p.unit, price: p.price }))}
        />
      )}

      {/* Si NO hay NINGÚN producto que mostrar y NO es preview: bloque "Cómo
          pedir" como empty-state. Con productos en la vitrina ya no hace falta. */}
      {showcase.length === 0 && !isPreview && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="mb-8 text-center max-w-2xl mx-auto">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-3">
              Cómo pedir
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
              Haz tu pedido en 3 pasos
            </h2>
          </div>
          <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                n: "01",
                title: "Explora el catálogo",
                desc: "Mira todos los productos disponibles con precios y stock.",
                Icon: SearchIcon,
              },
              {
                n: "02",
                title: "Arma tu pedido",
                desc: "Agrega lo que quieras. Verás el total real sin sorpresas.",
                Icon: ShoppingBag,
              },
              {
                n: "03",
                title: "Recibe en tu puerta",
                desc: "Pagas con Yape o efectivo al recibir. Delivery rápido a tu zona.",
                Icon: Truck,
              },
            ].map((step) => {
              const FIcon = step.Icon;
              return (
                <li
                  key={step.n}
                  className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-6"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <p
                      className="font-display text-[2rem] font-extrabold leading-none text-[var(--rule-base)] tabular-nums"
                    >
                      {step.n}
                    </p>
                    <span
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white"
                      style={{ background: cssPrimary }}
                    >
                      <FIcon className="h-5 w-5" strokeWidth={2} aria-hidden />
                    </span>
                  </div>
                  <h3 className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                    {step.desc}
                  </p>
                </li>
              );
            })}
          </ol>
          <div className="mt-8 text-center">
            <Link
              href={`/t/${tenant.slug}/tienda`}
              className="inline-flex items-center gap-2 rounded-full text-white px-6 h-12 text-sm font-extrabold shadow-lg transition-all hover:opacity-90"
              style={{ background: cssPrimary }}
            >
              <ShoppingBag className="w-4 h-4" strokeWidth={2.5} />
              Ver catálogo de {displayName}
              <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
            </Link>
          </div>
        </section>
      )}
          </>
        );
        // Información del negocio (anchor #info)
        __body.info = (
      <section id="info" data-pb="info" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 scroll-mt-20">
        <div className="mb-6" style={editorTheme.sectionText?.info?.align ? { textAlign: editorTheme.sectionText.info.align } : undefined}>
          <p data-pb-text="info:eyebrow" data-live="sectionText:info:eyebrow" className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1.5">
            {editorTheme.sectionText?.info?.eyebrow || "Información del negocio"}
          </p>
          <h2 data-pb-text="info:title" data-live="sectionText:info:title" className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
            {editorTheme.sectionText?.info?.title || `Lo que tienes que saber de ${displayName}`}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Antiguedad */}
          {tenant.createdAt && (
            <InfoCard
              icon={<ShieldCheck className="w-5 h-5" strokeWidth={2} />}
              label="Antigüedad"
              value={(() => {
                const years = new Date().getFullYear() - new Date(tenant.createdAt).getFullYear();
                if (years === 0) return "Nuevo · este año";
                if (years === 1) return "1 año atendiendo";
                return `${years} años atendiendo`;
              })()}
              hint={`En Buleje desde ${new Date(tenant.createdAt).getFullYear()}`}
              primary={cssPrimary}
              cardId="antiguedad"
              inlineText={editorTheme.inlineText}
            />
          )}

          {/* WhatsApp */}
          {(customization.whatsappPhone || tenant.ownerPhone) && (
            <InfoCard
              icon={<MessageCircle className="w-5 h-5" strokeWidth={2} />}
              label="Pedidos por WhatsApp"
              value={customization.whatsappPhone ?? tenant.ownerPhone ?? ""}
              hint="Respondemos al toque"
              primary={cssPrimary}
              href={`https://wa.me/${(customization.whatsappPhone ?? tenant.ownerPhone ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(`Hola ${displayName}, quiero hacer un pedido.`)}`}
              cardId="whatsapp"
              inlineText={editorTheme.inlineText}
            />
          )}

          {/* Direccion */}
          {customization.address && (
            <InfoCard
              icon={<MapPin className="w-5 h-5" strokeWidth={2} />}
              label="Ubicación"
              value={customization.address}
              hint="Delivery a tu zona"
              primary={cssPrimary}
              cardId="ubicacion"
              inlineText={editorTheme.inlineText}
            />
          )}

          {/* Metodos de pago (siempre visible — son los standard de Buleje) */}
          <InfoCard
            icon={<Tag className="w-5 h-5" strokeWidth={2} />}
            label="Métodos de pago"
            value="Yape · Plin · Efectivo"
            hint="Sin tarjeta obligatoria · pagas al recibir"
            primary={cssPrimary}
            cardId="pago"
            inlineText={editorTheme.inlineText}
          />

          {/* Delivery info */}
          <InfoCard
            icon={<Truck className="w-5 h-5" strokeWidth={2} />}
            label="Delivery"
            value="25–35 min promedio"
            hint="Motorizado propio o de la zona"
            primary={cssPrimary}
            cardId="delivery"
            inlineText={editorTheme.inlineText}
          />

          {/* Email si existe */}
          {customization.contactEmail && (
            <InfoCard
              icon={<ExternalLink className="w-5 h-5" strokeWidth={2} />}
              label="Email"
              value={customization.contactEmail}
              hint="Para consultas formales"
              primary={cssPrimary}
              href={`mailto:${customization.contactEmail}`}
              cardId="email"
              inlineText={editorTheme.inlineText}
            />
          )}
        </div>

        {/* Hint preview — solo el dueño lo ve */}
        {isPreview && (
          <p className="mt-6 text-xs text-[var(--text-tertiary)] flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" strokeWidth={2} aria-hidden />
            Solo lo que cargaste se muestra. Edita más datos desde <span className="font-mono text-[var(--accent)]">Mi tienda pública</span>.
          </p>
        )}
      </section>
        );
        // Testimonios (Brandon 2026-06-26): sección reordenable del cuerpo.
        __body.testimonials = (
          <TenantTestimonials testimonials={editorTheme.testimonials} primary={cssPrimary} text={editorTheme.sectionText?.testimonials} />
        );
        // ADR-457 · enchufe `tienda.portada` (modo agrega): los bloques de las
        // piezas que el superadmin prendió para este negocio. Sólo se monta si
        // hay alguna: sin piezas la portada sale con el mismo DOM de siempre
        // (medido 01-10). En su propio <Suspense>: una pieza lenta (tope 2 s)
        // no frena la portada entera, aparece cuando está.
        __body.pieza = piezasPortada.agrega ? (
          <Suspense fallback={null}>
            <Enchufe nombre="tienda.portada" modo="agrega" tenantId={tenant.id} slug={tenant.slug} />
          </Suspense>
        ) : null;
        // Orden final: bodyOrder válido primero, luego cualquier faltante (default).
        const __def = ["trust", "promos", "featured", "testimonials", "info", "pieza"];
        const __ord = (Array.isArray(editorTheme.bodyOrder) && editorTheme.bodyOrder.length
          ? editorTheme.bodyOrder.filter((k) => __def.includes(k))
          : []) as string[];
        for (const k of __def) if (!__ord.includes(k) && k !== "pieza") __ord.push(k);
        // El editor no ordena «pieza» (filtra a sus 5 claves): si bodyOrder no la
        // trae, va pegada ANTES de la vitrina, donde sea que el dueño la movió.
        if (!__ord.includes("pieza")) __ord.splice(Math.max(0, __ord.indexOf("featured")), 0, "pieza");
        // Secciones ocultas por el dueño (Brandon 2026-06-27): no renderizar.
        // En preview SÍ se muestran (atenuadas vía data-pb-hidden) para poder reactivarlas.
        const __hidden = new Set(Array.isArray(editorTheme.bodyHidden) ? editorTheme.bodyHidden : []);
        const __cuerpo = __ord
          .filter((k) => isPreview || !__hidden.has(k))
          .map((k) => <Fragment key={k}>{__body[k]}</Fragment>);
        // ADR-457 · modo reemplaza: una pieza (p. ej. la página por bloques del
        // dueño) se queda con el cuerpo entero; si falla, tarda o su página no
        // está publicada, se ve este mismo cuerpo — con los bloques que agregan
        // EN SU LUGAR (`agregaEnElFallback`). Si reemplaza, van después. Si el
        // reemplazo falla al DIBUJARSE, el navegador recarga con `?sinPiezas=1`
        // (`recargaSinPiezas`, ADR-458): el cuerpo no viaja armado de más.
        return piezasPortada.reemplaza ? (
          <Enchufe
            nombre="tienda.portada"
            tenantId={tenant.id}
            slug={tenant.slug}
            fallback={__cuerpo}
            agregaEnElFallback={piezasPortada.agrega}
            recargaSinPiezas
          />
        ) : (
          __cuerpo
        );
      })()}

      {/* ═══════════════ Secciones custom del SectionsBuilder ═══════════════
          El bodeguero arma estas desde /admin?tab=pagina-inicio → Secciones.
          Se guardan en customization.footerHtml (prefix __BULEJE_PAGE_DATA__::).
          Ordenadas por section.order, las invisibles se filtran en el render. */}
      {(() => {
        const customSections = pageData.sections
          .filter((s) => s.visible)
          .sort((a, b) => a.order - b.order);
        if (customSections.length === 0) return null;
        return (
          <div className="border-t border-[var(--rule-soft)]">
            {/* #12: engagement por sección (IntersectionObserver → beacon). */}
            <SectionViewTracker slug={tenant.slug} />
            {customSections.map((sec) => (
              // data-pb="custom:<id>" → seleccionable en Modo Creativo (ADR-301 Fase 4)
              <div key={sec.id} data-pb={`custom:${sec.id}`}>
                <SectionRenderer
                  section={sec}
                  primaryColor={primary}
                  accentColor={accent}
                />
              </div>
            ))}
          </div>
        );
      })()}

      {/* About — solo render si hay contenido real, o en preview */}
      {(customization.aboutTitle || customization.aboutBody) && (
        <section className="max-w-3xl mx-auto px-4 py-8">
          <div className="p-6 rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-base)]">
            <h2 className="text-xl font-extrabold mb-3">
              {customization.aboutTitle ?? "Sobre nosotros"}
            </h2>
            {customization.aboutBody && (
              <p className="text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                {customization.aboutBody}
              </p>
            )}
          </div>
        </section>
      )}
      {isPreview && !customization.aboutTitle && !customization.aboutBody && (
        <section className="max-w-3xl mx-auto px-4 py-8">
          <div className="p-6 rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-white/60 dark:bg-[var(--surface-canvas)]/60">
            <h2 className="text-xl font-extrabold mb-3 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">
              Sobre nosotros · vista previa
            </h2>
            <div className="space-y-2">
              <div className="h-4 w-full bg-[var(--surface-sunken)] rounded" />
              <div className="h-4 w-4/5 bg-[var(--surface-sunken)] rounded" />
              <div className="h-4 w-3/5 bg-[var(--surface-sunken)] rounded" />
            </div>
            <p className="text-xs text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] mt-3">Solo visible para ti · configura desde Mi Tienda &gt; Identidad</p>
          </div>
        </section>
      )}

      {/* Acción admin — SOLO en preview (el dueño editando su página). El público
          va directo al footer dedicado de la tienda. */}
      {isPreview && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
          <Link
            href={`/t/${tenant.slug}/admin`}
            className="group inline-flex items-center gap-4 p-5 bg-[var(--surface-raised)] rounded-2xl shadow-sm hover:shadow-md transition-all border border-[var(--rule-base)]"
          >
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: "color-mix(in oklch, var(--accent) 12%, transparent)" }}
            >
              <Settings className="w-6 h-6" style={{ color: accent }} />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-base leading-tight">Editar tienda</p>
              <p className="text-sm text-[var(--text-secondary)] mt-0.5">Solo tú lo ves · panel admin</p>
            </div>
            <ExternalLink className="w-4 h-4 text-[var(--text-tertiary)] ml-auto" />
          </Link>
        </section>
      )}

      {/* Texto de footer configurable (Brandon 2026-06-25). */}
      {editorTheme.footerText && (
        <p data-live="footerText" className="text-center px-4 pb-6 text-sm font-medium text-[var(--text-secondary)]">
          {editorTheme.footerText}
        </p>
      )}

      {/* Footer dedicado de la tienda — el MISMO del catálogo (Brandon 2026-06-26):
          contacto, navegación, ayuda, newsletter y marca verificada. Reemplaza el
          mini-footer custom anterior. SettingsProvider (auto-inicializa leyendo el
          slug del path /t/[slug]) le da el contexto que el footer consume; la home
          es standalone y no monta el StoreProviders del layout de (store). */}
      <SettingsProvider>
        <TenantFooter slug={tenant.slug} storeName={displayName} inlineText={editorTheme.inlineText} />
      </SettingsProvider>

      {/* Botón flotante de WhatsApp (Brandon 2026-06-26) — Modo Creativo > Contacto.
          Solo si el dueño lo activa y hay número. */}
      {editorTheme.whatsappFloatEnabled && (editorTheme.whatsapp || customization.whatsappPhone || tenant.ownerPhone) && (
        <WhatsAppFloat
          phone={editorTheme.whatsapp || customization.whatsappPhone || tenant.ownerPhone || ""}
          displayName={displayName}
          message={editorTheme.whatsappMessage}
          position={editorTheme.chatPosition === "left" ? "left" : "right"}
          bubbleText={editorTheme.chatBubbleText}
        />
      )}

      {/* Cupón flotante — se monta solo si hay cupón activo para este tenant */}
      <StickyCouponBanner tenantSlug={tenant.slug} />

      {/* Prueba social en vivo (Brandon 2026-06-26) — pedidos reales anonimizados.
          Solo si el dueño lo activó y hay pedidos recientes. */}
      {editorTheme.socialProofEnabled && socialProof.length > 0 && (
        <SocialProofToasts items={socialProof} />
      )}

      {/* Popup de bienvenida configurable (Brandon 2026-06-25) — Modo Creativo >
          Automatización. Dismissable (X / click-fuera / Escape). */}
      {editorTheme.welcomePopupEnabled && (
        <TenantWelcomePopup
          title={editorTheme.welcomePopupTitle ?? "¡Bienvenido!"}
          message={editorTheme.welcomePopupMessage ?? ""}
          coupon={editorTheme.welcomePopupCoupon || undefined}
          ctaHref={`/t/${tenant.slug}/tienda`}
          storageKey={`buleje-welcome-${tenant.slug}`}
        />
      )}

      {/* Push opt-in (Lote Q) — solo si el dueño lo activó y hay VAPID key. */}
      {editorTheme.pushOptInEnabled && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && (
        <TenantPushOptIn slug={tenant.slug} vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} message={editorTheme.pushOptInMessage} />
      )}

      {/* Exit-intent popup (Lote C): cupón de último momento al intentar salir. */}
      {editorTheme.exitIntentEnabled && (
        <TenantExitIntentPopup
          title={editorTheme.exitIntentTitle ?? "¡Espera!"}
          message={editorTheme.exitIntentMessage ?? ""}
          coupon={editorTheme.exitIntentCoupon || undefined}
          ctaHref={`/t/${tenant.slug}/tienda`}
          storageKey={`buleje-exit-${tenant.slug}`}
        />
      )}
    </main>
  );
}

// ─── Sub-componente: InfoCard ─────────────────────────────────────────────
// Card de informacion del negocio en la seccion "Lo que tenes que saber".
// Acepta opcionalmente un href para volverla clicable (ej. WhatsApp, email).
function InfoCard({
  icon,
  label,
  value,
  hint,
  primary,
  href,
  cardId,
  inlineText,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  primary: string;
  href?: string;
  // Edición inline (Brandon 2026-06-27): cada cuadro tiene un id → su label/value/
  // hint se editan con doble-click y se guardan en inlineText.
  cardId?: string;
  inlineText?: Record<string, string>;
}) {
  const k = (f: string) => `info.${cardId}.${f}`;
  // data-live debe llevar el prefijo "inlineText:" para que el editor lo rutee a
  // patchInlineText; la clave guardada en inlineText es k(f) (sin prefijo).
  const dl = (f: string) => `inlineText:${k(f)}`;
  const ov = (f: string, fb: string) => (cardId && inlineText?.[k(f)]) || fb;
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3 mb-3">
        <span
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white"
          style={{ background: primary }}
        >
          {icon}
        </span>
      </div>
      <p {...(cardId ? { "data-live": dl("label") } : {})} className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
        {ov("label", label)}
      </p>
      <p {...(cardId ? { "data-live": dl("value") } : {})} className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
        {ov("value", value)}
      </p>
      {hint && (
        <p {...(cardId ? { "data-live": dl("hint") } : {})} className="mt-1 text-xs text-[var(--text-secondary)] leading-snug">
          {ov("hint", hint)}
        </p>
      )}
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target={href.startsWith("http") ? "_blank" : undefined}
        rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
        className="group block rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 hover:border-[var(--accent)] hover:-translate-y-0.5 hover:shadow-md transition-all"
      >
        {inner}
      </a>
    );
  }
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      {inner}
    </div>
  );
}
