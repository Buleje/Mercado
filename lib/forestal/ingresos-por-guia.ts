/**
 * ingresos-por-guia.ts — la GUÍA como unidad de la bandeja (ADR-346).
 *
 * En el libro, una GTF con dos especies son **dos asientos**: el formato oficial
 * pide una línea por especie y producto (casilleros 6 y 7), y eso no se toca
 * (ADR-312). Pero el operador no recibió dos cosas: recibió **un papel**. La
 * bandeja mostraba la misma guía repetida, con el mismo número, el mismo
 * proveedor y la misma fecha, y había que recepcionarla dos veces.
 *
 * Acá se juntan las líneas de un mismo documento en una sola fila con el
 * resumen de sus especies. El libro sigue viendo asientos; la pantalla ve guías.
 *
 * PURO y client-safe: lo usan el listado del servidor y la tabla.
 */

/**
 * Una cantidad como llega de cada lado: `Decimal` desde Prisma, `string` desde
 * el JSON del endpoint, `number` en los tests. Se normaliza en un solo lugar.
 */
export type Cantidad = string | number | { toString(): string };

/** Lo mínimo de un asiento para poder resumirlo. Estructural a propósito. */
export interface LineaDeGuia {
  id: string;
  libroNro?: number | null;
  entryDate: string | Date;
  gtfNumber: string;
  gtfSeries?: string | null;
  gtfDate?: string | Date | null;
  docType?: string | null;
  providerName: string;
  originCode?: string | null;
  originSourceNumber?: string | null;
  originType?: string | null;
  speciesCommonName: string;
  speciesScientificName?: string | null;
  speciesCites?: boolean;
  productType: string;
  unit?: string | null;
  volumeM3: Cantidad;
  pieces?: number | null;
  status: string;
  trozasCount?: number;
  trozasM3?: number | null;
  trozasDecididas?: number;
  fechaRecepcion?: string | Date | null;
  validado?: boolean;
}

/** Una especie dentro de la guía. */
export interface EspecieDeGuia {
  comun: string;
  cientifica: string | null;
  cites: boolean;
  volumenM3: number;
  piezas: number;
  /** Los asientos que la declaran (casi siempre uno). */
  lineas: number;
}

export interface GuiaIngreso<L extends LineaDeGuia = LineaDeGuia> {
  /** Serie + número: dos guías pueden repetir número con distinta serie. */
  clave: string;
  gtfNumber: string;
  gtfSeries: string | null;
  gtfDate: string | Date | null;
  docType: string | null;
  /** La fecha del asiento más viejo — la guía entró una sola vez. */
  entryDate: string | Date;
  providerName: string;
  originCode: string | null;
  /** «N° de fuente de origen o procedencia» — la resolución de la ARFFS. */
  originSourceNumber: string | null;
  /** N° de libro del primero y del último asiento: el folio que cita la autoridad. */
  libroDesde: number | null;
  libroHasta: number | null;
  especies: EspecieDeGuia[];
  volumenM3: number;
  piezas: number;
  /** Piezas cargadas en el detalle y cuántas ya tienen decisión de recepción. */
  trozasCount: number;
  trozasDecididas: number;
  trozasM3: number | null;
  cites: boolean;
  /** Un estado para la guía entera; `mixto` cuando sus asientos no coinciden. */
  status: string;
  statusMixto: boolean;
  /** Cuántos asientos hay en cada estado — el detalle del `mixto`. */
  porEstado: Record<string, number>;
  /** Todas sus líneas, para las acciones en lote y el detalle desplegable. */
  lineas: L[];
}

const num = (v: Cantidad | null | undefined): number => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(typeof v === "string" ? v : v.toString());
  return Number.isFinite(n) ? n : 0;
};
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const txt = (v: string | null | undefined) => (v ?? "").trim();

/**
 * La clave del documento.
 *
 * Serie **y** número: dos ARFFS distintas pueden emitir el mismo correlativo con
 * series distintas, y juntarlas sería declarar que una madera vino de un papel
 * que no la ampara. Sin serie, la clave es el número solo.
 */
export function claveDeGuia(l: Pick<LineaDeGuia, "gtfNumber" | "gtfSeries">): string {
  return `${txt(l.gtfSeries)}|${txt(l.gtfNumber)}`;
}

