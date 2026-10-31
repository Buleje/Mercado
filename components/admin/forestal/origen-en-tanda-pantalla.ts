/**
 * «Vincular en tanda» (ADR-447) del lado de la pantalla: qué viaja en el POST
 * de cada grupo con lo que la persona desmarcó, cómo rinde cada corrida con
 * SUS trozas marcadas (vista previa: el servidor lo vuelve a mirar bajo lock)
 * y qué se le dice de cada resultado.
 *
 * PURO y client-safe: lo usan el hook, el modal y su test.
 */
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { CorridaEnLaTanda, GrupoDeLaTanda, PropuestaDeTandaOrigen } from "@/lib/forestal/origen-en-tanda";
import { TOPE_RENDIMIENTO_PCT } from "@/lib/forestal/vincular-produccion";
import type { ResultadoCorridaEnTanda, TrozaPropuesta, VincularTrozasPedido } from "@/lib/forestal/vincular-trozas";
import { de, ptDe, r1, r4 } from "./ctp-sin-origen-comun";

export interface EleccionesDeTanda {
  /** Trozas que la persona sacó de la propuesta. */
  desmarcadas: ReadonlySet<string>;
  /** Corridas que se dejan sin origen: no viajan. */
  sinOrigen: ReadonlySet<string>;
}

/**
 * Lo que el servidor contestó de UNA corrida. `pendiente` (contrato del 28-09):
 * se acabó el plazo total de la tanda antes de llegar a ella; no se escribió
 * nada y se vuelve a pedir sin romper el avance.
 */
export type ResultadoEnPantalla =
  | ResultadoCorridaEnTanda
  | { corridaId: string; lineNo: number | null; estado: "pendiente"; mensaje?: string };

export type ResultadosDeTanda = Readonly<Record<string, ResultadoEnPantalla>>;

/** Corridas por POST: el servidor acepta hasta 15 (aviso del 28-09); cada una es su propia transacción. */
export const CORRIDAS_POR_PEDIDO = 15;

export const SIN_ELEGIR: EleccionesDeTanda = { desmarcadas: new Set(), sinOrigen: new Set() };

/** Ya quedó con origen (ahora o antes): no se vuelve a pedir. */
export const yaTieneOrigen = (r: ResultadoEnPantalla | undefined): boolean =>
  r?.estado === "vinculada" || r?.estado === "ya_vinculada";

export interface VistaDeCorrida {
  marcadas: TrozaPropuesta[];
  m3Trozas: number;
  /** `producido ÷ troza marcada × 100`, con UN decimal. */
  rendimientoPct: number | null;
  /** Pasa el 56 % de la plaza: se avisa, se firma igual (ADR-358). */
  sobreElTope: boolean;
  /** Viaja en el próximo POST. */
  va: boolean;
  /** Por qué no viaja, si no viaja y todavía no tiene origen. */
  porQueNo: string | null;
}

export function vistaDeCorrida(
  c: CorridaEnLaTanda,
  e: EleccionesDeTanda,
  r?: ResultadoEnPantalla,
): VistaDeCorrida {
  const marcadas = c.trozas.filter((t) => !e.desmarcadas.has(t.trozaId));
  const m3Trozas = r4(marcadas.reduce((a, t) => a + t.m3, 0));
  const rendimientoPct = m3Trozas > 0 && c.m3Producido > 0 ? r1((c.m3Producido / m3Trozas) * 100) : null;
  const sinOrigen = e.sinOrigen.has(c.corridaId);
  const hecha = yaTieneOrigen(r);
  const porQueNo = hecha
    ? null
    : sinOrigen
      ? "Queda sin origen: no se vincula."
      : marcadas.length === 0
        ? "No le queda ninguna troza marcada: no se vincula."
        : null;
  return {
    marcadas,
    m3Trozas,
    rendimientoPct,
    sobreElTope: rendimientoPct != null && rendimientoPct > TOPE_RENDIMIENTO_PCT,
    va: !hecha && !sinOrigen && marcadas.length > 0,
    porQueNo,
  };
}

/** El cuerpo de `POST { tanda }` de UN grupo: la más vieja primero (como vino). */
export function pedidoDelGrupo(g: GrupoDeLaTanda, e: EleccionesDeTanda, res: ResultadosDeTanda): VincularTrozasPedido[] {
  return g.corridas.flatMap((c) => {
    const v = vistaDeCorrida(c, e, res[c.corridaId]);
    return v.va ? [{ corridaId: c.corridaId, trozaIds: v.marcadas.map((t) => t.trozaId) }] : [];
  });
}

/** Un pedido largo, en tandas que el servidor acepta (la más vieja primero, como vino). */
export function enTandas<T>(xs: readonly T[], tamanio: number = CORRIDAS_POR_PEDIDO): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += tamanio) out.push(xs.slice(i, i + tamanio));
  return out;
}

