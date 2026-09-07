/**
 * Cuánto producto puede salir de todo lo que la planta tiene hoy, y de qué está
 * hecho ese número.
 *
 * Vive fuera del componente porque cuatro lugares lo leen —la tarjeta, el modal
 * de detalle, el Excel y el PDF— y un cálculo que se rehace en cada uno diverge
 * a la primera columna nueva. Todo acá es PURO: entra lo que ya se pidió (patio,
 * lotes, corridas disponibles), sale el balance y las filas que lo justifican.
 *
 * Las cuatro fuentes, de la más lejana a la más lista:
 *
 *   1. POR RECEPCIONAR — madera anotada en el libro que todavía no llegó o no
 *      se validó. Es la más incierta: puede no aparecer.
 *   2. TROZAS EN PATIO — rolliza libre, sin lote y sin bloqueo.
 *   3. LOTES — lo que sus corridas todavía admiten declarar bajo el tope.
 *   4. PRODUCTOS TERMINADOS — lo aserrado que sigue en el depósito HOY.
 *
 * ⚠️ LO QUE ESTE NÚMERO NO ES. Las tres primeras son rolliza; la cuarta es
 * producto. Para poder sumarlas, la rolliza se convierte al 56 % (ADR-358), que
 * es el TECHO del rendimiento, no lo que la sierra saca de verdad. Así que el
 * total es una COTA MÁXIMA: «no más de esto», nunca «esto es lo que va a
 * haber».
 *
 * ⚠️ PRODUCTOS: LA FOTO, NO EL LIBRO. El stock «del período» que firma el libro
 * (Σ producido − Σ despachado entre dos fechas) NO es lo que hay en el depósito:
 * no descuenta lo marcado a mano como «ya usado» ni suma lo que quedó de meses
 * anteriores. Medido en una planta real: el libro decía 62.39 m³ y en el
 * depósito había 20.30 (54.73 estaban marcados usados). Un dueño que compromete
 * una venta con el primer número vende madera que no tiene. Acá manda lo
 * DISPONIBLE por corrida (`saldosDeCorridas`, ADR-316) y la diferencia con el
 * libro se dice, no se esconde.
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
const mismaEspecie = (a: unknown, b: string) => txt(a).toUpperCase() === b.toUpperCase();

/* ── Lo que entra ─────────────────────────────────────────────────────────── */

/** Una pieza del lote, lo justo para cruzarla contra su guía. */
export interface TrozaDeLote {
  id: string;
  codigo: string;
  especie: string;
  m3: number;
  permiso: string;
  guia: string;
  /** `true` si una corrida viva ya se la comió. */
  consumida: boolean;
}

/** El lote tal como lo arma Saldos — el mismo objeto que ya usan el CSV y el PDF. */
export interface LoteDeCapacidad {
  id: string;
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
  trozas: TrozaDeLote[];
}

/** Lo que `productosDisponibles` devuelve por corrida (ADR-349), lo que acá se usa. */
export interface CorridaDisponible {
  id: string;
  fecha: string;
  lote: string | null;
  producto: string | null;
  especie: string | null;
  presentacion?: string | null;
  unidad: string;
  disponible: number;
  /** Títulos habilitantes de la madera que la alimentó. >1 = mezcla; 0 = sin origen. */
  titularOrigen: string[];
  /** Guías de ingreso de esa madera. */
  gtfOrigen: string[];
  paquetes: { codigo: string; volumenM3: number }[];
}

export interface EntradaCapacidad {
  patio: readonly TrozaConsumible[];
  lotes: readonly LoteDeCapacidad[];
  /**
   * Las corridas con saldo en el depósito hoy (foto, sin período). Si todavía
   * no llegaron, la fila de productos usa el stock del libro y lo dice.
   */
  corridas?: readonly CorridaDisponible[];
  /** El stock de productos que firma el libro para el período, para conciliar. */
  stockLibroM3: number;
  /** Ingresos anotados que el libro cuenta pendientes. Es un total SIN permiso adentro. */
  pendienteM3: number;
  /** De qué período habla el libro, para decirlo en la tarjeta. */
  periodoLabel?: string;
  /** Sus fechas (ISO), para separar lo que queda de ese período de lo anterior. */
  periodo?: { from?: string | null; to?: string | null };
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
  if (f.especie && !mismaEspecie(t.especieComun, f.especie)) return false;
  if (f.guia && txt(t.gtfNumber) !== f.guia) return false;
  return true;
}

/**
 * Una corrida se atribuye a un permiso (o a una guía) sólo si TODA su madera
 * vino de ese permiso. Con dos títulos adentro no se reparte: repartir sería
 * inventar de qué permiso salió cada tablón, que es justo lo que el libro
 * existe para no hacer. Se cuenta aparte como «mezcla».
 */
function origenUnico(lista: readonly string[], valor: string): boolean {
  const unicos = [...new Set(lista.map(txt).filter(Boolean))];
  return unicos.length === 1 && unicos[0] === valor;
}

