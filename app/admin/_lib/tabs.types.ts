// ── 8 módulos consolidados + pedidos + plan ──
export type Tab =
  | "vendor-dashboard"    // Panel del vendedor (tienda_owner / proveedor)
  | "asistente-ia"        // Asistente IA (dashboard + chat + alertas)
  | "ventas-caja"         // Ventas & Caja
  | "inventario"          // Inventario
  | "productos"           // Productos & Precios
  | "compras"             // Compras
  | "plata"               // Mi Plata (finanzas)
  | "clientes"            // Mis Clientes
  | "config"              // Configuración
  // Tabs especiales mantenidos
  | "pedidos"
  | "plan"
  // Nuevos módulos avanzados
  | "analytics-pro"
  | "ai-command"
  // Módulos adicionales
  | "fiados"
  | "turnos"
  | "recetas"
  | "prestamos"
  // Módulos de documentos
  | "cotizaciones"
  | "guias-remision"
  | "notas-credito"
  | "contratos"
  // Módulos nuevos
  | "auditoria"
  | "devoluciones-proveedor"
  | "tesoreria"
  | "promociones"
  | "scoring"
  | "sugerencias-ia"
  | "metas-logros"
  // Módulos de operaciones de marketplace y delivery
  | "marketplace"
  | "delivery-partners"
  | "delivery-live"         // Bloque D1 marketplace: tracking vivo + rutas + mapa Leaflet
  | "marketplace-chat"      // Bloque D2 marketplace: chat buyer ↔ seller
  | "store-customizer"
  | "mi-perfil"
  // Módulo rendimiento técnico
  | "rendimiento"
  // Facturación electrónica SUNAT
  | "facturacion"
  // Página individual de la tienda
  | "pagina-inicio"
  // Predicción de demanda y reorden automático
  | "forecasting"
  // BullMQ Bull Board — monitoreo de colas
  | "colas"
  // Soporte unificado (WhatsApp + reviews pendientes)
  | "support-inbox";

/**
 * Subconjunto de Tabs cuya navegación directa por URL/hash/localStorage
 * está permitida. Cualquier valor fuera de esta lista cae a "asistente-ia"
 * en `useAdminTabs`. Mantener sincronizado con `Tab` cuando se agreguen
 * tabs visibles desde el sidebar.
 */
export const VALID_TABS: readonly Tab[] = [
  "vendor-dashboard",
  "asistente-ia",
  // ventas-caja removido de VALID_TABS — migración lo redirige a "pedidos"
  "inventario",
  "productos",
  "compras",
  "plata",
  "clientes",
  "config",
  "pedidos",
  "plan",
  "analytics-pro",
  "ai-command",
  "fiados",
  "turnos",
  "cotizaciones",
  "guias-remision",
  "notas-credito",
  "contratos",
  "sugerencias-ia",
  "metas-logros",
  "forecasting",
  "marketplace",
  "delivery-partners",
  "delivery-live",
  "marketplace-chat",
  "store-customizer",
  "colas",
  "support-inbox",
  "facturacion",
  "pagina-inicio",
] as const;
