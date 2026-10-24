/**
 * Cuánto rindió la guía (Cubicador, Brandon 24-10): cruza lo que declara una
 * GTF con lo que se cubicó en aserrada, que hasta hoy nunca se juntaban.
 *
 * - Guía de TROZA (rolliza): rendimiento = m³ aserrado ÷ m³ de troza, con el
 *   m³ aserrado SALIENDO del PT (PT ÷ 424, regla dura). Se juzga contra la
 *   meta del módulo (`juzgarRendimiento`, 56 %). Es un derivado: la corrida
 *   real se declara en Producción.
 * - Guía de madera ASERRADA (salida): cuadre directo en m³ y PT.
 *
 * Pura: sin base ni React. El servidor usa `resumirVolumenDeGuia` para no
 * mandar los items crudos; el cliente usa `cruzarConGuia`.
 */
import { PT_POR_M3 } from "./cubicacion";
import { juzgarRendimiento } from "./loctp-catalogos";

export type TipoDeGuia = "trozas" | "producto";

export interface VolumenPorEspecie {
  especie: string;
  m3: number;
  piezas: number;
}

/** Lo que el servidor devuelve de la guía: sumas, nunca los items. */
export interface VolumenDeGuia {
  tipo: TipoDeGuia;
  m3Total: number;
  volumenPorEspecie: VolumenPorEspecie[];
}

export interface ItemDeGuiaVolumen {
  species?: string | null;
  volumeM3?: number | string | null;
  pieces?: number | string | null;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const SIN_ESPECIE = "Sin especie";

/** «TORNILLO» = «Tornillo» = « tornillo »; sin tildes. */
export const claveDeEspecie = (s: string | null | undefined): string =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ") || "sin especie";

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Suma los items por especie; redondea UNA vez, al final. */
export function resumirVolumenDeGuia(tipo: TipoDeGuia, items: readonly ItemDeGuiaVolumen[]): VolumenDeGuia {
  const grupos = new Map<string, { especie: string; m3: number; piezas: number }>();
  let total = 0;
  for (const it of items) {
    const m3 = num(it.volumeM3);
    const piezas = num(it.pieces) || 1;
    const nombre = it.species?.trim() || SIN_ESPECIE;
    const k = claveDeEspecie(it.species);
    const g = grupos.get(k) ?? { especie: nombre, m3: 0, piezas: 0 };
    g.m3 += m3;
    g.piezas += piezas;
    grupos.set(k, g);
    total += m3;
  }
  return {
    tipo,
    m3Total: r3(total),
    volumenPorEspecie: [...grupos.values()]
      .map((g) => ({ especie: g.especie, m3: r3(g.m3), piezas: g.piezas }))
      .sort((a, b) => b.m3 - a.m3 || a.especie.localeCompare(b.especie, "es")),
  };
}

export interface PiezaParaCruce {
  especie?: string | null;
  pieTablar: number;
}

export interface FilaDelCruce {
  clave: string;
  especie: string;
  /** m³ que declara la guía de esa especie (0 si la guía no la trae). */
  m3Guia: number;
  /** PT cubicado de esa especie (0 si no se cubicó). */
  pt: number;
  /** m³ aserrado = PT ÷ 424. */
  m3Cubicado: number;
  /** Troza: m³ aserrado ÷ m³ de troza, en %. `null` si la guía no declara m³ de esa especie. */
  rendimientoPct: number | null;
  veredicto: "bueno" | "bajo" | "sospechoso" | null;
  /** Aserrada: m³ cubicado − m³ de la guía (con signo) y su equivalente en PT. */
  difM3: number;
  difPt: number;
  soloEnGuia: boolean;
  soloEnCubicacion: boolean;
}

export interface CruceConGuia {
  tipo: TipoDeGuia;
  filas: FilaDelCruce[];
  total: FilaDelCruce;
}

function armarFila(clave: string, especie: string, m3Guia: number, pt: number, enGuia: boolean, enCub: boolean): FilaDelCruce {
  const rend = m3Guia > 0 ? Math.round((pt / PT_POR_M3 / m3Guia) * 1000) / 10 : null;
  return {
    clave,
    especie,
    m3Guia: r3(m3Guia),
    pt: Math.round(pt * 100) / 100,
    m3Cubicado: r3(pt / PT_POR_M3),
    rendimientoPct: rend,
    veredicto: juzgarRendimiento(rend),
    difM3: r3(pt / PT_POR_M3 - m3Guia),
    difPt: Math.round(pt - m3Guia * PT_POR_M3),
    soloEnGuia: enGuia && !enCub,
    soloEnCubicacion: enCub && !enGuia,
  };
}

/**
 * Cruza la guía con las piezas de la cubicación. `especieDelLote` completa las
 * piezas sin especie (igual que el resto del cubicador).
 */
export function cruzarConGuia(guia: VolumenDeGuia, piezas: readonly PiezaParaCruce[], especieDelLote?: string | null): CruceConGuia {
  const porClave = new Map<string, { especie: string; m3Guia: number; pt: number; enGuia: boolean; enCub: boolean }>();
  for (const g of guia.volumenPorEspecie) {
    porClave.set(claveDeEspecie(g.especie), { especie: g.especie, m3Guia: g.m3, pt: 0, enGuia: true, enCub: false });
  }
  let ptTotal = 0;
  for (const p of piezas) {
    const pt = Number(p.pieTablar) || 0;
    const nombre = p.especie?.trim() || especieDelLote?.trim() || SIN_ESPECIE;
    const k = claveDeEspecie(nombre);
    const f = porClave.get(k) ?? { especie: nombre, m3Guia: 0, pt: 0, enGuia: false, enCub: false };
    f.pt += pt;
    f.enCub = true;
    porClave.set(k, f);
    ptTotal += pt;
  }
  const filas = [...porClave.entries()]
    .map(([k, f]) => armarFila(k, f.especie, f.m3Guia, f.pt, f.enGuia, f.enCub))
    .sort((a, b) => b.m3Guia - a.m3Guia || b.pt - a.pt || a.especie.localeCompare(b.especie, "es"));
  /* Rendimiento: sólo cuenta el PT de las especies que la guía trae (el Cedro que no vino en ella no
     sube el rendimiento de sus Tornillos). Cuadre de aserrada: todo lo cubicado contra todo lo declarado. */
  const ptDeLaGuia = [...porClave.values()].filter((f) => f.enGuia).reduce((a, f) => a + f.pt, 0);
  const ptDelTotal = guia.tipo === "trozas" ? ptDeLaGuia : ptTotal;
  return { tipo: guia.tipo, filas, total: armarFila("total", "Total", guia.m3Total, ptDelTotal, true, true) };
}