function pasaFiltrosCorrida(c: CorridaDisponible, f: FiltrosCapacidad): boolean {
  if (f.permiso && !origenUnico(c.titularOrigen, f.permiso)) return false;
  if (f.especie && !mismaEspecie(c.especie, f.especie)) return false;
  if (f.guia && !origenUnico(c.gtfOrigen, f.guia)) return false;
  return true;
}

/* ── Las opciones de cada filtro, con lo que hay detrás ───────────────────── */

export interface OpcionFiltro {
  valor: string;
  /** Piezas o corridas que hay detrás — lo que se cuenta, no siempre trozas. */
  piezas: number;
  m3: number;
}

function acumular(mapa: Map<string, OpcionFiltro>, valor: string, m3: number) {
  if (!valor) return;
  const prev = mapa.get(valor) ?? { valor, piezas: 0, m3: 0 };
  prev.piezas += 1;
  prev.m3 = r4(prev.m3 + m3);
  mapa.set(valor, prev);
}

const ordenar = (mapa: Map<string, OpcionFiltro>) =>
  [...mapa.values()].sort((a, b) => b.m3 - a.m3 || a.valor.localeCompare(b.valor, "es"));

/**
 * Las opciones de los tres filtros, cada una acotada por las anteriores.
 *
 * El conteo sale de TODA la madera que puede salir de la planta —libre, por
 * recepcionar y producto ya aserrado—, no sólo de la libre: si una guía entera
 * está sin recibir, o un permiso ya está todo aserrado en el depósito, tiene que
 * poder elegirse igual, o el filtro escondería justo lo que se busca.
 */
export function opcionesDeCapacidad(
  patio: readonly TrozaConsumible[],
  filtros: FiltrosCapacidad,
  corridas: readonly CorridaDisponible[] = [],
): { permisos: OpcionFiltro[]; especies: OpcionFiltro[]; guias: OpcionFiltro[] } {
  const trozas = patio.filter((t) => esLibre(t) || esPorRecepcionar(t));
  const enM3 = corridas.filter((c) => c.unidad === "m3");

  const permisos = new Map<string, OpcionFiltro>();
  const especies = new Map<string, OpcionFiltro>();
  const guias = new Map<string, OpcionFiltro>();

  for (const t of trozas) {
    const m3 = num(t.volumenM3);
    acumular(permisos, txt(t.permiso), m3);
    if (!filtros.permiso || txt(t.permiso) === filtros.permiso) {
      acumular(especies, txt(t.especieComun).toUpperCase(), m3);
      if (!filtros.especie || mismaEspecie(t.especieComun, filtros.especie))
        acumular(guias, txt(t.gtfNumber), m3);
    }
  }
  for (const c of enM3) {
    const permiso = [...new Set(c.titularOrigen.map(txt).filter(Boolean))];
    const guia = [...new Set(c.gtfOrigen.map(txt).filter(Boolean))];
    if (permiso.length === 1) acumular(permisos, permiso[0], c.disponible);
    if (!filtros.permiso || origenUnico(c.titularOrigen, filtros.permiso)) {
      acumular(especies, txt(c.especie).toUpperCase(), c.disponible);
      if ((!filtros.especie || mismaEspecie(c.especie, filtros.especie)) && guia.length === 1)
        acumular(guias, guia[0], c.disponible);
    }
  }
  return { permisos: ordenar(permisos), especies: ordenar(especies), guias: ordenar(guias) };
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
  return fechaLegible(recepcion || txt(t.fechaIngreso), !recepcion);
}

/** `soloFecha` = date-only del libro → UTC; si no, instante → Lima. */
export function fechaLegible(iso: string, soloFecha: boolean): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const esDateOnly = soloFecha || /^\d{4}-\d{2}-\d{2}$/.test(iso);
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: esDateOnly ? "UTC" : "America/Lima",
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
      (!filtros.especie || mismaEspecie(l.especie, filtros.especie)),
  );
}

/** Las corridas con saldo que quedan bajo los filtros, en m³, de mayor a menor. */
export function corridasDeFuente(
  corridas: readonly CorridaDisponible[],
  filtros: FiltrosCapacidad,
): CorridaDisponible[] {
  return corridas
    .filter((c) => c.unidad === "m3" && c.disponible > 0 && pasaFiltrosCorrida(c, filtros))
    .sort((a, b) => b.disponible - a.disponible);
}

/** ¿La fecha (ISO) cae dentro del período? Sin período, todo es «del período». */
export function enPeriodo(
  fechaIso: string,
  periodo?: { from?: string | null; to?: string | null },
): boolean {
  const f = fechaIso.slice(0, 10);
  if (!f) return true;
  const from = periodo?.from?.slice(0, 10);
  const to = periodo?.to?.slice(0, 10);
  return (!from || f >= from) && (!to || f <= to);
}

/* ── El balance ───────────────────────────────────────────────────────────── */

