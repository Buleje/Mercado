/**
 * loctp-consumos.ts — la Sección 2 del Libro de Operaciones del CTP.
 *
 * El consumo no tiene tabla propia en la base: **es** el puente entre un ingreso
 * y la corrida que lo transformó (`ForestCtpConsumo`, invariante I2). Por eso la
 * fila del libro se arma recorriendo el grafo de cadena de custodia, y no
 * leyendo un listado.
 *
 * Vive acá —y no dentro del export— porque ahora hay DOS consumidores: la hoja
 * "2. Consumos" del Excel oficial y la vista de Consumos del módulo. Si cada uno
 * armara la fila a su manera, la pantalla y el libro que se presenta podrían
 * declarar consumos distintos del mismo período.
 *
 * PURO y client-safe.
 */

/** El grafo de cadena de custodia, con lo mínimo que la sección necesita. */
export interface GrafoConsumos {
  /** El ingreso, con los casilleros que la sección pinta por fila (ADR-347). */
  ingresos: (IngresoConsumo & { id: string; gtf: string; species: string | null })[];
  corridas: { id: string; lineNo: number; label: string; unit: string | null; fecha?: string; observations?: string | null }[];
  consumos: { from: string; to: string; volumeM3: number }[];
}

/** El ingreso completo: el grafo es un mapa de conexiones, no la fila del libro. */
export interface IngresoConsumo {
  id?: string;
  productType?: string | null;
  speciesCommonName?: string | null;
  speciesScientificName?: string | null;
  originCode?: string | null;
  ctpProductCode?: string | null;
  originSourceNumber?: string | null;
  unit?: string | null;
}

/** Una fila de la Sección 2 — los 11 casilleros del formato. */
export interface FilaConsumo {
  /** (1) N° de registro dentro de la sección. */
  nro: number;
  /** (2) Fecha del consumo = la de la corrida que lo consumió. */
  fecha: string | null;
  /** (3) Tipo de producto consumido. */
  tipoProducto: string;
  /** (4) Nombre común. */
  especieComun: string;
  /** (5) Nombre científico. */
  especieCientifica: string;
  /** (6) Código de origen/procedencia/CTP/retrozado. */
  codigoOrigen: string;
  /** (7) N° de fuente de origen/procedencia. */
  fuenteOrigen: string;
  /** (8) Unidad de medida. */
  unidad: string;
  /** (9) Cantidad consumida. */
  cantidad: number;
  /** (10) N° de lote consumido: el lote de ASERRÍO que entró a la corrida. */
  lote: string;
  /** (11) Observaciones — acá, en qué corrida entró. */
  observaciones: string;
  /** La guía que ampara la madera consumida. No es casillero: es el enlace. */
  gtf: string;
  /** Ids para poder saltar al ingreso o a la corrida desde la pantalla. */
  woodEntryId: string;
  corridaId: string;
}

const txt = (v: unknown): string => (v == null ? "" : String(v).trim());

/**
 * Arma la Sección 2 del período.
 *
 * **El casillero (10) sale del lote de ASERRÍO** (ADR-334). Pide el lote del
 * producto *consumido*, y eso es exactamente lo que ahora tiene: las trozas se
 * agrupan en un lote antes de la sierra y la corrida se declara sobre ese lote.
 * Sigue yendo vacío cuando la corrida se cargó a mano —los libros viejos no
 * tienen lotes— porque el libro admite huecos; lo que no admite es un dato
 * inventado. **Nunca el lote COMERCIAL de la corrida**: ése se crea DESPUÉS del
 * consumo y declararlo acá sería datar el origen al revés.
 *
 * Lo mismo con (7): si el ingreso no declara su N° de fuente, va vacío. La GTF
 * ya tiene su propio casillero y repetirla acá sería llenar un casillero con un
 * dato que no es el que pide.
 */
export function filasConsumo(
  grafo: GrafoConsumos | null | undefined,
  /**
   * Los ingresos completos. **Por defecto, los del propio grafo** (ADR-347): ya
   * viajan con sus casilleros y con el filtro de estado aplicado en la DB, así
   * que pedirlos aparte era traer miles de filas para leerles seis campos.
   */
  ingresos: readonly IngresoConsumo[] = grafo?.ingresos ?? [],
  /** corrida → código del lote de aserrío (ver `loteAserrioPorCorrida`). */
  lotesPorCorrida?: ReadonlyMap<string, string>,
): FilaConsumo[] {
  if (!grafo) return [];
  const gtfPorIngreso = new Map(grafo.ingresos.map((i) => [i.id, i]));
  const corridaPorId = new Map(grafo.corridas.map((c) => [c.id, c]));
  const completoPorId = new Map(ingresos.filter((e) => e.id).map((e) => [e.id as string, e]));

  return grafo.consumos
    .map((c) => {
      const g = gtfPorIngreso.get(c.from);
      const completo = completoPorId.get(c.from);
      const cor = corridaPorId.get(c.to);
      return {
        nro: 0,
        fecha: cor?.fecha ?? null,
        tipoProducto: txt(completo?.productType) || "—",
        especieComun: txt(completo?.speciesCommonName) || txt(g?.species) || "—",
        especieCientifica: txt(completo?.speciesScientificName) || "—",
        codigoOrigen: txt(completo?.originCode) || txt(completo?.ctpProductCode) || "—",
        fuenteOrigen: txt(completo?.originSourceNumber),
        unidad: txt(completo?.unit) || "m3",
        cantidad: c.volumeM3,
        lote: lotesPorCorrida?.get(c.to) ?? "",
        /* (11) La corrida, y lo que el operador anotó al cargarla. La nota
           gana sobre el `label` —«rolliza · Tornillo»— que ya está en los
           casilleros (3) y (4): repetirlo gastaba la única columna libre. */
        observaciones: cor
          ? `Corrida #${cor.lineNo}${txt(cor.observations) ? ` · ${txt(cor.observations)}` : cor.label ? ` · ${cor.label}` : ""}`
          : "—",
        gtf: txt(g?.gtf) || "—",
        woodEntryId: c.from,
        corridaId: c.to,
      };
    })
    // Por fecha y, dentro del día, por guía: el libro se lee en el orden en que
    // pasaron las cosas.
    .sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? "") || a.gtf.localeCompare(b.gtf, "es"))
    .map((f, i) => ({ ...f, nro: i + 1 }));
}
