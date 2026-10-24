/**
 * Trozas, aserrada y pies tablares de una planta (superadmin, 17-10), armados
 * con las MISMAS funciones que el balance de capacidad del libro
 * (`armarBalance`, `trozasDeFuente`, `corridasDeFuente`): si el libro dice
 * 20 m³ de aserrada, acá también.
 *
 * Reglas que no se negocian:
 *  · La aserrada suma SÓLO corridas en m³ con saldo. Sumar `totales.volumen`
 *    de `productosDisponibles` o `saldos().productos.stock` mezcla unidades y
 *    lo ya usado: fue el «62 vs 20».
 *  · Los pies tablares son SIEMPRE derivados (`ptDeLinea`): la rolliza, a lo
 *    que rendiría aserrada al 56 %; lo aserrado, m³ × 424. Se muestran con «≈».
 */
import {
  armarBalance,
  corridasDeFuente,
  SIN_FILTROS,
  trozasDeFuente,
  type CorridaDisponible,
  type EntradaCapacidad,
  type FuenteDeCapacidad,
} from "@/lib/forestal/capacidad-de-planta";
import { ptDeLinea } from "@/lib/forestal/plata-de-guia";
import type { AserradaPlanta, PiezasM3, ProductoDisponible, TrozasPlanta } from "./tipos";

const r4 = (n: number): number => Math.round(n * 10_000) / 10_000;

/** ≈ pies tablares aserrables de rolliza (56 % × 424). */
export const ptDeRolliza = (m3: number): number => ptDeLinea({ volumeM3: m3, productType: "rolliza" });

/** ≈ pies tablares de madera ya aserrada (m³ × 424). */
export const ptDeAserrada = (m3: number): number => ptDeLinea({ volumeM3: m3, productType: "aserrada" });

function fuente(fuentes: readonly FuenteDeCapacidad[], clave: FuenteDeCapacidad["clave"]): FuenteDeCapacidad {
  const f = fuentes.find((x) => x.clave === clave);
  /* `armarBalance` devuelve siempre las cinco fuentes: si falta una, cambió su contrato. */
  if (!f) throw new Error(`armarBalance sin la fuente «${clave}»`);
  return f;
}

/**
 * Las trozas de la planta, con el mismo balance que la tarjeta de Saldos.
 *
 * `porRecepcionar.m3` es el número de la tarjeta «Por recepcionar» del libro:
 * piezas de guías sin recibir MÁS los ingresos sin validar que no tienen
 * piezas cargadas (`pendienteSinPiezasM3`, que va aparte sólo para contarlo).
 * `porRecepcionar.piezas` cuenta sólo las piezas: lo otro no tiene piezas.
 */
export function trozasPlanta(entrada: EntradaCapacidad, varadas: PiezasM3 & { dias: number }): TrozasPlanta {
  const balance = armarBalance(entrada, SIN_FILTROS);
  const patio = fuente(balance.fuentes, "patio");
  const porRecepcionar = fuente(balance.fuentes, "porRecepcionar");
  return {
    enPatio: { piezas: patio.filas, m3: patio.m3, ptAserrable: ptDeRolliza(patio.m3) },
    porRecepcionar: {
      piezas: trozasDeFuente("porRecepcionar", entrada.patio, SIN_FILTROS).length,
      m3: porRecepcionar.m3,
    },
    pendienteSinPiezasM3: entrada.estado?.pendientes === "error" ? 0 : r4(entrada.pendienteSinPiezasM3),
    varadas: { piezas: varadas.piezas, m3: r4(varadas.m3), dias: varadas.dias },
  };
}

/**
 * La aserrada disponible hoy (foto del depósito, sin período), con el mismo
 * balance que la fila «Productos» de la capacidad.
 *
 * @param corridas `productosDisponibles(...).corridas` (sin «ya usado»).
 * @param stockLibroM3 Σ `saldos().productos.stock`: sólo para conciliar.
 */
export function aserradaPlanta(corridas: readonly CorridaDisponible[], stockLibroM3: number): AserradaPlanta {
  const balance = armarBalance(
    { patio: [], lotes: [], corridas, stockLibroM3, pendienteSinPiezasM3: 0 },
    SIN_FILTROS,
  );
  const productos = fuente(balance.fuentes, "productos");
  const enM3 = corridasDeFuente(corridas, SIN_FILTROS);

  const grupos = new Map<string, ProductoDisponible>();
  for (const c of enM3) {
    const producto = c.producto?.trim() || "Sin producto";
    const especie = c.especie?.trim() || null;
    const clave = `${producto}|${especie ?? ""}`;
    const g = grupos.get(clave) ?? { producto, especie, m3: 0, pt: 0, corridas: 0, paquetes: 0 };
    g.m3 = r4(g.m3 + c.disponible);
    g.corridas += 1;
    g.paquetes += c.paquetes.length;
    grupos.set(clave, g);
  }
  const porProducto = [...grupos.values()]
    .map((g) => ({ ...g, pt: ptDeAserrada(g.m3) }))
    .sort((a, b) => b.m3 - a.m3);

  const otra = new Map<string, { unidad: string; cantidad: number; corridas: number }>();
  for (const c of corridas) {
    if (c.unidad === "m3" || !(c.disponible > 0)) continue;
    const g = otra.get(c.unidad) ?? { unidad: c.unidad, cantidad: 0, corridas: 0 };
    g.cantidad = r4(g.cantidad + c.disponible);
    g.corridas += 1;
    otra.set(c.unidad, g);
  }

  return {
    disponibleM3: productos.m3,
    disponiblePt: ptDeAserrada(productos.m3),
    corridas: productos.filas,
    paquetes: enM3.reduce((a, c) => a + c.paquetes.length, 0),
    enOtraUnidad: [...otra.values()].sort((a, b) => b.cantidad - a.cantidad),
    porProducto,
    libroFirmaM3: r4(stockLibroM3),
  };
}
