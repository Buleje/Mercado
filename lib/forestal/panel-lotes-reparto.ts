/**
 * Panel «Lotes» de la Distribución de rolliza (Brandon, 2026-10-03: «poder
 * crear lotes a los volúmenes … crear lote o usar un lote ya creado … y de
 * esos lotes, ahí mismo, escoger las trozas e integrarlas»).
 *
 * Tres caminos, todos con trozas REALES del patio (T1: nunca un lote sin
 * trozas ni con trozas inventadas):
 *  1. **Sugeridos del patio**: los lotes que propone el patio por especie +
 *     permiso (`proponerLotes`, la misma regla de «Lotes que puedes armar»).
 *     Cada lote creado entra como bloque con su `loteId` y sus `trozaIds`.
 *  2. **Lotes del Libro**: un lote abierto se trae como bloque nuevo o se
 *     vincula a un bloque que no tiene (típicamente uno cargado a mano).
 *  3. **Trozas del bloque**: se eligen piezas libres del patio de la especie
 *     (y permiso) del bloque y se suman a su lote, o se le arma uno con ellas.
 *
 * Acá sólo se decide qué se ofrece y con qué motivo; quien escribe es el
 * servidor (`agregarTrozas`, `crearPorBloques`, `crear` de propuestas), que
 * vuelve a validar cada pieza. El descuento de volumen sigue siendo el de
 * siempre: el consumo al registrar la producción.
 *
 * PURO y client-safe: sin DB, sin React y sin `window`.
 */

import { fmtM3 } from "./cubicacion-formato";
import { MAX_TROZAS_POR_BLOQUE, type BloqueRolliza } from "./cubicacion-reparto";
import { esSinCodigo, norm, type TrozaConsumible } from "./consumo-trozas";
import { piezasLibres, volumenLibre, type LoteAserrio } from "./lotes-aserrio";
import { motivoFueraDeLaPila } from "./lote-por-escaneo";
import { claveEspecie } from "./loth-constants";
import type { PropuestasDelPatio } from "./propuesta-de-lotes";

const texto = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t && t !== "—" ? t : null;
};
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** La GTF declara m³ a 3 decimales: menos que esto no es una diferencia. */
export const TOLERANCIA_M3 = 0.0005;

/* ── 1. Sugeridos del patio ───────────────────────────────────────────── */

/**
 * Por qué el patio propone menos (o nada), dicho con DÓNDE se arregla. En Blas
 * (03-10) los 7 ingresos están sin permiso: la lista sale vacía y sin esto
 * parecería que no hay madera.
 */
export function notasDelPatio(p: PropuestasDelPatio): string[] {
  const notas: string[] = [];
  const { sinPermiso, esperanGuia, sinEspecie } = p;
  if (sinPermiso.trozas > 0) {
    notas.push(
      `${plural(sinPermiso.trozas, "troza libre", "trozas libres")} (${fmtM3(sinPermiso.m3)} m³) ` +
        `no ${sinPermiso.trozas === 1 ? "tiene" : "tienen"} permiso en su ingreso: corrígelo en Ingresos y aparecerán acá.`,
    );
  }
  if (esperanGuia.trozas > 0) {
    notas.push(
      `${plural(esperanGuia.trozas, "troza", "trozas")} (${fmtM3(esperanGuia.m3)} m³) ` +
        `${esperanGuia.trozas === 1 ? "espera" : "esperan"} que recibas su guía en Ingresos (${plural(esperanGuia.guias, "guía", "guías")}).`,
    );
  }
  if (sinEspecie.trozas > 0) {
    notas.push(
      `${plural(sinEspecie.trozas, "troza", "trozas")} (${fmtM3(sinEspecie.m3)} m³) sin especie: corrígela en su guía.`,
    );
  }
  if (notas.length === 0 && p.propuestas.length === 0) {
    notas.push("No hay trozas libres en el patio: todas están en un lote, ya se aserraron o salieron despachadas.");
  }
  return notas;
}

