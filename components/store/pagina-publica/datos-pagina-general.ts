import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSessionPayload, SESSION } from "@/lib/session";
import { StorePageDB } from "@/lib/db/store-page.db";
import { SettingsDB } from "@/lib/db/settings.db";
import { OrdersDB } from "@/lib/db/orders.db";
import { logger } from "@/lib/logger";
import type { ParametrosDeBusqueda } from "@/extensiones/_contrato";

/**
 * Los datos de la página pública general de `/t/<negocio>` y quién puede
 * verla (ADR-458). Salió tal cual de `app/t/[slug]/page.tsx` para que la
 * ruta, `generateMetadata`, `<PaginaGeneral>` y una página propia lean lo
 * MISMO en un mismo pedido: `cache()` de React hace que la base se consulte
 * una vez aunque la llamen los cuatro.
 */

/** Producto normalizado para la vitrina de la landing (destacados o catálogo). */
interface ShowcaseItem {
  id: string;
  name: string;
  image: string;
  unit: string;
  price: number;
  exclusivePrice: number | null;
  savingsPercent: number | null;
  badge: string | null;
}

/**
 * Resolve tenant + customization + featured + promotions + exclusive count
 * en paralelo. Server Component — sin cache directive para evitar conflicto
 * con `cacheComponents: true` cuando leemos cookies/headers en middleware.
 * La capa StorePageDB ya aplica caché in-process vía getOrSet.
 */
