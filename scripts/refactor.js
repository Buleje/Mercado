const fs = require('fs');
let code = fs.readFileSync('app/admin/page.tsx', 'utf8');

// 1. Update Tab Type
code = code.replace(
  /type Tab = [\s\S]*?;/,
  `type Tab = "panel-principal" | "pos-caja" | "inventario-almacenes" | "catalogo-tienda"
  | "precios-promos" | "compras" | "logistica" | "devoluciones-calidad"
  | "ventas-marketing" | "crm-clientes" | "fidelizacion" | "encuestas-soporte"
  | "analytics-bi" | "proyecciones" | "finanzas"
  | "rrhh" | "proyectos-tareas" | "comunicaciones" | "alertas-automatizacion"
  | "reportes-documentos" | "agenda-utilidades" | "seguridad"
  | "pedidos" | "plan" | "changelog";`
);

// 2. Update TAB_MIGRATION
code = code.replace(
  /const TAB_MIGRATION: Record<string, Tab> = {[\s\S]*?};/,
  `const TAB_MIGRATION: Record<string, Tab> = {
  dashboard: "panel-principal", "dashboard-ejecutivo": "panel-principal",
  pos: "pos-caja", caja: "pos-caja", "arqueo-caja": "pos-caja", turnos: "pos-caja",
  
  // Inventario & Reposicion -> inventario-almacenes
  inventario: "inventario-almacenes", kardex: "inventario-almacenes", lotes: "inventario-almacenes", "inventario-fisico": "inventario-almacenes", mermas: "inventario-almacenes", almacenes: "inventario-almacenes", ubicaciones: "inventario-almacenes", transferencias: "inventario-almacenes",
  reposicion: "inventario-almacenes", "auto-reorden": "inventario-almacenes", "reorden-dinamico": "inventario-almacenes", prediccion: "inventario-almacenes",
  
  "categorias-editor": "catalogo-tienda", "combos-editor": "catalogo-tienda", combos: "catalogo-tienda", kits: "catalogo-tienda", "pagina-inicio": "catalogo-tienda",
  benchmark: "precios-promos", "historial-precios": "precios-promos", promociones: "precios-promos", cupones: "precios-promos", "ab-tests": "precios-promos",
  
  // Compras & Proveedores -> compras
  compras: "compras", "plan-compras": "compras", "aprobacion-compras": "compras", contratos: "compras", cotizaciones: "compras", recepcion: "compras",
  proveedores: "compras", "portal-proveedor": "compras", evaluaciones: "compras", "calidad-proveedor": "compras", "pagos-proveedor": "compras",
  
  entregas: "logistica", "rutas-delivery": "logistica", "delivery-horarios": "logistica", "seguimiento-envios": "logistica", "costos-envio": "logistica", flota: "logistica", "logistica-devoluciones": "logistica",
  devoluciones: "devoluciones-calidad", "devoluciones-avanzadas": "devoluciones-calidad", calidad: "devoluciones-calidad", anomalias: "devoluciones-calidad",
  
  marketing: "ventas-marketing", "forecast-ventas": "ventas-marketing", "metricas-conversion": "ventas-marketing", referidos: "ventas-marketing",
  
  // Clientes & Leads -> crm-clientes
  crm: "crm-clientes", "cliente-360": "crm-clientes", segmentos: "crm-clientes", "segmentos-auto": "crm-clientes", clv: "crm-clientes",
  clientes: "crm-clientes", visitantes: "crm-clientes",
  
  fidelizacion: "fidelizacion", "programa-puntos": "fidelizacion", "wish-lists": "fidelizacion",
  
  // Customer Success -> encuestas-soporte
  nps: "encuestas-soporte", encuestas: "encuestas-soporte", soporte: "encuestas-soporte",
  "reseñas": "encuestas-soporte", resenas: "encuestas-soporte",
  
  bi: "analytics-bi", "mapa-calor": "analytics-bi", "abc-analysis": "analytics-bi", pareto: "analytics-bi", "bcg-matrix": "analytics-bi", "analisis-cesta": "analytics-bi", "kpi-personalizado": "analytics-bi",
  simulador: "proyecciones", estacionalidad: "proyecciones", "comparador-periodos": "proyecciones",
  
  // Finanzas & Contabilidad -> finanzas
  pl: "finanzas", "balance-general": "finanzas", "flujo-caja": "finanzas", presupuestos: "finanzas", "presupuesto-real": "finanzas", "break-even": "finanzas", rentabilidad: "finanzas", margenes: "finanzas",
  tesoreria: "finanzas", "proyeccion-liquidez": "finanzas", cheques: "finanzas", conciliacion: "finanzas", "centro-cobros": "finanzas", "cuentas-cobrar": "finanzas",
  facturacion: "finanzas", "e-facturacion": "finanzas", impuestos: "finanzas", cuentas: "finanzas",
  gastos: "finanzas", "centros-costo": "finanzas", seguros: "finanzas", activos: "finanzas", "gastos-activos": "finanzas",
  
  rrhh: "rrhh", nomina: "rrhh", sucursales: "rrhh",
  proyectos: "proyectos-tareas", tareas: "proyectos-tareas", kanban: "proyectos-tareas", metas: "proyectos-tareas", "tablero-metas": "proyectos-tareas",
  "hub-comunicaciones": "comunicaciones", chat: "comunicaciones", "plantillas-mensaje": "comunicaciones", notificaciones: "comunicaciones",
  "alertas-automaticas": "alertas-automatizacion", recordatorios: "alertas-automatizacion", flujos: "alertas-automatizacion", "reglas-negocio": "alertas-automatizacion",
  reportes: "reportes-documentos", "reportes-auto": "reportes-documentos", "importar-exportar": "reportes-documentos", documentos: "reportes-documentos",
  calendario: "agenda-utilidades", "notas-rapidas": "agenda-utilidades", "filtros-guardados": "agenda-utilidades",
  
  // Sistema & Accesos -> seguridad
  "usuarios-admin": "seguridad", "permisos-roles": "seguridad", "logs-seguridad": "seguridad", auditoria: "seguridad", actividad: "seguridad", cumplimiento: "seguridad",
  "salud-sistema": "seguridad", "backup-restaurar": "seguridad", webhooks: "seguridad", sistema: "seguridad", configuracion: "seguridad", equipo: "seguridad",
  
  pedidos: "pedidos",
  changelog: "changelog",
  plan: "plan",
};`
);

