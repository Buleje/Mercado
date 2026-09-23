/**
 * El resumen de una o varias jornadas de producción, en tres cortes.
 *
 * - **Por especie** (Brandon, 2026-09-11): todos los días marcados juntos,
 *   especie primero y producto adentro — el corte del Cuadro Resumen del LO-CTP.
 * - **Por día** (Brandon, 2026-09-23: *«un resumen detallado según los días,
 *   por ejemplo el lunes tantas piezas, m³ y otros detalles, el martes lo
 *   mismo»*).
 * - **Por día, especie y tipo** (el mismo pedido: *«ese mismo de días pero
 *   detallado por tipo y especie, separado en cada fila»*).
 *
 * Los tres salen de UNA pasada sobre las corridas. El PT del DÍA es el mismo
 * que dice su casillero en la tira (`redondeo(m³ del día × 424)`, en
 * `jornadasDesdeFilas`) y se reparte hacia especies y productos por el mayor
 * resto (`repartirPt`); la semana y cada especie son SUMAS de eso. Si cada
 * corte redondeara su propio m³, el lunes y el martes sumarían 1 PT más que el
 * total de la semana — o el renglón del lunes diría otro PT que su casillero:
 * cifras contiguas que no cierran enseñan a desconfiar de la tabla entera.
 *
 * Criterios (los de siempre del libro, también en `detalle-de-jornada.ts`):
 *  · el m³ sólo se suma si el asiento está en m³ — convertir otra unidad a ojo
 *    inventaría la producción del día;
 *  · las piezas de la corrida son las de sus paquetes; el `pieces` del asiento
 *    sólo si no tiene paquetes con cantidad;
 *  · lo declarado que los paquetes NO detallan (L1: `Σ paquetes ≤ quantity`)
 *    tiene su renglón «Sin producto declarado», con tolerancia de un litro;
 *  · las especies se juntan por `claveEspecie`: «TORNILLO» y «Tornillo» son una.
 *
 * PURO y client-safe: lo arma el servidor (`ForestCtpDB.resumenDeJornadas`) y
 * se prueba sin base.
 */

import { PT_POR_M3 } from "@/lib/forestal/cubicacion";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { repartirPt } from "@/lib/forestal/detalle-de-jornada";

export const SIN_ESPECIE = "Sin especie declarada";
export const SIN_PRODUCTO = "Sin producto declarado";

/** Una corrida como la lee el servidor, ya con su día y su m³ en m³. */
export interface CorridaParaResumen {
  id: string;
  lineNo: number;
  /** `YYYY-MM-DD`. */
  dia: string;
  especie: string | null;
  linea: string | null;
  /** De quién es la madera, como la nombra el libro (`etiquetaDeDueno`, o `SIN_DUENO`). */
  dueno: string;
  /** Volumen declarado, en m³ (0 si el asiento está en otra unidad). */
  m3: number;
  /** `pieces` del asiento. */
  piezasAsiento: number;
  materiaPrimaRef: string | null;
  paquetes: { productType: string | null; cantidad: number | null; volumenM3: number }[];
}

export interface CifrasDeResumen {
  piezas: number;
  m3: number;
  pt: number;
}

export interface ProductoDeResumen extends CifrasDeResumen {
  producto: string;
}

export interface EspecieDeResumen extends CifrasDeResumen {
  especie: string;
  corridas: number;
  productos: ProductoDeResumen[];
}

export interface DiaDeResumen extends CifrasDeResumen {
  dia: string;
  corridas: number;
  /** Las líneas de producción distintas de ese día, no vacías. */
  lineas: string[];
  /** Los dueños de ese día (de lo que entró al resumen), en orden de aparición. */
  duenos: string[];
  especies: EspecieDeResumen[];
}

