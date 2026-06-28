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
  | "adelantos"
  | "por-cobrar"          // Tablero consolidado de cuentas por cobrar
  | "activos"
  // Módulos de documentos
  | "documentos"
  | "cotizaciones"
  | "guias-remision"
  | "notas-credito"
  | "contratos"
  // Módulos nuevos
  | "auditoria"
  | "devoluciones-proveedor"
  | "dropship"
  | "tesoreria"
  | "promociones"
  | "scoring"
  | "sugerencias-ia"
  | "metas-logros"
  // Crecimiento (Marketing & Fidelización) — Ola 1
  | "campanas"
  | "puntos"
  // Equipo (tareas + notas) — huérfanos montados
  | "tareas"
  | "notas"
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
  | "support-inbox"
  // ── ENRICH-5 bridges (marketplace admin surfaces) ─────────────────────────
  | "subscriptions"          // Bodega al Mes
  | "gift-cards-admin"       // Gift cards gestión
  | "socio-members"          // Socio Buleje
  | "lives-admin"            // Transmisiones en vivo
  | "leads-funnel"           // Funnel de leads outbound/inbound (CEO dashboard)
  // ── Especializaciones por tenant (ADR-124) ─────────────────────────────
  // Estos tabs SOLO aparecen si el tenant tiene la TenantFeatureFlag
  // `spec:<vertical>:<modulo>` habilitada por superadmin.
  | "ctp-libro-operaciones"  // Forestal: LOE-CTP SERFOR
  | "loth-libro-operaciones" // Forestal: LO-TH Títulos Habilitantes (ADR-125)
  | "cacao-acopio"; // Agrícola: Acopio & Beneficio de Cacao (ADR-128)

/**
 * Subconjunto de Tabs cuya navegación directa por URL/hash/localStorage
 * está permitida. Cualquier valor fuera de esta lista cae a "asistente-ia"
 * en `useAdminTabs`. Mantener sincronizado con `Tab` cuando se agreguen
 * tabs visibles desde el sidebar.
 */
export const VALID_TABS: readonly Tab[] = [
  "vendor-dashboard",
  "asistente-ia",
  "ventas-caja",
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
  "recetas",
  "prestamos",
  "adelantos",
  "por-cobrar",
  "activos",
  "scoring",
  "documentos",
  "cotizaciones",
  "guias-remision",
  "notas-credito",
  "contratos",
  "sugerencias-ia",
  "metas-logros",
  "campanas",
  "puntos",
  "tareas",
  "notas",
  "dropship",
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
  "subscriptions",
  "gift-cards-admin",
  "socio-members",
  "lives-admin",
  "leads-funnel",
  // Especializaciones (ADR-124 / ADR-125 / ADR-128)
  "ctp-libro-operaciones",
  "loth-libro-operaciones",
  "cacao-acopio",
] as const;