/* ── El bloque que sale de un lote ────────────────────────────────────── */

/**
 * Las trozas libres del lote, para que el bloque las recuerde. `null` si no
 * tiene o si pasan del tope que admite el guardado (500): un bloque con la
 * lista cortada declararía menos piezas que su lote.
 */
export function trozaIdsLibresDelLote(lote: Pick<LoteAserrio, "trozas">): string[] | null {
  const ids = piezasLibres(lote).map((t) => t.id);
  return ids.length > 0 && ids.length <= MAX_TROZAS_POR_BLOQUE ? ids : null;
}

/** El único permiso de unas trozas, o `null` si no traen o traen más de uno. */
export function permisoDeLasTrozas(trozas: readonly { permiso?: string | null }[]): string | null {
  const permisos = new Set(trozas.map((t) => texto(t.permiso)).filter((p): p is string => p !== null));
  return permisos.size === 1 ? [...permisos][0]! : null;
}

/** El permiso del lote (ADR-393) o, si nació «de todos», el único de sus trozas. */
export function permisoDelLote(lote: Pick<LoteAserrio, "permiso" | "trozas">): string | null {
  return texto(lote.permiso) ?? permisoDeLasTrozas(lote.trozas);
}

/** Un bloque nuevo con la rolliza libre de un lote, sus trozas y su `loteId`. */
export function bloqueDesdeLote(
  id: string,
  lote: { id: string; code: string; especie: string; permiso: string | null },
  m3: number,
  trozaIds: string[] | null,
): BloqueRolliza {
  return {
    id,
    etiqueta: `Lote ${lote.code}`,
    especie: lote.especie,
    m3: r4(m3),
    permiso: lote.permiso,
    origen: "lote",
    loteId: lote.id,
    trozaIds: trozaIds && trozaIds.length > 0 && trozaIds.length <= MAX_TROZAS_POR_BLOQUE ? trozaIds : null,
    tipo: "rolliza",
    costoM3: null,
    aprovechablePct: null,
  };
}

/**
 * Pone en la tabla el bloque de un lote recién creado o traído, sin repetir
 * madera (revisión 03-10): si un bloque SIN lote ya tenía alguna de esas trozas
 * (el que trajo Saldos o el patio), se las saca —y su m³— porque ahora van en
 * el bloque del lote; si se queda sin trozas, sale de la tabla. Con las mismas
 * trozas en dos bloques el reparto partía la especie entre los dos y el Libro
 * declaraba de menos sin que nadie lo viera.
 *
 * `m3De` da el m³ de cada troza; si falta una, se descuenta en proporción.
 */
export function ponerLoteEnLaTabla(
  bloques: readonly BloqueRolliza[],
  nuevo: BloqueRolliza,
  m3De: ReadonlyMap<string, number> = new Map(),
): { lista: BloqueRolliza[]; tocados: string[] } {
  const delLote = new Set(nuevo.trozaIds ?? []);
  const tocados: string[] = [];
  const lista: BloqueRolliza[] = [];
  for (const b of bloques) {
    const ids = b.trozaIds ?? [];
    const repetidas = texto(b.loteId) || delLote.size === 0 ? [] : ids.filter((t) => delLote.has(t));
    if (repetidas.length === 0) {
      lista.push(b);
      continue;
    }
    tocados.push(b.id);
    const quedan = ids.filter((t) => !delLote.has(t));
    if (quedan.length === 0) continue;
    const conocidas = repetidas.every((t) => m3De.has(t));
    const sale = conocidas ? m3DeIds(repetidas, m3De) : (Number(b.m3) || 0) * (repetidas.length / ids.length);
    lista.push({ ...b, trozaIds: quedan, m3: r4(Math.max(0, (Number(b.m3) || 0) - sale)) });
  }
  lista.push(nuevo);
  return { lista, tocados };
}

/* ── 2. Lotes del Libro ───────────────────────────────────────────────── */

