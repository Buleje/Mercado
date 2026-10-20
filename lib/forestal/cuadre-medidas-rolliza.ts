/**
 * ¿Cuadran las medidas? — la pieza aserrada contra la troza que la respalda
 * (Brandon, 2026-10-19: «si en piezas registradas hay de largo 20 pies, en la
 * guía tiene que haber por lo mínimo 6 metros a más; en caso de haberlo, poner
 * esa pieza como advertencia o que no cuadra porque la troza no hay de esas
 * medidas; también aplica eso en diámetros»).
 *
 * La regla vive en `medida-cabe-en-troza.ts` (ADR-505) y el reparto ya la
 * respeta al distribuir: con la regla activa, lo que queda acá son las entradas
 * a mano y los bloques que se marcaron «sin respetar medidas». Sigue siendo una
 * ADVERTENCIA: dice «esta pieza no pudo salir de ninguna troza de ese bloque».
 *
 * Puro: sin React, sin red, sin localStorage.
 *
 * `trozasDelBloque` lee primero la copia guardada con la hoja
 * (`BloqueRolliza.trozasMedidas`): es la misma que usó el reparto, así lo que
 * se reparte y lo que se revisa no pueden discrepar.
 */

import type { BloqueRolliza, Distribucion } from "./cubicacion-reparto";
import { claveEspecie, esAserradaDirecta } from "./cubicacion-reparto";
import { medidaDeTroza, respaldoDe, revisarPieza, type AvisoMedida, type PiezaMedida, type RespaldoTrozas, type TrozaConMedidasAPI, type TrozaMedida } from "./medida-cabe-en-troza";

export {
  TOLERANCIA_DIAMETRO_CM,
  TOLERANCIA_LARGO_M,
  aCm,
  aMetros,
  diametroUtilCm,
  elegibilidad,
  holguraM,
  respaldoDe,
  revisarPieza,
  subcapacidadM3,
  type AvisoMedida,
  type Elegibilidad,
  type MotivoMedida,
  type PiezaMedida,
  type RespaldoTrozas,
  type TrozaMedida,
} from "./medida-cabe-en-troza";

export type EstadoCuadreMedidas = "cuadra" | "advertencia" | "sin-medidas" | "sin-piezas";

export interface CuadreBloqueMedidas {
  bloqueId: string;
  etiqueta: string;
  especie: string;
  permiso: string | null;
  /** De dónde salieron las trozas comparadas («sus 12 trozas», «el patio de PLT-…»). */
  fuente: string | null;
  estado: EstadoCuadreMedidas;
  respaldo: RespaldoTrozas;
  avisos: AvisoMedida[];
  piezas: number;
  piezasConAviso: number;
  /** Piezas que se repartieron a este bloque sin trozas con medidas para comprobarlas. */
  piezasSinComprobar: number;
}

export interface CuadreMedidas {
  bloques: CuadreBloqueMedidas[];
  /** Líneas (medidas) con advertencia: el número de la pestaña. */
  avisos: number;
  piezasConAviso: number;
  piezasSinComprobar: number;
}

export interface EntradaCuadre {
  bloqueId: string;
  etiqueta: string;
  especie: string;
  permiso: string | null;
  fuente: string | null;
  trozas: readonly TrozaMedida[];
  piezas: readonly PiezaMedida[];
  /** Piezas que el reparto puso acá sin poder comprobarlas (bloque sin medidas). */
  sinComprobar?: number;
}

/** Una medida una sola vez (el reparto la puede repartir en dos grupos o días). */
function unirMedidas(piezas: readonly PiezaMedida[]): PiezaMedida[] {
  const m = new Map<string, PiezaMedida>();
  for (const p of piezas) {
    if (!(p.piezas > 0)) continue;
    const k = `${p.espesor}${p.uEspesor}|${p.ancho}${p.uAncho}|${p.largo}${p.uLargo}`;
    const prev = m.get(k);
    m.set(k, prev ? { ...prev, piezas: prev.piezas + p.piezas } : { ...p });
  }
  return [...m.values()];
}

export function cuadrarBloque(e: EntradaCuadre): CuadreBloqueMedidas {
  const piezas = unirMedidas(e.piezas);
  const respaldo = respaldoDe(e.trozas);
  const totalPiezas = piezas.reduce((s, p) => s + p.piezas, 0);
  const base = { bloqueId: e.bloqueId, etiqueta: e.etiqueta, especie: e.especie, permiso: e.permiso, fuente: e.fuente, respaldo, piezas: totalPiezas, piezasSinComprobar: e.sinComprobar ?? 0 };
  if (piezas.length === 0) return { ...base, estado: "sin-piezas", avisos: [], piezasConAviso: 0 };
  if (respaldo.trozas === 0) return { ...base, estado: "sin-medidas", avisos: [], piezasConAviso: 0 };
  const ref = e.permiso?.trim() || (e.etiqueta.trim() ? `«${e.etiqueta.trim()}»` : e.especie || "este bloque");
  const avisos = piezas
    .map((p) => revisarPieza(p, e.trozas, ref))
    .filter((a): a is AvisoMedida => a != null)
    .sort((a, b) => b.largoM - a.largoM || b.ladoCm - a.ladoCm);
  const piezasConAviso = avisos.reduce((s, a) => s + a.piezas, 0);
  return { ...base, estado: avisos.length > 0 ? "advertencia" : "cuadra", avisos, piezasConAviso };
}

// ── De qué trozas sale cada bloque ─────────────────────────────────────────────

/**
 * Una troza que sabe de dónde viene (patio o lote del Libro). Puede traer las
 * puntas medidas al recibirla y las de Oxapampa (`TrozaConMedidasAPI`): las lee
 * `medidaDeTroza` en `conPuntas`.
 */
