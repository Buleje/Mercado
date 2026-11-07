/**
 * T3 · La madera no se asierra antes de entrar al patio (ADR-433).
 *
 * Una troza no puede consumirse en una corrida con fecha ANTERIOR a su
 * ingreso. Si pasa, el libro afirma que se aserró madera que todavía no había
 * llegado: es lo primero que ve un fiscalizador que cruza la Sección 1 con la
 * Sección 2.
 *
 * Medido el 25-09: la vinculación nueva escribía 20 corridas de 10-HUA (del
 * 07/09 al 22/09) con trozas de guías recibidas el 23/09 — «Recibir en bloque»
 * propone HOY como fecha de recepción de todas las guías. En `main` ya hay 2
 * piezas así (corrida 95002 del 23/07, guía recibida el 19/09).
 *
 * El ingreso de la troza es, en este orden: su propia recepción (una guía de
 * sesenta trozas se descarga en dos viajes, ADR-336), la recepción de su guía,
 * o el asiento de la guía si nunca se recepcionó.
 *
 * PURO y client-safe: lo usan los escritores de consumo por pieza
 * (`ForestLoteAserrioDB.consumir` / `sumarACorrida`,
 * `WoodEntriesDB.marcarTrozasConsumidas`) y lo puede usar la pantalla para
 * decir lo mismo antes de firmar.
 */

/** Una fecha como la guarda el libro: `Date`, ISO, `AAAA-MM-DD` o nada. */
export type FechaDelLibro = Date | string | null | undefined;

/**
 * El día `AAAA-MM-DD` de una fecha del libro, en UTC.
 *
 * Las fechas del libro son date-only guardadas a medianoche UTC y se leen en
 * UTC (sin eso se corren un día en Lima). Algunas traen hora —en `main`, 101 de
 * 161 corridas se crearon con `new Date()`— y también van en UTC: es el día que
 * el libro MUESTRA (`timeZone: "UTC"`) y el que corta la pantalla
 * (`fechaIngresoDeTroza`, `.slice(0, 10)`). Leerlas en Lima haría que el
 * servidor nombre un día distinto del que el operador ve en la fila.
 */
export function diaDelLibro(v: FechaDelLibro): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** De dónde salió la fecha de ingreso: manda la de la troza, después la guía, después el asiento. */
export type FuenteDeIngreso = "troza" | "guia" | "asiento";

export interface TrozaConFechas {
  id: string;
  /** Código de planta o del bosque, el que tenga. */
  codigo: string | null;
  gtf: string | null;
  fechaRecepcionTroza: FechaDelLibro;
  fechaRecepcionGuia: FechaDelLibro;
  fechaAsientoGuia: FechaDelLibro;
}

/** Cuándo entró la troza al patio, y según qué dato. `null` = no hay ninguna fecha. */
export function ingresoDeLaTroza(t: TrozaConFechas): { dia: string; fuente: FuenteDeIngreso } | null {
  const troza = diaDelLibro(t.fechaRecepcionTroza);
  if (troza) return { dia: troza, fuente: "troza" };
  const guia = diaDelLibro(t.fechaRecepcionGuia);
  if (guia) return { dia: guia, fuente: "guia" };
  const asiento = diaDelLibro(t.fechaAsientoGuia);
  return asiento ? { dia: asiento, fuente: "asiento" } : null;
}

export interface TrozaQueEntroDespues {
  id: string;
  codigo: string | null;
  gtf: string | null;
  /** `AAAA-MM-DD`. */
  ingreso: string;
  fuente: FuenteDeIngreso;
}

/**
 * Las trozas que entraron al patio DESPUÉS del día de la corrida.
 *
 * El mismo día pasa: se descarga a la mañana y se asierra a la tarde. Sin fecha
 * de corrida, o sin ninguna fecha de la troza, no hay nada que comparar y no se
 * inventa un rechazo.
 */
export function trozasQueEntraronDespues(
  trozas: readonly TrozaConFechas[],
  fechaCorrida: FechaDelLibro,
): TrozaQueEntroDespues[] {
  const corrida = diaDelLibro(fechaCorrida);
  if (!corrida) return [];
  const fuera: TrozaQueEntroDespues[] = [];
  for (const t of trozas) {
    const ingreso = ingresoDeLaTroza(t);
    if (ingreso && ingreso.dia > corrida) {
      fuera.push({ id: t.id, codigo: t.codigo, gtf: t.gtf, ingreso: ingreso.dia, fuente: ingreso.fuente });
    }
  }
  return fuera.sort((a, b) => a.ingreso.localeCompare(b.ingreso) || (a.gtf ?? "").localeCompare(b.gtf ?? ""));
}

/** `AAAA-MM-DD` → `dd/mm/aaaa`. */
const legible = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;

const QUE_FECHA: Record<FuenteDeIngreso, string> = {
  troza: "su recepción",
  guia: "la recepción de su guía",
  /* Puede estar validada y sin fecha de recepción (019-0000003 en `main`): no se afirma que no llegó. */
  asiento: "el asiento de su guía, que no tiene fecha de recepción",
};

/** Hasta cuántas trozas se nombran una por una; el resto va como «y N más». */
const NOMBRADAS = 5;

/**
 * El mensaje del rechazo: qué troza, de qué guía, con qué fechas y el camino.
 * No es un «no se puede» pelado: dice qué dato corregir y dónde.
 */
export function mensajeEntroDespues(
  fuera: readonly TrozaQueEntroDespues[],
  corrida: { lineNo: number | null; fecha: FechaDelLibro },
): string {
  const dia = diaDelLibro(corrida.fecha) ?? "";
  const cual = corrida.lineNo != null ? `la corrida N° ${corrida.lineNo}` : "la corrida";
  const cuando = dia ? ` del ${legible(dia)}` : "";
  const trozas = fuera
    .slice(0, NOMBRADAS)
    .map(
      (t) =>
        `${t.codigo ?? t.id} (guía ${t.gtf ?? "sin número"}: ${legible(t.ingreso)}, por ${QUE_FECHA[t.fuente]})`,
    )
    .join("; ");
  const resto = fuera.length > NOMBRADAS ? ` y ${fuera.length - NOMBRADAS} más` : "";
  const guias = [...new Set(fuera.map((t) => t.gtf).filter((g): g is string => Boolean(g)))];
  const ultima = fuera.reduce((max, t) => (t.ingreso > max ? t.ingreso : max), "");
  const encabezado =
    fuera.length === 1
      ? `La troza ${trozas} entró al patio después de ${cual}${cuando}: no pudo estar en esa sierra.`
      : `${fuera.length} trozas entraron al patio después de ${cual}${cuando}: ${trozas}${resto}. No pudieron estar en esa sierra.`;
  const donde =
    guias.length > 0
      ? `Corrige la fecha de recepción de ${guias.length === 1 ? "la guía" : "las guías"} ${guias.join(", ")} en Ingresos`
      : "Corrige la fecha de recepción en Ingresos";
  return `${encabezado} ${donde}, o usa una corrida del ${legible(ultima)} en adelante.`;
}