/** Junta los asientos de UNA guía en su resumen. Las líneas se pasan tal cual. */
export function resumirGuia<L extends LineaDeGuia>(lineas: readonly L[]): GuiaIngreso<L> {
  if (lineas.length === 0) throw new Error("resumirGuia: una guía sin asientos no existe");

  /* El orden manda: el asiento más viejo define la fecha y el folio inicial. Un
     `sort` propio y no el del que llama — la guía tiene que leerse igual venga
     de donde venga. */
  const ms = (v: string | Date) => {
    const d = v instanceof Date ? v : new Date(v);
    const t = d.getTime();
    return Number.isNaN(t) ? 0 : t;
  };
  const orden = [...lineas].sort((a, b) => {
    const d = ms(a.entryDate) - ms(b.entryDate);
    if (d !== 0) return d;
    return (a.libroNro ?? 0) - (b.libroNro ?? 0);
  });
  const primera = orden[0];

  const porEspecie = new Map<string, EspecieDeGuia>();
  const porEstado: Record<string, number> = {};
  let volumen = 0;
  let piezas = 0;
  let trozasCount = 0;
  let trozasDecididas = 0;
  /* `null` = ninguna pieza trae volumen. "No sé" no es "cero": un 0 acá haría
     que la tabla cante un descuadre que nadie puede explicar. */
  let trozasM3: number | null = null;

  for (const l of orden) {
    const vol = num(l.volumeM3);
    volumen += vol;
    piezas += l.pieces ?? 0;
    trozasCount += l.trozasCount ?? 0;
    trozasDecididas += l.trozasDecididas ?? 0;
    if (l.trozasM3 != null) trozasM3 = (trozasM3 ?? 0) + num(l.trozasM3);

    porEstado[l.status] = (porEstado[l.status] ?? 0) + 1;

    const comun = txt(l.speciesCommonName) || "—";
    const previa = porEspecie.get(comun.toLowerCase());
    if (previa) {
      previa.volumenM3 = r4(previa.volumenM3 + vol);
      previa.piezas += l.pieces ?? 0;
      previa.lineas += 1;
      previa.cites = previa.cites || Boolean(l.speciesCites);
      previa.cientifica = previa.cientifica ?? (txt(l.speciesScientificName) || null);
    } else {
      porEspecie.set(comun.toLowerCase(), {
        comun,
        cientifica: txt(l.speciesScientificName) || null,
        cites: Boolean(l.speciesCites),
        volumenM3: r4(vol),
        piezas: l.pieces ?? 0,
        lineas: 1,
      });
    }
  }

  const estados = Object.keys(porEstado);
  const libros = orden.map((l) => l.libroNro).filter((n): n is number => typeof n === "number");

  return {
    clave: claveDeGuia(primera),
    gtfNumber: primera.gtfNumber,
    gtfSeries: primera.gtfSeries ?? null,
    gtfDate: orden.find((l) => l.gtfDate)?.gtfDate ?? null,
    docType: orden.find((l) => l.docType)?.docType ?? null,
    entryDate: primera.entryDate,
    providerName: primera.providerName,
    originCode: orden.find((l) => txt(l.originCode))?.originCode ?? null,
    originSourceNumber: orden.find((l) => txt(l.originSourceNumber))?.originSourceNumber ?? null,
    libroDesde: libros.length ? Math.min(...libros) : null,
    libroHasta: libros.length ? Math.max(...libros) : null,
    /* Por volumen: la especie que manda en el papel es la que más madera trae. */
    especies: [...porEspecie.values()].sort((a, b) => b.volumenM3 - a.volumenM3),
    volumenM3: r4(volumen),
    piezas,
    trozasCount,
    trozasDecididas,
    trozasM3: trozasM3 == null ? null : r4(trozasM3),
    cites: orden.some((l) => l.speciesCites),
    /* Un solo estado si todos coinciden. Si no, `mixto` — y NUNCA el del
       primero: una guía con una línea validada y otra rechazada no está
       validada, y mostrarla así esconde justo la que hay que mirar. */
    status: estados.length === 1 ? estados[0] : "mixto",
    statusMixto: estados.length > 1,
    porEstado,
    lineas: orden,
  };
}
