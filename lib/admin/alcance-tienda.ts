/**
 * Qué superficie del cliente final cambia cada pestaña del panel (Brandon
 * 20-10: «cuáles pertenecen a marketplace, a tienda y a mixta para evitar
 * confusiones»).
 *
 * - `tienda`: tu tienda propia (`/t/<slug>`, el subdominio o el dominio propio).
 * - `marketplace`: tu ficha dentro del marketplace de Buleje (`/marketplace/<slug>`, `/tiendas`).
 * - `ambas`: lo mismo vale en las dos.
 *
 * MEDIDO, no supuesto: `evidencia` nombra el campo que guarda la pantalla y
 * quién lo lee (grep del 20-10). `porque` es la frase que ve el dueño en el ⓘ
 * de `EtiquetaAlcance`. Claves: `tab`, `tab/vista` o `tab/vista/sub`, con los
 * ids de `VISTAS_POR_MODULO` / `ANIDADAS_POR_MODULO` (el test lo cruza). Gana
 * la más específica. Lo que no se midió (Campañas › Puntos, Inventario ›
 * Categorías) no está: sin clave, no hay etiqueta.
 */

export type Alcance = "tienda" | "marketplace" | "ambas";

export interface EntradaAlcance {
  alcance: Alcance;
  /** Para el dueño (ⓘ «A dónde afecta»): sin nombres de código. */
  porque: string;
  /** Para quien mantiene esto: campo guardado → quién lo lee. */
  evidencia: string;
  /** Ejemplo propio; si falta, el de `TEXTO_ALCANCE`. */
  ejemplo?: string;
}

export const ALCANCE_TIENDA: Readonly<Record<string, EntradaAlcance>> = {
  // ── Tienda online ──────────────────────────────────────────────────────────
  "pagina-inicio/apariencia": {
    alcance: "tienda",
    porque: "Logo, colores, portada, contacto y cómo te piden: sólo en tu tienda propia. El marketplace usa tu ficha.",
    evidencia: "Settings.storeThemeJson → app/t/[slug], app/(store) y extensiones/pagina-*; 0 lectores en app/(store)/marketplace.",
  },
  "pagina-inicio/apariencia/pedidos": {
    alcance: "tienda",
    porque: "Qué datos le pides a tu cliente (celular, ubicación, foto del pedido) al comprar en tu tienda.",
    evidencia: "storeTheme.pedidosCliente → extensiones/pagina-tienda/datos.ts, pagina-musa y el checkout de la tienda (leerConfigPedidos).",
  },
  "pagina-inicio/contenido": {
    alcance: "ambas",
    porque: "Mezcla: Secciones y Promociones van a tu tienda; Marca y Banners, a tu ficha del marketplace.",
    evidencia: "Ver las 4 secciones de abajo.",
    ejemplo: "Ej.: cambias el orden de Secciones y lo ve tu tienda; subes un banner y sale en el marketplace.",
  },
  "pagina-inicio/contenido/sections": {
    alcance: "tienda",
    porque: "El orden de los bloques del inicio de tu tienda.",
    evidencia: "TenantStorePage → getCustomization en PaginaGeneral y extensiones/pagina-tienda|musa.",
  },
  "pagina-inicio/contenido/promotions": {
    alcance: "tienda",
    porque: "Las ofertas que se destacan en el inicio de tu tienda.",
    evidencia: "StorePageDB.listPromotions → components/store/pagina-publica/PaginaGeneral.",
  },
  "pagina-inicio/contenido/branding": {
    alcance: "marketplace",
    porque: "El logo y el banner de tu tienda en el directorio del marketplace.",
    evidencia: "Store.logo/banner → /api/marketplace/stores/[slug]/branding.",
  },
  "pagina-inicio/contenido/banners": {
    alcance: "marketplace",
    porque: "Las imágenes de la franja de tu ficha en el marketplace (tu tienda propia no las muestra).",
    evidencia: "StoreBanner → sólo StorePromoBannersStrip (section=promo) en StoreDetailClient de /marketplace/[slug].",
  },
  "pagina-inicio/paginas": {
    alcance: "tienda",
    porque: "Páginas extra de tu tienda (Ofertas, Nosotros…).",
    evidencia: "Páginas por bloques → app/cms/[slug] de la tienda.",
  },
  "pagina-inicio/redes": {
    alcance: "tienda",
    porque: "El Pixel de Meta, TikTok y Google Analytics se cargan en tu tienda.",
    evidencia: "storeTheme.salesChannels/pixelId → TenantAnalytics de la tienda.",
  },

  // ── Marketplace ────────────────────────────────────────────────────────────
  "marketplace/resumen": {
    alcance: "marketplace",
    porque: "Cómo te va con lo que entra por el marketplace.",
    evidencia: "/api/marketplace/analytics.",
  },
  "marketplace/tienda": {
    alcance: "marketplace",
    porque: "Nombre, logo, zonas, horario y vacaciones de tu ficha en el marketplace.",
    evidencia: "Modelo Store (name/logo/zones/schedule/vacationMode/isPublished).",
  },
  "marketplace/productos": {
    alcance: "marketplace",
    porque: "Qué productos tuyos salen publicados en el marketplace.",
    evidencia: "StoreProduct ← /api/marketplace/stores/my/products (sync).",
  },
  "marketplace/ordenes": {
    alcance: "marketplace",
    porque: "Los pedidos que te llegaron por el marketplace.",
    evidencia: "/api/marketplace/orders (use-marketplace-orders).",
  },
  "marketplace/comisiones": {
    alcance: "marketplace",
    porque: "Lo que cobra la plataforma por cada venta del marketplace.",
    evidencia: "/api/commissions/ledger.",
  },
  "marketplace/precios": {
    alcance: "marketplace",
    porque: "El precio con el que sales en el marketplace, al lado de otras tiendas.",
    evidencia: "Escribe el precio de StoreProduct.",
  },

  // ── Ajustes ────────────────────────────────────────────────────────────────
  "config/negocio": {
    alcance: "tienda",
    porque: "Nombre, WhatsApp, horario y cómo te piden en tu tienda (WhatsApp o formulario).",
    evidencia: "Settings (incluye mode) → CartSidebar y extensiones/pagina-tienda/datos.ts.",
  },
  "config/cobros": {
    alcance: "ambas",
    porque: "Los medios de pago (Yape, efectivo, transferencia) valen en tu tienda y en el marketplace.",
    evidencia: "Settings.yape*/cash*/transfer* → checkout de la tienda y /api/marketplace/storefront/payment-config (app/checkout/entrega).",
    ejemplo: "Ej.: apagas Plin y deja de salir al pagar en tu tienda y en el marketplace.",
  },
  "config/delivery": {
    alcance: "tienda",
    porque: "Zonas y tarifas del delivery de tu tienda (el marketplace usa las zonas de tu ficha).",
    evidencia: "Settings.deliveryZonesJson → tienda; el marketplace lee Store.zones.",
  },
  "config/tienda": {
    alcance: "tienda",
    porque: "El modo vacaciones cierra las compras de tu tienda.",
    evidencia: "Settings.maintenanceMode → sólo app/(store)/layout.tsx.",
  },

  // ── Otras pestañas que cambian lo que ve el cliente ────────────────────────
  "inventario/stock": {
    alcance: "ambas",
    porque: "El mismo producto (nombre, foto, precio, stock) sale en tu tienda y en el marketplace.",
    evidencia: "Product → catálogo de la tienda y lib/db/marketplace-products.db.ts (lee Product directo).",
  },
  "inventario/ofertas/cupones": {
    alcance: "ambas",
    porque: "Un mismo código de cupón vale en tu tienda y en el marketplace.",
    evidencia: "CouponsDB compartido → checkout de la tienda y /api/marketplace/coupons/validate.",
  },
  "clientes/resenas/moderar": {
    alcance: "marketplace",
    porque: "Las reseñas que apruebas salen en tu ficha del marketplace; tu tienda propia no las muestra.",
    evidencia: "StoreReview → /marketplace/[slug], /tiendas y /api/marketplace/stores; 0 lectores en app/t.",
  },
};

