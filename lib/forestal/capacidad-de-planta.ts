/**
 * Cuánto producto puede salir de todo lo que la planta tiene hoy, y de qué está
 * hecho ese número.
 *
 * Vive fuera del componente porque tres pantallas lo leen —la tarjeta, el Excel
 * y el PDF— y un cálculo que se rehace en cada una diverge a la primera columna
 * nueva. Todo acá es PURO: entra lo que ya se pidió (patio, lotes, productos),
 * sale el balance y las filas que lo justifican.
 *
 * Las cuatro fuentes, de la más lejana a la más lista:
 *
 *   1. POR RECEPCIONAR — madera anotada en el libro que todavía no llegó o no
 *      se validó. Es la más incierta: puede no aparecer.
 *   2. TROZAS EN PATIO — rolliza libre, sin lote y sin bloqueo.
 *   3. LOTES — lo que sus corridas todavía admiten declarar bajo el tope.
 *   4. PRODUCTOS TERMINADOS — stock ya aserrado, listo para despachar.
 *
 * ⚠️ LO QUE ESTE NÚMERO NO ES. Las tres primeras son rolliza; la cuarta es
 * producto. Para poder sumarlas, la rolliza se convierte al 56 % (ADR-358), que
 * es el TECHO del rendimiento, no lo que la sierra saca de verdad. Así que el
 * total es una COTA MÁXIMA: «no más de esto», nunca «esto es lo que va a
 * haber».
 */

import { RENDIMIENTO_META } from "@/lib/forestal/loctp-catalogos";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";

export type ClaveFuente = "porRecepcionar" | "patio" | "lotes" | "productos";

export interface FuenteDeCapacidad {
  clave: ClaveFuente;
  label: string;
  /** m³ tal como están hoy (rolliza o producto, según la fuente). */
  m3: number;
  /** m³ de producto que representan. Rolliza convertida al 56 %; producto, igual. */
  enProducto: number;
  /** `true` si su valor pasó por la conversión — la tarjeta lo marca. */
  convertido: boolean;
  detalle?: string;
  /** Cuántas filas hay detrás. `0` = el botón de detalle no tiene qué abrir. */
  filas: number;
  /**
   * Por qué esta fuente no puede honrar los filtros elegidos, si es el caso.
   * Se muestra en vez de un cero mudo: un cero sin explicación se lee como
   * «no hay», y acá significa «no se puede saber».
   */
  noAtribuible?: string;
}

export interface BalanceCapacidad {
  fuentes: FuenteDeCapacidad[];
  totalProducto: number;
}

/**
 * Filtros encadenados. Cada uno acota al siguiente: elegido un permiso, sólo se
 * ofrecen las especies que tienen madera de ESE permiso; elegida la especie,
 * sólo las guías que la traen.
 */
export interface FiltrosCapacidad {
  permiso?: string;
  especie?: string;
  guia?: string;
}

export const SIN_FILTROS: FiltrosCapacidad = {};

/** ¿Hay algún filtro puesto? */
export function hayFiltro(f: FiltrosCapacidad): boolean {
  return Boolean(f.permiso || f.especie || f.guia);
}

const r4 = (v: number) => Math.round(v * 10000) / 10000;
const txt = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => Number(v ?? 0) || 0;

/** El lote tal como lo arma Saldos — el mismo objeto que ya usan el CSV y el PDF. */
export interface LoteDeCapacidad {
  code: string;
  permisos: string[];
  especie: string | null;
  status: string;
  consumidoM3: number;
  esperado56M3: number;
  producidoM3: number | null;
  restaM3: number | null;
  apartadoM3: number;
  piezas: number;
}

export interface ProductoDeCapacidad {
  producto: string;
  producido: number;
  despachado: number;
  stock: number;
}

export interface EntradaCapacidad {
  patio: readonly TrozaConsumible[];
  lotes: readonly LoteDeCapacidad[];
  productos: readonly ProductoDeCapacidad[];
  /** Ingresos anotados que el libro cuenta pendientes. Es un total SIN permiso adentro. */
  pendienteM3: number;
  /** De qué período habla el stock de productos, para decirlo en la tarjeta. */
  periodoLabel?: string;
}

/* ── Qué troza entra en cada fuente ───────────────────────────────────────── */

/** Rolliza libre: sin lote, sin corrida y de una guía ya recibida (ADR-339). */
export function esLibre(t: TrozaConsumible): boolean {
  return !t.loteAserrioId && !t.consumidaEnId && t.guiaRecepcionada !== false;
}

/** Anotada pero todavía no bajó del camión. */
export function esPorRecepcionar(t: TrozaConsumible): boolean {
  return t.guiaRecepcionada === false;
}