export interface LoteParaUsar {
  lote: LoteAserrio;
  libres: number;
  m3: number;
  permiso: string | null;
  /** La etiqueta del bloque que ya lo usa: un lote, un bloque (doble consumo). */
  enBloque: string | null;
}

/** Los lotes abiertos con rolliza libre, el más viejo primero (la madera apilada se raja). */
export function lotesParaUsar(lotes: readonly LoteAserrio[], bloques: readonly BloqueRolliza[]): LoteParaUsar[] {
  return lotes
    .filter((l) => l.status === "abierto" && piezasLibres(l).length > 0)
    .map((lote) => {
      const b = bloques.find((x) => x.loteId === lote.id);
      return {
        lote,
        libres: piezasLibres(lote).length,
        m3: volumenLibre(lote),
        permiso: permisoDelLote(lote),
        enBloque: b ? b.etiqueta || "sin etiqueta" : null,
      };
    })
    .sort((a, b) => (a.lote.fechaApertura ?? "").localeCompare(b.lote.fechaApertura ?? ""));
}

/** Por qué un bloque no se puede vincular a ningún lote, o `null`. */
export function motivoNoVincula(b: Pick<BloqueRolliza, "tipo" | "loteId" | "corridaIds" | "jornadasLibro">): string | null {
  if (b.tipo === "aserrada") return "Es madera ya aserrada: no lleva lote de aserrío.";
  if (texto(b.loteId)) return "Ya tiene lote.";
  /* Con producción escrita desde un lote anterior, cambiarle el lote dejaría
     esos días como «anulados» y listos para registrarse otra vez (revisión 03-10). */
  if ((b.corridaIds?.length ?? 0) > 0 || (b.jornadasLibro?.length ?? 0) > 0) {
    return "Ya tiene producción en el Libro: no se le cambia el lote.";
  }
  return null;
}

/** Lo que el bloque dice y el lote no. Avisan, no frenan: lo que manda en el Libro es el lote. */
export function avisosDelVinculo(
  b: Pick<BloqueRolliza, "especie" | "permiso" | "m3" | "trozaIds">,
  lote: LoteAserrio,
): string[] {
  const avisos: string[] = [];
  if (texto(b.especie) && claveEspecie(b.especie) !== claveEspecie(lote.speciesCommon)) {
    avisos.push(`El bloque dice ${b.especie} y el lote es de ${lote.speciesCommon}.`);
  }
  const permiso = permisoDelLote(lote);
  if (texto(b.permiso) && permiso && texto(b.permiso) !== permiso) {
    avisos.push(`El bloque dice permiso ${b.permiso} y las trozas del lote son del ${permiso}.`);
  }
  const libre = volumenLibre(lote);
  if (Math.abs((Number(b.m3) || 0) - libre) > TOLERANCIA_M3) {
    avisos.push(`El bloque dice ${fmtM3(Number(b.m3) || 0)} m³ y el lote tiene ${fmtM3(libre)} m³ de rolliza libre.`);
  }
  const propias = b.trozaIds ?? [];
  if (propias.length > 0) {
    const delLote = new Set(piezasLibres(lote).map((t) => t.id));
    if (propias.length !== delLote.size || propias.some((id) => !delLote.has(id))) {
      avisos.push("Sus trozas pasan a ser las del lote.");
    }
  }
  return avisos;
}

/**
 * El bloque vinculado al lote: toma su `loteId` y sus trozas libres. La especie
 * y el permiso del bloque se completan sólo si estaban vacíos (lo escrito a
 * mano se respeta y se avisa en `avisosDelVinculo`).
 */
