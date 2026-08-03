/**
 * subvistas-modulos — las sub-vistas buscables de los módulos del panel.
 *
 * Existe para que el buscador global (`GlobalSearch`) pueda ofrecer los
 * destinos que viven DENTRO de un módulo —Saldos, Cumplimiento, Rentabilidad…—
 * sin importar el módulo entero, que es lazy y arrastraría medio panel al
 * chunk del buscador.
 *
 * Sólo datos: `key`, `label` y `hint`. Los iconos y el agrupado por fase viven
 * en la cabina de cada libro, que compone sobre esto.
 *
 * Aplica a los módulos cuya vista es direccionable por `?vista=` (los que usan
 * `useVistaModulo`): el resto no tendría a dónde navegar.
 */

export interface SubvistaModulo {
  key: string;
  label: string;
  /** Qué se hace ahí, en una línea. Alimenta las keywords del buscador. */
  hint: string;
}

/** Libro de Operaciones CTP (forestal) — 18 vistas. */
export const CTP_VISTAS: readonly SubvistaModulo[] = [
  { key: "ingresos", label: "Ingresos", hint: "Materia prima recibida" },
  { key: "consumos", label: "Consumos", hint: "Qué madera entró a la sierra" },
  { key: "produccion", label: "Producción", hint: "Transformación" },
  { key: "despacho", label: "Despacho", hint: "Salida de producto" },
  { key: "trozas", label: "Trozas", hint: "Buscar una pieza por su codificación" },
  { key: "radar", label: "Radar", hint: "Cadena de custodia visual" },
  { key: "planta", label: "Planta", hint: "Mapa del aserradero" },
  { key: "eudr", label: "EUDR", hint: "Geolocalización + dossier UE" },
  { key: "guias", label: "Guías emitidas", hint: "Las GTF de salida del CTP y cuáles quedaron a medio llenar" },
  { key: "saldos", label: "Saldos", hint: "Balance de planta" },
  { key: "resumenes", label: "Cuadros SERFOR", hint: "Los 3 cuadros resumen del formato oficial" },
  { key: "cumplimiento", label: "Cumplimiento", hint: "Alertas del período" },
  { key: "cierre", label: "Cierre", hint: "Cerrar mes · bloquear el acta" },
  { key: "rentabilidad", label: "Rentabilidad", hint: "Margen: venta − COGS" },
  { key: "analisis", label: "Análisis", hint: "Reorden + tendencias" },
  { key: "fletes", label: "Fletes", hint: "Lo que cuesta traer la madera y a quién se le debe" },
  { key: "directorio", label: "Directorio", hint: "Proveedores, compradores, transportistas y placas" },
  { key: "ficha", label: "Ficha CTP", hint: "Identidad legal SERFOR" },
];

/**
 * El resto de los módulos con sub-vistas direccionables.
 *
 * Los ids TIENEN que coincidir con el `TABS` de cada módulo; lo garantiza
 * `__tests__/admin-subvistas-sincronizadas.test.ts`, que lee los componentes y
 * compara. Sin ese test esta tabla se desincroniza en silencio y el buscador
 * empieza a ofrecer destinos que ya no existen.
 *
 * Los módulos ANIDADOS (Contratos y Cotizaciones dentro de Documentos, la
 * página de tienda dentro de Mi Tienda) NO están acá: comparten `?vista=` con
 * su padre y se pisarían.
 */
