/**
 * cubicacion-meta — la meta de mix del aserradero y cómo va este lote contra
 * ella, más la evolución entre cubicaciones guardadas.
 *
 * Un resumen dice qué salió; una meta dice qué se buscaba. Con las dos, el
 * operario sabe si la corrida estuvo bien SIN tener que acordarse del número
 * que se puso el mes pasado. La tendencia es la misma pregunta en el tiempo:
 * ¿el mix está mejorando o me estoy acostumbrando a cortar corto?
 *
 * PURO: todo sale de `agruparPor`, la misma fuente que las tablas.
 */
import type { PiezaCubicada } from "./cubicacion";
import { agruparPor, type PrecioPt } from "./cubicacion-resumen";
import { ORDEN_TIPO, type TipoComercial } from "./cubicacion-tipo";

export interface MetaMix {
  /** Tipo comercial que se quiere maximizar (el que mejor se paga). */
  tipo: TipoComercial;
  /** Piso deseado, en % del pie tablar del lote. */
  pctMinimo: number;
}

export const META_DEFAULT: MetaMix = { tipo: "Comercial", pctMinimo: 50 };

export interface EstadoMeta {
  meta: MetaMix;
  /** % del PT que ese tipo tiene HOY en el lote. */ actual: number;
  cumple: boolean;
  /** Puntos porcentuales que faltan (0 si cumple). */ faltanPuntos: number;
  /** Pie tablar que habría que mover a ese tipo para llegar. */ faltanPt: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Tipos válidos para fijar una meta (los que el aserradero puede perseguir). */
export const TIPOS_META: readonly TipoComercial[] = ORDEN_TIPO;

/** Cómo va el lote contra la meta. Lote vacío ⇒ null (no se evalúa el aire). */
export function evaluarMeta(rows: PiezaCubicada[], meta: MetaMix, precio: PrecioPt = 0): EstadoMeta | null {
  if (rows.length === 0) return null;
  const res = agruparPor(rows, "tipo", precio);
  const grupo = res.grupos.find((g) => g.label === meta.tipo);
  const actual = r2(grupo?.pctPt ?? 0);
  const cumple = actual >= meta.pctMinimo;
  const faltanPuntos = cumple ? 0 : r2(meta.pctMinimo - actual);
  return {
    meta,
    actual,
    cumple,
    faltanPuntos,
    // Cuánto PT habría que sumar a ese tipo (a total constante) para llegar.
    faltanPt: cumple ? 0 : r2((faltanPuntos / 100) * res.total.pieTablar),
  };
}

// ─── Tendencia entre cubicaciones guardadas ────────────────────────────────

export interface PuntoTendencia {
  id: string;
  nombre: string;
  /** Fecha del trabajo (AAAA-MM-DD). */ fecha: string;
  pieTablar: number;
  /** % del PT que tuvo el tipo de la meta en ESA cubicación. */ pctMeta: number;
  /** S/ por pie tablar de esa cubicación (0 si no tenía precio). */ precioPt: number;
}

export interface Tendencia {
  puntos: PuntoTendencia[];
  /** Diferencia en puntos entre el primero y el último (positivo = mejora). */
  deltaPctMeta: number;
  /** Promedio simple del % de la meta en la serie. */ promedioPctMeta: number;
}

/**
 * Arma la serie histórica del mix, del más viejo al más nuevo (así se lee como
 * una línea de tiempo). Cada entrada trae sus propias piezas: el % se recalcula,
 * no se confía en totales guardados que podrían ser de otra versión.
 */
export function serieTendencia(
  registros: Array<{ id: string; nombre: string; fecha: string; piezas: PiezaCubicada[]; precioPt?: number }>,
  meta: MetaMix,
  maximo = 8,
): Tendencia {
  const puntos = registros
    .filter((r) => Array.isArray(r.piezas) && r.piezas.length > 0)
    .sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""))
    .slice(-maximo)
    .map<PuntoTendencia>((r) => {
      const res = agruparPor(r.piezas, "tipo", r.precioPt ?? 0);
      const g = res.grupos.find((x) => x.label === meta.tipo);
      return {
        id: r.id,
        nombre: r.nombre,
        fecha: r.fecha,
        pieTablar: r2(res.total.pieTablar),
        pctMeta: r2(g?.pctPt ?? 0),
        precioPt: res.total.pieTablar > 0 ? r2(res.total.valor / res.total.pieTablar) : 0,
      };
    });

  const primero = puntos[0]?.pctMeta ?? 0;
  const ultimo = puntos[puntos.length - 1]?.pctMeta ?? 0;
  return {
    puntos,
    deltaPctMeta: puntos.length > 1 ? r2(ultimo - primero) : 0,
    promedioPctMeta: puntos.length > 0 ? r2(puntos.reduce((a, p) => a + p.pctMeta, 0) / puntos.length) : 0,
  };
}