export function vincularBloque(
  b: BloqueRolliza,
  lote: LoteAserrio,
  bloques: readonly BloqueRolliza[],
): { bloque: BloqueRolliza } | { motivo: string } {
  const m = motivoNoVincula(b);
  if (m) return { motivo: m };
  const otro = bloques.find((x) => x.id !== b.id && x.loteId === lote.id);
  if (otro) {
    return { motivo: `El lote ${lote.code} ya está en el bloque «${otro.etiqueta || "sin etiqueta"}»: un lote, un bloque.` };
  }
  if (lote.status !== "abierto") return { motivo: `El lote ${lote.code} está ${lote.status}: ya no tiene rolliza para vincular.` };
  const libres = piezasLibres(lote).length;
  const ids = trozaIdsLibresDelLote(lote);
  if (!ids) {
    return {
      motivo: libres === 0
        ? `El lote ${lote.code} no tiene trozas libres.`
        : `El lote ${lote.code} tiene más de ${MAX_TROZAS_POR_BLOQUE} trozas: tráelo como bloque desde Consumos.`,
    };
  }
  return {
    bloque: {
      ...b,
      loteId: lote.id,
      trozaIds: ids,
      especie: texto(b.especie) ? b.especie : lote.speciesCommon,
      permiso: texto(b.permiso) ?? permisoDelLote(lote),
    },
  };
}

/* ── 3. Trozas del bloque ─────────────────────────────────────────────── */

export type ModoSelector =
  | { modo: "agregar"; lote: LoteAserrio }
  | { modo: "crear" }
  | { modo: "no"; motivo: string };

/**
 * Qué hace el selector con este bloque: sumar a su lote, armarle uno con lo
 * elegido, o nada (con el motivo).
 */
export function modoDelSelector(
  b: Pick<BloqueRolliza, "tipo" | "loteId">,
  lotes: readonly LoteAserrio[],
  lotesCargados: boolean,
): ModoSelector {
  if (b.tipo === "aserrada") return { modo: "no", motivo: "Es madera ya aserrada: no lleva lote de aserrío ni trozas." };
  const loteId = texto(b.loteId);
  if (!loteId) return { modo: "crear" };
  const lote = lotes.find((l) => l.id === loteId);
  if (!lote) {
    return {
      modo: "no",
      motivo: lotesCargados ? "No encuentro su lote en el Libro (¿se borró?). Quítale la marca en «Crear lotes»." : "Cargando los lotes del Libro…",
    };
  }
  if (lote.status !== "abierto") return { modo: "no", motivo: `El lote ${lote.code} está ${lote.status}: ya no admite trozas.` };
  return { modo: "agregar", lote };
}

/** Las piezas que el patio puede dar: libres, sin lote, guía recibida y de esa especie. */
export function trozasLibresDeEspecie(patio: readonly TrozaConsumible[], especie: string): TrozaConsumible[] {
  const clave = claveEspecie(especie);
  if (!texto(especie)) return [];
  return patio.filter((t) => motivoFueraDeLaPila(t) === null && claveEspecie(t.especieComun) === clave);
}

/** Las especies con piezas libres en el patio (para el bloque que no dice la suya). */
export function especiesLibres(patio: readonly TrozaConsumible[]): string[] {
  const porClave = new Map<string, string>();
  for (const t of patio) {
    const e = texto(t.especieComun);
    if (e && motivoFueraDeLaPila(t) === null && !porClave.has(claveEspecie(e))) porClave.set(claveEspecie(e), e);
  }
  return [...porClave.values()].sort((a, b) => a.localeCompare(b, "es"));
}

/** Los permisos de unas trozas, sin repetir (las sin permiso no cuentan). */
export function permisosDe(trozas: readonly TrozaConsumible[]): string[] {
  return [...new Set(trozas.map((t) => texto(t.permiso)).filter((p): p is string => p !== null))].sort();
}

/**
 * La regla de permiso del selector:
 *  · lote nuevo (`crear`): el permiso elegido, obligatorio — el mismo criterio
 *    que «Crear lotes» por bloque (ADR-464: sin permiso no se arma);
 *  · lote con permiso: ese, obligatorio (ADR-393; más estricto que el
 *    servidor, que deja entrar una troza sin permiso: no puede probar su título);
 *  · lote viejo «de todos»: el único de sus trozas si lo hay, y sin exigir.
 */