/** Los grupos que todavía tienen algo que mandar, en el orden de la propuesta. */
export function gruposEnFila(p: PropuestaDeTandaOrigen, e: EleccionesDeTanda, res: ResultadosDeTanda): string[] {
  return p.grupos.filter((g) => pedidoDelGrupo(g, e, res).length > 0).map((g) => g.clave);
}

export interface LoQueVa {
  corridas: number;
  m3Producido: number;
  pt: number;
  trozas: number;
  m3Trozas: number;
  sobreElTope: number;
}

/** Lo que viajaría si se aprieta «Vincular las N»: sólo lo marcado y sin origen todavía. */
export function loQueVa(p: PropuestaDeTandaOrigen, e: EleccionesDeTanda, res: ResultadosDeTanda): LoQueVa {
  let corridas = 0;
  let m3Producido = 0;
  let trozas = 0;
  let m3Trozas = 0;
  let sobre = 0;
  for (const g of p.grupos) {
    for (const c of g.corridas) {
      const v = vistaDeCorrida(c, e, res[c.corridaId]);
      if (!v.va) continue;
      corridas++;
      m3Producido += c.m3Producido;
      trozas += v.marcadas.length;
      m3Trozas += v.m3Trozas;
      if (v.sobreElTope) sobre++;
    }
  }
  return { corridas, m3Producido: r4(m3Producido), pt: ptDe(m3Producido), trozas, m3Trozas: r4(m3Trozas), sobreElTope: sobre };
}

/** Las elecciones que siguen valiendo con una propuesta nueva (lo demás se suelta). */
export function eleccionesVigentes(p: PropuestaDeTandaOrigen, e: EleccionesDeTanda): EleccionesDeTanda {
  const corridas = new Set(p.grupos.flatMap((g) => g.corridas.map((c) => c.corridaId)));
  const trozas = new Set(p.grupos.flatMap((g) => g.corridas.flatMap((c) => c.trozas.map((t) => t.trozaId))));
  return {
    desmarcadas: new Set([...e.desmarcadas].filter((id) => trozas.has(id))),
    sinOrigen: new Set([...e.sinOrigen].filter((id) => corridas.has(id))),
  };
}

export type TonoEstado = "ok" | "error" | "aviso" | "neutro";

export function tonoDeResultado(r: ResultadoEnPantalla): TonoEstado {
  if (r.estado === "vinculada") return r.sobreElTope ? "aviso" : "ok";
  if (r.estado === "ya_vinculada") return "ok";
  if (r.estado === "pendiente") return "aviso";
  return "error";
}

export function textoDeResultado(r: ResultadoEnPantalla): string {
  switch (r.estado) {
    case "vinculada":
      return `Vinculada: ${de(r.trozas, "troza", "trozas")} · ${fmtM3(r.m3)} m³${
        r.rendimientoPct != null ? ` · rinde ${r1(r.rendimientoPct)} %` : ""
      }${r.sobreElTope ? ", pasa el 56 %" : ""}.`;
    case "ya_vinculada":
      return r.mismas ? "Ya estaba vinculada con estas trozas." : `Ya tenía origen: ${r.mensaje}`;
    case "bloqueada":
      return `No se vinculó: ${r.mensaje}`;
    case "error":
      return `No se pudo: ${r.mensaje}`;
    case "pendiente":
      return "Se acabó el tiempo de la tanda antes de llegar a ésta: no se escribió nada, se vuelve a pedir.";
  }
}

/** La pastilla del grupo: lo que pasó con sus corridas, o lo que va a mandar. */
export function estadoDelGrupo(
  g: GrupoDeLaTanda,
  e: EleccionesDeTanda,
  res: ResultadosDeTanda,
): { tono: TonoEstado; texto: string } {
  const rs = g.corridas.map((c) => res[c.corridaId]).filter((r): r is ResultadoEnPantalla => r != null);
  const conOrigen = g.corridas.filter((c) => yaTieneOrigen(res[c.corridaId])).length;
  const mal = rs.filter((r) => r.estado === "bloqueada" || r.estado === "error").length;
  if (g.corridas.length > 0 && conOrigen === g.corridas.length) return { tono: "ok", texto: "Vinculado" };
  if (mal > 0) return { tono: "error", texto: de(mal, "no se vinculó", "no se vincularon") };
  if (conOrigen > 0) return { tono: "aviso", texto: `${conOrigen} de ${g.corridas.length}` };
  const van = pedidoDelGrupo(g, e, res).length;
  if (van === 0) return { tono: "neutro", texto: "Sin origen" };
  const sobre = g.corridas.some((c) => vistaDeCorrida(c, e, res[c.corridaId]).sobreElTope);
  return sobre ? { tono: "aviso", texto: "Pasa el 56 %" } : { tono: "neutro", texto: van === g.corridas.length ? "Lista" : `${van} de ${g.corridas.length}` };
}
