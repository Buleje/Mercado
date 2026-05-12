import type { Tab } from "./tabs.types";

// Old tab IDs → consolidated module IDs for localStorage migration
// Maps all legacy tab IDs from previous 14-module and 28-module layouts to new 8-module layout
export const TAB_MIGRATION: Record<string, Tab> = {
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
  "inventario-fisico": "inventario", mermas: "inventario", almacenes: "inventario",
  "inventario-almacenes": "inventario", ubicaciones: "inventario", transferencias: "inventario",
  "auto-reorden": "inventario", "reorden-dinamico": "inventario",
  prediccion: "inventario", reposicion: "inventario",
  // → Productos & Precios
  "categorias-editor": "productos", "combos-editor": "productos", combos: "productos",
  kits: "productos", "catalogo-tienda": "productos",
  "precios-promos": "productos", benchmark: "productos", "historial-precios": "productos",
  promociones: "productos", cupones: "productos", "ab-tests": "productos",
  // → Compras
  compras: "compras", "plan-compras": "compras", "aprobacion-compras": "compras",
  recepcion: "compras",
  proveedores: "compras", "portal-proveedor": "compras", evaluaciones: "compras",
  "calidad-proveedor": "compras", "pagos-proveedor": "compras",
  // Documentos (tabs propios bajo hub "Cobrar" — NO redirigir a compras)
  cotizaciones: "cotizaciones",
  contratos: "contratos",
  "notas-credito": "notas-credito",
  "guias-remision": "guias-remision",
  // → Mi Plata (finanzas, analytics, reportes)
  pl: "plata", "balance-general": "plata", "flujo-caja": "plata",
  presupuestos: "plata", "presupuesto-real": "plata", "break-even": "plata",
  rentabilidad: "plata", margenes: "plata", finanzas: "plata",
  tesoreria: "plata", "proyeccion-liquidez": "plata", cheques: "plata",
  conciliacion: "plata", "centro-cobros": "plata", "cuentas-cobrar": "plata",
  "e-facturacion": "facturacion", impuestos: "plata", cuentas: "plata",
  gastos: "plata", "centros-costo": "plata", seguros: "plata",
  activos: "plata", "gastos-activos": "plata",
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
  entregas: "clientes", "rutas-delivery": "clientes", "delivery-horarios": "clientes",
  "seguimiento-envios": "clientes", "costos-envio": "clientes", flota: "clientes",
  "logistica-devoluciones": "clientes", "devoluciones-calidad": "clientes",
  devoluciones: "clientes", "devoluciones-avanzadas": "clientes", calidad: "clientes", anomalias: "clientes",
  // → Configuración (seguridad, sistema, RRHH, comunicaciones, tareas, agenda)
  usuarios: "config", "usuarios-admin": "config", "permisos-roles": "config", "logs-seguridad": "config",
  actividad: "config", cumplimiento: "config",
  "salud-sistema": "config", "backup-restaurar": "config", webhooks: "config",
  sistema: "config", configuracion: "config", equipo: "config", seguridad: "config",
  rrhh: "config", nomina: "config", sucursales: "config",
  comunicaciones: "config", "hub-comunicaciones": "config",
  chat: "config", "plantillas-mensaje": "config", notificaciones: "config",
  proyectos: "config", tareas: "config", kanban: "config",
  "tablero-metas": "config", "proyectos-tareas": "config",
  "alertas-automatizacion": "config", "alertas-automaticas": "config",
  recordatorios: "config", flujos: "config", "reglas-negocio": "config",
  "agenda-utilidades": "config", calendario: "config",
  "notas-rapidas": "config", "filtros-guardados": "config",
  // Especiales
  pedidos: "pedidos",
  plan: "plan",
  // Módulos nuevos
  auditoria: "auditoria",
  "devoluciones-proveedor": "devoluciones-proveedor",
  scoring: "scoring",
  // Marketplace & Delivery
  marketplace: "marketplace",
  "marketplace-tienda": "marketplace",
  "marketplace-productos": "marketplace",
  "marketplace-ordenes": "marketplace",
  "marketplace-comisiones": "marketplace",
  delivery: "delivery-partners",
  "delivery-partners": "delivery-partners",
  repartidores: "delivery-partners",
  asignaciones: "delivery-partners",
  // Rendimiento técnico
  rendimiento: "rendimiento",
  "web-vitals": "rendimiento",
  "salud-sistema-tech": "rendimiento",
  // Módulos adicionales
  fiados: "fiados",
  turnos: "turnos",
  recetas: "recetas",
  prestamos: "prestamos",
};