// update TAB_CATEGORIES
code = code.replace(
  /const TAB_CATEGORIES: TabCategory\[\] = \[[\s\S]*?\];/,
  `const TAB_CATEGORIES: TabCategory[] = [
  {
    id: "operaciones",
    label: "Operaciones & POS",
    icon: Monitor,
    tabs: ["panel-principal", "pos-caja", "inventario-almacenes", "pedidos"]
  },
  {
    id: "producto",
    label: "Producto & Precios",
    icon: Package,
    tabs: ["catalogo-tienda", "precios-promos"]
  },
  {
    id: "compras-proveedores",
    label: "Compras & Proveedores",
    icon: Truck,
    tabs: ["compras"]
  },
  {
    id: "logistica-calidad",
    label: "Logística & Calidad",
    icon: MapPin,
    tabs: ["logistica", "devoluciones-calidad"]
  },
  {
    id: "clientes-marketing",
    label: "Clientes & Marketing",
    icon: Users,
    tabs: ["crm-clientes", "ventas-marketing", "fidelizacion", "encuestas-soporte"]
  },
  {
    id: "analytics",
    label: "Inteligencia & Analytics",
    icon: Brain,
    tabs: ["analytics-bi", "proyecciones"]
  },
  {
    id: "finanzas",
    label: "Finanzas",
    icon: DollarSign,
    tabs: ["finanzas"]
  },
  {
    id: "organizacion",
    label: "Organización",
    icon: Target,
    tabs: ["rrhh", "proyectos-tareas", "comunicaciones", "alertas-automatizacion"]
  },
  {
    id: "admin-sistema",
    label: "Administración & Sistema",
    icon: Settings,
    tabs: ["reportes-documentos", "agenda-utilidades", "seguridad", "plan", "changelog"]
  },
];`
);

