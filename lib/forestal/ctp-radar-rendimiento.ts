/**
 * ctp-radar-rendimiento — cuánto producto sale por m³ de troza que entra, y
 * qué corridas se salen de lo normal.
 *
 * Por qué importa: una merma del 70% en una corrida es o un error de carga o
 * madera que salió de la planta sin registrarse. Con el balance ya calculado el
 * dato está a mano, sólo faltaba compararlo.
 *
 * DOS CAUTELAS que definen el diseño de este módulo:
 *
 * 1. El rendimiento sólo es interpretable **contra sus pares**. Si la corrida
 *    declara pies tablares y la entrada son m³, el cociente es una constante de
 *    conversión (~424 pt/m³), no un "42%". Por eso cada corrida se compara
 *    contra la MEDIANA de su grupo `(producto, unidad)` y nunca contra un 100%
 *    absoluto — salvo el caso m³→m³, donde salir más de lo que entró sí es
 *    imposible en sí mismo.
 *
 * 2. Con dos corridas no hay "normal". Debajo de `MIN_GRUPO` no se emite
 *    ninguna alerta relativa: preferimos no decir nada a inventar un promedio.
 *
 * PURO y client-safe.
 */

import type { TrazaGrafo } from "@/lib/db/forest-ctp.db";

/** Corridas mínimas en un grupo para que su mediana signifique algo. */
export const MIN_GRUPO = 3;

/** Desvío contra la mediana del grupo a partir del cual se marca. */
export const DESVIO_PCT = 25;

export type RendimientoFlag = "normal" | "bajo" | "alto" | "imposible" | "sin_referencia";

export interface RendimientoCorrida {
  id: string;
  lineNo: number;
  etiqueta: string;
  /** m³ de troza atribuidos a la corrida. */
  entradaM3: number;
  /** Cantidad producida declarada. */
  salida: number;
  unidad: string;
  /** salida / entradaM3. null si no hay materia prima atribuida. */
  ratio: number | null;
  /** Clave del grupo comparable: producto + unidad. */
  grupo: string;
  /** Mediana del grupo (null si el grupo es chico). */
  medianaGrupo: number | null;
  /** Desvío contra la mediana, en % (negativo = rinde menos que sus pares). */
  desvioPct: number | null;
  flag: RendimientoFlag;
  motivo: string | null;
}

export const FLAG_TONE: Record<RendimientoFlag, "success" | "warning" | "danger" | "muted"> = {
  normal: "success",
  bajo: "warning",
  alto: "warning",
  imposible: "danger",
  sin_referencia: "muted",
};

export const FLAG_LABEL: Record<RendimientoFlag, string> = {
  normal: "En rango",
  bajo: "Merma alta",
  alto: "Rinde de más",
  imposible: "Imposible",
  sin_referencia: "Sin referencia",
};

const round = (n: number, d = 3): number => Number(n.toFixed(d));

/** Unidad normalizada: "m3", "M3", "m³" son la misma cosa. */
function normUnidad(u: string | null): string {
  return (u ?? "").trim().toLowerCase().replace("³", "3").replace(/\s+/g, "");
}

function esMetrosCubicos(u: string | null): boolean {
  const n = normUnidad(u);
  return n === "m3" || n === "metroscubicos" || n === "metros3";
}

export function mediana(valores: number[]): number | null {
  const v = valores.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * Calcula el rendimiento de cada corrida y marca las que se salen del grupo.
 */
export function analizarRendimiento(g: TrazaGrafo): RendimientoCorrida[] {
  const entradaPorCorrida = new Map<string, number>();
  for (const c of g.consumos) {
    entradaPorCorrida.set(c.to, (entradaPorCorrida.get(c.to) ?? 0) + (Number(c.volumeM3) || 0));
  }

  const base = g.corridas.map((c) => {
    const entradaM3 = round(entradaPorCorrida.get(c.id) ?? 0);
    const salida = Number(c.quantity) || 0;
    const ratio = entradaM3 > 0 ? round(salida / entradaM3) : null;
    return {
      id: c.id,
      lineNo: c.lineNo,
      etiqueta: c.label,
      entradaM3,
      salida,
      unidad: c.unit ?? "",
      ratio,
      grupo: `${(c.productType ?? "—").trim().toLowerCase()}|${normUnidad(c.unit)}`,
    };
  });

  // Mediana por grupo comparable, sólo con corridas que tengan ratio.
  const porGrupo = new Map<string, number[]>();
  for (const b of base) {
    if (b.ratio == null) continue;
    const arr = porGrupo.get(b.grupo) ?? [];
    arr.push(b.ratio);
    porGrupo.set(b.grupo, arr);
  }

  return base.map((b) => {
    const muestras = porGrupo.get(b.grupo) ?? [];
    const med = muestras.length >= MIN_GRUPO ? mediana(muestras) : null;

    if (b.ratio == null) {
      return { ...b, medianaGrupo: med, desvioPct: null, flag: "sin_referencia" as const, motivo: "Sin materia prima atribuida: no hay rendimiento que medir." };
    }

    // Único juicio absoluto: m³ que salen > m³ que entraron.
    if (esMetrosCubicos(b.unidad) && b.ratio > 1.001) {
      return {
        ...b, medianaGrupo: med, desvioPct: med ? round(((b.ratio - med) / med) * 100, 1) : null,
        flag: "imposible" as const,
        motivo: `Salieron ${round(b.salida, 2)} m³ de ${b.entradaM3} m³ de troza: una corrida no puede rendir más de lo que entró.`,
      };
    }

    if (med == null || med === 0) {
      return {
        ...b, medianaGrupo: med, desvioPct: null, flag: "sin_referencia" as const,
        motivo: `Menos de ${MIN_GRUPO} corridas de «${b.etiqueta}» en el período: no hay con qué compararla.`,
      };
    }

    const desvioPct = round(((b.ratio - med) / med) * 100, 1);
    if (Math.abs(desvioPct) < DESVIO_PCT) {
      return { ...b, medianaGrupo: med, desvioPct, flag: "normal" as const, motivo: null };
    }
    const bajo = desvioPct < 0;
    return {
      ...b, medianaGrupo: med, desvioPct,
      flag: (bajo ? "bajo" : "alto") as RendimientoFlag,
      motivo: bajo
        ? `Rinde ${Math.abs(desvioPct)}% menos que las demás corridas de su tipo (${round(b.ratio, 2)} vs ${round(med, 2)} ${b.unidad || "u"}/m³). Revisá si falta producto por registrar o si la materia prima atribuida es de más.`
        : `Rinde ${desvioPct}% más que sus pares (${round(b.ratio, 2)} vs ${round(med, 2)} ${b.unidad || "u"}/m³). Suele ser materia prima sin atribuir del todo.`,
    };
  });
}

/** Sólo lo que hay que mirar, lo peor primero. */
export function alertasRendimiento(rs: RendimientoCorrida[]): RendimientoCorrida[] {
  const peso: Record<RendimientoFlag, number> = { imposible: 0, bajo: 1, alto: 2, sin_referencia: 3, normal: 4 };
  return rs
    .filter((r) => r.flag === "imposible" || r.flag === "bajo" || r.flag === "alto")
    .sort((a, b) => peso[a.flag] - peso[b.flag] || Math.abs(b.desvioPct ?? 0) - Math.abs(a.desvioPct ?? 0));
}
