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
import { estaDisponible, type TrozaConsumible } from "@/lib/forestal/consumo-trozas";

export type ClaveFuente = "porRecepcionar" | "patio" | "apartado" | "lotes" | "productos";

/** Cómo llegó cada dato que alimenta el balance. */
export type EstadoFuente = "cargando" | "ok" | "error";

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
 * Los tres recortes de la capacidad. Dos reglas y ninguna es un detalle:
 *
 *  · **Cada uno admite VARIOS valores** (Brandon, 2026-09-08): tres permisos de
 *    los cinco que tienen tornillo. Dentro de un recorte los valores suman (O);
 *    entre recortes se cruzan (Y) — «tornillo, de estos tres permisos».
 *  · **Se cruzan entre sí**: cada uno acota las opciones de los otros dos, en
 *    cualquier orden. Ver `opcionesDeCapacidad`.
 *
 * Una lista vacía es lo mismo que no tener el recorte puesto: «todos».
 */
export interface FiltrosCapacidad {
  permiso?: readonly string[];
  especie?: readonly string[];
  guia?: readonly string[];
}

/** Las tres claves, para recorrerlas sin repetirlas en cada archivo. */
export const CLAVES_DE_FILTRO = ["permiso", "especie", "guia"] as const;
export type ClaveFiltro = (typeof CLAVES_DE_FILTRO)[number];

export const SIN_FILTROS: FiltrosCapacidad = {};

/** ¿Este recorte está puesto? Una lista vacía es «todos», no «ninguno». */
export const recortePuesto = (r?: readonly string[]): boolean => (r?.length ?? 0) > 0;

/** ¿Hay algún filtro puesto? */
export function hayFiltro(f: FiltrosCapacidad): boolean {
  return CLAVES_DE_FILTRO.some((k) => recortePuesto(f[k]));
}

/** Suma o saca un valor del recorte; devuelve `undefined` si queda vacío. */
export function alternarEnRecorte(
  actual: readonly string[] | undefined,
  valor: string,
): string[] | undefined {
  const lista = actual ?? [];
  const proximo = lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
  return proximo.length > 0 ? proximo : undefined;
}

const r4 = (v: number) => Math.round(v * 10000) / 10000;
const txt = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => Number(v ?? 0) || 0;
const mismaEspecie = (a: unknown, b: string) => txt(a).toUpperCase() === b.toUpperCase();

/** El valor de la fila cae dentro del recorte (O entre los elegidos). */
const dentro = (r: readonly string[] | undefined, v: unknown) =>
  !recortePuesto(r) || r!.includes(txt(v));
/** Igual, comparando especies como las compara el resto del libro. */
const dentroEspecie = (r: readonly string[] | undefined, v: unknown) =>
  !recortePuesto(r) || r!.some((x) => mismaEspecie(v, x));

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
  /** `cantidad` = piezas del paquete; opcional porque no todo consumidor la pide. */
  paquetes: { codigo: string; volumenM3: number; cantidad?: number }[];
  /** La nota de la corrida: el importador del SNIFFS deja ahí su marca de apertura. */
  observations?: string | null;
  /** La existencia de apertura declarada a mano (ADR-394). */
  aperturaDeclaradaAt?: string | null;
  aperturaDeclaradaPor?: string | null;
  aperturaDeclaradaMotivo?: string | null;
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
  /**
   * Ingresos pendientes de validar que NO tienen piezas cargadas. Sólo esos: los
   * que sí las tienen ya entran troza por troza en «por recepcionar», y sumar
   * también su total del libro contaba la misma madera dos veces (auditoría
   * 2026-09-06). Es un total SIN permiso adentro.
   */
  pendienteSinPiezasM3: number;
  /**
   * Cómo llegó cada fetch. Un `[]` que en realidad es «no cargó» o «falló»
   * produce un reporte firmable con «0 piezas libres» donde había 5.000: acá
   * se distingue, y el balance lo dice en la fila en vez de poner un cero.
   */
  estado?: Partial<Record<"patio" | "lotes" | "corridas" | "pendientes", EstadoFuente>>;
  /** El endpoint del patio recorta a 5.000 piezas: si recortó, el techo es parcial. */
  patioTruncado?: { devueltas: number; total: number } | null;
  /** De qué período habla el libro, para decirlo en la tarjeta. */
  periodoLabel?: string;
  /** Sus fechas (ISO), para separar lo que queda de ese período de lo anterior. */
  periodo?: { from?: string | null; to?: string | null };
}

