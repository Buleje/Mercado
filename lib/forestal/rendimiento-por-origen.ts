/**
 * rendimiento-por-origen — ¿qué proveedor, permiso o guía me rinde más en la
 * sierra? PURO: recibe las corridas TERMINADAS ya leídas, con su consumo por
 * guía (`ForestCtpConsumo`), y agrupa.
 *
 * Reglas:
 *   1. **Lo que no se puede atribuir no se inventa.** Los m³ declarados que
 *      ninguna guía respalda (y las guías que no traen el dato con que se
 *      agrupa) van a «Sin origen» con su volumen. `materiaPrimaRef` en texto no
 *      es origen (trazabilidad = puentes N:M, regla forestal-serfor).
 *   2. **Corrida mixta = se reparte por m³.** Si una corrida comió madera de
 *      dos orígenes, sus PT se reparten en proporción al m³ de cada uno y el
 *      grupo queda `prorrateado: true`.
 *   3. **La diferencia es contra SU especie.** El tornillo rinde distinto que
 *      la capirona: un proveedor de capirona no «rinde menos» por vender
 *      capirona. La diferencia en PT es contra el promedio de la misma especie
 *      en el mismo período, y en S/ a su precio de venta.
 */
import { PT_POR_M3 } from "./cubicacion";
import { claveEspecie } from "./loth-constants";
import type { AgruparOrigenPor, FilaRendimientoOrigen, TotalRendimientoOrigen } from "./precio-troza-tipos";

const r1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

/** Por debajo de esto (m³) un resto es redondeo, no madera sin origen. */
const M3_TOLERANCIA = 0.001;
export const CLAVE_SIN_ORIGEN = "sin-origen";

/** Lo que trae la guía de ingreso para decidir su origen. */
export interface IngresoDeOrigen {
  gtfNumber: string | null;
  providerName: string | null;
  providerDocument: string | null;
  supplierId: string | null;
  originSourceNumber: string | null;
}

export interface OrigenDeConsumo {
  clave: string;
  nombre: string;
  detalle: string | null;
}

const limpio = (s: string | null | undefined): string => (s ?? "").replace(/\s+/g, " ").trim();

/** El origen de una guía según cómo se agrupa; null = la guía no trae ese dato. */
export function origenDeIngreso(w: IngresoDeOrigen, por: AgruparOrigenPor): OrigenDeConsumo | null {
  const nombre = limpio(w.providerName);
  const doc = limpio(w.providerDocument);
  if (por === "guia") {
    const gtf = limpio(w.gtfNumber);
    return gtf ? { clave: `g:${gtf.toUpperCase()}`, nombre: `GTF ${gtf}`, detalle: nombre || null } : null;
  }
  if (por === "permiso") {
    const permiso = limpio(w.originSourceNumber);
    return permiso ? { clave: `p:${permiso.toUpperCase()}`, nombre: permiso, detalle: nombre || null } : null;
  }
  if (w.supplierId) return { clave: `s:${w.supplierId}`, nombre: nombre || "Proveedor sin nombre", detalle: doc || null };
  if (doc) return { clave: `d:${doc}`, nombre: nombre || doc, detalle: doc };
  if (nombre) return { clave: `n:${nombre.toLowerCase()}`, nombre, detalle: null };
  return null;
}

export interface ConsumoParaOrigen {
  /** null = la guía no trae el dato con que se agrupa. */
  origen: OrigenDeConsumo | null;
  m3: number;
}

export interface CorridaParaOrigen {
  id: string;
  lote: string | null;
  especie: string;
  /** m³ de rollo declarados en la corrida (el denominador del libro). */
  m3Entrada: number;
  /** m³ aserrados que salieron. */
  m3Salida: number;
  consumos: readonly ConsumoParaOrigen[];
}

interface Acumulado {
  origen: OrigenDeConsumo;
  sinOrigen: boolean;
  m3: number;
  pt: number;
  corridas: Set<string>;
  lotes: Set<string>;
  prorrateado: boolean;
  especies: Map<string, string>;
  difPt: number;
  difSoles: number;
  faltaPrecio: Set<string>;
}

export interface RendimientoPorOrigen {
  filas: FilaRendimientoOrigen[];
  total: TotalRendimientoOrigen;
}

/**
 * @param precioPtDe S/ por PT de la especie (null = sin precio): sólo para la diferencia en S/.
 */