// Replace ALL_TABS
code = code.replace(
  /const ALL_TABS = \[[\s\S]*?\] as const;/,
  `const ALL_TABS = [
    // — Operaciones & POS —
    { id: "panel-principal" as Tab,         label: "Panel Principal",            icon: BarChart3 },
    { id: "pos-caja" as Tab,               label: "POS & Caja",                icon: Monitor },
    { id: "inventario-almacenes" as Tab,   label: "Inventario & Reposición",    icon: Boxes },
    { id: "pedidos" as Tab,                label: "Pedidos",                   icon: ShoppingCart },
    // — Producto & Precios —
    { id: "catalogo-tienda" as Tab,        label: "Catálogo & Tienda",         icon: Store },
    { id: "precios-promos" as Tab,         label: "Precios & Promos",          icon: DollarSign },
    // — Compras & Proveedores —
    { id: "compras" as Tab,                label: "Compras & Proveedores",     icon: Truck },
    // — Logística & Calidad —
    { id: "logistica" as Tab,              label: "Logística",                 icon: MapPin },
    { id: "devoluciones-calidad" as Tab,   label: "Devoluciones & Calidad",    icon: RotateCcw },
    // — Clientes & Marketing —
    { id: "crm-clientes" as Tab,           label: "Clientes & Leads",          icon: Users },
    { id: "ventas-marketing" as Tab,       label: "Ventas & Marketing",        icon: Megaphone },
    { id: "fidelizacion" as Tab,           label: "Fidelización",              icon: Heart },
    { id: "encuestas-soporte" as Tab,      label: "Customer Success (CX)",     icon: MessageSquare },
    // — Inteligencia & Analytics —
    { id: "analytics-bi" as Tab,           label: "Analytics & BI",            icon: Brain },
    { id: "proyecciones" as Tab,           label: "Proyecciones",              icon: SlidersHorizontal },
    // — Finanzas —
    { id: "finanzas" as Tab,               label: "Finanzas & Contabilidad",   icon: Wallet },
    // — Organización —
    { id: "rrhh" as Tab,                   label: "Recursos Humanos",          icon: Users },
    { id: "proyectos-tareas" as Tab,       label: "Proyectos & Tareas",        icon: Target },
    { id: "comunicaciones" as Tab,         label: "Comunicaciones",            icon: MessageSquare },
    { id: "alertas-automatizacion" as Tab, label: "Alertas & Automatización",  icon: Bell },
    // — Administración & Sistema —
    { id: "reportes-documentos" as Tab,    label: "Reportes & Documentos",     icon: FileBarChart },
    { id: "agenda-utilidades" as Tab,      label: "Agenda & Utilidades",       icon: CalendarDays },
    { id: "seguridad" as Tab,              label: "Sistema & Accesos",         icon: Settings },
    { id: "plan" as Tab,                    label: "Plan & Límites",            icon: Zap },
    { id: "changelog" as Tab,               label: "Changelog",                 icon: Target },
  ] as const;`
);