/* ── Qué troza entra en cada fuente ───────────────────────────────────────── */

/** Rolliza libre: sin lote, sin corrida y de una guía ya recibida (ADR-339). */
export function esLibre(t: TrozaConsumible): boolean {
  /* DISPONIBLE según las reglas del patio (`estaDisponible`): no consumida, no
     despachada en rollo, no descarte, no una madre ya retrozada, con volumen.
     Reimplementar esa lista acá contaba madera que ya salió de la planta. */
  return !t.loteAserrioId && t.guiaRecepcionada !== false && estaDisponible(t);
}

/** Anotada pero todavía no bajó del camión. */
export function esPorRecepcionar(t: TrozaConsumible): boolean {
  return t.guiaRecepcionada === false && !t.consumidaEnId && !t.despachadaEnId && !t.descarte;
}

function pasaFiltros(t: TrozaConsumible, f: FiltrosCapacidad): boolean {
  return (
    dentro(f.permiso, t.permiso) &&
    dentroEspecie(f.especie, t.especieComun) &&
    dentro(f.guia, t.gtfNumber)
  );
}

/**
 * Una corrida (o un lote) se atribuye a un permiso —o a una guía— sólo si TODA
 * su madera vino de ahí. Con dos títulos adentro no se reparte: repartir sería
 * inventar de qué permiso salió cada tablón, que es justo lo que el libro
 * existe para no hacer. Se cuenta aparte como «mezcla».
 *
 * Con varios valores tildados la regla NO se ablanda: la corrida entra si toda
 * su madera es de UNO de ellos. La mezcla no se deshace porque el filtro sea
 * más ancho.
 */
const origenDentro = (lista: readonly string[], r?: readonly string[]): boolean => {
  if (!recortePuesto(r)) return true;
  const unicos = [...new Set(lista.map(txt).filter(Boolean))];
  return unicos.length === 1 && r!.includes(unicos[0]);
};

function pasaFiltrosCorrida(c: CorridaDisponible, f: FiltrosCapacidad): boolean {
  return (
    origenDentro(c.titularOrigen, f.permiso) &&
    dentroEspecie(f.especie, c.especie) &&
    origenDentro(c.gtfOrigen, f.guia)
  );
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
 * Las opciones de los tres filtros, **cada una acotada por los OTROS DOS**.
 *
 * Antes la cadena era de una sola dirección —permiso → especie → guía—, así que
 * elegir «TORNILLO» dejaba el desplegable de permisos ofreciendo los de toda la
 * planta, incluidos los que no tienen un solo tronco de tornillo. Elegir uno de
 * ésos daba una tarjeta en cero y no había forma de saber, antes de probarlos,
 * cuál sí (Brandon, 2026-09-08).
 *
 * La regla es la de cualquier buscador con facetas: para calcular las opciones
 * de un filtro se aplican todos los demás **menos el suyo**. Así cada filtro
 * ofrece exactamente lo que se puede combinar con lo ya elegido, en cualquier
 * orden —especie primero y permiso después, o al revés—, y el valor que uno ya
 * tiene puesto no se saca a sí mismo de la lista.
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
    const okPermiso = dentro(filtros.permiso, t.permiso);
    const okEspecie = dentroEspecie(filtros.especie, t.especieComun);
    const okGuia = dentro(filtros.guia, t.gtfNumber);
    if (okEspecie && okGuia) acumular(permisos, txt(t.permiso), m3);
    if (okPermiso && okGuia) acumular(especies, txt(t.especieComun).toUpperCase(), m3);
    if (okPermiso && okEspecie) acumular(guias, txt(t.gtfNumber), m3);
  }
  for (const c of enM3) {
    /* Una corrida cuenta para un permiso (o una guía) sólo si TODA su madera
       vino de ahí: repartirla sería inventar de qué título salió cada tablón. */
    const permiso = [...new Set(c.titularOrigen.map(txt).filter(Boolean))];
    const guia = [...new Set(c.gtfOrigen.map(txt).filter(Boolean))];
    const okPermiso = origenDentro(c.titularOrigen, filtros.permiso);
    const okEspecie = dentroEspecie(filtros.especie, c.especie);
    const okGuia = origenDentro(c.gtfOrigen, filtros.guia);
    if (okEspecie && okGuia && permiso.length === 1) acumular(permisos, permiso[0], c.disponible);
    if (okPermiso && okGuia) acumular(especies, txt(c.especie).toUpperCase(), c.disponible);
    if (okPermiso && okEspecie && guia.length === 1) acumular(guias, guia[0], c.disponible);
  }
  return { permisos: ordenar(permisos), especies: ordenar(especies), guias: ordenar(guias) };
}

