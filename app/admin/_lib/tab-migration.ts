import type { DestinoTab } from "@/lib/admin/destino-tab";
import type { Tab } from "./tabs.types";

/**
 * Alias de pestañas: id viejo → su casa de hoy (ADR-490, plan «panel unificado» R3).
 *
 * NINGÚN id se retira: hay avisos guardados en la base con `/admin?tab=<id>`,
 * links de WhatsApp ya enviados y favoritos en cada navegador. El valor es:
 *  - un `Tab` → nombre nuevo del MISMO módulo: la `?vista=` del link viaja;
 *  - un `DestinoTab` `{ tab, vista, sub }` → el contenido se mudó a la vista de
 *    otra pestaña: SU vista gana (la del link era del módulo viejo).
 * Un alias puede apuntar a otro alias (se sigue la cadena); un ciclo o un
 * destino que el panel no sabe abrir lo frena `__tests__/destino-tab.test.ts`.
 *
 * NO leer este mapa directo: `resolverDestino` (`lib/admin/destino-tab.ts`)
 * aplica el orden único (par con vista → alias → cadena → pestaña conocida).
 */
export const TAB_MIGRATION: Record<string, Tab | DestinoTab> = {
  // Alias NATURALES — lo que una persona escribe o lo que un link viejo trae.
  // Sin estos, `?tab=inicio` no resolvía y el panel caía en silencio al último
  // tab guardado en localStorage: un link a "Inicio" te abría Inventario.
  inicio: "vendor-dashboard", home: "vendor-dashboard",
  ventas: "ventas-caja",
  whatsapp: "whatsapp-inbox",
  "canales-venta": "canales",
  documentacion: "documentos",
  // Los avisos «Adelantos vencidos por cobrar» anteriores al 09-10 traen
  // `?tab=cobranza`, que nunca existió: sin esto abrían Inicio. Desde la ola 3
  // va directo a la cobranza de Adelantos (Mi Plata › Adelantos, `?sub=`).
  cobranza: { tab: "plata", vista: "adelantos", sub: "cobranza" },
  // El cron de predicción (`app/api/cron/demand-forecast`) escribe «Ver
  // predicciones» con `?tab=demand-prediction`, que nunca fue pestaña: 30
  // avisos guardados caían en Inicio (medido 09-10). Si `forecasting` pasa a
  // ser una vista de Inicio, éste la sigue solo.
  "demand-prediction": "forecasting",
  // El correo de límite del plan (`lib/billing/alerts/templates.ts`) manda a
  // `?tab=subscription` para mejorar el plan; la pestaña del plan es `plan`.
  subscription: "plan",
  // → Asistente IA (absorbe dashboard, agentes, changelog)
  dashboard: "asistente-ia", "dashboard-ejecutivo": "asistente-ia", "panel-principal": "asistente-ia",
  agentes: "asistente-ia", changelog: "asistente-ia",
  // → Ventas & Caja — `ventas-caja` es el ID ACTUAL del POS (no migrar).
  // Tabs antiguos (pos / caja / pos-caja / arqueo-caja) sí se redirigen al POS.
  pos: "ventas-caja", caja: "ventas-caja", "pos-caja": "ventas-caja", "arqueo-caja": "ventas-caja",
  "ventas-marketing": "analytics-pro", marketing: "analytics-pro", "forecast-ventas": "analytics-pro",
  "metricas-conversion": "analytics-pro", referidos: "analytics-pro",
  // → Inventario
  inventario: "inventario", kardex: "inventario", lotes: "inventario",
  mermas: { tab: "inventario", vista: "kardex", sub: "perdidas" }, almacenes: "inventario",
  "inventario-almacenes": "inventario", ubicaciones: "inventario", transferencias: "inventario",
  "auto-reorden": "inventario", "reorden-dinamico": "inventario",
  prediccion: "inventario", reposicion: "inventario",
  // Formato viejo `/admin?module=inventario&tab=stock`: lo mandan por push los
  // crones de stock bajo y de productos sin ventas. Caía en Inicio (09-10).
  stock: { tab: "inventario", vista: "stock" },
  // → Productos (desde la ola 3, vistas de Productos e inventario: abajo).
  // Combos, kits y A/B siguen la cadena `productos` → Categorías, que es donde
  // caían antes (la 1.ª vista de Productos); su casa la decide Brandon.
  "combos-editor": "productos", combos: "productos", kits: "productos", "ab-tests": "productos",
  // → Compras
  compras: "compras", "plan-compras": "compras", "aprobacion-compras": "compras",
  proveedores: "compras", "portal-proveedor": "compras", evaluaciones: "compras",
  "calidad-proveedor": "compras", "pagos-proveedor": "compras",
  // → Mi Plata (finanzas, analytics, reportes)
  pl: "plata", "balance-general": "plata", "flujo-caja": "plata",
  presupuestos: "plata", "presupuesto-real": "plata", "break-even": "plata",
  rentabilidad: "plata", margenes: "plata", finanzas: "plata",
  tesoreria: "plata", "proyeccion-liquidez": "plata", cheques: "plata",
  conciliacion: "plata", "centro-cobros": "plata",
  cuentas: "plata",
  gastos: "plata", "centros-costo": "plata", seguros: "plata",
  "gastos-activos": "plata",
  reportes: "plata", "reportes-auto": "plata", "importar-exportar": "plata",
  "reportes-documentos": "plata",
  "analytics-bi": "plata", bi: "plata", "mapa-calor": "plata", "abc-analysis": "plata",
  pareto: "plata", "bcg-matrix": "plata", "analisis-cesta": "plata", "kpi-personalizado": "plata",
  proyecciones: "plata", simulador: "plata", estacionalidad: "plata", "comparador-periodos": "plata",
  // → Mis Clientes (CRM, delivery, fidelizacion, logistica)
  crm: "clientes", "cliente-360": "clientes", segmentos: "clientes",
  "segmentos-auto": "clientes", clv: "clientes", clientes: "clientes",
  "crm-clientes": "clientes", visitantes: "clientes",
  fidelizacion: "clientes", "programa-puntos": "clientes", "wish-lists": "clientes",
  "encuestas-soporte": "clientes", nps: "clientes", encuestas: "clientes",
  soporte: "clientes", resenas: "clientes",
  logistica: "clientes",
  "seguimiento-envios": "clientes", "costos-envio": "clientes", flota: "clientes",
  "logistica-devoluciones": "clientes", "devoluciones-calidad": "clientes",
  devoluciones: "clientes", "devoluciones-avanzadas": "clientes", calidad: "clientes", anomalias: "clientes",
  // → Configuración (seguridad, sistema, RRHH, comunicaciones, tareas, agenda)
  usuarios: "config", "usuarios-admin": "config", "permisos-roles": "config", "logs-seguridad": "config",
  actividad: "config", cumplimiento: "config",
  "salud-sistema": "config", "backup-restaurar": "config", webhooks: "config",
  sistema: "config", configuracion: "config", equipo: "config", seguridad: "config",
  sucursales: "config",
  comunicaciones: "config", "hub-comunicaciones": "config",
  chat: "config", "plantillas-mensaje": "config", notificaciones: "config",
  proyectos: "config", kanban: "config",
  "tablero-metas": "config",
  "alertas-automatizacion": "config", "alertas-automaticas": "config",
  recordatorios: "config", flujos: "config", "reglas-negocio": "config",
  "agenda-utilidades": "config", calendario: "config",
  "filtros-guardados": "config",
  // Especiales
  pedidos: "pedidos",
  // Marketplace & Delivery
  marketplace: "marketplace",
  "marketplace-tienda": { tab: "marketplace", vista: "tienda" },
  "marketplace-productos": { tab: "marketplace", vista: "productos" },
  "marketplace-ordenes": { tab: "marketplace", vista: "ordenes" },
  "marketplace-comisiones": { tab: "marketplace", vista: "comisiones" },
  // Formato viejo `/admin?module=marketplace&tab=ordenes`: el aviso «Nuevo
  // pedido marketplace» (app/api/marketplace/orders y el webhook de Mercado
  // Pago). 60 guardados en 5 negocios caían en Inicio (09-10). Desde el 11-10
  // Marketplace lee `?vista=`: el aviso abre Órdenes.
  ordenes: { tab: "marketplace", vista: "ordenes" },
  // Rendimiento técnico (`rendimiento` → Configuración › Sistema, abajo)
  "web-vitals": "rendimiento",
  "salud-sistema-tech": "rendimiento",
  // Módulos adicionales
  recetas: "recetas",
  // → Recursos Humanos (ADR-414). "rrhh" y "nomina" ya NO van a "config": son
  // pestaña real. Alias de links viejos y de lo que una persona escribiría.
  rrhh: "rrhh", nomina: "rrhh",
  "recursos-humanos": "rrhh", personal: "rrhh", asistencia: "rrhh", asistencias: "rrhh",
  colaboradores: "rrhh", trabajadores: "rrhh", empleados: "rrhh", planilla: "rrhh",

  // ── Ola 2 del panel unificado (2026-10-10): pestañas que pasaron a ser una
  //    vista de otra. El componente es el mismo (R5); su permiso lo da el
  //    `origen` de la vista (R2, lib/admin/subvistas-modulos.ts).
  // Configuración absorbe Plan y Sistema (Rendimiento, Auditoría y Colas).
  plan: { tab: "config", vista: "plan" },
  rendimiento: { tab: "config", vista: "sistema", sub: "velocidad" },
  auditoria: { tab: "config", vista: "sistema", sub: "actividad" },
  colas: { tab: "config", vista: "sistema", sub: "colas" },
  // Equipo (`rrhh`) absorbe Tareas y Notas; el hub Equipo viejo queda sin montar.
  tareas: { tab: "rrhh", vista: "tareas" },
  "proyectos-tareas": { tab: "rrhh", vista: "tareas" },
  notas: { tab: "rrhh", vista: "notas" },
  "notas-rapidas": { tab: "rrhh", vista: "notas" },
  // Tienda online: una sola barra; Canales es «Redes y medición».
  canales: { tab: "pagina-inicio", vista: "redes" },
  "store-customizer": { tab: "pagina-inicio", vista: "apariencia" },
  // Pedidos y reparto absorbe Delivery. entregas/rutas/horarios caían en
  // Clientes, que no tiene nada de reparto.
  "delivery-partners": { tab: "pedidos", vista: "reparto" },
  "delivery-live": { tab: "pedidos", vista: "reparto", sub: "en-vivo" },
  delivery: { tab: "pedidos", vista: "reparto" },
  entregas: { tab: "pedidos", vista: "reparto" },
  "rutas-delivery": { tab: "pedidos", vista: "reparto" },
  "delivery-horarios": { tab: "pedidos", vista: "reparto" },
  repartidores: { tab: "pedidos", vista: "reparto", sub: "repartidores" },
  asignaciones: { tab: "pedidos", vista: "reparto", sub: "asignaciones" },
  // Forestal: Trámites es la 2.ª fase de Herramientas; los lotes comerciales
  // con QR, una pestaña de Libro CTP › Despacho (Brandon, 2026-10-09). `?lote=`
  // viaja intacto (urlConDestino sólo toca tab, vista y sub).
  "forestal-tramites": { tab: "forestal-herramientas", vista: "catalogo" },
  "forestal-lotes": { tab: "ctp-libro-operaciones", vista: "despacho", sub: "lotes-qr" },

  // ── Ola 3 del panel unificado (2026-10-10): dinero y abastecimiento.
  // Ventas y caja: Me deben es la casa única de los fiados (Brandon, 2026-10-09)
  // y Turnos, una vista. `?tab=fiados` abría Mi Plata › Fiados.
  fiados: { tab: "ventas-caja", vista: "cuentas-cobrar" },
  turnos: { tab: "ventas-caja", vista: "turnos" },
  // Mi Plata en dos niveles: las pestañas sueltas que abrían el hub en una hoja.
  // `activos` y `adelantos` son del plan Básico: su vista los nombra en `origen`.
  activos: { tab: "plata", vista: "activos" },
  adelantos: { tab: "plata", vista: "adelantos" },
  prestamos: { tab: "plata", vista: "prestamos" },
  scoring: { tab: "plata", vista: "scoring" },
  "por-cobrar": { tab: "plata", vista: "por-cobrar" },
  "cuentas-cobrar": { tab: "plata", vista: "por-cobrar" },
  // TaxTab y ObligacionesTab vivían en Comprobantes: hoy son Mi Plata › Impuestos.
  impuestos: { tab: "plata", vista: "impuestos" },
  // Compras: 7 vistas. Dropship y Devoluciones eran pestañas sueltas; Recepción,
  // la 2.ª sección de Órdenes y recepción.
  dropship: { tab: "compras", vista: "dropship" },
  "devoluciones-proveedor": { tab: "compras", vista: "devoluciones" },
  recepcion: { tab: "compras", vista: "ordenes-compra", sub: "recibir" },
  // Productos e inventario absorbe Productos (Categorías, Precios, Ofertas y
  // cupones) y el Conteo físico, que era un modal.
  productos: { tab: "inventario", vista: "categorias" },
  "catalogo-tienda": { tab: "inventario", vista: "categorias" },
  "categorias-editor": { tab: "inventario", vista: "categorias" },
  promociones: { tab: "inventario", vista: "ofertas", sub: "ofertas" },
  cupones: { tab: "inventario", vista: "ofertas", sub: "cupones" },
  "historial-precios": { tab: "inventario", vista: "precios" },
  "precios-promos": { tab: "inventario", vista: "precios" },
  "inventario-fisico": { tab: "inventario", vista: "conteo" },
  benchmark: { tab: "marketplace", vista: "precios" },
  // Comprobantes (`facturacion`) deja de ser una vista de Documentos: es su hub.
  "e-facturacion": { tab: "facturacion", vista: "facturas" },
  cotizaciones: { tab: "facturacion", vista: "cotizaciones" },
  "guias-remision": { tab: "facturacion", vista: "guias" },
  "notas-credito": { tab: "facturacion", vista: "notas" },
  contratos: { tab: "documentos", vista: "contratos" },
};