export function reglaDePermiso(
  modo: Exclude<ModoSelector, { modo: "no" }>,
  permisoElegido: string | null,
): { permiso: string | null; exige: boolean } {
  if (modo.modo === "crear") return { permiso: permisoElegido, exige: true };
  const delLote = texto(modo.lote.permiso);
  if (delLote) return { permiso: delLote, exige: true };
  return { permiso: permisoDeLasTrozas(piezasLibres(modo.lote)), exige: false };
}

/** Por qué esta troza no se puede elegir, o `null`. */
export function motivoDeTroza(t: TrozaConsumible, regla: { permiso: string | null; exige: boolean }): string | null {
  const p = texto(t.permiso);
  if (!p) {
    return regla.exige ? `Su ingreso no tiene permiso: corrígelo en Ingresos${t.gtfNumber ? ` (guía ${t.gtfNumber})` : ""}` : null;
  }
  if (regla.permiso && p !== regla.permiso) return `Es del permiso ${p}, no del ${regla.permiso}`;
  return null;
}

/** El código con el que el operario ubica la pieza. */
export function codigoDeTroza(t: Pick<TrozaConsumible, "id" | "codificacion" | "codigoPlanta">): string {
  if (!esSinCodigo(t)) return (t.codificacion ?? "").trim();
  return texto(t.codigoPlanta) ?? `#${t.id.slice(-6)}`;
}

export interface OpcionDeTroza {
  id: string;
  codigo: string;
  gtf: string | null;
  m3: number;
  motivo: string | null;
}

/** Las opciones del selector: elegibles primero, después las apagadas; filtradas por código o guía. */
export function opcionesDeTrozas(
  trozas: readonly TrozaConsumible[],
  regla: { permiso: string | null; exige: boolean },
  busqueda: string,
): OpcionDeTroza[] {
  const q = norm(busqueda);
  return trozas
    .filter((t) => !q || norm(`${t.codificacion ?? ""} ${t.codigoPlanta ?? ""} ${t.gtfNumber ?? ""}`).includes(q))
    .map((t) => ({
      id: t.id,
      codigo: codigoDeTroza(t),
      gtf: texto(t.gtfNumber),
      m3: Number(t.volumenM3) || 0,
      motivo: motivoDeTroza(t, regla),
    }))
    .sort((a, b) => Number(a.motivo !== null) - Number(b.motivo !== null) || a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
}

/** m³ de unos ids, a 4 decimales. Preview: el volumen del lote lo cuenta el servidor. */
export function m3DeIds(ids: Iterable<string>, m3De: ReadonlyMap<string, number>): number {
  let s = 0;
  for (const id of ids) s += m3De.get(id) ?? 0;
  return r4(s);
}

/** Las trozas del bloque después de sumar piezas a su lote (la base: las suyas o las libres del lote). */
export function trozaIdsTrasAgregar(
  b: Pick<BloqueRolliza, "trozaIds">,
  lote: Pick<LoteAserrio, "trozas">,
  entraron: readonly string[],
): string[] | null {
  const base = b.trozaIds && b.trozaIds.length > 0 ? b.trozaIds : piezasLibres(lote).map((t) => t.id);
  const todas = [...new Set([...base, ...entraron])];
  return todas.length > 0 && todas.length <= MAX_TROZAS_POR_BLOQUE ? todas : null;
}

/** Las trozas del bloque después de sacar una de su lote. */
export function trozaIdsTrasQuitar(
  b: Pick<BloqueRolliza, "trozaIds">,
  lote: Pick<LoteAserrio, "trozas">,
  trozaId: string,
): string[] | null {
  const base = b.trozaIds && b.trozaIds.length > 0 ? b.trozaIds : piezasLibres(lote).map((t) => t.id);
  const quedan = base.filter((id) => id !== trozaId);
  return quedan.length > 0 ? quedan : null;
}
