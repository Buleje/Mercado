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
  productos: () => import("@/components/admin/unified/CatalogoTiendaModule"),
  compras: () => import("@/components/admin/unified/ComprasModule"),
  "devoluciones-proveedor": () => import("@/components/admin/unified/ComprasModule"),
  // Hub financiero — muchos sub-tabs comparten módulo.
  plata: () => import("@/components/admin/unified/FinanzasModule"),
  fiados: () => import("@/components/admin/unified/FinanzasModule"),
  "por-cobrar": () => import("@/components/admin/unified/FinanzasModule"),
  prestamos: () => import("@/components/admin/unified/FinanzasModule"),
  adelantos: () => import("@/components/admin/unified/FinanzasModule"),
  activos: () => import("@/components/admin/unified/FinanzasModule"),
  scoring: () => import("@/components/admin/unified/FinanzasModule"),
  clientes: () => import("@/components/admin/unified/CRMClientesModule"),
  "leads-funnel": () => import("@/components/admin/unified/CRMClientesModule"),
  pedidos: () => import("@/components/admin/OrdersTab"),
  recetas: () => import("@/components/admin/RecetasModule"),
  dropship: () => import("@/components/admin/unified/DropshipModule"),
  marketplace: () => import("@/components/admin/unified/MarketplaceModule"),
  promociones: () => import("@/components/admin/PromocionesModule"),
  // Hub de documentos & SUNAT.
  cotizaciones: () => import("@/components/admin/unified/DocumentosHubModule"),
  "guias-remision": () => import("@/components/admin/unified/DocumentosHubModule"),
  "notas-credito": () => import("@/components/admin/unified/DocumentosHubModule"),
  contratos: () => import("@/components/admin/unified/DocumentosHubModule"),
  facturacion: () => import("@/components/admin/unified/DocumentosHubModule"),
  documentos: () => import("@/components/admin/unified/DocumentosHubModule"),
  // Hub de sistema.
  auditoria: () => import("@/components/admin/unified/SistemaHubModule"),
  rendimiento: () => import("@/components/admin/unified/SistemaHubModule"),
  colas: () => import("@/components/admin/unified/SistemaHubModule"),
  // Otros hubs / módulos.
  mensajes: () => import("@/components/admin/unified/MensajesHubModule"),
  crecimiento: () => import("@/components/admin/unified/CrecimientoHubModule"),
  campanas: () => import("@/components/admin/unified/CrecimientoHubModule"),
  equipo: () => import("@/components/admin/unified/EquipoHubModule"),
  tareas: () => import("@/components/admin/unified/EquipoHubModule"),
  metas: () => import("@/components/admin/unified/MetasLogrosModule"),
  analisis: () => import("@/components/admin/unified/AnalisisHubModule"),
  canales: () => import("@/components/admin/tabs/SalesChannelsTab"),
  delivery: () => import("@/components/admin/unified/DeliveryPartnersModule"),
  "mi-tienda": () => import("@/components/admin/unified/MiTiendaHubModule"),
  "mi-perfil": () => import("@/components/admin/MiPerfilTab"),
  plan: () => import("@/components/admin/PlanTab"),
  config: () => import("@/components/admin/tabs/SettingsTab"),
  "ctp-libro-operaciones": () => import("@/components/admin/forestal/CTPLibroOperaciones"),
  "loth-libro-operaciones": () => import("@/components/admin/forestal/LothLibroOperaciones"),
  "cacao-acopio": () => import("@/components/admin/cacao/CacaoAcopio"),
};

const preloaded = new Set<string>();

/** Arranca la precarga del chunk del tab (idempotente, fire-and-forget). */
export function preloadTab(tabId: string): void {
  if (preloaded.has(tabId)) return;
  const loader = TAB_LOADERS[tabId];
  if (!loader) return;
  preloaded.add(tabId);
  loader().catch(() => {
    preloaded.delete(tabId); // falló (offline/chunk) — permití reintentar luego
  });
}
