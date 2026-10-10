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
  // `?tab=cobranza`, que nunca existió: sin esto abrían Inicio.
  cobranza: "adelantos",
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
  "inventario-fisico": "inventario", mermas: "inventario", almacenes: "inventario",
  "inventario-almacenes": "inventario", ubicaciones: "inventario", transferencias: "inventario",
  "auto-reorden": "inventario", "reorden-dinamico": "inventario",
  prediccion: "inventario", reposicion: "inventario",
  // Formato viejo `/admin?module=inventario&tab=stock`: lo mandan por push los
  // crones de stock bajo y de productos sin ventas. Caía en Inicio (09-10).
  stock: { tab: "inventario", vista: "stock" },
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
  "gastos-activos": "plata",
  // 'activos' YA NO migra a 'plata' — ahora es el módulo Activos & Maquinaria
  // (Brandon 2026-06-06). Era un alias legacy de un sub-tab de finanzas.
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
  sucursales: "config",
  comunicaciones: "config", "hub-comunicaciones": "config",
  chat: "config", "plantillas-mensaje": "config", notificaciones: "config",
  // "tareas" ya NO migra a config: ahora es tab real del hub Equipo (TasksTab montado).
  proyectos: "config", kanban: "config",
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
  // Formato viejo `/admin?module=marketplace&tab=ordenes`: el aviso «Nuevo
  // pedido marketplace» (app/api/marketplace/orders y el webhook de Mercado
  // Pago). 60 guardados en 5 negocios caían en Inicio (09-10). Sin vista a
  // propósito: Marketplace elige su sección con estado local; cuando lea
  // `?vista=` (ola 4) este alias y los `marketplace-*` llevan la suya.
  ordenes: "marketplace",
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
  // → Recursos Humanos (ADR-414). "rrhh" y "nomina" ya NO van a "config": son
  // pestaña real. Alias de links viejos y de lo que una persona escribiría.
  rrhh: "rrhh", nomina: "rrhh",
  "recursos-humanos": "rrhh", personal: "rrhh", asistencia: "rrhh", asistencias: "rrhh",
  colaboradores: "rrhh", trabajadores: "rrhh", empleados: "rrhh", planilla: "rrhh",
};

/**
 * Vistas que se mudaron: `"<tab>:<vista>"` viejo → destino (notación `vieneDe`
 * del plan, §2.2). Gana sobre `TAB_MIGRATION`: un link `?tab=X&vista=Y` va al
 * destino exacto de esa vista aunque `X` tenga su propio alias. La llenan los
 * integradores de cada ola (pedido `vistaMigracion` en `SP/panel/registro`).
 */
export const VISTA_MIGRATION: Record<string, DestinoTab> = {};