/**
 * La fila de productos terminados.
 *
 * Con corridas: lo disponible HOY que se puede atribuir al filtro, y aparte lo
 * que no se puede —mezcla de permisos, sin origen, otra unidad— para que el
 * cero no sea mudo. Sin corridas (todavía cargando): el stock del libro, dicho
 * como tal.
 */
function filaProductos(entrada: EntradaCapacidad, filtros: FiltrosCapacidad): FuenteDeCapacidad {
  const base = { clave: "productos" as const, label: "Productos terminados", convertido: false };
  const periodo = entrada.periodoLabel ? ` en ${entrada.periodoLabel}` : "";

  if (!entrada.corridas) {
    const ciego = hayFiltro(filtros);
    return {
      ...base,
      m3: ciego ? 0 : r4(entrada.stockLibroM3),
      enProducto: ciego ? 0 : r4(entrada.stockLibroM3),
      filas: 0,
      detalle: ciego
        ? undefined
        : `Stock del libro${periodo} — el detalle por corrida está cargando`,
      noAtribuible: ciego ? "Cargando las corridas del depósito…" : undefined,
    };
  }

  const enM3 = entrada.corridas.filter((c) => c.unidad === "m3" && c.disponible > 0);
  const otraUnidad = entrada.corridas.filter((c) => c.unidad !== "m3" && c.disponible > 0);
  const atribuibles = corridasDeFuente(entrada.corridas, filtros);
  const disponible = r4(atribuibles.reduce((a, c) => a + c.disponible, 0));

  /* Lo que queda afuera bajo el filtro, con nombre. */
  const restantes = enM3.filter((c) => !atribuibles.includes(c));
  const mezcla = restantes.filter(
    (c) =>
      (filtros.permiso && new Set(c.titularOrigen.map(txt).filter(Boolean)).size > 1) ||
      (filtros.guia && new Set(c.gtfOrigen.map(txt).filter(Boolean)).size > 1),
  );
  const sinOrigen = restantes.filter(
    (c) =>
      (filtros.permiso && c.titularOrigen.filter(Boolean).length === 0) ||
      (filtros.guia && c.gtfOrigen.filter(Boolean).length === 0),
  );
  const m3De = (cs: CorridaDisponible[]) => r4(cs.reduce((a, c) => a + c.disponible, 0));

  const notas: string[] = [];
  if (hayFiltro(filtros)) {
    if (mezcla.length)
      notas.push(
        `${m3De(mezcla)} m³ en ${mezcla.length} corrida${mezcla.length === 1 ? "" : "s"} con origen mezclado — no se reparten`,
      );
    if (sinOrigen.length) notas.push(`${m3De(sinOrigen)} m³ sin origen declarado`);
  } else {
    /* La conciliación con el libro, número por número. El stock que firma el
       libro es Σ producido − Σ despachado ENTRE dos fechas; lo que hay hoy es
       otra cosa: de esas corridas queda menos (lo marcado «ya usado» y lo que
       salió) y además hay saldo de corridas anteriores al período. Decir sólo
       «la diferencia es X» mezclaba un resta con una suma. */
    const totalHoy = m3De(enM3);
    const delPeriodo = m3De(enM3.filter((c) => enPeriodo(c.fecha, entrada.periodo)));
    const anteriores = r4(totalHoy - delPeriodo);
    if (Math.abs(entrada.stockLibroM3 - totalHoy) >= 0.001) {
      const partes = [`El libro firma ${r4(entrada.stockLibroM3)} m³${periodo}`];
      partes.push(
        `de esas corridas quedan ${delPeriodo} disponibles (el resto está marcado «ya usado» o ya salió)`,
      );
      if (anteriores > 0) partes.push(`y hay ${anteriores} más de períodos anteriores`);
      notas.push(`${partes.join("; ")} → ${totalHoy} hoy`);
    }
  }
  if (otraUnidad.length)
    notas.push(
      `${otraUnidad.length} corrida${otraUnidad.length === 1 ? "" : "s"} en ${[...new Set(otraUnidad.map((c) => c.unidad))].join("/")} no se suman en m³`,
    );

  return {
    ...base,
    m3: disponible,
    enProducto: disponible,
    filas: atribuibles.length,
    detalle: `${atribuibles.length} corrida${atribuibles.length === 1 ? "" : "s"} con saldo hoy${notas.length ? ` · ${notas.join(" · ")}` : ""}`,
    noAtribuible:
      atribuibles.length === 0 && hayFiltro(filtros)
        ? notas.length
          ? `Nada atribuible a este filtro: ${notas.join(" · ")}`
          : "Ninguna corrida con saldo viene entera de este filtro"
        : undefined,
  };
}

/**
 * Las cuatro fuentes y el techo que suman, bajo los filtros elegidos.
 *
 * Lo que una fuente no puede atribuir queda en CERO y lo DICE (`noAtribuible`).
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
    filaProductos(entrada, filtros),
  ];

  return { fuentes, totalProducto: r4(fuentes.reduce((a, f) => a + f.enProducto, 0)) };
}