export interface TextoAlcance {
  etiqueta: string;
  /** ⓘ «Qué hace»: quién lo ve. */
  quien: string;
  ejemplo: string;
}

export const TEXTO_ALCANCE: Readonly<Record<Alcance, TextoAlcance>> = {
  tienda: {
    etiqueta: "Tu tienda",
    quien: "Cambia lo que ve quien entra a tu tienda propia: tu enlace /t/tu-negocio o tu dominio.",
    ejemplo: "Ej.: cambias el color del botón y cambia en tu tienda; en el marketplace no.",
  },
  marketplace: {
    etiqueta: "Marketplace",
    quien: "Cambia lo que ve quien busca tiendas en el marketplace de Buleje, donde salen varios negocios juntos.",
    ejemplo: "Ej.: cambias el banner de tu ficha y sale en el marketplace; tu tienda propia sigue igual.",
  },
  ambas: {
    etiqueta: "Tu tienda y Marketplace",
    quien: "Cambia lo que ven tus clientes en tu tienda propia y en el marketplace.",
    ejemplo: "Ej.: creas un cupón y el mismo código vale en los dos.",
  },
};

/** La entrada más específica que exista (`tab/vista/sub` → `tab/vista` → `tab`), o null. */
export function alcanceDe(tab: string, vista?: string | null, sub?: string | null): (EntradaAlcance & { clave: string }) | null {
  const claves = [vista && sub ? `${tab}/${vista}/${sub}` : null, vista ? `${tab}/${vista}` : null, tab];
  for (const clave of claves) {
    if (!clave) continue;
    const e = ALCANCE_TIENDA[clave];
    if (e) return { ...e, clave };
  }
  return null;
}
