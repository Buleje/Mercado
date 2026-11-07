/**
 * Resumen por especie de los lotes elegidos (Brandon, 2026-11-03): «un modal
 * de resumen por tipo especie y al lado una tabla de detalles del lote
 * escogido, el volumen que sobra y demás».
 *
 * Cada cifra sale de la MISMA función que pinta la tarjeta del lote —consumido,
 * producido, rinde, lo que salió, lo que queda en patio y lo que todavía admite
 * declarar—: si el resumen dijera otra cosa que la tarjeta, una de las dos
 * mentiría. Acá sólo se suma.
 */

import {
  consumidoDelLote,
  estadoDeLote,
  margenLote,
  producidoDelLote,
  rendimientoLote,
  salidaDelLote,
  volumenLibre,
  type LoteAserrio,
} from "./lotes-aserrio";
import { topeDeclarableM3 } from "./produccion-paquetes";

/** Una fila del detalle: un lote con sus cifras ya resueltas. */
export interface FilaDetalleLote {
  id: string;
  code: string;
  especie: string;
  estado: string;
  /** Rolliza que entró a la sierra. */
  consumidoM3: number;
  /** Aserrada declarada en sus corridas vivas; `null` = todavía nada. */
  producidoM3: number | null;
  rendimientoPct: number | null;
  /** Lo que ya salió del patio: despachado + reprocesado. */
  salidoM3: number;
  /** Aserrada que sigue en el patio. */
  enPatioM3: number;
  /** Sin redondear: la barra de abajo suma los pies crudos y redondea al final. */
  enPatioPt: number;
  /** Lo que la corrida todavía admite declarar hasta el tope del 56 %. */
  porDeclararM3: number;
  /** Rolliza del lote que todavía no entró a la sierra (lotes abiertos). */
  sinAserrarM3: number;
}

/** Una especie del resumen, con la suma de sus lotes. */
export interface FilaResumenEspecie {
  especie: string;
  lotes: number;
  consumidoM3: number;
  producidoM3: number;
  /** Producido ÷ consumido de los lotes que ya declararon; `null` si ninguno. */
  rendimientoPct: number | null;
  salidoM3: number;
  enPatioM3: number;
  enPatioPt: number;
  porDeclararM3: number;
  sinAserrarM3: number;
}

export interface ResumenPorEspecie {
  especies: FilaResumenEspecie[];
  total: FilaResumenEspecie;
}

const r4 = (v: number) => Math.round(v * 10000) / 10000;

/**
 * Lo que el lote todavía admite declarar. `margenLote` sólo mira las corridas
 * a medio declarar; una que consumió y no declaró NADA (el 28-2026 del SNIFFS)
 * tiene el tope entero libre —la tarjeta la cuenta como «sin declarar acá»—, y
 * mostrarle «—» diría que no le sobra nada.
 */
function porDeclararDe(lote: LoteAserrio): number {
  if (lote.status === "abierto") return 0;
  const medio = margenLote(lote);
  if (medio) return r4(medio.margenM3);
  const c = lote.produccion;
  const entrada = Number(c?.volumeInputM3 ?? 0);
  const sinDeclarar = c?.viva && c.quantity == null && (c.unit ?? "m3") === "m3" && (c.status ?? "registrado") === "registrado";
  return sinDeclarar && entrada > 0 ? r4(topeDeclarableM3(entrada)) : 0;
}

export function filaDetalleLote(lote: LoteAserrio): FilaDetalleLote {
  const salida = salidaDelLote(lote);
  const enPatioM3 = lote.madera ? Number(lote.madera.m3Disponible) || 0 : (salida?.enPatio ?? 0);
  return {
    id: lote.id,
    code: lote.code,
    especie: lote.speciesCommon.trim() || "Sin especie",
    estado: estadoDeLote(lote).label,
    consumidoM3: consumidoDelLote(lote),
    producidoM3: producidoDelLote(lote),
    rendimientoPct: rendimientoLote(lote),
    salidoM3: salida?.salido ?? 0,
    enPatioM3: r4(enPatioM3),
    enPatioPt: lote.madera ? Number(lote.madera.ptDisponible) || 0 : 0,
    porDeclararM3: porDeclararDe(lote),
    sinAserrarM3: lote.status === "abierto" ? volumenLibre(lote) : 0,
  };
}

/** Clave de agrupación: «Tornillo» y «tornillo » son la misma especie. */
const claveEspecie = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

function sumar(especie: string, filas: readonly FilaDetalleLote[]): FilaResumenEspecie {
  let consumido = 0;
  let producido = 0;
  let consumidoConRend = 0;
  let salido = 0;
  let enPatio = 0;
  let pt = 0;
  let porDeclarar = 0;
  let sinAserrar = 0;
  for (const f of filas) {
    consumido += f.consumidoM3;
    salido += f.salidoM3;
    enPatio += f.enPatioM3;
    pt += f.enPatioPt;
    porDeclarar += f.porDeclararM3;
    sinAserrar += f.sinAserrarM3;
    /* El rinde del grupo es el de los lotes que ya declararon: un lote recién
       aserrado sin producción no es un 0 %, es «todavía no se sabe». */
    if (f.producidoM3 != null && f.consumidoM3 > 0) {
      producido += f.producidoM3;
      consumidoConRend += f.consumidoM3;
    }
  }
  return {
    especie,
    lotes: filas.length,
    consumidoM3: r4(consumido),
    producidoM3: r4(producido),
    rendimientoPct: consumidoConRend > 0 ? Math.round((producido / consumidoConRend) * 1000) / 10 : null,
    salidoM3: r4(salido),
    enPatioM3: r4(enPatio),
    enPatioPt: Math.round(pt),
    porDeclararM3: r4(porDeclarar),
    sinAserrarM3: r4(sinAserrar),
  };
}

/** Las filas agrupadas por especie (la de más volumen consumido primero) y el total. */
export function resumenPorEspecie(filas: readonly FilaDetalleLote[]): ResumenPorEspecie {
  const grupos = new Map<string, { nombre: string; filas: FilaDetalleLote[] }>();
  for (const f of filas) {
    const k = claveEspecie(f.especie);
    const g = grupos.get(k) ?? { nombre: f.especie, filas: [] };
    g.filas.push(f);
    grupos.set(k, g);
  }
  const especies = [...grupos.values()]
    .map((g) => sumar(g.nombre, g.filas))
    .sort((a, b) => b.consumidoM3 - a.consumidoM3 || a.especie.localeCompare(b.especie, "es"));
  return { especies, total: sumar("Total", filas) };
}
