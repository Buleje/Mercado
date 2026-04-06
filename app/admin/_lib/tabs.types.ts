// ── 8 módulos consolidados + pedidos + plan ──
export type Tab =
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
  | "store-customizer"
  | "mi-perfil"
  // Módulo rendimiento técnico
  | "rendimiento"
  // BullMQ Bull Board — monitoreo de colas
  | "colas";