export interface TrozaConOrigen extends TrozaMedida, Omit<TrozaConMedidasAPI, keyof TrozaMedida> {
  id: string;
  especieComun?: string | null;
  permiso?: string | null;
}

export interface FuentesDeTrozas {
  /** Patio + trozas de los lotes del Libro (por id). */
  libro: readonly TrozaConOrigen[];
  /** Trozas de cada lote del Libro. */
  lotes: ReadonlyMap<string, { code: string; trozas: readonly TrozaConOrigen[] }>;
  /** El cubicador de trozas del navegador (Smalian: Ø en cm, largo en m). */
  cubicador: readonly { especie?: string; d1: number; d2: number; largo: number }[];
}

const alfanum = (s: string | null | undefined) => (s ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();

/** Mismo permiso escrito distinto, o uno es la cola del otro («PLT-2021-017» ⊂ «19-SEC/REG-PLT-2021-017»). */
export function coincidePermiso(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = alfanum(a);
  const y = alfanum(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [corto, largo] = x.length <= y.length ? [x, y] : [y, x];
  return corto.length >= 8 && largo.endsWith(corto);
}

const mismaEspecie = (a: string | null | undefined, b: string | null | undefined) => {
  const k = claveEspecie(a);
  return k === "" || claveEspecie(b) === k;
};

/**
 * Las trozas que respaldan un bloque, de la más exacta a la más amplia:
 * sus trozas elegidas → las de su lote → las del cubicador de trozas (si de ahí
 * vino) → las del patio y lotes de SU permiso y especie. Ninguna = `[]`.
 */
export function trozasDelBloque(b: BloqueRolliza, f: FuentesDeTrozas): { trozas: TrozaMedida[]; fuente: string | null } {
  /* La copia guardada con la hoja manda (ADR-505): es la que usó el reparto. */
  const copia = b.trozasMedidas ?? [];
  if (copia.length > 0) return { trozas: [...copia], fuente: copia.length === 1 ? "su troza (guardada con la hoja)" : `sus ${copia.length} trozas (guardadas con la hoja)` };
  return trozasDeLasFuentes(b, f);
}

/**
 * La troza del Libro con sus puntas leídas como las lee el patio
 * (`medidaDeTroza` → `medidasDePieza`): una pieza medida al recibirla o
 * cubicada en Oxapampa también tiene Ø para el cuadre, no sólo la que trae
 * `d1Cm`/`d2Cm`.
 */
const conPuntas = <T extends TrozaConOrigen>(t: T): T => ({ ...t, ...(medidaDeTroza(t) ?? {}) });

/** Lo mismo sin mirar la copia: de dónde se completa una hoja vieja. */
export function trozasDeLasFuentes(b: BloqueRolliza, f: FuentesDeTrozas): { trozas: TrozaMedida[]; fuente: string | null } {
  const ids = b.trozaIds ?? [];
  if (ids.length > 0) {
    const set = new Set(ids);
    const t = f.libro.filter((x) => set.has(x.id));
    if (t.length > 0) return { trozas: t.map(conPuntas), fuente: `sus ${t.length} ${t.length === 1 ? "troza" : "trozas"}` };
  }
  if (b.loteId) {
    const lote = f.lotes.get(b.loteId);
    if (lote && lote.trozas.length > 0) return { trozas: lote.trozas.map(conPuntas), fuente: `las trozas del lote ${lote.code}` };
  }
  if (b.origen === "trozas") {
    const t = f.cubicador
      .filter((x) => claveEspecie(x.especie) === claveEspecie(b.especie))
      .map((x) => ({ largoM: x.largo, d1Cm: x.d1, d2Cm: x.d2 }));
    if (t.length > 0) return { trozas: t, fuente: `el cubicador de trozas (${t.length})` };
  }
  if (b.permiso?.trim()) {
    const vistos = new Set<string>();
    const t = f.libro.filter((x) => {
      if (vistos.has(x.id) || !coincidePermiso(x.permiso, b.permiso) || !mismaEspecie(b.especie, x.especieComun)) return false;
      vistos.add(x.id);
      return true;
    });
    if (t.length > 0) return { trozas: t.map(conPuntas), fuente: `el Libro, ${t.length} ${t.length === 1 ? "troza" : "trozas"} de ese permiso` };
  }
  return { trozas: [], fuente: null };
}

/** Todo el reparto: un renglón por bloque de rolliza (la aserrada directa no trae troza). */
export function cuadrarMedidasDelReparto(dist: Distribucion, f: FuentesDeTrozas): CuadreMedidas {
  const bloques: CuadreBloqueMedidas[] = [];
  for (const e of dist.especies) {
    for (const bd of e.bloques) {
      const b = bd.bloque;
      if (esAserradaDirecta(b)) continue;
      const { trozas, fuente } = trozasDelBloque(b, f);
      const medidas = bd.asignado.flatMap((g) => g.medidas);
      bloques.push(
        cuadrarBloque({
          bloqueId: b.id,
          etiqueta: b.etiqueta ?? "",
          especie: b.especie || e.especie,
          permiso: b.permiso?.trim() || null,
          fuente,
          trozas,
          piezas: medidas,
          sinComprobar: medidas.reduce((s, m) => s + (m.sinComprobar ? m.piezas : 0), 0),
        }),
      );
    }
  }
  return {
    bloques,
    avisos: bloques.reduce((s, b) => s + b.avisos.length, 0),
    piezasConAviso: bloques.reduce((s, b) => s + b.piezasConAviso, 0),
    piezasSinComprobar: bloques.reduce((s, b) => s + b.piezasSinComprobar, 0),
  };
}