// Replace rendering
const newRender = \`
        {tab === "panel-principal" && <PanelPrincipalModule />}
        {tab === "pos-caja" && <POSCajaModule />}
        {tab === "inventario-almacenes" && (
          <div className="space-y-8">
            <InventarioAlmacenesModule />
            <div className="pt-8 border-t border-gray-200 dark:border-card-border">
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-4">Reposición Inteligente</h3>
              <ReposicionModule />
            </div>
          </div>
        )}
        {tab === "catalogo-tienda" && <CatalogoTiendaModule />}
        {tab === "precios-promos" && <PreciosPromosModule />}
        {tab === "compras" && (
          <div className="space-y-8">
            <ComprasModule />
            <div className="pt-8 border-t border-gray-200 dark:border-card-border">
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-4">Directorio de Proveedores</h3>
              <ProveedoresModule />
            </div>
          </div>
        )}
        {tab === "logistica" && <LogisticaModule />}
        {tab === "devoluciones-calidad" && <DevolucionesCalidadModule />}
        {tab === "ventas-marketing" && <VentasMarketingModule />}
        {tab === "crm-clientes" && (
          <div className="space-y-8">
            <CRMClientesModule />
            <div className="pt-8 border-t border-gray-200 dark:border-card-border">
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-4">Base de Datos: Clientes</h3>
              <CustomersTab />
            </div>
            <div className="pt-8 border-t border-gray-200 dark:border-card-border">
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-4">Registro de Visitantes (Leads)</h3>
              <VisitantesTab />
            </div>
          </div>
        )}
        {tab === "fidelizacion" && <FidelizacionModule />}
        {tab === "encuestas-soporte" && (
          <div className="space-y-8">
            <EncuestasSoporteModule />
            <div className="pt-8 border-t border-gray-200 dark:border-card-border">
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-4">Reseñas y Feedback Externo</h3>
              <ReviewsTab />
            </div>
          </div>
        )}
        {tab === "analytics-bi" && <AnalyticsBIModule />}
        {tab === "proyecciones" && <ProyeccionesModule />}
        {tab === "finanzas" && (
          <div className="space-y-8">
            <FinanzasModule />
            <div className="pt-8 border-t border-gray-200 dark:border-card-border">
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-4">Tesorería y Liquidez</h3>
              <TesoreriaModule />
            </div>
            <div className="pt-8 border-t border-gray-200 dark:border-card-border">
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-4">Módulo de Facturación</h3>
              <FacturacionModule />
            </div>
            <div className="pt-8 border-t border-gray-200 dark:border-card-border">
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-4">Gastos y Activos Fijos</h3>
              <GastosActivosModule />
            </div>
          </div>
        )}
        {tab === "rrhh" && <RRHHModule />}
        {tab === "proyectos-tareas" && <ProyectosTareasModule />}
        {tab === "comunicaciones" && <ComunicacionesModule />}
        {tab === "alertas-automatizacion" && <AlertasAutomModule />}
        {tab === "reportes-documentos" && <ReportesDocModule />}
        {tab === "agenda-utilidades" && <AgendaUtilidadesModule />}
        {tab === "seguridad" && (
          <div className="space-y-8">
            <SeguridadModule />
            <div className="pt-8 border-t border-gray-200 dark:border-card-border">
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-4">Salud del Sistema y Webhooks</h3>
              <SistemaModule />
            </div>
            <div className="pt-8 border-t border-gray-200 dark:border-card-border">
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-4">Configuración General</h3>
              <SettingsTab storeMode={storeMode} onModeChange={setStoreModeState} />
            </div>
            <div className="pt-8 border-t border-gray-200 dark:border-card-border">
              <h3 className="text-lg font-bold text-gray-900 dark:text-foreground mb-4">Gestión de Equipo</h3>
              <TeamTab />
            </div>
          </div>
        )}
        {tab === "pedidos" && <OrdersTab />}
        {tab === "plan" && <PlanTab />}
        {tab === "changelog" && <ChangelogModule />}\`;

code = code.replace(
  /{tab === "panel-principal" && <PanelPrincipalModule \/>}[\s\S]*?{tab === "changelog" && <ChangelogModule \/>}/,
  newRender.trim()
);

fs.writeFileSync('app/admin/page.tsx', code, 'utf8');
console.log('UI Refactored successfully!');