/**
 * Suelta los filtros que, con los demás puestos, ya no tienen nada detrás.
 *
 * Con las opciones cruzadas elegir de un desplegable siempre da resultado, pero
 * quedan dos caminos por los que se puede llegar a una combinación imposible:
 * un link viejo («capacidad de la guía G-4 con especie CAPIRONA») y quitar un
 * filtro que era el que hacía compatibles a los otros dos. En vez de mostrar un
 * cero mudo —que se lee como «no hay madera»— se suelta el filtro que ya no
 * puede cumplirse y quedan los que sí.
 *
 * Con el patio y las corridas todavía cargando NO toca nada: un `[]` que en
 * realidad es «no llegó» borraría el filtro que el usuario acaba de abrir.
 */
export function sanearFiltros(
  patio: readonly TrozaConsumible[],
  corridas: readonly CorridaDisponible[],
  filtros: FiltrosCapacidad,
  /**
   * El filtro que el operador **acaba de tocar**: ése no se suelta nunca, se
   * sueltan los que ya no lo acompañan. Sin esto, elegir una especie que la
   * guía puesta no tiene borraba las dos y la pantalla volvía a cero justo
   * cuando el usuario estaba eligiendo. Por omisión manda la especie, que es
   * por donde se empieza a mirar la planta.
   */
  prioridad?: keyof FiltrosCapacidad,
): FiltrosCapacidad {
  if (!hayFiltro(filtros)) return filtros;
  if (patio.length === 0 && corridas.length === 0) return filtros;

  const resto: ClaveFiltro[] = (["especie", "permiso", "guia"] as const).filter(
    (k) => k !== prioridad,
  );
  const orden = prioridad ? [prioridad, ...resto] : resto;

  /* Se aceptan de a uno contra lo YA aceptado: así el segundo recorte se juzga
     con el primero puesto, que es como se va a leer la tarjeta. Dentro de un
     recorte se cae valor por valor: elegidos tres permisos, se suelta sólo el
     que no acompaña, no los tres. */
  let acc: FiltrosCapacidad = {};
  for (const k of orden) {
    const valores = filtros[k];
    if (!recortePuesto(valores)) continue;
    const o = opcionesDeCapacidad(patio, acc, corridas);
    const lista = k === "permiso" ? o.permisos : k === "especie" ? o.especies : o.guias;
    const quedan = valores!.filter((v) => lista.some((x) => x.valor === v));
    if (quedan.length > 0) acc = { ...acc, [k]: quedan };
  }

  /* Si no cambió nada se devuelve el MISMO objeto: el estado vive en la URL y
     un objeto nuevo por render dispararía una navegación en bucle. */
  const igualLista = (a?: readonly string[], b?: readonly string[]) =>
    (a?.length ?? 0) === (b?.length ?? 0) && (a ?? []).every((v, i) => v === (b ?? [])[i]);
  const igual = CLAVES_DE_FILTRO.every((k) => igualLista(acc[k], filtros[k]));
  return igual ? filtros : acc;
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
  if (recortePuesto(filtros.guia)) return [];
  return lotes.filter(
    (l) =>
      /* Con permisos elegidos el lote entra sólo si TODA su madera es de UNO de
         ellos — la misma regla que las corridas. Un lote con dos títulos
         adentro atribuido entero a cada uno sumaba la misma madera dos veces. */
      origenDentro(l.permisos, filtros.permiso) && dentroEspecie(filtros.especie, l.especie),
  );
}

