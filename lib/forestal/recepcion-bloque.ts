/**
 * recepcion-bloque.ts — recibir VARIAS guías en un acto, sin que sea un tilde
 * a ciegas.
 *
 * El caso que lo pide es real: el 2026-09-15, en el tenant forestal, **10 de 11
 * guías** (21 asientos, 181,11 m³, 153 de 160 trozas) llevaban 7 días sin
 * recepcionar. Recibirlas de a una son 10 fichas abiertas y 10 confirmaciones.
 *
 * Pero «recepcionar» no es un trámite: es declarar que alguien miró la madera y
 * que ese día bajó del camión. En la recepción de a una esa garantía la da la
 * FICHA (ADR-350) —se revisa y se recibe en la misma pantalla—; en un bloque no
 * se pueden abrir diez fichas, así que la garantía la dan estas tres reglas:
 *
 * 1. **Una fecha POR GUÍA, explícita y nunca futura** (ADR-434). El bloque
 *    empezó con una sola fecha para todas, con hoy propuesto: en Blas dejó 7
 *    guías recibidas el 23/09 cuando la sierra las usaba desde el 07/09, y T3
 *    trabó 18 corridas. Ahora cada guía propone la suya (la de su papel) y la
 *    revisa `revisarLlegada` (`fecha-de-llegada.ts`).
 * 2. **Tilde por guía, y el bloque arranca en cero.** Sin «marcar todas»: el
 *    tilde es la declaración, y una casilla que viene puesta no declara nada.
 * 3. **Observación obligatoria cuando la guía no cuadra.** Si el papel declara
 *    un volumen y sus piezas suman otro, recibirla en silencio es firmar la
 *    contradicción. El que la recibe igual tiene que decir por qué.
 *
 * PURO y client-safe: lo usa el modal y se prueba sin navegador.
 */

import { limaDateKey } from "@/lib/utils";
import { cuadreDeIngreso, descuadra } from "./cuadre-trozas";

/** Lo mínimo de una guía para poder ofrecerla en el bloque. */
export interface GuiaDelBloque {
  clave: string;
  gtfNumber: string;
  volumenM3: number;
  trozasM3: number | null;
  trozasCount: number;
  trozasDecididas: number;
  /** Los asientos: entre ellos se reparte el costo y a todos los fecha. */
  lineas: readonly { id: string; volumeM3?: number | string | null }[];
}

/** Lo que el operador marcó en la fila de una guía. */
export interface MarcaDeGuia {
  marcada: boolean;
  observacion: string;
  /** Total pagado por la guía, como se tipea (S/). Vacío = no se carga costo. */
  costoTotal: string;
  /** `AAAA-MM-DD` en que llegó ESTA guía (ADR-434). Se llena con la propuesta al marcarla. */
  fecha: string;
}

export const MARCA_VACIA: MarcaDeGuia = { marcada: false, observacion: "", costoTotal: "", fecha: "" };

export type Marcas = Readonly<Record<string, MarcaDeGuia>>;

export const marcaDe = (marcas: Marcas, clave: string): MarcaDeGuia => marcas[clave] ?? MARCA_VACIA;

/** La guía se contradice a sí misma: declara un volumen y sus piezas suman otro. */
export function noCuadra(g: GuiaDelBloque): boolean {
  return descuadra(cuadreDeIngreso(g.volumenM3, g.trozasM3, g.trozasCount));
}

/** El aviso del descuadre tal como lo escribe el resto del libro, o `null`. */
export function avisoDeCuadre(g: GuiaDelBloque): string | null {
  const c = cuadreDeIngreso(g.volumenM3, g.trozasM3, g.trozasCount);
  return descuadra(c) ? c.aviso : null;
}

/**
 * Lo mínimo que se le pide a una fecha de llegada, sin saber nada de la guía.
 * `null` = sirve. La revisión completa (antes de la guía, corridas, plazo) es
 * `revisarLlegada`, y el modal la pasa a `problemasDelBloque`.
 *
 * El «hoy» es el de Lima y no `toISOString()`: a las 19:00 de Pucallpa el ISO
 * ya es el día siguiente, y la recepción quedaría fechada mañana.
 */
export function problemaDeFecha(fecha: string, hoy: string = limaDateKey()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return "Falta la fecha en que bajó la madera.";
  if (fecha > hoy) return "La recepción no puede ser de un día que todavía no llegó.";
  return null;
}