export const VISTAS_POR_MODULO: Readonly<Record<string, readonly SubvistaModulo[]>> = {
  "ventas-caja": [
    { key: "pos", label: "Vender", hint: "Punto de venta: buscar producto y cobrar" },
    { key: "turnos", label: "Turnos", hint: "Abrir y cerrar turnos del equipo" },
    { key: "caja-registradora", label: "Caja Registradora", hint: "Movimientos de efectivo, retiros e ingresos" },
    { key: "cuentas-cobrar", label: "Me deben", hint: "Lo que quedó a cuenta en el mostrador" },
    { key: "arqueo", label: "Cuadrar Caja", hint: "Contar la caja y cuadrar el turno" },
    { key: "comisiones", label: "Comisiones", hint: "Lo que ganó cada vendedor" },
  ],
  plata: [
    { key: "resumen", label: "Resumen", hint: "Cómo viene la plata del mes" },
    { key: "pl", label: "Ganancias y pérdidas", hint: "Estado de resultados" },
    { key: "rentabilidad", label: "Rentabilidad", hint: "Margen por producto y categoría" },
    { key: "comparador", label: "Comparar períodos", hint: "Este mes contra el anterior" },
    { key: "gastos", label: "Gastos y costos", hint: "En qué se va la plata" },
    { key: "presupuesto", label: "Presupuesto", hint: "Cuánto planeaste gastar y cuánto va" },
    { key: "flujo-caja", label: "Proyección", hint: "Flujo de caja de las próximas semanas" },
    { key: "tesoreria", label: "Tesorería", hint: "Cuentas bancarias y saldos" },
    { key: "por-cobrar", label: "Todo lo que me deben", hint: "Cobranzas pendientes" },
    { key: "fiados", label: "Fiados", hint: "Lo que se llevaron anotado" },
    { key: "prestamos", label: "Préstamos", hint: "Plata prestada y cuotas" },
    { key: "adelantos", label: "Adelantos", hint: "Adelantos al personal" },
    { key: "scoring", label: "Scoring", hint: "A quién conviene fiarle" },
    { key: "reportes", label: "Reportes", hint: "Reportes financieros para el contador" },
    { key: "activos", label: "Activos", hint: "Bienes y depreciación" },
  ],
  compras: [
    { key: "punto-compra", label: "Punto de Compra", hint: "Cargar una compra al proveedor" },
    { key: "historial-gastos", label: "Historial de Gastos", hint: "Todo lo comprado" },
    { key: "sugerencias", label: "Sugerencias", hint: "Qué reponer según la venta" },
    { key: "ordenes-compra", label: "Ordenes", hint: "Órdenes de compra emitidas" },
    { key: "proveedores", label: "Proveedores", hint: "A quién le comprás" },
    { key: "recepcion", label: "Recepcion", hint: "Recibir la mercadería que llegó" },
    { key: "comparador", label: "Comparador", hint: "Qué proveedor conviene por producto" },
    { key: "devoluciones", label: "Devoluciones", hint: "Devolver al proveedor" },
  ],
  inventario: [
    { key: "stock", label: "Stock", hint: "Qué hay y cuánto queda" },
    { key: "kardex", label: "Entradas y Salidas", hint: "Movimiento de cada producto" },
    { key: "lotes", label: "Vencimientos", hint: "Lotes y vencimientos" },
    { key: "mermas", label: "Pérdidas", hint: "Lo que se perdió, rompió o venció" },
  ],
  clientes: [
    { key: "crm", label: "Mis clientes", hint: "Ficha de cada cliente" },
    { key: "leads", label: "Leads", hint: "Interesados que todavía no compran" },
    { key: "resenas", label: "Opiniones", hint: "Qué dicen los clientes" },
    { key: "segmentos", label: "Segmentos", hint: "Agrupar clientes por comportamiento" },
    { key: "mapa", label: "Mapa", hint: "Dónde viven los clientes" },
    { key: "mensajes", label: "Mensajes masivos", hint: "Conversaciones con clientes" },
  ],
  "mensajes-hub": [
    { key: "whatsapp", label: "WhatsApp", hint: "Bandeja de entrada de WhatsApp" },
    { key: "chat", label: "Chat con clientes", hint: "Chat de la tienda" },
    { key: "soporte", label: "Soporte", hint: "Tickets y reclamos" },
    { key: "avisos", label: "Avisos por pedido", hint: "Notificaciones a clientes" },
    { key: "plantillas", label: "Plantillas WhatsApp", hint: "Mensajes prearmados" },
    { key: "bot", label: "Bot WhatsApp", hint: "Configurar las respuestas automáticas" },
  ],
  "crecimiento-hub": [
    { key: "campanas", label: "Campañas", hint: "Promos y envíos masivos" },
    { key: "segmentos", label: "Segmentos", hint: "A quién apuntar cada campaña" },
    { key: "puntos", label: "Puntos & Fidelización", hint: "Programa de fidelidad" },
    { key: "rfm", label: "Análisis RFM", hint: "Clientes por frecuencia y valor" },
    { key: "gift-cards", label: "Gift Cards", hint: "Tarjetas de regalo" },
    { key: "socio", label: "Socio Buleje", hint: "Membresía y beneficios" },
    { key: "subscriptions", label: "Bodega al Mes", hint: "Compras que se repiten solas" },
    { key: "lives", label: "En Vivo", hint: "Ventas en vivo" },
  ],
  "documentos-hub": [
    { key: "facturacion", label: "Facturación SUNAT", hint: "Comprobantes electrónicos" },
    { key: "cotizaciones", label: "Cotizaciones", hint: "Presupuestos a clientes" },
    { key: "guias", label: "Guías de Remisión", hint: "Traslado de mercadería" },
    { key: "notas", label: "Notas de Crédito", hint: "Anular o corregir un comprobante" },
    { key: "contratos", label: "Contratos", hint: "Contratos y firmas" },
    { key: "drive", label: "Documentación", hint: "El drive: archivos, carpetas y búsqueda" },
  ],
  "analisis-hub": [
    { key: "analytics", label: "Analytics Pro", hint: "Métricas del negocio" },
    { key: "forecast", label: "Predicción Demanda", hint: "Cuánto se va a vender" },
    { key: "inteligencia", label: "Inteligencia", hint: "Hallazgos automáticos" },
  ],
  "asistente-ia-hub": [
    { key: "chat", label: "Chat IA", hint: "Preguntarle al asistente" },
    { key: "comandos", label: "Comandos IA", hint: "Acciones que la IA puede ejecutar" },
    { key: "sugerencias", label: "Sugerencias IA", hint: "Qué recomienda mejorar" },
  ],
  "sistema-hub": [
    { key: "rendimiento", label: "Rendimiento", hint: "Qué tan rápido va el sitio" },
    { key: "auditoria", label: "Auditoría", hint: "Quién hizo qué y cuándo" },
    { key: "colas", label: "Colas", hint: "Trabajos en segundo plano" },
  ],
  "equipo-hub": [
    { key: "tareas", label: "Tareas", hint: "Pendientes del equipo" },
    { key: "notas", label: "Notas", hint: "Notas rápidas internas" },
  ],
  "mi-tienda-hub": [
    { key: "identidad", label: "Identidad y tema", hint: "Logo, colores y tipografía" },
    { key: "pagina", label: "Mi tienda pública", hint: "Cómo se ve la tienda al cliente" },
  ],
  recetas: [
    { key: "dashboard", label: "Resumen", hint: "Cómo viene la producción" },
    { key: "recetas", label: "Recetas", hint: "Insumos de cada producto elaborado" },
    { key: "produccion", label: "Producción", hint: "Producir según receta y descontar insumos" },
    { key: "recetario", label: "Recetario", hint: "El recetario impreso" },
  ],
};

/** Libro de Operaciones de Títulos Habilitantes (forestal) — 9 vistas. */
export const LOTH_VISTAS: readonly SubvistaModulo[] = [
  { key: "secciones", label: "Secciones", hint: "Las 6 secciones SERFOR" },
  { key: "gtf", label: "GTF", hint: "Guías de transporte forestal" },
  { key: "plan", label: "Plan de Manejo", hint: "Censo + especies autorizadas" },
  { key: "mapa", label: "Mapa", hint: "Dónde se taló cada árbol (GPS de campo)" },
  { key: "trazabilidad", label: "Por árbol", hint: "Operación completa de un árbol" },
  { key: "cumplimiento", label: "Cumplimiento", hint: "Veredicto de fiscalización + reporte imprimible" },
  { key: "cierre", label: "Cierre", hint: "Cerrar el mes → acta inmutable (OSINFOR)" },
  { key: "rentabilidad", label: "Rentabilidad", hint: "Margen por especie (ingreso − costos)" },
  { key: "analitica", label: "Analítica", hint: "Aprovechamiento + anomalías" },
];
