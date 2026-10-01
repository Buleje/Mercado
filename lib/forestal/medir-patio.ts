/**
 * medir-patio.ts — «Medir escaneando» en el modo patio (Brandon 2026-09-26).
 *
 * Con la tablet frente a la pila: se escanea la troza, se tipean sus puntas en
 * pulgadas y su largo en pies (cubicación Oxapampa), y se pasa a la siguiente.
 * La fila (qué dice cada celda, el pt en vivo, qué se manda) es la MISMA de la
 * planilla de la guía (`planilla-oxapampa.ts`): acá sólo vive lo propio del
 * patio.
 *
 *   · La TANDA: lo medido en esta visita, lo último arriba, guardado en la
 *     tablet para que una recarga o un corte de señal no lo borre de la vista.
 *   · `pareceEscaneo`: la pistola es un teclado y tipea donde esté el cursor.
 *     Si el cursor quedó en «D1″», el código de la troza siguiente entra ahí
 *     como si fuera una medida de 90 millones de pulgadas.
 *   · `faltaParaGuardar`: qué le falta a la fila, en palabras.
 *   · `conCambioLocal`: la troza como queda con lo que se anotó sin señal (el
 *     servidor todavía no lo tiene, pero la tablet sí lo tiene que mostrar).
 *   · `reconciliarTanda`: lo anotado sin señal contra el patio del servidor y
 *     la cola (subió, el servidor lo rechazó, o sigue en la tablet).
 *   · `restoDelEscaneo`: el segundo código de la misma etiqueta (o el resto de
 *     la ficha del QR grande) que la pistola tipea en «D1″» tras escanear.
 *
 * PURO y client-safe.
 */

import { ptOxapampa } from "./cubicacion-oxapampa";
import { redondear2, type CambioMedidaTroza } from "./medidas-troza";
import {
  CAMPOS_OXAPAMPA,
  erroresDeFila,
  filaDeTroza,
  leerDecimal,
  textoDeMedida,
  type BaseTrozaPlanilla,
  type FilaPlanilla,
} from "./planilla-oxapampa";
import {
  ECO_DE_ETIQUETA_MS,
  VENTANA_FICHA_MS,
  buscarTrozaEscaneada,
  esFichaDeTroza,
  esLineaDeFicha,
  leerEscaneo,
  type TrozaEscaneable,
} from "./leer-escaneo-troza";

/** Cómo quedó una troza de la tanda. */
export type EstadoMedida =
  /** Está en el libro, tal cual. */
  | "guardada"
  /** Anotada en la tablet sin señal: se sube sola cuando vuelva. */
  | "en-equipo"
  /** Se guardó, pero el servidor no aceptó una parte (p. ej. los cm). */
  | "con-aviso"
  /** Se le borró la medida Oxapampa (se había tipeado en la troza equivocada). */
  | "borrada"
  /**
   * El servidor NO la guardó (la guía está anulada, la troza figura como no
   * llegada…). Su PT no existe en el libro: no suma y se puede reenviar.
   */
  | "rechazada";

export interface MedidaDeLaTanda {
  id: string;
  codigo: string;
  especie: string | null;
  gtfNumber: string | null;
  d1: number | null;
  d2: number | null;
  largo: number | null;
  pt: number | null;
  estado: EstadoMedida;
  /** Lo que el servidor no aceptó, en palabras (`con-aviso` y `rechazada`). */
  aviso: string | null;
  en: string;
  /** Sólo `rechazada`: lo que se mandó, para volver a llenar el formulario y reenviarlo. */
  cambio?: CambioMedidaTroza | null;
}

/** Una tanda es un día de patio; más de esto ya no se lee en una pantalla. */
export const MAX_TANDA = 300;

const ESTADOS: readonly EstadoMedida[] = ["guardada", "en-equipo", "con-aviso", "borrada", "rechazada"];

/** Pone (o reemplaza) la medida de una troza arriba de la tanda. */
export function ponerEnTanda(
  tanda: readonly MedidaDeLaTanda[],
  m: MedidaDeLaTanda,
): MedidaDeLaTanda[] {
  return [m, ...tanda.filter((x) => x.id !== m.id)].slice(0, MAX_TANDA);
}

