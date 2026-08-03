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