function pasaFiltros(t: TrozaConsumible, f: FiltrosCapacidad): boolean {
  if (f.permiso && txt(t.permiso) !== f.permiso) return false;
  if (f.especie && txt(t.especieComun).toUpperCase() !== f.especie.toUpperCase()) return false;
  if (f.guia && txt(t.gtfNumber) !== f.guia) return false;
  return true;
}

/* ── Las opciones de cada filtro, con lo que hay detrás ───────────────────── */

export interface OpcionFiltro {
  valor: string;
  piezas: number;
  m3: number;
}

function contar(
  trozas: readonly TrozaConsumible[],
  clave: (t: TrozaConsumible) => string,
): OpcionFiltro[] {
  const mapa = new Map<string, OpcionFiltro>();
  for (const t of trozas) {
    const valor = clave(t);
    if (!valor) continue;
    const prev = mapa.get(valor) ?? { valor, piezas: 0, m3: 0 };
    prev.piezas += 1;
    prev.m3 = r4(prev.m3 + num(t.volumenM3));
    mapa.set(valor, prev);
  }
  return [...mapa.values()].sort((a, b) => b.m3 - a.m3 || a.valor.localeCompare(b.valor, "es"));
}

/**
 * Las opciones de los tres filtros, cada una acotada por las anteriores.
 *
 * El conteo sale de TODA la madera que puede salir de la planta —libre y por
 * recepcionar—, no sólo de la libre: si una guía entera está sin recibir, su
 * permiso tiene que poder elegirse igual, o el filtro escondería justo lo que
 * todavía no llegó.
 */
export function opcionesDeCapacidad(
  patio: readonly TrozaConsumible[],
  filtros: FiltrosCapacidad,
): { permisos: OpcionFiltro[]; especies: OpcionFiltro[]; guias: OpcionFiltro[] } {
  const enJuego = patio.filter((t) => esLibre(t) || esPorRecepcionar(t));
  const porPermiso = filtros.permiso
    ? enJuego.filter((t) => txt(t.permiso) === filtros.permiso)
    : enJuego;
  const porEspecie = filtros.especie
    ? porPermiso.filter((t) => txt(t.especieComun).toUpperCase() === filtros.especie!.toUpperCase())
    : porPermiso;
  return {
    permisos: contar(enJuego, (t) => txt(t.permiso)),
    especies: contar(porPermiso, (t) => txt(t.especieComun).toUpperCase()),
    guias: contar(porEspecie, (t) => txt(t.gtfNumber)),
  };
}

/* ── Las filas que hay detrás de cada fuente ──────────────────────────────── */

export interface FilaTroza {
  codigo: string;
  especie: string;
  dimensiones: string;
  m3: number;
  pt: number;
  permiso: string;
  guia: string;
  proveedor: string;
  fecha: string;
}

const dimensionesDe = (t: TrozaConsumible): string => {
  if (t.d1Cm != null || t.d2Cm != null || t.largoM != null) {
    const d1 = t.d1Cm != null ? `${t.d1Cm}` : "—";
    const d2 = t.d2Cm != null ? `${t.d2Cm}` : "—";
    const l = t.largoM != null ? `${t.largoM}` : "—";
    return `Ø ${d1}/${d2} cm · ${l} m`;
  }
  return txt(t.dimensiones) || "—";
};

/**
 * La fecha, legible.
 *
 * Vienen de dos formas y no se tratan igual: `fechaRecepcion` es un instante
 * (cuándo bajó la pieza del camión) y va en hora de Lima; `fechaIngreso` es
 * date-only a medianoche UTC (el asiento del libro) y sin `timeZone:"UTC"` se
 * corre un día hacia atrás — el bug clásico de este módulo.
 */
export function fechaDeTroza(t: TrozaConsumible): string {
  const recepcion = txt(t.fechaRecepcion);
  const iso = recepcion || txt(t.fechaIngreso);
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const soloFecha = !recepcion || /^\d{4}-\d{2}-\d{2}$/.test(iso);
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: soloFecha ? "UTC" : "America/Lima",
  });
}

export function filaDeTroza(t: TrozaConsumible): FilaTroza {
  const m3 = r4(num(t.volumenM3));
  return {
    codigo: txt(t.codigoPlanta) || txt(t.codificacion) || "—",
    especie: txt(t.especieComun) || "—",
    dimensiones: dimensionesDe(t),
    m3,
    pt: pieTablarDe(m3),
    permiso: txt(t.permiso) || "—",
    guia: txt(t.gtfNumber) || "—",
    proveedor: txt(t.proveedor) || "—",
    fecha: fechaDeTroza(t),
  };
}

/** Las trozas de una fuente, ya filtradas y ordenadas de mayor a menor volumen. */
export function trozasDeFuente(
  clave: "patio" | "porRecepcionar",
  patio: readonly TrozaConsumible[],
  filtros: FiltrosCapacidad,
): TrozaConsumible[] {
  const cumple = clave === "patio" ? esLibre : esPorRecepcionar;
  return patio
    .filter((t) => cumple(t) && pasaFiltros(t, filtros))
    .sort((a, b) => num(b.volumenM3) - num(a.volumenM3));
}

