/**
 * ctp-radar — el BALANCE de la cadena de custodia que el radar dibujaba a medias.
 *
 * El grafo ya traía el volumen de cada arista (`consumos.volumeM3`,
 * `origenes.quantity`) pero el radar sólo miraba SI existía la conexión, no
 * CUÁNTO. Consecuencia: un ingreso de 10 m³ con 1 m³ consumido se pintaba igual
 * que uno agotado, y un despacho con la mitad del volumen sin atribuir contaba
 * como "cadena completa".
 *
 * Acá se calcula, por nodo:
 *   · ingreso  → cuánto se consumió y cuánto queda SIN ATRIBUIR (el `sinAtribuir`
 *     de los invariantes I1–I5, que es ≤ y nunca ==),
 *   · corrida  → materia prima que entró, cuánto de lo producido ya salió,
 *   · despacho → qué parte de lo despachado tiene origen documentado.
 *
 * PURO y client-safe.
 */

import type { TrazaGrafo } from "@/lib/db/forest-ctp.db";

/** Tolerancia para comparar decimales de volumen (evita "0.0000001 sin atribuir"). */
const EPS = 1e-4;

export type RadarEstado = "ok" | "parcial" | "warn" | "muted";

export interface RadarBalance {
  id: string;
  /** Volumen/cantidad propia del nodo (lo que declara la línea). */
  total: number;
  /** Parte con respaldo: consumida (ingreso) o atribuida (corrida/despacho). */
  cubierto: number;
  /** total − cubierto, nunca negativo. */
  sinAtribuir: number;
  /** 0–100. Sin total declarado ⇒ null (no se inventa un porcentaje). */
  pct: number | null;
  estado: RadarEstado;
}

export interface RadarAnalisis {
  ingresos: Map<string, RadarBalance>;
  corridas: Map<string, RadarBalance>;
  despachos: Map<string, RadarBalance>;
  /** Estado por id, para pintar el nodo. */
  estado: Map<string, RadarEstado>;
  /** Nodos con hueco (warn) o atribución parcial. */
  warnIds: Set<string>;
  parcialIds: Set<string>;
  totales: {
    ingresoM3: number;
    consumidoM3: number;
    /** m³ de ingresos que todavía no entraron a ninguna corrida. */
    stockSinConsumirM3: number;
    despachosCompletos: number;
    despachosHueco: number;
    despachosParciales: number;
    corridasHuerfanas: number;
    citesCount: number;
    /** % de despachos que trazan de punta a punta (por conteo, no por volumen). */
    trazabilidadPct: number | null;
    /** % del volumen ingresado que ya fue consumido por producción. */
    consumoPct: number | null;
  };
}

const round = (n: number, d = 4): number => Number(n.toFixed(d));

function balance(id: string, total: number, cubierto: number, opts: { vacioEsMuted?: boolean } = {}): RadarBalance {
  const t = Number.isFinite(total) ? Math.max(0, total) : 0;
  const c = Number.isFinite(cubierto) ? Math.max(0, cubierto) : 0;
  const sin = round(Math.max(0, t - c));
  const pct = t > EPS ? Math.min(100, Math.round((c / t) * 100)) : null;

  let estado: RadarEstado;
  if (c <= EPS) estado = opts.vacioEsMuted ? "muted" : "warn";
  else if (sin > EPS) estado = "parcial";
  else estado = "ok";

  return { id, total: round(t), cubierto: round(Math.min(c, t)), sinAtribuir: sin, pct, estado };
}

/**
 * Analiza el grafo con los volúmenes de las aristas.
 *
 * Criterios:
 *  - **Ingreso**: cubierto = Σ de lo consumido por producción. Un ingreso sin
 *    consumir NO es un error (es stock en patio) → `muted`, no `warn`.
 *  - **Corrida**: sin materia prima atribuida = `warn` (rompe la cadena hacia
 *    atrás). Con materia prima, se mide qué parte de lo producido ya salió.
 *  - **Despacho**: sin origen = `warn`; con origen incompleto = `parcial`.
 */
