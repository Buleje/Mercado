/**
 * tab-preload.ts — precarga del CÓDIGO (chunk dynamic) de un tab del admin.
 *
 * El panel ya prefetchea DATOS (use-admin-prefetch) y los chunks de tabs
 * "probables" tras 2s de inactividad. Esto suma lo que faltaba: al hacer HOVER
 * o FOCUS sobre un tab del sidebar, arrancamos su import() de una — así el clic
 * abre el tab al instante en vez de esperar a bajar+parsear su chunk.
 *
 * Cada value es el MISMO loader que usa el TabRouter para ese tab (o el hub que
 * lo renderiza). Los import() son strings LITERALES estáticos (obligatorio: un
 * import con variable crea un context module y rompe el code-splitting).
 * `import()` es idempotente y el navegador cachea el chunk, así que un mapeo
 * impreciso solo desperdicia una precarga, nunca rompe.
 */

type Loader = () => Promise<unknown>;

// Tab id → loader del módulo/hub que lo renderiza (ver TabRouter dispatch).
const TAB_LOADERS: Record<string, Loader> = {
  "vendor-dashboard": () => import("@/components/admin/unified/VendorDashboardModule"),
  "asistente-ia": () => import("@/components/admin/unified/AsistenteIAHubModule"),
  "ventas-caja": () => import("@/components/admin/unified/POSCajaModule"),
  turnos: () => import("@/components/admin/unified/POSCajaModule"),
  inventario: () => import("@/components/admin/tabs/InventoryTab"),
  // Ola 3: Productos (Categorías, Precios, Ofertas) es una vista de Productos e inventario.
  productos: () => import("@/components/admin/tabs/InventoryTab"),
  compras: () => import("@/components/admin/unified/ComprasModule"),
  "devoluciones-proveedor": () => import("@/components/admin/unified/ComprasModule"),
  // Hub financiero — muchos sub-tabs comparten módulo. Fiados es Ventas y caja › Me deben (ola 3).
  plata: () => import("@/components/admin/unified/FinanzasModule"),
  fiados: () => import("@/components/admin/unified/POSCajaModule"),
  "por-cobrar": () => import("@/components/admin/unified/FinanzasModule"),
  prestamos: () => import("@/components/admin/unified/FinanzasModule"),
  adelantos: () => import("@/components/admin/unified/FinanzasModule"),
  activos: () => import("@/components/admin/unified/FinanzasModule"),
  scoring: () => import("@/components/admin/unified/FinanzasModule"),
  clientes: () => import("@/components/admin/unified/CRMClientesModule"),
  "leads-funnel": () => import("@/components/admin/unified/CRMClientesModule"),
  pedidos: () => import("@/components/admin/OrdersTab"),
  // Ola 2 del panel unificado: Delivery es Pedidos y reparto › Reparto.
  "delivery-partners": () => import("@/components/admin/OrdersTab"),
  "delivery-live": () => import("@/components/admin/OrdersTab"),
  recetas: () => import("@/components/admin/RecetasModule"),
  dropship: () => import("@/components/admin/unified/ComprasModule"),
  marketplace: () => import("@/components/admin/unified/MarketplaceModule"),
  // «promociones» es Productos e inventario › Ofertas y cupones (ola 3).
  promociones: () => import("@/components/admin/tabs/InventoryTab"),
  // Comprobantes (ola 3) y Documentos (el Archivo y los Contratos).
  facturacion: () => import("@/components/admin/unified/ComprobantesHubModule"),
  cotizaciones: () => import("@/components/admin/unified/ComprobantesHubModule"),
  "guias-remision": () => import("@/components/admin/unified/ComprobantesHubModule"),
  "notas-credito": () => import("@/components/admin/unified/ComprobantesHubModule"),
  contratos: () => import("@/components/admin/unified/DocumentosHubModule"),
  documentos: () => import("@/components/admin/unified/DocumentosHubModule"),
  // Sistema (Rendimiento, Auditoría, Colas) y Plan son vistas de Configuración (ola 2).
  auditoria: () => import("@/components/admin/tabs/SettingsTab"),
  rendimiento: () => import("@/components/admin/tabs/SettingsTab"),
  colas: () => import("@/components/admin/tabs/SettingsTab"),
  // Otros hubs / módulos.
  mensajes: () => import("@/components/admin/unified/MensajesHubModule"),
  "whatsapp-inbox": () => import("@/components/admin/unified/MensajesHubModule"),
  crecimiento: () => import("@/components/admin/unified/CrecimientoHubModule"),
  campanas: () => import("@/components/admin/unified/CrecimientoHubModule"),
  // Tareas y Notas son vistas de Equipo (`rrhh`) desde la ola 2.
  tareas: () => import("@/components/admin/unified/RecursosHumanosHubModule"),
  notas: () => import("@/components/admin/unified/RecursosHumanosHubModule"),
  rrhh: () => import("@/components/admin/unified/RecursosHumanosHubModule"),
  metas: () => import("@/components/admin/unified/MetasLogrosModule"),
  planificacion: () => import("@/components/admin/unified/PlanificacionModule"),
  analisis: () => import("@/components/admin/unified/AnalisisHubModule"),
  // Tienda online (`pagina-inicio`) absorbe Canales e Identidad y tema (ola 2).
  "pagina-inicio": () => import("@/components/admin/unified/MiTiendaHubModule"),
  canales: () => import("@/components/admin/unified/MiTiendaHubModule"),
  "store-customizer": () => import("@/components/admin/unified/MiTiendaHubModule"),
  "mi-perfil": () => import("@/components/admin/MiPerfilTab"),
  plan: () => import("@/components/admin/tabs/SettingsTab"),
  config: () => import("@/components/admin/tabs/SettingsTab"),
  "ctp-libro-operaciones": () => import("@/components/admin/forestal/CTPLibroOperaciones"),
  "forestal-lotes": () => import("@/components/admin/forestal/CTPLibroOperaciones"),
  "loth-libro-operaciones": () => import("@/components/admin/forestal/LothLibroOperaciones"),
  "forestal-herramientas": () => import("@/components/admin/forestal/ForestalHerramientas"),
  "forestal-tramites": () => import("@/components/admin/forestal/ForestalHerramientas"),
  camaras: () => import("@/components/admin/CamarasModule"),
  "cacao-acopio": () => import("@/components/admin/cacao/CacaoAcopio"),
  "a-medida": () => import("@/components/admin/a-medida/ALaMedidaModule"),
};

const preloaded = new Set<string>();

/** Arranca la precarga del chunk del tab (idempotente, fire-and-forget). */
export function preloadTab(tabId: string): void {
  if (preloaded.has(tabId)) return;
  const loader = TAB_LOADERS[tabId];
  if (!loader) return;
  preloaded.add(tabId);
  loader().catch(() => {
    preloaded.delete(tabId); // falló (offline/chunk) — permite reintentar luego
  });
}