/**
 * Cuántas trozas quedaron medidas y cuánto pt suman. Sólo cuenta lo que TIENE
 * PT: una borrada, una a medias, una que sólo recibió sus cm o una que el
 * servidor rechazó no están cubicadas. `enEquipo` son las que todavía no
 * subieron (su pt es el de la tablet, la misma cuenta que hará el servidor);
 * `rechazadas`, las que hay que volver a mandar.
 */
export function resumenDeTanda(tanda: readonly MedidaDeLaTanda[]): {
  trozas: number;
  pt: number;
  enEquipo: number;
  rechazadas: number;
} {
  let pt = 0;
  let trozas = 0;
  let enEquipo = 0;
  let rechazadas = 0;
  for (const m of tanda) {
    if (m.estado === "en-equipo") enEquipo += 1;
    if (m.estado === "rechazada") rechazadas += 1;
    if (m.estado === "borrada" || m.estado === "rechazada" || m.pt == null || !Number.isFinite(m.pt)) continue;
    trozas += 1;
    pt += m.pt;
  }
  return { trozas, pt: Math.round(pt * 100) / 100, enEquipo, rechazadas };
}

const numONulo = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const textoONulo = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * Un `CambioMedidaTroza` leído de algo guardado (la tanda, la cola). Conserva
 * la diferencia entre ausente (no se toca) y `null` (se borra). `null` si no
 * tiene forma de cambio.
 */
export function leerCambio(v: unknown): CambioMedidaTroza | null {
  if (!v || typeof v !== "object") return null;
  const x = v as Record<string, unknown>;
  if (typeof x.id !== "string" || !x.id) return null;
  const c: CambioMedidaTroza = { id: x.id };
  for (const k of ["oxD1Pulg", "oxD2Pulg", "oxLargoPies", "d1Cm", "d2Cm"] as const) {
    if (x[k] === null) c[k] = null;
    else if (typeof x[k] === "number" && Number.isFinite(x[k])) c[k] = x[k] as number;
  }
  return c;
}

/** Lee la tanda guardada en la tablet. La de otro día (o rota) = vacía. */
export function leerTanda(json: string | null | undefined, hoy: string): MedidaDeLaTanda[] {
  if (!json) return [];
  try {
    const d = JSON.parse(json) as { v?: unknown; fecha?: unknown; medidas?: unknown };
    if (d?.v !== 1 || d.fecha !== hoy || !Array.isArray(d.medidas)) return [];
    const out: MedidaDeLaTanda[] = [];
    for (const x of d.medidas as Record<string, unknown>[]) {
      if (!x || typeof x.id !== "string" || !x.id || typeof x.codigo !== "string") continue;
      const estado = ESTADOS.includes(x.estado as EstadoMedida) ? (x.estado as EstadoMedida) : "guardada";
      out.push({
        id: x.id,
        codigo: x.codigo,
        especie: textoONulo(x.especie),
        gtfNumber: textoONulo(x.gtfNumber),
        d1: numONulo(x.d1),
        d2: numONulo(x.d2),
        largo: numONulo(x.largo),
        pt: numONulo(x.pt),
        estado,
        aviso: textoONulo(x.aviso),
        en: typeof x.en === "string" ? x.en : "",
        ...(estado === "rechazada" ? { cambio: leerCambio(x.cambio) } : {}),
      });
    }
    return out.slice(0, MAX_TANDA);
  } catch {
    return [];
  }
}

/** Lo que se guarda en la tablet. */
export function tandaParaGuardar(hoy: string, medidas: readonly MedidaDeLaTanda[]): string {
  return JSON.stringify({ v: 1, fecha: hoy, medidas });
}