export function analizarRadar(g: TrazaGrafo): RadarAnalisis {
  const consumidoPorIngreso = new Map<string, number>();
  const materiaPorCorrida = new Map<string, number>();
  for (const c of g.consumos) {
    const v = Number(c.volumeM3) || 0;
    consumidoPorIngreso.set(c.from, (consumidoPorIngreso.get(c.from) ?? 0) + v);
    materiaPorCorrida.set(c.to, (materiaPorCorrida.get(c.to) ?? 0) + v);
  }

  const salidaPorCorrida = new Map<string, number>();
  const origenPorDespacho = new Map<string, number>();
  const corridasDeDespacho = new Map<string, string[]>();
  for (const o of g.origenes) {
    const q = Number(o.quantity) || 0;
    salidaPorCorrida.set(o.from, (salidaPorCorrida.get(o.from) ?? 0) + q);
    origenPorDespacho.set(o.to, (origenPorDespacho.get(o.to) ?? 0) + q);
    const arr = corridasDeDespacho.get(o.to) ?? [];
    arr.push(o.from);
    corridasDeDespacho.set(o.to, arr);
  }

  const ingresos = new Map<string, RadarBalance>();
  for (const w of g.ingresos) {
    // Un ingreso sin consumir es stock en patio, no un hueco de la cadena.
    ingresos.set(w.id, balance(w.id, Number(w.volumeM3) || 0, consumidoPorIngreso.get(w.id) ?? 0, { vacioEsMuted: true }));
  }

  const corridas = new Map<string, RadarBalance>();
  for (const c of g.corridas) {
    const materia = materiaPorCorrida.get(c.id) ?? 0;
    if (materia <= EPS) {
      // Sin materia prima: la cadena se corta hacia atrás, sin importar lo producido.
      corridas.set(c.id, { id: c.id, total: Number(c.quantity) || 0, cubierto: 0, sinAtribuir: round(Number(c.quantity) || 0), pct: 0, estado: "warn" });
      continue;
    }
    // Con materia prima: se mide qué parte de lo producido ya salió en despachos.
    corridas.set(c.id, balance(c.id, Number(c.quantity) || 0, salidaPorCorrida.get(c.id) ?? 0, { vacioEsMuted: true }));
  }

  const despachos = new Map<string, RadarBalance>();
  for (const d of g.despachos) {
    const origen = origenPorDespacho.get(d.id) ?? 0;
    const base = balance(d.id, Number(d.quantity) || 0, origen);
    // Aunque el volumen cuadre, si alguna corrida de origen no tiene materia
    // prima la cadena no llega hasta la GTF: sigue siendo un hueco.
    const cadenaRota = (corridasDeDespacho.get(d.id) ?? []).some((cid) => (materiaPorCorrida.get(cid) ?? 0) <= EPS);
    despachos.set(d.id, cadenaRota ? { ...base, estado: "warn" } : base);
  }

  const estado = new Map<string, RadarEstado>();
  const warnIds = new Set<string>();
  const parcialIds = new Set<string>();
  for (const m of [ingresos, corridas, despachos]) {
    for (const [id, b] of m) {
      estado.set(id, b.estado);
      if (b.estado === "warn") warnIds.add(id);
      if (b.estado === "parcial") parcialIds.add(id);
    }
  }

  const ingresoM3 = round([...ingresos.values()].reduce((a, b) => a + b.total, 0));
  const consumidoM3 = round([...ingresos.values()].reduce((a, b) => a + b.cubierto, 0));
  const despachosArr = [...despachos.values()];

  return {
    ingresos,
    corridas,
    despachos,
    estado,
    warnIds,
    parcialIds,
    totales: {
      ingresoM3,
      consumidoM3,
      stockSinConsumirM3: round(Math.max(0, ingresoM3 - consumidoM3)),
      despachosCompletos: despachosArr.filter((b) => b.estado === "ok").length,
      despachosHueco: despachosArr.filter((b) => b.estado === "warn").length,
      despachosParciales: despachosArr.filter((b) => b.estado === "parcial").length,
      corridasHuerfanas: [...corridas.values()].filter((b) => b.estado === "warn").length,
      citesCount: g.ingresos.filter((w) => w.cites).length,
      trazabilidadPct: g.despachos.length
        ? Math.round((despachosArr.filter((b) => b.estado === "ok").length / g.despachos.length) * 100)
        : null,
      consumoPct: ingresoM3 > EPS ? Math.round((consumidoM3 / ingresoM3) * 100) : null,
    },
  };
}

/** Grosor de la arista según su volumen (1,2–5 px), para leer el flujo de un vistazo. */
export function grosorArista(valor: number, maximo: number): number {
  if (!Number.isFinite(valor) || valor <= 0 || maximo <= 0) return 1.2;
  return Number((1.2 + (Math.min(valor, maximo) / maximo) * 3.8).toFixed(2));
}

export type RadarOrden = "linea" | "volumen" | "estado";

/** Peso de orden: primero lo que hay que mirar. */
const PESO_ESTADO: Record<RadarEstado, number> = { warn: 0, parcial: 1, ok: 2, muted: 3 };

/** Ordena una columna del radar sin perder el índice original. */
export function ordenarNodos<T extends { id: string }>(
  nodos: T[],
  orden: RadarOrden,
  balances: Map<string, RadarBalance>,
  volumenDe: (n: T) => number,
): T[] {
  if (orden === "linea") return nodos;
  const copia = [...nodos];
  if (orden === "volumen") return copia.sort((a, b) => volumenDe(b) - volumenDe(a));
  return copia.sort((a, b) => {
    const ea = balances.get(a.id)?.estado ?? "ok";
    const eb = balances.get(b.id)?.estado ?? "ok";
    return PESO_ESTADO[ea] - PESO_ESTADO[eb] || volumenDe(b) - volumenDe(a);
  });
}

/** CSV del grafo con sus volúmenes — para el informe o para cruzar en Excel. */
export function radarToCsv(g: TrazaGrafo, a: RadarAnalisis): string {
  const filas: string[] = ["tipo,id,etiqueta,detalle,total,cubierto,sin_atribuir,pct,estado"];
  const esc = (s: unknown) => {
    const t = String(s ?? "");
    return t.includes(",") || t.includes('"') ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const push = (tipo: string, id: string, etiqueta: string, detalle: string, b?: RadarBalance) =>
    filas.push(
      [tipo, id, esc(etiqueta), esc(detalle), b?.total ?? "", b?.cubierto ?? "", b?.sinAtribuir ?? "", b?.pct ?? "", b?.estado ?? ""].join(","),
    );

  for (const w of g.ingresos) push("ingreso", w.id, `GTF ${w.gtf || "—"}`, w.species ?? "", a.ingresos.get(w.id));
  for (const c of g.corridas) push("corrida", c.id, `Corrida #${c.lineNo}`, c.label ?? "", a.corridas.get(c.id));
  for (const d of g.despachos) push("despacho", d.id, `Despacho #${d.lineNo}`, d.destino ?? d.label ?? "", a.despachos.get(d.id));

  filas.push("");
  filas.push("arista,desde,hasta,valor");
  for (const c of g.consumos) filas.push(["consumo", c.from, c.to, c.volumeM3].join(","));
  for (const o of g.origenes) filas.push(["origen", o.from, o.to, o.quantity].join(","));
  return filas.join("\n");
}