async function leerDatosDePagina(slug: string) {
  // SECURITY 2026-05-07 (audit MT5): si slug es synthetic `custom--{host}`,
  // resolver al slug REAL via Tenant.customDomain. Si no hay match → null.
  // Antes el synthetic slug se usaba como id directo y, si por casualidad
  // coincidía con un slug registrado, daba acceso al tenant equivocado.
  let lookupCondition: { OR: Array<{ id: string } | { slug: string } | { customDomain: string }> };
  if (slug.startsWith("custom--")) {
    const host = slug.slice("custom--".length);
    lookupCondition = { OR: [{ customDomain: host }] };
  } else {
    lookupCondition = { OR: [{ id: slug }, { slug }] };
  }
  // eslint-disable-next-line no-restricted-properties -- Public SSR landing: lookup cross-tenant intentional por slug/id/customDomain; no hay tenantId del request todavía (esta misma query lo resuelve).
  const tenant = await prisma.tenant
    .findFirst({
      where: lookupCondition,
      select: {
        id: true,
        slug: true,
        name: true,
        plan: true,
        active: true,
        ownerPhone: true,
        customDomain: true,
        logoUrl: true,
        primaryColor: true,
        createdAt: true,
      },
    })
    .catch((err) => { logger.warn("[t/[slug]] tenant lookup failed", { err: String(err), slug }); return null; });

  if (!tenant) return null;

  const [customization, featured, promotions, exclusiveCount, settings, catalog] = await Promise.all([
    StorePageDB.getCustomization(tenant.id),
    StorePageDB.listPublicFeatured(tenant.id, 24),
    StorePageDB.listPromotions(tenant.id, true),
    StorePageDB.countActiveExclusivePrices(tenant.id),
    SettingsDB.get(tenant.id).catch((err) => { logger.warn("[t/[slug]] settings load failed", { err: String(err), tenantId: tenant.id }); return null; }),
    StorePageDB.listCatalogWithVisibility(tenant.id).catch((err) => { logger.warn("[t/[slug]] catalog load failed", { err: String(err), tenantId: tenant.id }); return []; }),
  ]);

  // "Productos al frente" (Brandon 2026-06-08): la landing debe mostrar
  // productos REALES sin entrar al catálogo. Si el dueño marcó destacados
  // (tenantPageProductOverride) usamos esos; si no, caemos al catálogo real
  // (primeros productos activos+visibles). Shape unificado para la vitrina.
  const productCount = catalog.filter((c) => c.active && c.visible).length;

  // Categorías reales (con conteo) para el bento del hero de escritorio.
  // Solo productos visibles+activos; ordenadas por cantidad desc.
  const catCounts = new Map<string, number>();
  for (const c of catalog) {
    const cat = c.active && c.visible && typeof c.category === "string" ? c.category.trim() : "";
    if (cat) catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
  }
  const categories = [...catCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const showcase: ShowcaseItem[] =
    featured.length > 0
      ? featured.map((p) => ({
          id: String(p.id),
          name: p.productName,
          image: p.productImage,
          unit: p.productUnit,
          price: p.productBasePrice,
          exclusivePrice:
            p.exclusivePrice != null && p.exclusivePrice < p.productBasePrice
              ? p.exclusivePrice
              : null,
          savingsPercent: p.savingsPercent ?? null,
          badge: p.badge ?? null,
        }))
      : catalog
          .filter((c) => c.active && c.visible)
          .slice(0, 12)
          .map((c) => ({
            id: String(c.productId),
            name: c.name,
            image: c.image,
            unit: c.unit,
            price: c.price,
            exclusivePrice: null,
            savingsPercent: null,
            badge: null,
          }));

  // Cadena de fallback para el nombre público de la tienda:
  //   storeTheme.storeName  →  settings.businessName  →  tenant.name  →  slug
  // El primero suele ser el campo que el dueño edita en el panel admin —
  // mientras que `tenant.name` puede contener el ID legacy del owner.
  const st = (settings?.storeTheme as Record<string, unknown> | undefined) ?? undefined;
  const themeName = st?.["storeName"];
  const displayName =
    (typeof themeName === "string" && themeName.trim()) ||
    (typeof settings?.businessName === "string" && settings.businessName.trim()) ||
    tenant.name ||
    tenant.slug;

  // FUENTE DE VERDAD del tema (Brandon 2026-06-08): el editor (Modo Creativo /
  // Identidad y tema) guarda en settings.storeTheme vía /api/settings. La landing
  // ANTES leía solo customization.footerHtml → los cambios del editor no se
  // reflejaban acá (sí en el catálogo, que sí lee settings.storeTheme). Ahora
  // settings.storeTheme manda, con fallback al diseño viejo. Así "todo se
  // personaliza" en la landing también.
  const pick = (k: string) => {
    const v = st?.[k];
    return typeof v === "string" && v.trim() && !v.trim().startsWith("var(") ? v.trim() : undefined;
  };
  const pickStr = (k: string) => (typeof st?.[k] === "string" ? (st[k] as string) : undefined);
  const editorTheme = {
    primaryColor: pick("primaryColor"),
    secondaryColor: pick("secondaryColor"),
    accentColor: pick("accentColor"),
    // Tipografía + estilos UI del editor (otra taxonomía) — opcionales.
    fontFamily: pickStr("fontFamily"),
    bodyFontFamily: pickStr("bodyFontFamily"),
    // Lote B (Brandon 2026-06-27): gradiente del hero + grid de destacados.
    heroGradientFrom: pickStr("heroGradientFrom"),
    heroGradientTo: pickStr("heroGradientTo"),
    heroGradientAngle: typeof st?.["heroGradientAngle"] === "number" ? (st["heroGradientAngle"] as number) : undefined,
    featuredCols: typeof st?.["featuredCols"] === "number" ? (st["featuredCols"] as number) : undefined,
    featuredCount: typeof st?.["featuredCount"] === "number" ? (st["featuredCount"] as number) : undefined,
    // Lote D (Brandon 2026-06-27): video/2º CTA hero, velocidad anuncios, fondo página.
    heroVideoUrl: pickStr("heroVideoUrl"),
    heroCta2Label: pickStr("heroCta2Label"),
    heroCta2Url: pickStr("heroCta2Url"),
    announcementInterval: typeof st?.["announcementInterval"] === "number" ? (st["announcementInterval"] as number) : undefined,
    pageBgColor: pickStr("pageBgColor"),
    // Lote E (Brandon 2026-06-27): color de navbar + layout de destacados.
    navbarBgColor: pickStr("navbarBgColor"),
    navbarTextColor: pickStr("navbarTextColor"),
    featuredLayout: pickStr("featuredLayout"),
    // Lote F (Brandon 2026-06-27): fuente propia por URL.
    customFontUrl: pickStr("customFontUrl"),
    customFontName: pickStr("customFontName"),
    customFontTarget: pickStr("customFontTarget"),
    // Lote H (Brandon 2026-06-27): tamaño base + interlineado.
    baseFontSize: typeof st?.["baseFontSize"] === "number" ? (st["baseFontSize"] as number) : undefined,
    lineHeight: typeof st?.["lineHeight"] === "number" ? (st["lineHeight"] as number) : undefined,
    // Lote I (Brandon 2026-06-27): menú de navegación editable.
    navCatalogLabel: pickStr("navCatalogLabel"),
    navExtraLinks: Array.isArray(st?.["navExtraLinks"]) ? (st["navExtraLinks"] as Array<{ label: string; url: string }>) : [],
    // Lote J (Brandon 2026-06-27): peso de fuente de títulos.
    headingWeight: typeof st?.["headingWeight"] === "number" ? (st["headingWeight"] as number) : undefined,
    // Lote P (Brandon 2026-06-28): A/B test del hero.
    abTestEnabled: st?.["abTestEnabled"] === true,
    heroVariantB: (st?.["heroVariantB"] && typeof st["heroVariantB"] === "object" && !Array.isArray(st["heroVariantB"]) ? st["heroVariantB"] : {}) as { heroTitle?: string; heroSubtitle?: string },
    // Lote Q (Brandon 2026-06-28): push opt-in.
    pushOptInEnabled: st?.["pushOptInEnabled"] === true,
    pushOptInMessage: pickStr("pushOptInMessage"),
    // Lote U (Brandon 2026-06-28): SEO schema, transición, cursor.
    schemaLocalBusiness: st?.["schemaLocalBusiness"] === true,
    pageTransition: (["fade", "slide", "blur"].includes(st?.["pageTransition"] as string) ? (st!["pageTransition"] as string) : "none") as "none" | "fade" | "slide" | "blur",
    customCursor: (["dot", "ring"].includes(st?.["customCursor"] as string) ? (st!["customCursor"] as string) : "none") as "none" | "dot" | "ring",
    borderRadius: typeof st?.["borderRadius"] === "number" ? (st["borderRadius"] as number) : undefined,
    buttonStyle: pickStr("buttonStyle"),
    cardStyle: pickStr("cardStyle"),
    shadowLevel: pickStr("shadowLevel"),
    // Banner de anuncio del editor (Brandon 2026-06-25): imagen arriba de la tienda.
    announcementImage: pickStr("announcementImage"),
    // Imagen por sección (Brandon 2026-06-25): map clave-sección → URL.
    sectionImages:
      st?.["sectionImages"] && typeof st["sectionImages"] === "object" && !Array.isArray(st["sectionImages"])
        ? (st["sectionImages"] as Record<string, string>)
        : ({} as Record<string, string>),
    // Automatización (Brandon 2026-06-25): popup de bienvenida + texto del footer.
    welcomePopupEnabled: st?.["welcomePopupEnabled"] === true,
    welcomePopupTitle: pickStr("welcomePopupTitle"),
    welcomePopupMessage: pickStr("welcomePopupMessage"),
    welcomePopupCoupon: pickStr("welcomePopupCoupon"),
    // Lote C (Brandon 2026-06-27): conversión avanzada.
    announcements: Array.isArray(st?.["announcements"]) ? (st["announcements"] as unknown[]).filter((x): x is string => typeof x === "string") : [],
    exitIntentEnabled: st?.["exitIntentEnabled"] === true,
    exitIntentTitle: pickStr("exitIntentTitle"),
    exitIntentMessage: pickStr("exitIntentMessage"),
    exitIntentCoupon: pickStr("exitIntentCoupon"),
    scheduleExceptions: Array.isArray(st?.["scheduleExceptions"]) ? (st["scheduleExceptions"] as Array<{ date: string; label: string; closed: boolean }>) : [],
    chatPosition: pickStr("chatPosition"),
    chatBubbleText: pickStr("chatBubbleText"),
    footerText: pickStr("footerText"),
    // Analytics por tenant (Brandon 2026-06-26): GA4 + Meta Pixel del comerciante.
    // tiktokPixelId: Canales de venta (Brandon 2026-06-30).
    analyticsId: pickStr("analyticsId"),
    pixelId: pickStr("pixelId"),
    tiktokPixelId: pickStr("tiktokPixelId"),
    // Variantes + controles del hero (Brandon 2026-06-26, page builder Fase 4).
    heroVariant: pickStr("heroVariant"),
    heroOverlay: typeof st?.["heroOverlay"] === "number" ? (st["heroOverlay"] as number) : undefined,
    heroAlign: pickStr("heroAlign"),
    heroHeight: pickStr("heroHeight"),
    heroShowBadges: st?.["heroShowBadges"] !== false, // default true
    // Mejoras Modo Creativo (Brandon 2026-06-26): escala tipográfica, WhatsApp
    // flotante, animaciones de entrada.
    fontScale: pickStr("fontScale"),
    whatsappFloatEnabled: st?.["whatsappFloatEnabled"] === true,
    whatsapp: pickStr("whatsapp"), // número que el dueño pone en Contacto
    whatsappMessage: pickStr("whatsappMessage"),
    animateOnScroll: st?.["animateOnScroll"] === true,
    // Contador de oferta (Brandon 2026-06-26).
    countdownEnabled: st?.["countdownEnabled"] === true,
    countdownTitle: pickStr("countdownTitle"),
    countdownEndsAt: pickStr("countdownEndsAt"),
    // Testimonios (Brandon 2026-06-26): array de reseñas.
    testimonials: Array.isArray(st?.["testimonials"])
      ? (st["testimonials"] as unknown[]).filter(
          (t): t is { name: string; stars: number; comment: string } =>
            !!t && typeof t === "object" && "name" in t,
        )
      : ([] as Array<{ name: string; stars: number; comment: string }>),
    // Estilos POR SECCIÓN (Brandon 2026-06-26): map data-pb → {bg,text,pad}.
    sectionStyles:
      st?.["sectionStyles"] && typeof st["sectionStyles"] === "object" && !Array.isArray(st["sectionStyles"])
        ? (st["sectionStyles"] as Record<string, { bg?: string; text?: string; pad?: "sm" | "md" | "lg"; radius?: number; border?: string; borderW?: number; shadow?: "none" | "soft" | "deep"; font?: string; width?: "narrow" | "normal" | "full"; padY?: number; divider?: "none" | "line" | "space"; anim?: "none" | "fade" | "up" | "zoom" }>)
        : ({} as Record<string, { bg?: string; text?: string; pad?: "sm" | "md" | "lg"; radius?: number; border?: string; borderW?: number; shadow?: "none" | "soft" | "deep"; font?: string; width?: "narrow" | "normal" | "full"; padY?: number; divider?: "none" | "line" | "space"; anim?: "none" | "fade" | "up" | "zoom" }>),
    // Texto POR SECCIÓN (Brandon 2026-06-27): map data-pb → {eyebrow,title}.
    // Override del texto por defecto de cada sección del cuerpo (featured/info…).
    sectionText:
      st?.["sectionText"] && typeof st["sectionText"] === "object" && !Array.isArray(st["sectionText"])
        ? (st["sectionText"] as Record<string, { eyebrow?: string; title?: string; align?: "left" | "center" | "right" }>)
        : ({} as Record<string, { eyebrow?: string; title?: string; align?: "left" | "center" | "right" }>),
    // Texto inline genérico (Brandon 2026-06-27): map data-live="inlineText:key" → override.
    inlineText:
      st?.["inlineText"] && typeof st["inlineText"] === "object" && !Array.isArray(st["inlineText"])
        ? (st["inlineText"] as Record<string, string>)
        : ({} as Record<string, string>),
    // Secciones del cuerpo ocultas (Brandon 2026-06-27).
    bodyHidden: Array.isArray(st?.["bodyHidden"])
      ? (st["bodyHidden"] as unknown[]).filter((x): x is string => typeof x === "string")
      : ([] as string[]),
    // Diseño de tarjetas de producto (Brandon 2026-06-27).
    cardDesign:
      st?.["cardDesign"] && typeof st["cardDesign"] === "object" && !Array.isArray(st["cardDesign"])
        ? (st["cardDesign"] as { bg?: string; radius?: number; border?: string; borderW?: number; shadow?: "none" | "soft" | "deep"; nameColor?: string; priceColor?: string })
        : ({} as { bg?: string; radius?: number; border?: string; borderW?: number; shadow?: "none" | "soft" | "deep"; nameColor?: string; priceColor?: string }),
    // Estilos por texto (barra de texto flotante): map campo → {size,bold,color,align,italic,underline,upper}.
    textStyles:
      st?.["textStyles"] && typeof st["textStyles"] === "object" && !Array.isArray(st["textStyles"])
        ? (st["textStyles"] as Record<string, { size?: number; bold?: boolean; color?: string; align?: "left" | "center" | "right"; italic?: boolean; underline?: boolean; upper?: boolean; track?: number; tshadow?: boolean }>)
        : ({} as Record<string, { size?: number; bold?: boolean; color?: string; align?: "left" | "center" | "right"; italic?: boolean; underline?: boolean; upper?: boolean; track?: number; tshadow?: boolean }>),
    // Orden del cuerpo de la landing (Brandon 2026-06-26, page builder Fase 2):
    // keys reordenables = trust|promos|featured|info. Vacío = orden histórico.
    bodyOrder: Array.isArray(st?.["bodyOrder"])
      ? (st["bodyOrder"] as unknown[]).filter((x): x is string => typeof x === "string")
      : ([] as string[]),
    // Conversión (Brandon 2026-06-26, Modo Creativo > Automatización): envío
    // gratis, prueba social, estado abierto/cerrado, tema estacional.
    freeShipEnabled: st?.["freeShipEnabled"] === true,
    freeShipThreshold: typeof st?.["freeShipThreshold"] === "number" ? (st["freeShipThreshold"] as number) : 50,
    freeShipText: pickStr("freeShipText"),
    socialProofEnabled: st?.["socialProofEnabled"] === true,
    openStatusEnabled: st?.["openStatusEnabled"] === true,
    seasonalTheme: pickStr("seasonalTheme") || "none",
    schedules:
      st?.["schedules"] && typeof st["schedules"] === "object" && !Array.isArray(st["schedules"])
        ? (st["schedules"] as Record<string, { open: string; close: string }>)
        : ({} as Record<string, { open: string; close: string }>),
  };

  // Feature flags PRO opt-in por tienda (ADR-298): viven en storeTheme.features.
  // La plantilla es la misma para todas; solo las tiendas con flags ven los
  // bloques extra (trust/urgency/content/capture). Cero impacto en las demás.
  const rawFeatures = (st as Record<string, unknown> | undefined)?.["features"];
  const features = Array.isArray(rawFeatures)
    ? rawFeatures.filter((x): x is string => typeof x === "string")
    : [];

  // Prueba social (Brandon 2026-06-26): pedidos recientes ANONIMIZADOS, solo si
  // el dueño activó el toggle. Sin pedidos → array vacío (no se inventa data).
  let socialProof: Array<{ product: string; at: string }> = [];
  if (editorTheme.socialProofEnabled) {
    try {
      const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7); // últimos 7 días
      socialProof = await OrdersDB.recentForSocialProof(tenant.id, since);
    } catch {
      socialProof = [];
    }
  }

  return { tenant, customization, featured, promotions, exclusiveCount, displayName, showcase, productCount, categories, editorTheme, features, socialProof };
}