/** Las marcas de unidad que a veces se tipean detrás de una medida. */
const UNIDAD_AL_FINAL = /(″|"|′|'|pulg|pies|pie|cm)+$/iu;

/**
 * ¿Lo que entró a un campo de medida es un ESCANEO y no una medida?
 *
 * Una medida en pulgadas o pies tiene, como mucho, tres cifras enteras (el
 * tope es 120″ y 100 pies). Un código de planta de cuatro cifras o más
 * (90100123), uno del bosque (letras o barra: 13/A) o el QR (una URL) no se
 * confunden con una medida — y un número mal tipeado («1.2.3») no es un
 * escaneo: es un error de la celda.
 *
 * Lo que NO alcanza a ver: en Blas 41 de 84 códigos de planta tienen 2 o 3
 * cifras («58», «118»), iguales a una medida. Ése es el trabajo de
 * `restoDelEscaneo`, que mira CUÁNDO llegó y no sólo qué dice.
 */
export function pareceEscaneo(texto: string): boolean {
  const s = texto.trim().replace(/\s+/g, "").replace(UNIDAD_AL_FINAL, "");
  if (!s) return false;
  if (/[a-z/:_-]/i.test(s)) return true;
  const entero = s.split(/[.,]/)[0] ?? "";
  return /^\d{4,}$/.test(entero);
}

const NOMBRE_OX = { d1: "D1″", d2: "D2″", largo: "el largo" } as const;

/**
 * Qué casillas Oxapampa faltan para tener PT, en el orden en que se tipean.
 * Vacío = no falta ninguna (o no se tipeó nada, que no es «a medias»).
 *
 * Las DOS puntas, siempre (revisión 26-09 de `ptOxapampa`): con una sola se
 * congelaba un PT hasta 21 % más alto y la troza contaba como cubicada.
 */
export function oxQueFalta(fila: FilaPlanilla): ("d1" | "d2" | "largo")[] {
  const valores = CAMPOS_OXAPAMPA.map((c) => [c, leerDecimal(fila[c])] as const);
  if (!valores.some(([, v]) => typeof v === "number")) return [];
  return valores.filter(([, v]) => v == null).map(([c]) => c);
}

/** «Falta D2″» · «Falta D1″ y el largo». */
export function textoDeLoQueFalta(faltan: readonly ("d1" | "d2" | "largo")[]): string | null {
  if (faltan.length === 0) return null;
  const n = faltan.map((c) => NOMBRE_OX[c]);
  return `Falta ${n.length === 1 ? n[0] : `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`}`;
}

/**
 * Qué le falta a la fila para poder guardarla, en palabras; `null` = lista.
 *
 * No se guarda una cubicación a medias: sin las dos puntas y el largo no hay
 * pt, y una troza a medias en la lista del dueño se paga mal. Sí se puede
 * guardar SOLO los cm (la guía no los trajo) o borrar la medida (vaciar las
 * tres casillas de una troza ya medida).
 */
export function faltaParaGuardar(
  base: BaseTrozaPlanilla,
  fila: FilaPlanilla,
  cambio: CambioMedidaTroza | null,
): string | null {
  if (Object.keys(erroresDeFila(fila)).length > 0) return "Corrige lo marcado en rojo.";
  const falta = textoDeLoQueFalta(oxQueFalta(fila));
  if (falta) return `${falta}.`;
  if (!cambio) {
    const teniaOx = base.oxD1Pulg != null || base.oxD2Pulg != null || base.oxLargoPies != null;
    return teniaOx ? "Sin cambios: ya está guardada así." : "Anota las puntas y el largo.";
  }
  return null;
}

/** ¿El cambio borra la cubicación Oxapampa entera? */
export function borraLaMedida(base: BaseTrozaPlanilla, cambio: CambioMedidaTroza): boolean {
  const final = (nuevo: number | null | undefined, actual: number | null | undefined) =>
    nuevo === undefined ? (actual ?? null) : nuevo;
  const teniaOx = base.oxD1Pulg != null || base.oxD2Pulg != null || base.oxLargoPies != null;
  return (
    teniaOx &&
    final(cambio.oxD1Pulg, base.oxD1Pulg) == null &&
    final(cambio.oxD2Pulg, base.oxD2Pulg) == null &&
    final(cambio.oxLargoPies, base.oxLargoPies) == null
  );
}

/**
 * La troza como queda con el cambio, sin esperar al servidor (sin señal). El
 * pt es `ptOxapampa` sobre las medidas redondeadas a 2 decimales, la misma
 * cuenta que congela el servidor (`planearMedida`). Los cm sólo se llenan
 * sobre vacío — igual que en el libro.
 */
export function conCambioLocal<T extends BaseTrozaPlanilla>(t: T, c: CambioMedidaTroza): T {
  const valor = (nuevo: number | null | undefined, actual: number | null | undefined) =>
    nuevo === undefined ? (actual ?? null) : nuevo === null ? null : redondear2(nuevo);
  const d1 = valor(c.oxD1Pulg, t.oxD1Pulg);
  const d2 = valor(c.oxD2Pulg, t.oxD2Pulg);
  const largo = valor(c.oxLargoPies, t.oxLargoPies);
  return {
    ...t,
    oxD1Pulg: d1,
    oxD2Pulg: d2,
    oxLargoPies: largo,
    oxPt: ptOxapampa({ d1Pulg: d1, d2Pulg: d2, largoPies: largo }),
    d1Cm: t.d1Cm ?? c.d1Cm ?? null,
    d2Cm: t.d2Cm ?? c.d2Cm ?? null,
  };
}

/**
 * La troza con lo que la tablet anotó SIN SEÑAL encima. Tras recargar sin
 * señal, el patio sale del caché (sin esa medida) pero la tanda la tiene: al
 * volver a escanearla tiene que verse lo que se anotó, no el vacío.
 */
export function conMedidaDeTanda<T extends BaseTrozaPlanilla>(
  t: T,
  tanda: readonly MedidaDeLaTanda[],
): T {
  const m = tanda.find((x) => x.id === t.id);
  if (!m || m.estado !== "en-equipo") return t;
  return { ...t, oxD1Pulg: m.d1, oxD2Pulg: m.d2, oxLargoPies: m.largo, oxPt: m.pt };
}

/**
 * ¿Dos medidas son la misma? El servidor redondea a 2 decimales ANTES de
 * guardar (`planearMedida`): 10,125″ anotado sin señal vuelve como 10,13, y
 * comparar crudo (diferencia 0,005000…08) dejaba la troza «en la tablet» todo
 * el día. Se redondean los DOS lados, como el servidor.
 */
export const mismaMedida = (a: number | null | undefined, b: number | null | undefined): boolean =>
  a == null || b == null ? a == null && b == null : redondear2(a) === redondear2(b);

const OX = [
  ["oxD1Pulg", "oxD1Pulg"],
  ["oxD2Pulg", "oxD2Pulg"],
  ["oxLargoPies", "oxLargoPies"],
] as const;

/**
 * ¿La troza que devolvió el servidor tiene la cubicación que se mandó? Sólo
 * mira lo que el cambio tocaba (ausente = no se tocó). Sirve para distinguir
 * un rechazo PARCIAL (los cm no entraron, el PT sí) de uno TOTAL (la pieza
 * entera: guía anulada, no llegada), en el que el PT de la tablet no existe.
 */
export function quedoLaMedida(cambio: CambioMedidaTroza, t: BaseTrozaPlanilla | null | undefined): boolean {
  if (!t) return false;
  return OX.every(([k, kt]) => cambio[k] === undefined || mismaMedida(cambio[k], t[kt]));
}

/** ¿El cambio toca la cubicación Oxapampa (y no sólo los cm)? */
export const tocaLaCubicacion = (c: CambioMedidaTroza): boolean =>
  c.oxD1Pulg !== undefined || c.oxD2Pulg !== undefined || c.oxLargoPies !== undefined;

/** Lo que la cola del patio sabe de las medidas (`medidasEnCola`). */
export interface MedidasEnCola {
  /** Trozas con una medida todavía por subir. */
  pendientes: ReadonlySet<string>;
  /** Trozas cuya medida el servidor no aceptó: por qué y lo que se mandó. */
  rechazadas: ReadonlyMap<string, { motivo: string; cambio: CambioMedidaTroza | null }>;
}

/** Lo mínimo de una anotación de la cola que hace falta leer acá. */
export interface AnotacionLeida {
  section: string;
  payload: Record<string, unknown>;
  estado: string;
  motivo?: string;
}

/** Las medidas de la cola del patio, por troza. */
export function medidasEnCola(lista: readonly AnotacionLeida[]): MedidasEnCola {
  const pendientes = new Set<string>();
  const rechazadas = new Map<string, { motivo: string; cambio: CambioMedidaTroza | null }>();
  for (const a of lista) {
    if (a.section !== "medidas" || !Array.isArray(a.payload.trozas)) continue;
    for (const x of a.payload.trozas as unknown[]) {
      const c = leerCambio(x);
      if (!c) continue;
      if (a.estado === "rechazado") {
        rechazadas.set(c.id, { motivo: a.motivo?.trim() || "El libro no la aceptó.", cambio: c });
      } else {
        pendientes.add(c.id);
      }
    }
  }
  return { pendientes, rechazadas };
}

/**
 * Lo que la tablet anotó sin señal, contra el patio recién traído del
 * servidor y lo que dice la cola:
 *
 *   · el servidor ya tiene esas medidas → «guardada» con el pt que congeló
 *     (o «con aviso» si la cola dice que algo —los cm— no entró);
 *   · no las tiene y la cola la RECHAZÓ → «rechazada», con el motivo y lo que
 *     se mandó para reenviarlo. Su PT no se muestra como si existiera;
 *   · si no, se deja como está (todavía no subió, o alguien la midió distinto).
 *
 * `cola` ausente (sin IndexedDB) = sólo se compara contra el servidor.
 */
export function reconciliarTanda(
  tanda: readonly MedidaDeLaTanda[],
  trozas: readonly (BaseTrozaPlanilla & { oxPt?: number | null })[],
  cola?: MedidasEnCola,
): MedidaDeLaTanda[] {
  if (!tanda.some((m) => m.estado === "en-equipo" || m.estado === "rechazada")) return tanda as MedidaDeLaTanda[];
  const porId = new Map(trozas.map((t) => [t.id, t]));
  return tanda.map((m) => {
    if (m.estado !== "en-equipo" && m.estado !== "rechazada") return m;
    const t = porId.get(m.id);
    const rechazo = cola?.rechazadas.get(m.id);
    const enServidor =
      t != null && mismaMedida(t.oxD1Pulg, m.d1) && mismaMedida(t.oxD2Pulg, m.d2) && mismaMedida(t.oxLargoPies, m.largo);
    if (enServidor) {
      const { cambio: _cambio, ...resto } = m;
      return rechazo
        ? { ...resto, estado: "con-aviso", aviso: rechazo.motivo, pt: t.oxPt ?? m.pt }
        : { ...resto, estado: "guardada", aviso: null, pt: t.oxPt ?? m.pt };
    }
    if (m.estado === "en-equipo" && rechazo && !cola?.pendientes.has(m.id)) {
      return { ...m, estado: "rechazada", aviso: rechazo.motivo, pt: null, cambio: rechazo.cambio };
    }
    return m;
  });
}

/**
 * Las trozas de una carga del patio, sin pisar lo guardado MIENTRAS viajaba
 * (Brandon 2026-09-26): una recarga que salió antes de guardar volvía después
 * con la troza vieja y la lista local perdía la medida recién hecha.
 * `guardadas` = lo guardado con su número de orden; `desde` = el número que
 * había cuando la carga salió. Lo guardado después gana.
 */
export function mezclarCarga<T extends { id: string }>(
  frescas: readonly T[],
  guardadas: ReadonlyMap<string, { n: number; troza: T }>,
  desde: number,
): T[] {
  if (guardadas.size === 0) return [...frescas];
  return frescas.map((f) => {
    const g = guardadas.get(f.id);
    return g && g.n > desde ? g.troza : f;
  });
}

/**
 * La fila con que abre el formulario. Si el servidor rechazó lo que se mandó,
 * se vuelve a llenar con ESO (sobre la troza del servidor, no encima): así
 * `cambioDeFila` ve la diferencia y «Guardar» reenvía. Superponerlo a la troza
 * —como se hace con lo que está en la tablet— daba «Sin cambios» y no dejaba
 * reenviar nunca.
 */
export function filaInicial(t: BaseTrozaPlanilla, propuesta?: CambioMedidaTroza | null): FilaPlanilla {
  if (!propuesta) return filaDeTroza(t);
  const valor = (nuevo: number | null | undefined, actual: number | null | undefined) =>
    nuevo === undefined ? actual : nuevo;
  return {
    ...filaDeTroza({
      ...t,
      oxD1Pulg: valor(propuesta.oxD1Pulg, t.oxD1Pulg),
      oxD2Pulg: valor(propuesta.oxD2Pulg, t.oxD2Pulg),
      oxLargoPies: valor(propuesta.oxLargoPies, t.oxLargoPies),
    }),
    d1Cm: t.d1Cm == null ? textoDeMedida(propuesta.d1Cm) : "",
    d2Cm: t.d2Cm == null ? textoDeMedida(propuesta.d2Cm) : "",
  };
}

/** El escaneo que abrió el formulario: de qué troza y cuándo. */
export interface EscaneoReciente {
  trozaId: string;
  /** ms (`Date.now()`) en que se eligió la troza. */
  en: number;
  /** Hasta cuándo lo que llega se toma como el resto de la ficha del QR grande. */
  fichaHasta: number;
}

/** Abre las dos ventanas al elegir una troza. */
export const escaneoReciente = (trozaId: string, ahora: number): EscaneoReciente => ({
  trozaId,
  en: ahora,
  fichaHasta: ahora + VENTANA_FICHA_MS,
});

/**
 * ¿Lo que entró a una casilla de medida es el RESTO del escaneo que abrió el
 * formulario, y no una medida? (Brandon 2026-09-26)
 *
 * Tras escanear, el cursor salta a «D1″». La etiqueta trae dos códigos de la
 * misma troza (QR y barras) y la pistola puede leer los dos: el segundo —en
 * Blas, «58»: 41 de 84 códigos tienen 2 o 3 cifras— entraba como 58″ y el PT
 * salía ~4× más alto. Y el QR grande llega partido en líneas (`Tornillo`,
 * `2.412 m³`…) que daban un aviso falso de «el cursor estaba en una medida».
 *
 *   · `"eco"`: dentro de `ECO_DE_ETIQUETA_MS`, el código de la MISMA troza.
 *   · `"ficha"`: dentro de la ventana de la ficha, una línea de ficha o algo
 *     que parece un escaneo y no es ninguna troza (quien llama la renueva).
 *   · `null`: es una medida (o el escaneo de OTRA troza, que se atiende aparte).
 *
 * `previo` es lo que la casilla tenía antes: la pistola tipea donde está el
 * cursor, y en una troza ya medida el eco llega pegado («18» + «58»).
 */
export function restoDelEscaneo<T extends TrozaEscaneable>(
  texto: string,
  previo: string,
  reciente: EscaneoReciente | null,
  trozas: readonly T[],
  ahora: number,
): "eco" | "ficha" | null {
  if (!reciente) return null;
  const crudo = texto.trim();
  if (!crudo) return null;
  const antes = previo.trim();
  const candidatos = [crudo];
  if (antes && crudo !== antes) {
    if (crudo.startsWith(antes)) candidatos.push(crudo.slice(antes.length).trim());
    else if (crudo.endsWith(antes)) candidatos.push(crudo.slice(0, -antes.length).trim());
  }
  const enEco = ahora >= reciente.en && ahora - reciente.en < ECO_DE_ETIQUETA_MS;
  const enFicha = ahora >= reciente.en && ahora < reciente.fichaHasta;
  const lecturas = candidatos.filter(Boolean).map((c) => ({ c, r: buscarTrozaEscaneada(trozas, leerEscaneo(c)) }));
  const esEsta = ({ r }: (typeof lecturas)[number]) =>
    (r.estado === "una" && r.troza.id === reciente.trozaId) ||
    (r.estado === "varias" && r.trozas.some((t) => t.id === reciente.trozaId));
  if (enEco && lecturas.some(esEsta)) return "eco";
  /* El escaneo de OTRA troza no es ruido: se atiende (cambiar de troza o avisar). */
  if (lecturas.some((l) => l.r.estado !== "ninguna" && !esEsta(l))) return null;
  if (!enFicha) return null;
  return lecturas.some(({ c }) => esLineaDeFicha(c) || esFichaDeTroza(c) || pareceEscaneo(c)) ? "ficha" : null;
}