/** Los lotes que el filtro de permiso deja afuera por tener varios títulos adentro. */
export function lotesMezclados(
  lotes: readonly LoteDeCapacidad[],
  filtros: FiltrosCapacidad,
): LoteDeCapacidad[] {
  if (!recortePuesto(filtros.permiso) || recortePuesto(filtros.guia)) return [];
  return lotes.filter(
    (l) =>
      new Set(l.permisos.map(txt).filter(Boolean)).size > 1 &&
      l.permisos.some((p) => filtros.permiso!.includes(txt(p))) &&
      dentroEspecie(filtros.especie, l.especie),
  );
}

/**
 * Cuánto producto más admite un lote bajo el techo del 56 %.
 *
 * Es una COTA MÁXIMA, así que: un lote que consumió y todavía no declaró tiene
 * el techo entero por delante (no cero); uno que ya pasó el techo aporta cero
 * (no un negativo que le reste al total: pasarse es un hallazgo de la tabla de
 * lotes, no un descuento de la capacidad).
 */
export function admiteDelLote(l: LoteDeCapacidad): number {
  if (l.producidoM3 == null) return l.consumidoM3 > 0 ? r4(l.esperado56M3) : 0;
  return Math.max(0, r4(l.restaM3 ?? l.esperado56M3 - l.producidoM3));
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

  const fallo = entrada.estado?.corridas === "error";
  if (!entrada.corridas || fallo) {
    const ciego = hayFiltro(filtros);
    return {
      ...base,
      m3: ciego ? 0 : r4(entrada.stockLibroM3),
      enProducto: ciego ? 0 : r4(entrada.stockLibroM3),
      filas: 0,
      /* Un fallo de red no es un hecho del depósito: se dice que no se pudo
         leer y se cae al stock del libro, que NO descuenta lo marcado usado. */
      detalle: ciego
        ? undefined
        : fallo
          ? `No se pudo leer el depósito — se muestra el stock del libro${periodo}, que no descuenta lo marcado «ya usado»`
          : `Stock del libro${periodo} — el detalle por corrida está cargando`,
      noAtribuible: ciego
        ? fallo
          ? "No se pudo leer el depósito"
          : "Cargando las corridas del depósito…"
        : undefined,
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
      (recortePuesto(filtros.permiso) && new Set(c.titularOrigen.map(txt).filter(Boolean)).size > 1) ||
      (recortePuesto(filtros.guia) && new Set(c.gtfOrigen.map(txt).filter(Boolean)).size > 1),
  );
  const sinOrigen = restantes.filter(
    (c) =>
      (recortePuesto(filtros.permiso) && c.titularOrigen.filter(Boolean).length === 0) ||
      (recortePuesto(filtros.guia) && c.gtfOrigen.filter(Boolean).length === 0),
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
  const est = (k: "patio" | "lotes" | "pendientes") => entrada.estado?.[k] ?? "ok";
  /* Una fuente que no llegó no vale cero: vale «no se sabe», y se dice. */
  const sinDato = (k: "patio" | "lotes" | "pendientes", que: string): string | undefined =>
    est(k) === "cargando"
      ? `Cargando ${que}…`
      : est(k) === "error"
        ? `No se pudo leer ${que} — el techo no lo incluye`
        : undefined;

  const porRecepcionar = trozasDeFuente("porRecepcionar", entrada.patio, filtros);
  const libres = trozasDeFuente("patio", entrada.patio, filtros);
  const lotes = lotesDeFuente(entrada.lotes, filtros);
  const mezclados = lotesMezclados(entrada.lotes, filtros);
  const admiten = r4(lotes.reduce((a, l) => a + admiteDelLote(l), 0));
  const apartado = r4(lotes.reduce((a, l) => a + l.apartadoM3, 0));
  const conApartado = lotes.filter((l) => l.apartadoM3 > 0);

  /* Lo pendiente sin piezas es un total del libro sin permiso ni especie
     adentro: con cualquier filtro puesto no se puede repartir, así que sólo
     entra en «toda la planta». */
  const pendiente =
    hayFiltro(filtros) || est("pendientes") !== "ok" ? 0 : r4(entrada.pendienteSinPiezasM3);
  const recepcionarM3 = r4(sumaM3(porRecepcionar) + pendiente);
  const patioNoLlego = sinDato("patio", "el patio");
  const lotesNoLlego = sinDato("lotes", "los lotes");
  const trunc = entrada.patioTruncado;

  const fuentes: FuenteDeCapacidad[] = [
    {
      clave: "porRecepcionar",
      label: "Por recepcionar",
      m3: patioNoLlego ? 0 : recepcionarM3,
      enProducto: patioNoLlego ? 0 : aProducto(recepcionarM3),
      convertido: true,
      detalle: [
        `${porRecepcionar.length} ${porRecepcionar.length === 1 ? "pieza" : "piezas"} de guías sin recibir`,
        pendiente > 0 ? `${pendiente} m³ de ingresos sin validar y sin piezas cargadas` : "",
        est("pendientes") === "error" ? "los ingresos sin validar no se pudieron leer" : "",
      ]
        .filter(Boolean)
        .join(" · "),
      filas: porRecepcionar.length,
      noAtribuible: patioNoLlego,
    },
    {
      clave: "patio",
      label: "Trozas en el patio",
      m3: patioNoLlego ? 0 : sumaM3(libres),
      enProducto: patioNoLlego ? 0 : aProducto(sumaM3(libres)),
      convertido: true,
      detalle: `${libres.length} ${libres.length === 1 ? "pieza libre" : "piezas libres"}, sin lote ni bloqueo${
        trunc && trunc.devueltas < trunc.total
          ? ` · ⚠ el patio tiene ${trunc.total.toLocaleString("es-PE")} piezas y sólo llegaron ${trunc.devueltas.toLocaleString("es-PE")}: el techo es parcial`
          : ""
      }`,
      filas: libres.length,
      noAtribuible: patioNoLlego,
    },
    {
      clave: "apartado",
      label: "Apartado en lotes, sin aserrar",
      m3: lotesNoLlego ? 0 : apartado,
      enProducto: lotesNoLlego ? 0 : aProducto(apartado),
      convertido: true,
      /* Estas piezas NO están en el patio libre (tienen lote) ni en «lo que los
         lotes admiten» (eso es lo ya consumido): sin esta fila la madera
         apartada desaparecía del techo. */
      detalle: `${conApartado.length} ${conApartado.length === 1 ? "lote" : "lotes"} con piezas apartadas todavía enteras`,
      filas: conApartado.length,
      noAtribuible: lotesNoLlego,
    },
    {
      clave: "lotes",
      label: "Lo que los lotes admiten",
      m3: lotesNoLlego ? 0 : admiten,
      /* YA es producto: es cuánto más se puede DECLARAR bajo el tope, no
         rolliza esperando. Convertirlo otra vez sería aplicar el 56 % dos
         veces sobre la misma madera. */
      enProducto: lotesNoLlego ? 0 : admiten,
      convertido: false,
      detalle: `Al 56 % menos lo ya declarado; un lote que consumió y no declaró tiene el techo entero${
        mezclados.length > 0
          ? ` · ${r4(mezclados.reduce((a, l) => a + admiteDelLote(l), 0))} m³ en ${mezclados.length} ${mezclados.length === 1 ? "lote" : "lotes"} con permisos mezclados — no se reparten`
          : ""
      }`,
      filas: lotes.length,
      noAtribuible:
        lotesNoLlego ??
        (recortePuesto(filtros.guia)
          ? "Un lote junta piezas de varias guías: no se puede acotar a una sola"
          : undefined),
    },
    filaProductos(entrada, filtros),
  ];

  return { fuentes, totalProducto: r4(fuentes.reduce((a, f) => a + f.enProducto, 0)) };
}
