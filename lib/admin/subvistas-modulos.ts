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

/** Libro de Operaciones CTP (forestal) — 19 vistas. */
export const CTP_VISTAS: readonly SubvistaModulo[] = [
  { key: "ingresos", label: "Ingresos", hint: "Bandeja: las guías que llegaron y falta recepcionar" },
  { key: "gtf-ingresadas", label: "GTF ingresadas", hint: "Las guías ya recepcionadas, con sus piezas disponibles para la sierra" },
  { key: "lotes", label: "Lotes de aserrío", hint: "Armar lo que va junto a la sierra: trozas de una especie apartadas en un lote" },
  { key: "consumos", label: "Consumos", hint: "Qué madera entró a la sierra" },
  { key: "produccion", label: "Producción", hint: "Transformación" },
  { key: "disponibles", label: "Productos disponibles", hint: "La madera aserrada que sigue en la planta, paquete por paquete" },
  { key: "despacho", label: "Despacho", hint: "Salida de producto" },
  { key: "trozas", label: "Trozas", hint: "Buscar una pieza por su codificación" },
  { key: "radar", label: "Radar", hint: "Cadena de custodia visual" },
  { key: "planta", label: "Planta", hint: "Mapa del aserradero" },
  { key: "eudr", label: "EUDR", hint: "Geolocalización + dossier UE" },
  { key: "guias", label: "Guías emitidas", hint: "Las GTF de salida del CTP y cuáles quedaron a medio llenar" },
  { key: "tablero", label: "Tablero", hint: "Todo el movimiento del libro en gráficos: entradas, sierra, producción y despachos" },
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
 * ⚠️ La clave es el **id del tab**, no el `MODULE_ID` del componente. No siempre
 * coinciden: los ocho hubs (`documentos-hub`, `equipo-hub`…) NO son tabs — sólo
 * se llega a ellos por tabs alias (`?tab=tareas`, `?tab=contratos`), que el
 * buscador ya indexa como módulos de primer nivel. Declararlos acá con su
 * MODULE_ID no rompía nada, simplemente no se leía nunca. Lo cuida
 * `admin-subvistas-sincronizadas`.
 *
 * Los módulos ANIDADOS (Contratos y Cotizaciones dentro de Documentos, la
 * página de tienda dentro de Mi Tienda) van en `ANIDADAS_POR_MODULO`: comparten
 * `?vista=` con su padre y necesitan las dos coordenadas.
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
  recetas: [
    { key: "dashboard", label: "Resumen", hint: "Cómo viene la producción" },
    { key: "recetas", label: "Recetas", hint: "Insumos de cada producto elaborado" },
    { key: "produccion", label: "Producción", hint: "Producir según receta y descontar insumos" },
    { key: "recetario", label: "Recetario", hint: "El recetario impreso" },
  ],
};

/**
 * Destinos de SEGUNDO nivel: viven dentro de un módulo que ya está dentro de un
 * hub, así que llegar a ellos necesita `?vista=` (la del hub) y `?sub=` (la del
 * módulo anidado) a la vez.
 *
 * Sin esto, buscar «plantillas de contrato» o «papelera» dejaba en la puerta del
 * hub y había que hacer dos clicks más adivinando dónde.
 */
export interface SubvistaAnidada extends SubvistaModulo {
  /** La vista del hub que hay que abrir para que el módulo exista en pantalla. */
  vista: string;
}

export const ANIDADAS_POR_MODULO: Readonly<Record<string, readonly SubvistaAnidada[]>> = {
  // Clave = id del TAB (`?tab=documentos` abre el hub de Documentos).
  documentos: [
    { vista: "contratos", key: "plantillas", label: "Plantillas de contrato", hint: "Modelos para generar contratos" },
    { vista: "contratos", key: "contratos", label: "Mis Contratos", hint: "Contratos emitidos y su estado de firma" },
    { vista: "contratos", key: "crear", label: "Crear Contrato", hint: "Redactar un contrato nuevo" },
    { vista: "cotizaciones", key: "lista", label: "Lista de cotizaciones", hint: "Presupuestos enviados" },
    { vista: "cotizaciones", key: "nueva", label: "Nueva cotización", hint: "Armar un presupuesto" },
    // Modos del drive. No están todos: se declaran los que alguien buscaría por
    // nombre, no los catorce estados internos del componente.
    { vista: "drive", key: "favorites", label: "Documentos favoritos", hint: "Los archivos marcados" },
    { vista: "drive", key: "expiring", label: "Documentos por vencer", hint: "Lo que caduca pronto" },
    { vista: "drive", key: "trash", label: "Papelera de documentos", hint: "Archivos borrados, para restaurar" },
    { vista: "drive", key: "enlaces", label: "Enlaces compartidos", hint: "Links públicos activos y cómo cortarlos" },
    { vista: "drive", key: "duplicados", label: "Documentos duplicados", hint: "Archivos repetidos que ocupan lugar" },
    { vista: "drive", key: "sync", label: "Sincronización de carpeta", hint: "La carpeta de Windows espejada en el drive" },
    { vista: "drive", key: "activity", label: "Actividad del drive", hint: "Quién subió, movió o borró qué" },
  ],
  "pagina-inicio": [
    { vista: "pagina", key: "sections", label: "Secciones de la tienda", hint: "El orden de los bloques de la página" },
    { vista: "pagina", key: "branding", label: "Branding de la tienda", hint: "Logo, colores y tipografía" },
    { vista: "pagina", key: "banners", label: "Banners", hint: "Las imágenes grandes del inicio" },
    { vista: "pagina", key: "promotions", label: "Promociones de la página", hint: "Qué ofertas se destacan" },
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