/**
 * `loadPageData` memorizada por pedido (`cache()` de React): `generateMetadata`,
 * la ruta y `<PaginaGeneral>` la piden con el mismo `slug` y la base se lee una
 * sola vez.
 */
export const loadPageData = cache(leerDatosDePagina);

export type DatosPaginaGeneral = NonNullable<Awaited<ReturnType<typeof leerDatosDePagina>>>;

/** `?preview=` de la URL; un valor repetido (`?preview=a&preview=b`) no es «true», igual que antes. */
export function previewDe(busqueda: ParametrosDeBusqueda): string | undefined {
  const v = busqueda.preview;
  return typeof v === "string" ? v : undefined;
}

export interface AccesoPaginaPublica {
  datos: DatosPaginaGeneral;
  /** El dueño de ESTE negocio o un superadmin mirando con `?preview=true`. */
  isPreview: boolean;
}

/**
 * ¿Se puede ver la página pública de `slug`? `null` = 404 (no existe, o está
 * inactiva / sin publicar y no es la vista previa de su dueño). La usan la
 * ruta (antes de elegir entre la general y una página propia) y
 * `<PaginaGeneral>`; memorizada por pedido.
 */
export const accesoPaginaPublica = cache(async (slug: string, preview: string | undefined): Promise<AccesoPaginaPublica | null> => {
  const isPreviewParam = preview === "true";
  const data = await loadPageData(slug);
  if (!data) return null;

  const { tenant, customization } = data;

  // SECURITY (audit 2026-06-26): `?preview=true` solo lo honra el DUEÑO de este
  // tenant o un superadmin con sesión válida. Antes, cualquier visitante anónimo
  // podía ver una tienda no publicada/inactiva agregando el parámetro a la URL.
  let isPreview = false;
  if (isPreviewParam) {
    try {
      const token = (await cookies()).get(SESSION.COOKIE_NAME)?.value;
      const payload = token ? await getSessionPayload(token) : null;
      isPreview = !!payload && (payload.role === "superadmin" || payload.tenantId === tenant.id);
    } catch {
      isPreview = false;
    }
  }

  // Permitir preview del dueño/superadmin aunque esté inactiva/sin publicar.
  if (!isPreview && (!tenant.active || !customization.published)) return null;

  return { datos: data, isPreview };
});