export interface ResumenDeJornadas {
  dias: string[];
  corridas: {
    id: string;
    lineNo: number;
    dia: string;
    especie: string | null;
    linea: string | null;
    dueno: string;
    m3: number;
    piezas: number;
    materiaPrimaRef: string | null;
    paquetes: number;
  }[];
  porEspecie: EspecieDeResumen[];
  /** Un renglón por día marcado que tuvo corridas, en orden de fecha. */
  porDia: DiaDeResumen[];
  totales: { corridas: number } & CifrasDeResumen;
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;
/** Un litro: la tolerancia del aserradero, no la del punto flotante. */
const UN_LITRO = 0.001;

interface Hoja {
  piezas: number;
  m3: number;
}

/**
 * Qué dueños entran de cada día, cuando no entran todos (Brandon, 2026-09-23:
 * *«que se pueda elegir del día que tiene 2, sólo uno o los dos»*). Un día que
 * no está en el mapa entra entero.
 */
export type DuenosPorDia = Readonly<Record<string, readonly string[]>>;

export function resumirJornadas(
  dias: readonly string[],
  todas: readonly CorridaParaResumen[],
  soloDuenos: DuenosPorDia = {},
): ResumenDeJornadas {
  const corridas = todas.filter((c) => {
    const elegidos = soloDuenos[c.dia];
    return !elegidos || elegidos.includes(c.dueno);
  });
  /* día → claveEspecie → producto → piezas y m³. La hoja es la fila más chica. */
  const hojas = new Map<string, Map<string, Map<string, Hoja>>>();
  /* Cuántas corridas y piezas tiene cada día·especie: las piezas de la especie
     son las de la corrida, no la suma de productos (el resto sin detallar sólo
     suma piezas si la corrida no tiene paquetes). */
  const porDiaEspecie = new Map<string, { corridas: number; piezas: number; m3: number }>();
  const nombreDe = new Map<string, string>();
  const lineasDe = new Map<string, Set<string>>();
  const duenosDe = new Map<string, Set<string>>();
  const salida: ResumenDeJornadas["corridas"] = [];

  for (const c of corridas) {
    const piezasPaquetes = c.paquetes.reduce((a, p) => a + (p.cantidad ?? 0), 0);
    const piezas = piezasPaquetes > 0 ? piezasPaquetes : c.piezasAsiento;
    const nombre = (c.especie ?? "").trim() || SIN_ESPECIE;
    const clave = claveEspecie(nombre) || nombre;
    if (!nombreDe.has(clave)) nombreDe.set(clave, nombre);

    salida.push({
      id: c.id,
      lineNo: c.lineNo,
      dia: c.dia,
      especie: c.especie,
      linea: c.linea,
      dueno: c.dueno,
      m3: r4(c.m3),
      piezas,
      materiaPrimaRef: c.materiaPrimaRef,
      paquetes: c.paquetes.length,
    });

    const linea = c.linea?.trim();
    if (linea) lineasDe.set(c.dia, (lineasDe.get(c.dia) ?? new Set()).add(linea));
    duenosDe.set(c.dia, (duenosDe.get(c.dia) ?? new Set()).add(c.dueno));

    const kDe = `${c.dia}|${clave}`;
    const de = porDiaEspecie.get(kDe) ?? { corridas: 0, piezas: 0, m3: 0 };
    de.corridas += 1;
    de.piezas += piezas;
    /* El m³ de la especie es el DECLARADO, como el del casillero; los
       productos lo detallan (y lo no detallado tiene su renglón). */
    de.m3 += c.m3;
    porDiaEspecie.set(kDe, de);

    const delDia = hojas.get(c.dia) ?? new Map<string, Map<string, Hoja>>();
    const deLaEspecie = delDia.get(clave) ?? new Map<string, Hoja>();
    const sumar = (producto: string, piezasP: number, m3P: number) => {
      const h = deLaEspecie.get(producto) ?? { piezas: 0, m3: 0 };
      h.piezas += piezasP;
      h.m3 += m3P;
      deLaEspecie.set(producto, h);
    };
    let detallado = 0;
    for (const p of c.paquetes) {
      sumar((p.productType ?? "").trim() || SIN_PRODUCTO, p.cantidad ?? 0, p.volumenM3);
      detallado += p.volumenM3;
    }
    const sinDetallar = c.m3 - detallado;
    /* Las piezas del resto sólo si el asiento las declaró y los paquetes no:
       contar dos veces las mismas piezas sería peor que no contarlas. */
    if (sinDetallar > UN_LITRO) sumar(SIN_PRODUCTO, c.paquetes.length === 0 ? piezas : 0, sinDetallar);
    delDia.set(clave, deLaEspecie);
    hojas.set(c.dia, delDia);
  }

  const porM3 = <T extends { m3: number }>(a: T, b: T) => b.m3 - a.m3;
  const sumaPt = (xs: readonly { pt: number }[]) => xs.reduce((a, x) => a + x.pt, 0);

  /* ── Por día (y adentro, especie → producto) ── */
  const porDia: DiaDeResumen[] = [...hojas.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([dia, especies]) => {
      const base = [...especies.entries()]
        .map(([clave, productos]) => {
          const de = porDiaEspecie.get(`${dia}|${clave}`) ?? { corridas: 0, piezas: 0, m3: 0 };
          const prods = [...productos.entries()]
            .map(([producto, h]) => ({ producto, piezas: h.piezas, m3: h.m3 }))
            .sort(porM3);
          return { clave, de, prods };
        })
        .sort((a, b) => b.de.m3 - a.de.m3);
      const m3Dia = base.reduce((a, e) => a + e.de.m3, 0);
      /* El PT del casillero de ese día, repartido. */
      const ptsEspecie = repartirPt(base.map((e) => e.de.m3), Math.round(m3Dia * PT_POR_M3));
      const lista: EspecieDeResumen[] = base.map(({ clave, de, prods }, i) => {
        const ptsProducto = repartirPt(prods.map((p) => p.m3), ptsEspecie[i] ?? 0);
        return {
          especie: nombreDe.get(clave) ?? clave,
          corridas: de.corridas,
          piezas: de.piezas,
          m3: r4(de.m3),
          pt: ptsEspecie[i] ?? 0,
          productos: prods.map((p, j) => ({ ...p, m3: r4(p.m3), pt: ptsProducto[j] ?? 0 })),
        };
      });
      return {
        dia,
        corridas: lista.reduce((a, e) => a + e.corridas, 0),
        lineas: [...(lineasDe.get(dia) ?? [])].sort(),
        duenos: [...(duenosDe.get(dia) ?? [])],
        especies: lista,
        piezas: lista.reduce((a, e) => a + e.piezas, 0),
        m3: r4(m3Dia),
        pt: sumaPt(lista),
      };
    });

  /* ── Por especie: la SUMA de las hojas de cada día, nunca un redondeo propio ── */
  const acumEspecie = new Map<string, EspecieDeResumen & { prods: Map<string, ProductoDeResumen> }>();
  for (const d of porDia) {
    for (const e of d.especies) {
      const clave = claveEspecie(e.especie) || e.especie;
      const acc = acumEspecie.get(clave) ?? { especie: e.especie, corridas: 0, piezas: 0, m3: 0, pt: 0, productos: [], prods: new Map() };
      acc.corridas += e.corridas;
      acc.piezas += e.piezas;
      acc.m3 += e.m3;
      acc.pt += e.pt;
      for (const p of e.productos) {
        const q = acc.prods.get(p.producto) ?? { producto: p.producto, piezas: 0, m3: 0, pt: 0 };
        q.piezas += p.piezas;
        q.m3 += p.m3;
        q.pt += p.pt;
        acc.prods.set(p.producto, q);
      }
      acumEspecie.set(clave, acc);
    }
  }
  const porEspecie: EspecieDeResumen[] = [...acumEspecie.values()]
    .map(({ prods, ...e }) => ({
      ...e,
      m3: r4(e.m3),
      productos: [...prods.values()].map((p) => ({ ...p, m3: r4(p.m3) })).sort(porM3),
    }))
    .sort(porM3);

  return {
    dias: [...dias],
    corridas: salida,
    porEspecie,
    porDia,
    totales: {
      corridas: corridas.length,
      piezas: porDia.reduce((a, d) => a + d.piezas, 0),
      m3: r4(porDia.reduce((a, d) => a + d.m3, 0)),
      pt: sumaPt(porDia),
    },
  };
}

// ── Elegir dueños de los días marcados ──────────────────────────────────────

/**
 * Saca o devuelve un dueño de un día marcado. Nunca deja el día sin ninguno:
 * un día marcado con cero dueños sumaría nada y parecería un día vacío — para
 * eso está desmarcar el día.
 */
export function alternarDuenoExcluido(
  excluidos: readonly string[],
  todos: readonly string[],
  dueno: string,
): string[] {
  if (excluidos.includes(dueno)) return excluidos.filter((d) => d !== dueno);
  const next = [...excluidos, dueno];
  return todos.every((d) => next.includes(d)) ? [...excluidos] : next;
}

/** El filtro para el resumen: sólo los días marcados a los que se les sacó algún dueño. */
export function filtroDeDuenos(
  marcados: readonly string[],
  duenosDe: Readonly<Record<string, readonly string[]>>,
  excluidosDe: Readonly<Record<string, readonly string[]>>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const dia of marcados) {
    const fuera = excluidosDe[dia] ?? [];
    if (fuera.length === 0) continue;
    out[dia] = (duenosDe[dia] ?? []).filter((d) => !fuera.includes(d));
  }
  return out;
}