/** Cuántas guías están marcadas. */
export const marcadas = (guias: readonly GuiaDelBloque[], marcas: Marcas): GuiaDelBloque[] =>
  guias.filter((g) => marcaDe(marcas, g.clave).marcada);

export interface ProblemaDeGuia {
  clave: string;
  gtfNumber: string;
  motivo: string;
}

/**
 * Lo que impide mandar el bloque, guía por guía. Lista vacía = se puede.
 *
 * No incluye el descuadre en sí: una guía que no cuadra SE PUEDE recibir (la
 * madera ya bajó), pero no en silencio.
 */
export function problemasDelBloque(
  guias: readonly GuiaDelBloque[],
  marcas: Marcas,
  /** Qué frena la fecha de ESA guía (ADR-434). Por defecto, sólo formato y futuro. */
  bloqueoDeFecha: (g: GuiaDelBloque, fecha: string) => string | null = (_g, fecha) => problemaDeFecha(fecha),
): ProblemaDeGuia[] {
  const problemas: ProblemaDeGuia[] = [];
  for (const g of marcadas(guias, marcas)) {
    const m = marcaDe(marcas, g.clave);
    const deFecha = bloqueoDeFecha(g, m.fecha);
    if (deFecha) problemas.push({ clave: g.clave, gtfNumber: g.gtfNumber, motivo: deFecha });
    if (noCuadra(g) && m.observacion.trim().length < 3) {
      problemas.push({
        clave: g.clave,
        gtfNumber: g.gtfNumber,
        motivo: "no cuadra con sus piezas: escribe qué pasó al recibirla",
      });
    }
    const costo = m.costoTotal.trim();
    if (costo !== "") {
      const n = Number(costo);
      if (!Number.isFinite(n) || n <= 0) {
        problemas.push({
          clave: g.clave,
          gtfNumber: g.gtfNumber,
          motivo: "el costo tiene que ser un número mayor que cero, o quedar vacío",
        });
      }
    }
  }
  return problemas;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * El costo de la guía repartido entre sus asientos, por volumen. Al último se
 * le da el RESTO: tres tercios redondeados dejan un céntimo suelto y el libro
 * tiene que sumar exactamente lo que dice la factura (mismo criterio que
 * `CtpCostoGuiaModal`).
 */
export function repartirCosto(
  g: GuiaDelBloque,
  total: number,
): { id: string; costoTotal: number }[] {
  if (!(total > 0) || g.lineas.length === 0) return [];
  const vols = g.lineas.map((l) => Math.max(0, Number(l.volumeM3) || 0));
  const suma = vols.reduce((a, b) => a + b, 0);
  let asignado = 0;
  return g.lineas.map((l, i) => {
    const parte =
      i === g.lineas.length - 1
        ? r2(total - asignado)
        : suma > 0
          ? r2((total * vols[i]) / suma)
          : r2(total / g.lineas.length);
    asignado = r2(asignado + parte);
    return { id: l.id, costoTotal: parte };
  });
}

export interface ResumenDelBloque {
  guias: number;
  asientos: number;
  m3: number;
  /** Trozas que quedan fechadas —las que hoy no tienen decisión—. */
  trozasAFechar: number;
  conCosto: number;
  soles: number;
}

/** Lo que se va a declarar, en números, antes de apretar. */
export function resumenDelBloque(
  guias: readonly GuiaDelBloque[],
  marcas: Marcas,
): ResumenDelBloque {
  const elegidas = marcadas(guias, marcas);
  let asientos = 0;
  let m3 = 0;
  let trozasAFechar = 0;
  let conCosto = 0;
  let soles = 0;
  for (const g of elegidas) {
    asientos += g.lineas.length;
    m3 += g.volumenM3;
    trozasAFechar += Math.max(0, g.trozasCount - g.trozasDecididas);
    const n = Number(marcaDe(marcas, g.clave).costoTotal.trim());
    if (Number.isFinite(n) && n > 0) {
      conCosto += 1;
      soles = r2(soles + n);
    }
  }
  return { guias: elegidas.length, asientos, m3: Math.round(m3 * 10_000) / 10_000, trozasAFechar, conCosto, soles };
}