export function rendimientoPorOrigen(
  corridas: readonly CorridaParaOrigen[],
  precioPtDe: (especie: string) => number | null,
): RendimientoPorOrigen {
  /* 1. Cada corrida, partida en sus orígenes (más el resto sin origen). */
  const partes = corridas
    .filter((c) => c.m3Entrada > 0 && c.m3Salida > 0)
    .flatMap((c) => {
      const porOrigen = new Map<string, { origen: OrigenDeConsumo; m3: number }>();
      let atribuido = 0;
      for (const x of c.consumos) {
        if (!(x.m3 > 0) || !x.origen) continue;
        const prev = porOrigen.get(x.origen.clave);
        porOrigen.set(x.origen.clave, { origen: x.origen, m3: (prev?.m3 ?? 0) + x.m3 });
        atribuido += x.m3;
      }
      const consumido = c.consumos.reduce((a, x) => a + (x.m3 > 0 ? x.m3 : 0), 0);
      /* El libro manda `≤`: si lo ligado pasara a lo declarado, la base es lo ligado (nunca más del 100 %). */
      const base = Math.max(c.m3Entrada, consumido);
      const sinOrigenM3 = base - atribuido;
      const trozos: { origen: OrigenDeConsumo | null; m3: number }[] = [...porOrigen.values()];
      if (sinOrigenM3 > M3_TOLERANCIA) trozos.push({ origen: null, m3: sinOrigenM3 });
      const ptCorrida = c.m3Salida * PT_POR_M3;
      const mixta = trozos.length > 1;
      /* Se reparte sobre lo que quedó en trozos (no `base`): un resto ≤ tolerancia no se lleva PT. */
      const repartido = trozos.reduce((a, t) => a + t.m3, 0);
      return trozos.map((t) => ({ c, origen: t.origen, m3: t.m3, pt: (ptCorrida * t.m3) / repartido, mixta }));
    });

  /* 2. El promedio de cada especie (PT por m³ de rollo) en estas mismas corridas. */
  const porEspecie = new Map<string, { m3: number; pt: number }>();
  for (const p of partes) {
    const k = claveEspecie(p.c.especie);
    const e = porEspecie.get(k) ?? { m3: 0, pt: 0 };
    porEspecie.set(k, { m3: e.m3 + p.m3, pt: e.pt + p.pt });
  }

  /* 3. Agrupar. */
  const grupos = new Map<string, Acumulado>();
  const sinOrigen: OrigenDeConsumo = { clave: CLAVE_SIN_ORIGEN, nombre: "Sin origen", detalle: "m³ sin guía ligada o guía sin el dato" };
  for (const p of partes) {
    const origen = p.origen ?? sinOrigen;
    const g =
      grupos.get(origen.clave) ??
      ({
        origen,
        sinOrigen: p.origen == null,
        m3: 0,
        pt: 0,
        corridas: new Set(),
        lotes: new Set(),
        prorrateado: false,
        especies: new Map(),
        difPt: 0,
        difSoles: 0,
        faltaPrecio: new Set(),
      } satisfies Acumulado);
    const kEsp = claveEspecie(p.c.especie);
    const prom = porEspecie.get(kEsp);
    const esperado = prom && prom.m3 > 0 ? (p.m3 * prom.pt) / prom.m3 : p.pt;
    const dif = p.pt - esperado;
    const precio = precioPtDe(p.c.especie);
    if (precio != null && precio > 0) g.difSoles += dif * precio;
    else if (Math.abs(dif) >= 0.5) g.faltaPrecio.add(p.c.especie);
    g.m3 += p.m3;
    g.pt += p.pt;
    g.difPt += dif;
    g.corridas.add(p.c.id);
    if (p.c.lote) g.lotes.add(p.c.lote);
    if (p.mixta) g.prorrateado = true;
    if (!g.especies.has(kEsp)) g.especies.set(kEsp, p.c.especie);
    grupos.set(origen.clave, g);
  }

  const pct = (pt: number, m3: number): number | null => (m3 > 0 ? r1((pt / (m3 * PT_POR_M3)) * 100) : null);
  const filas: FilaRendimientoOrigen[] = [...grupos.values()]
    .map((g) => ({
      clave: g.origen.clave,
      nombre: g.origen.nombre,
      detalle: g.origen.detalle,
      sinOrigen: g.sinOrigen,
      m3Rollo: r4(g.m3),
      ptProducidos: r2(g.pt),
      rendimientoPct: pct(g.pt, g.m3),
      corridas: g.corridas.size,
      lotes: g.lotes.size,
      prorrateado: g.prorrateado,
      especies: [...g.especies.values()].sort((a, b) => a.localeCompare(b, "es")),
      difPtVsPromedio: r2(g.difPt),
      difSolesVsPromedio: g.faltaPrecio.size > 0 ? null : r2(g.difSoles),
      difSolesFalta: g.faltaPrecio.size > 0 ? `sin precio de venta de ${[...g.faltaPrecio].sort().join(", ")}` : null,
    }))
    /* Lo que más madera puso, primero; «Sin origen» siempre al final. */
    .sort((a, b) => Number(a.sinOrigen) - Number(b.sinOrigen) || b.m3Rollo - a.m3Rollo || a.nombre.localeCompare(b.nombre, "es"));

  const m3 = partes.reduce((a, p) => a + p.m3, 0);
  const pt = partes.reduce((a, p) => a + p.pt, 0);
  const lotes = new Set(partes.flatMap((p) => (p.c.lote ? [p.c.lote] : [])));
  return {
    filas,
    total: {
      m3Rollo: r4(m3),
      ptProducidos: r2(pt),
      rendimientoPct: pct(pt, m3),
      corridas: new Set(partes.map((p) => p.c.id)).size,
      lotes: lotes.size,
      m3SinOrigen: r4(partes.filter((p) => p.origen == null).reduce((a, p) => a + p.m3, 0)),
    },
  };
}