/**
 * Los lotes que quedan bajo los filtros.
 *
 * Honran permiso y especie, que son campos suyos. La guía NO: un lote junta
 * piezas de varias guías, y decir que «este lote es de la guía X» sería inventar
 * una atribución que el libro no tiene.
 */
export function lotesDeFuente(
  lotes: readonly LoteDeCapacidad[],
  filtros: FiltrosCapacidad,
): LoteDeCapacidad[] {
  if (filtros.guia) return [];
  return lotes.filter(
    (l) =>
      (!filtros.permiso || l.permisos.includes(filtros.permiso)) &&
      (!filtros.especie || txt(l.especie).toUpperCase() === filtros.especie.toUpperCase()),
  );
}

/* ── El balance ───────────────────────────────────────────────────────────── */

/**
 * Las cuatro fuentes y el techo que suman, bajo los filtros elegidos.
 *
 * Lo que una fuente no puede atribuir queda en CERO y lo DICE (`noAtribuible`).
 * Repartir por prorrateo sería inventar de qué permiso salió cada tablón, que es
 * justo lo que el libro existe para no hacer.
 */
export function armarBalance(
  entrada: EntradaCapacidad,
  filtros: FiltrosCapacidad = SIN_FILTROS,
): BalanceCapacidad {
  const aProducto = (m3: number) => r4(m3 * RENDIMIENTO_META);
  const sumaM3 = (ts: readonly TrozaConsumible[]) =>
    r4(ts.reduce((a, t) => a + num(t.volumenM3), 0));

  const porRecepcionar = trozasDeFuente("porRecepcionar", entrada.patio, filtros);
  const libres = trozasDeFuente("patio", entrada.patio, filtros);
  const lotes = lotesDeFuente(entrada.lotes, filtros);
  const restaLotes = r4(lotes.reduce((a, l) => a + (l.restaM3 ?? 0), 0));

  /* `pendienteM3` es un total del libro sin permiso ni especie adentro: con
     cualquier filtro puesto no se puede repartir, así que sólo entra en «toda
     la planta». */
  const pendiente = hayFiltro(filtros) ? 0 : r4(entrada.pendienteM3);
  const recepcionarM3 = r4(sumaM3(porRecepcionar) + pendiente);

  const stock = r4(entrada.productos.reduce((a, p) => a + num(p.stock), 0));
  const productosCiegos = hayFiltro(filtros);

  const fuentes: FuenteDeCapacidad[] = [
    {
      clave: "porRecepcionar",
      label: "Por recepcionar",
      m3: recepcionarM3,
      enProducto: aProducto(recepcionarM3),
      convertido: true,
      detalle: "Anotada en el libro, todavía no llegó o no se validó",
      filas: porRecepcionar.length,
    },
    {
      clave: "patio",
      label: "Trozas en el patio",
      m3: sumaM3(libres),
      enProducto: aProducto(sumaM3(libres)),
      convertido: true,
      detalle: `${libres.length} ${libres.length === 1 ? "pieza libre" : "piezas libres"}, sin lote ni bloqueo`,
      filas: libres.length,
    },
    {
      clave: "lotes",
      label: "Lo que los lotes admiten",
      m3: restaLotes,
      /* YA es producto: es cuánto más se puede DECLARAR bajo el tope, no
         rolliza esperando. Convertirlo otra vez sería aplicar el 56 % dos
         veces sobre la misma madera. */
      enProducto: restaLotes,
      convertido: false,
      detalle: "Al 56 % menos lo ya declarado",
      filas: lotes.length,
      noAtribuible: filtros.guia
        ? "Un lote junta piezas de varias guías: no se puede acotar a una sola"
        : undefined,
    },
    {
      clave: "productos",
      label: "Productos terminados",
      m3: productosCiegos ? 0 : stock,
      enProducto: productosCiegos ? 0 : stock,
      convertido: false,
      detalle: productosCiegos
        ? undefined
        : entrada.productos.length === 0
          ? `Sin productos en stock${entrada.periodoLabel ? ` en ${entrada.periodoLabel}` : ""}`
          : entrada.productos.length === 1
            ? `${entrada.productos[0].producto}${entrada.periodoLabel ? ` · stock de ${entrada.periodoLabel}` : ""}`
            : `${entrada.productos.length} productos${entrada.periodoLabel ? ` · stock de ${entrada.periodoLabel}` : ""}`,
      filas: productosCiegos ? 0 : entrada.productos.length,
      noAtribuible: productosCiegos
        ? "No se puede atribuir sin recorrer la cadena corrida→lote→troza→ingreso"
        : undefined,
    },
  ];

  return { fuentes, totalProducto: r4(fuentes.reduce((a, f) => a + f.enProducto, 0)) };
}