/**
 * Vistas que se mudaron: `"<tab>:<vista>"` viejo → destino (notación `vieneDe`
 * del plan, §2.2). Gana sobre `TAB_MIGRATION`: un link `?tab=X&vista=Y` va al
 * destino exacto de esa vista aunque `X` tenga su propio alias. La llenan los
 * integradores de cada ola (pedido `vistaMigracion` en `SP/panel/registro`).
 */
export const VISTA_MIGRATION: Record<string, DestinoTab> = {
  // Marketplace › Cupones era la misma tabla `Coupon` que Ofertas y cupones (11-10).
  "marketplace:cupones": { tab: "inventario", vista: "ofertas", sub: "cupones" },
  // Campañas › Segmentos se fundió en Campañas (fila «Para quién», 11-10).
  "campanas:segmentos": { tab: "campanas", vista: "campanas" },
  // Recetas › Resumen repetía Producción (lotes del mes y gráfico semanal) → se fundió ahí (11-10).
  "recetas:dashboard": { tab: "recetas", vista: "produccion" },
  // Segmentos → los Indicadores de Mis clientes (10-10): repetía su faceta «Segmento».
  "clientes:segmentos": { tab: "clientes", vista: "crm" },
  // Pérdidas → sección de Entradas y salidas (10-10).
  "inventario:mermas": { tab: "inventario", vista: "kardex", sub: "perdidas" },
  // ── Ola 2 (2026-10-10) ──
  "tareas:tareas": { tab: "rrhh", vista: "tareas" },
  "tareas:notas": { tab: "rrhh", vista: "notas" },
  "pagina-inicio:identidad": { tab: "pagina-inicio", vista: "apariencia" },
  "pagina-inicio:pagina": { tab: "pagina-inicio", vista: "contenido" },
  // Las 8 vistas del Delivery suelto → las secciones de Reparto (`?sub=`).
  "delivery-partners:live": { tab: "pedidos", vista: "reparto", sub: "en-vivo" },
  "delivery-partners:pedidos-vivo": { tab: "pedidos", vista: "reparto", sub: "en-vivo" },
  "delivery-partners:repartidores": { tab: "pedidos", vista: "reparto", sub: "repartidores" },
  "delivery-partners:solicitudes": { tab: "pedidos", vista: "reparto", sub: "postulantes" },
  "delivery-partners:asignaciones": { tab: "pedidos", vista: "reparto", sub: "asignaciones" },
  "delivery-partners:permisos": { tab: "pedidos", vista: "reparto", sub: "asignaciones" },
  "delivery-partners:retiros": { tab: "pedidos", vista: "reparto", sub: "pagos" },
  "delivery-partners:ranking": { tab: "pedidos", vista: "reparto", sub: "ranking" },
  // Libro CTP 26 → 22 y Libro TH 10 → 9: la vista vieja es una pestaña interna.
  "ctp-libro-operaciones:gtf-ingresadas": { tab: "ctp-libro-operaciones", vista: "ingresos", sub: "recepcionadas" },
  "ctp-libro-operaciones:reportes": { tab: "ctp-libro-operaciones", vista: "tablero", sub: "produccion" },
  "ctp-libro-operaciones:analisis": { tab: "ctp-libro-operaciones", vista: "tablero", sub: "tendencias" },
  "ctp-libro-operaciones:rentabilidad": { tab: "ctp-libro-operaciones", vista: "tablero", sub: "margen" },
  "forestal-herramientas:rendimiento": { tab: "ctp-libro-operaciones", vista: "tablero", sub: "rendimiento" },
  "loth-libro-operaciones:extraccion": { tab: "loth-libro-operaciones", vista: "tablero", sub: "extraccion" },
  // ── Ola 3 (2026-10-10) ──
  "plata:fiados": { tab: "ventas-caja", vista: "cuentas-cobrar" },
  "ventas-caja:arqueo": { tab: "ventas-caja", vista: "caja-registradora", sub: "cuadrar" },
  "compras:recepcion": { tab: "compras", vista: "ordenes-compra", sub: "recibir" },
  "compras:comparador": { tab: "compras", vista: "proveedores", sub: "comparar" },
  "compras:historial-gastos": { tab: "plata", vista: "gastos" },
  "productos:categorias": { tab: "inventario", vista: "categorias" },
  "productos:promociones": { tab: "inventario", vista: "ofertas", sub: "ofertas" },
  "productos:cupones": { tab: "inventario", vista: "ofertas", sub: "cupones" },
  "productos:historial-precios": { tab: "inventario", vista: "precios" },
  "documentos:facturacion": { tab: "facturacion", vista: "facturas" },
  "documentos:cotizaciones": { tab: "facturacion", vista: "cotizaciones" },
  "documentos:guias": { tab: "facturacion", vista: "guias" },
  "documentos:notas": { tab: "facturacion", vista: "notas" },
  // Asistente IA (10-10): «Sugerencias IA» se fundió en Comandos IA (lo que no
  // se vende → Precios en bloque; a quién ofrecerle → A quién escribir).
  "asistente-ia:sugerencias": { tab: "asistente-ia", vista: "comandos" },
};
