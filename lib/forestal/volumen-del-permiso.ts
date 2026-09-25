/**
 * Volumen y trazabilidad de un permiso (ADR-432) — la vida entera de la madera
 * que entró con UN título habilitante: lo que ingresó, lo que se consumió, lo
 * que se produjo (por especie y por tipo), lo que salió y el hilo que une cada
 * guía de ingreso con sus corridas y sus despachos.
 *
 * Brandon (2026-09-25): «el volumen ingresado por permiso; ahí estará el
 * resumen por tipo y especie del permiso elegido, lo consumido y toda la
 * trazabilidad».
 *
 * Lo que la medición en Blas (25-09) dejó fijado antes de escribir una línea:
 *  · 10-HUA-PUE/PER-FMP-2026-007: 21 filas de guía (8 GTF), 135,587 m³ de
 *    rolliza en 11 especies; 30 corridas atadas (46,155 m³ de aserrada) y 0 m³
 *    de consumo VIVO: el único consumo (10,37 m³, línea 29, Cachimbo, sin
 *    contrato) es de una corrida ANULADA — su madera volvió al patio. Que una
 *    corrida sin contrato coma de un permiso sí pasa: en `main`, CON-25-UCA-0207
 *    y CON-25-UCA-0142 tienen una heredada cada una. La producción del permiso
 *    sólo se ve completa si se sigue el consumo, no sólo `contratoId`.
 *  · 4 especies producidas bajo ese permiso nunca entraron por él (Copaiba,
 *    Huayruro Negro, Machimango, Tacho: 5,96 m³).
 *  · 3 permisos REG-PLT tienen producción y 0 guías de ingreso.
 *  · 1 guía REG-PLT (21,311 m³) no trae lista de trozas. La otra que se
 *    contaba (20,687 m³) está RECHAZADA y no entra, igual que en `balance()`.
 *  · Una GTF con varias especies cuelga TODAS sus trozas de una sola de sus
 *    filas (13 de las 21 filas de 10-HUA no tienen trozas propias): cada troza
 *    se lleva a la fila de su especie (`filaDeLaTroza`).
 *  · 0 despachos en todo el libro: la sección de salida tiene que verse vacía
 *    sin parecer rota.
 *
 * Reglas (las que no se rompen):
 *  1. Una corrida es del permiso si está ATADA (`contratoId` = el permiso) o si
 *     es HEREDADA: sin contrato propio y comió madera de guías del permiso
 *     (`ForestCtpConsumo`). La heredada cuenta en la proporción de lo que comió
 *     de este permiso sobre todo lo que comió (una corrida que mezcla dos
 *     permisos no se suma entera a los dos). Si está atada a OTRO contrato y
 *     comió de éste, no suma producción acá: va a avisos.
 *  2. El consumo en m³ sale SÓLO de `ForestCtpConsumo` (consumir un lote
 *     también lo escribe). Las trozas marcadas (`consumidaEnId`) dan piezas,
 *     nunca m³ otra vez: sumar las dos contaría dos veces.
 *  3. El m³ de la aserrada: unidad `m3` tal cual; `pt` ÷ `PT_POR_M3`; cualquier
 *     otra unidad NO se convierte y va a `avisos.sinConvertir`.
 *  4. `aserrablePt` es un DERIVADO (techo del 56 %, `pieTablarAserrableDe`) y
 *     la pantalla lo rotula «≈… pt aserr.». `saldoPt = aserrablePt −
 *     producidoPt` sobre la base de TODO lo ingresado (ADR-409 base
 *     «ingresado») y restando TODA la producción del permiso (atada +
 *     heredada), así nada se cuenta dos veces.
 *  5. `saldoRollizaM3` es el saldo del LIBRO (ingresado − consumido registrado
 *     − rolliza despachada sin aserrar), no el patio físico pieza por pieza
 *     (eso es ADR-431). La producción declarada sin materia prima no lo baja:
 *     por eso existe `avisos.corridasSinMateriaPrima`.
 *  6. Lo que no se puede calcular es `null` y se pinta «—», nunca 0.
 *
 * PURO y client-safe: la DB class (`ForestContratoDB.volumen`) trae las filas y
 * `armarVolumenDelPermiso` las arma. Todo el criterio vive acá, testeado.
 */

import { motivoBloqueo, type TrozaConsumible } from "./consumo-trozas";
import { PT_POR_M3, pieTablarAserrableDe } from "./cubicacion";
import { RENDIMIENTO_META } from "./loctp-catalogos";
import { claveEspecie } from "./loth-constants";
import { enPatio, porRecepcionarDelPatio } from "./patio-por-permiso";

/* ─────────────────────────── Salida (lo que lee la pantalla) ─────────────────────────── */

/** Estado de las trozas de UNA guía, con el criterio de ADR-431 (`patio-por-permiso`). */
export interface TrozasDeGuia {
  total: number;
  /** Libres en el patio (guía recibida, sin lote). */
  libres: number;
  /** Apartadas en un lote de aserrío, todavía sin consumir. */
  enLote: number;
  /** La guía sigue sin recepcionar: están declaradas, no en el patio. */
  porRecepcionar: number;
  consumidas: number;
  /** Salieron sin aserrar (ADR-363). */
  despachadas: number;
  /** Declaradas en la guía y nunca bajaron del camión (ADR-325). */
  noRecepcionadas: number;
  /** Troza madre de un retrozado: sus hijas son las que cuentan. */
  retrozadas: number;
}

/** Qué se llevó UNA corrida de UNA guía. */
export interface ConsumoDeGuia {
  corridaId: string;
  lineNo: number | null;
  fecha: string;
  m3: number;
}

/** Una guía de ingreso del permiso, con todo lo que pasó con su madera. */
export interface GuiaDelPermiso {
  id: string;
  /** N° de la GTF (o GRR). */
  gtf: string;
  /** Recepción física si existe; si no, la fecha del asiento. ISO. */
  fecha: string;
  especie: string;
  /** `WoodEntry.productType` (rolliza, aserrada…). */
  producto: string;
  m3: number;
  piezas: number;
  proveedor: string | null;
  /** Σ `ForestCtpConsumo.volumeM3` de esta guía. */
  consumidoM3: number;
  /** m³ de sus trozas despachadas sin aserrar. */
  despachadoRollizaM3: number;
  /** m3 − consumido − despachado sin aserrar. Negativo = se consumió más de lo que entró (se avisa). */
  saldoM3: number;
  /** `null` = la guía no trae lista de trozas (el m³ existe, las piezas no). */
  trozas: TrozasDeGuia | null;
  /** Las corridas que comieron de esta guía, en orden de fecha. */
  consumos: ConsumoDeGuia[];
  /** URLs de las fotos de la pila (`WoodEntry.photos`, compartidas por TODAS las
   *  filas de esta GTF — ver `fotosGuia` en `wood-entries.db.ts`). Siempre un
   *  array, nunca `null`: sin fotos es `[]`, no un hueco que haya que chequear
   *  en cada pantalla. */
  fotos: string[];
  /**
   * `WoodEntry.costoTotal` de esta fila: lo que costó la madera. `null` = sin
   * precio cargado (sin factura es `null`, nunca 0). Opcional para no romper a
   * quien arma una guía a mano; el servidor lo manda siempre.
   */
  costo?: number | null;
}

/** atada = `contratoId` es este permiso · heredada = sin contrato y comió de guías de este permiso. */
export type OrigenCorrida = "atada" | "heredada";

export interface CorridaDelPermiso {
  id: string;
  lineNo: number | null;
  fecha: string;
  especie: string | null;
  /** `productType` tal cual (p. ej. «MADERA ASERRADA (COMERCIAL)»); la pantalla lo acorta. */
  tipo: string | null;
  cantidad: number;
  unidad: string | null;
  piezas: number | null;
  /** m³ de aserrada de la corrida ENTERA (regla 3). `null` = unidad que no convierte. */
  m3: number | null;
  origen: OrigenCorrida;
  /** Fracción de la corrida que es de este permiso: 1 si está atada; consumo de este permiso ÷ consumo total si es heredada. */
  parte: number;
  /** m³ de aserrada que cuentan para ESTE permiso (m3 × parte). `null` si `m3` es null. */
  m3DelPermiso: number | null;
  /** m³ de rolliza de ESTE permiso que se comió (`ForestCtpConsumo`). 0 = declarada sin materia prima. */
  consumidoM3: number;
  /** GTF de este permiso de las que comió. */
  guias: string[];
  /** Lote o referencia de materia prima tal como está escrita (`materiaPrimaRef`). */
  lote: string | null;
  /** m³ de aserrada de esta corrida que ya salió en despachos (× parte). */
  despachadoM3: number;
}

export interface DespachoDelPermiso {
  id: string;
  lineNo: number | null;
  fecha: string;
  /** GTF de salida. */
  gtf: string | null;
  destino: string | null;
  especie: string | null;
  tipo: string | null;
  /** m³ que salieron de ESTE permiso: aserrada (por proporción de cada corrida) + rolliza sin aserrar. */
  m3: number;
  /** De esos m³, cuánto salió en troza. */
  rollizaM3: number;
  /** Corridas de este permiso de las que salió. */
  corridaIds: string[];
  /** Trozas de este permiso que salieron sin aserrar en este despacho. */
  trozas: number;
}

/** Una fila por especie: el recorrido completo de esa especie bajo el permiso. */
export interface FilaEspecieDelPermiso {
  /** Clave normalizada (minúsculas, sin tildes, espacios colapsados). */
  clave: string;
  /** Nombre como lo escribe la guía (o la corrida si no entró por guía). */
  especie: string;
  guias: number;
  piezas: number;
  ingresadoM3: number;
  consumidoM3: number;
  despachadoRollizaM3: number;
  /** ingresado − consumido − despachado sin aserrar (saldo del libro). */
  saldoRollizaM3: number;
  /** Derivado: techo del 56 % sobre lo ingresado. */
  aserrablePt: number;
  corridas: number;
  producidoM3: number;
  producidoPt: number;
  /** Aserrada de esta especie que ya salió. */
  despachadoM3: number;
  /** aserrablePt − producidoPt. Negativo = se produjo más de lo que el techo permite. */
  saldoPt: number;
  /** Se produjo esta especie bajo el permiso sin que ninguna guía del permiso la trajera. */
  sinIngreso: boolean;
}

/** Producción por especie × tipo de producto. */
export interface FilaTipoDelPermiso {
  clave: string;
  especie: string;
  tipo: string;
  corridas: number;
  piezas: number;
  /** `null` = la fila tiene corridas en una unidad que no pasa a m³ (regla 3): se pinta «—», nunca 0. */
  m3: number | null;
  pt: number | null;
}

export interface AvisosDelPermiso {
  /** Producción de especies que no entraron por ninguna guía del permiso. */
  especiesSinIngreso: { especie: string; m3: number; corridas: number }[];
  /** Comieron madera de este permiso y no tienen contrato: suman acá como heredadas, pero el balance de plata no las ve. */
  corridasSinAtar: { id: string; lineNo: number | null; especie: string | null; m3: number | null; consumidoM3: number }[];
  /** Comieron madera de este permiso y están atadas a OTRO contrato. No suman producción acá. */
  corridasDeOtroPermiso: { id: string; lineNo: number | null; contratoCodigo: string | null; consumidoM3: number }[];
  /** Atadas al permiso sin un solo m³ de consumo de guías de ESTE permiso (también la que comió sólo de otro): la rolliza que usaron no baja este saldo. */
  /** `ids` = las corridas exactas: la lista de Trazabilidad a la que manda el aviso usa ESTOS, no un filtro propio. */
  corridasSinMateriaPrima: { cantidad: number; m3: number; ids: string[] };
  /** Guías con m³ pero sin lista de trozas. */
  guiasSinTrozas: { id: string; gtf: string; m3: number }[];
  /** Especies donde lo producido supera el techo aserrable (pt de más). */
  excesos: { especie: string; pt: number }[];
  /** Corridas en una unidad que no pasa a m³ (kg, unidad…). */
  sinConvertir: { id: string; lineNo: number | null; cantidad: number; unidad: string | null }[];
}

export interface TotalesDelPermiso {
  guias: number;
  /** Trozas de las guías (sin contar las madres de un retrozado). */
  trozas: number;
  piezas: number;
  ingresadoM3: number;
  consumidoM3: number;
  despachadoRollizaM3: number;
  saldoRollizaM3: number;
  aserrablePt: number;
  corridas: number;
  producidoM3: number;
  producidoPt: number;
  despachos: number;
  /** Aserrada + rolliza que salió del permiso. */
  despachadoM3: number;
  saldoPt: number;
  /** producidoM3 ÷ ingresadoM3 × 100. `null` sin ingreso o sin producción. */
  rendimientoPct: number | null;
}

export interface VolumenDelPermiso {
  contratoId: string;
  codigo: string;
  totales: TotalesDelPermiso;
  /** Orden: ingresado desc; las especies sin ingreso al final. */
  especies: FilaEspecieDelPermiso[];
  /** Orden: especie, luego m³ desc. */
  porTipo: FilaTipoDelPermiso[];
  /** Orden: fecha asc. */
  guias: GuiaDelPermiso[];
  /** Orden: fecha asc, lineNo asc. */
  corridas: CorridaDelPermiso[];
  /** Orden: fecha asc. */
  despachos: DespachoDelPermiso[];
  avisos: AvisosDelPermiso;
}

/* ───────────── Implementación: `armarVolumenDelPermiso(entrada)` (pura, testeada) ───────────── */

/* ─────────── Entrada (filas crudas: números y fechas ISO, sin Prisma) ─────────── */

/** Una guía de ingreso (`WoodEntry`) del permiso, ya viva: sin baja, ni rechazada ni anulada. */
export interface GuiaEntrada {
  id: string;
  gtf: string;
  /** Asiento en el libro (`entryDate`). ISO. */
  fechaAsiento: string;
  /** Recepción física de la guía, si la hay. ISO. */
  fechaRecepcion: string | null;
  especie: string;
  producto: string;
  m3: number;
  piezas: number;
  proveedor: string | null;
  /** Ver `GuiaDelPermiso.fotos`. Siempre un array. */
  fotos: string[];
  /** `WoodEntry.costoTotal`; `null` = sin precio. Ver `GuiaDelPermiso.costo`. */
  costo?: number | null;
}

/** Un `ForestCtpConsumo` de una corrida VIVA (sin baja, no anulada). */
export interface ConsumoEntrada {
  id: string;
  woodEntryId: string;
  corridaId: string;
  corridaLineNo: number | null;
  /** `entryDate` de la corrida. ISO. */
  corridaFecha: string;
  m3: number;
}

/** Una corrida de producción viva que toca al permiso: atada a él, o comió de sus guías. */
export interface CorridaEntrada {
  id: string;
  lineNo: number | null;
  fecha: string;
  contratoId: string | null;
  especie: string | null;
  tipo: string | null;
  cantidad: number;
  unidad: string | null;
  piezas: number | null;
  /** `materiaPrimaRef` tal cual. */
  lote: string | null;
}

/** Un tramo despacho ← corrida (`ForestCtpDespachoOrigen`). `cantidad` en la unidad de la CORRIDA. */
export interface DespachoOrigenEntrada {
  despachoId: string;
  corridaId: string;
  cantidad: number;
}

/** Un despacho vivo (`ForestCtpEntry` section `despacho`). */
export interface DespachoEntrada {
  id: string;
  lineNo: number | null;
  fecha: string;
  gtf: string | null;
  destino: string | null;
  especie: string | null;
  tipo: string | null;
}

export interface EntradaVolumenDelPermiso {
  contratoId: string;
  codigo: string;
  guias: readonly GuiaEntrada[];
  /**
   * Las trozas de esas guías con el mapeo del patio (`trozasComoConsumibles`):
   * `consumidaEnId`/`despachadaEnId` ya vienen en `null` si la corrida o el
   * despacho que las tomó está anulado — la madera volvió al patio.
   */
  trozas: readonly TrozaConsumible[];
  /**
   * TODOS los consumos que hacen falta, sin repetir: los de las guías del
   * permiso (de cualquier corrida) y los de las corridas del permiso (de
   * cualquier guía, para la proporción de las heredadas).
   */
  consumos: readonly ConsumoEntrada[];
  /** Atadas al permiso + las que comieron de sus guías (con o sin contrato). */
  corridas: readonly CorridaEntrada[];
  /** id → código de los OTROS contratos a los que están atadas corridas que comieron de acá. */
  codigosDeContratos: Readonly<Record<string, string>>;
  /** Tramos de despacho de las corridas del permiso, sólo de despachos vivos. */
  origenes: readonly DespachoOrigenEntrada[];
  /** Los despachos vivos: los de esos tramos y los que se llevaron trozas del permiso. */
  despachos: readonly DespachoEntrada[];
}

/* ─────────────────────────── Implementación ─────────────────────────── */

/* `|| 0`: el ruido de un reparto (0,8 − 0,8000000000000002) no puede salir como «−0,0000». */
const r4 = (n: number) => Math.round(n * 10_000) / 10_000 || 0;
const r2 = (n: number) => Math.round(n * 100) / 100 || 0;
const numero = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const tiempo = (iso: string | null | undefined): number => {
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
};
const porNumero = (a: number | null, b: number | null) =>
  (a ?? Number.POSITIVE_INFINITY) - (b ?? Number.POSITIVE_INFINITY);
const texto = (a: string, b: string) => a.localeCompare(b, "es-PE", { numeric: true, sensitivity: "base" });

/** Rótulo de la fila cuando la especie viene vacía: sigue siendo una fila, no se esconde. */
export const SIN_ESPECIE = "Sin especie";
/** Rótulo del tipo cuando la corrida no declara `productType`. */
export const SIN_TIPO = "Sin tipo";

/**
 * Regla 3: el m³ de una cantidad de aserrada. `m3` tal cual, `pt` ÷ 424; otra
 * unidad (kg, unidad, vacía) → `null`: no se inventa una conversión.
 */
export function m3DeCantidad(cantidad: number, unidad: string | null | undefined): number | null {
  const u = (unidad ?? "").trim().toLowerCase().replace("³", "3").replace(/\s+/g, "");
  if (u === "m3") return numero(cantidad);
  if (u === "pt") return numero(cantidad) / PT_POR_M3;
  return null;
}

type Cubeta = Exclude<keyof TrozasDeGuia, "total">;

/**
 * La cubeta de una troza, con los MISMOS predicados del patio (ADR-431):
 * `motivoBloqueo` para lo que ya no está disponible y `porRecepcionarDelPatio`
 * / `enPatio` para lo que sí. Descarte y sin volumen no tienen cubeta: cuentan
 * en `total` (son filas de la guía) pero no son madera del patio.
 */
function cubetaDe(t: TrozaConsumible): Cubeta | null {
  switch (motivoBloqueo(t)) {
    case "ya_consumida":
      return "consumidas";
    case "ya_despachada":
      return "despachadas";
    case "no_recepcionada":
      return "noRecepcionadas";
    case "madre_retrozada":
      return "retrozadas";
    case "descarte":
    case "sin_volumen":
      return null;
    case null:
      if (porRecepcionarDelPatio(t)) return "porRecepcionar";
      if (enPatio(t)) return t.loteAserrioId ? "enLote" : "libres";
      return null;
  }
}

const trozasEnCero = (): TrozasDeGuia => ({
  total: 0,
  libres: 0,
  enLote: 0,
  porRecepcionar: 0,
  consumidas: 0,
  despachadas: 0,
  noRecepcionadas: 0,
  retrozadas: 0,
});

/**
 * La fila de guía a la que pertenece una troza.
 *
 * Una GTF con varias especies se asienta en UNA FILA POR ESPECIE, pero la
 * lista de trozas cuelga entera de una sola de esas filas. Medido en Blas
 * (25-09): de las 21 filas de 10-HUA, 13 no tienen trozas propias y sus
 * piezas están en la fila hermana — la GTF 010-001-0000008 cuelga sus 5 trozas
 * (Azucar huayo, Cachimbo, Huayruro, Pashaco) de la fila «Azucar huayo», y
 * cada troza pesa lo mismo que la fila de su especie. Sin esto la ficha decía
 * «13 guías sin lista de trozas» de 21: un falso rojo.
 *
 * Cada troza va a la fila de SU especie dentro de la MISMA GTF. Si su especie
 * no tiene fila (o viene vacía), se queda donde está: no se inventa un destino.
 */
function filaDeLaTroza(
  t: TrozaConsumible,
  guiasPorId: ReadonlyMap<string, GuiaEntrada>,
  hermanasPorGtf: ReadonlyMap<string, readonly GuiaEntrada[]>,
): string | null {
  const propia = guiasPorId.get(t.woodEntryId);
  if (!propia) return null;
  const k = claveEspecie(t.especieComun);
  if (!k || claveEspecie(propia.especie) === k) return propia.id;
  const hermana = (hermanasPorGtf.get(propia.gtf.trim()) ?? []).find((h) => claveEspecie(h.especie) === k);
  return hermana?.id ?? propia.id;
}

/**
 * A qué filas de la GTF va el m³ de UN consumo (una corrida × la fila donde se
 * anotó).
 *
 * El consumo de un lote se anota en la fila donde la troza está CARGADA
 * (`forest-lote-aserrio.db.ts` agrupa por `t.woodEntryId`), pero la troza se
 * muestra en la fila de SU especie (`filaDeLaTroza`). Si el m³ se quedara en la
 * fila cargada, la fila Cachimbo diría «1 consumida · 0 m³» y la de Azucar
 * huayo «0 consumidas · 0,8 m³». En Blas, 29 de las 46 trozas de 10-HUA están
 * cargadas en la fila de otra especie.
 *
 *  1. La corrida marcó trozas de esa fila → el m³ se reparte entre sus filas de
 *     destino en proporción al volumen de esas trozas (por piezas si no tienen
 *     volumen).
 *  2. No marcó trozas (consumo sólo por volumen) → va a la fila de la especie
 *     de la CORRIDA dentro de la misma GTF, si existe.
 *  3. Si no, se queda en la fila donde se anotó.
 *
 * Nunca sale de la GTF: el total por GTF y el del permiso no cambian.
 */
function repartirConsumo(
  c: ConsumoEntrada,
  cargada: GuiaEntrada,
  m3: number,
  marcadasPorConsumo: ReadonlyMap<string, ReadonlyMap<string, { m3: number; piezas: number }>>,
  hermanasPorGtf: ReadonlyMap<string, readonly GuiaEntrada[]>,
  corridaPorId: ReadonlyMap<string, CorridaEntrada>,
): [string, number][] {
  const marcadas = marcadasPorConsumo.get(`${cargada.id}\u0000${c.corridaId}`);
  if (marcadas && marcadas.size > 0) {
    const filas = [...marcadas.entries()];
    const volumen = filas.reduce((s, [, x]) => s + x.m3, 0);
    const piezas = filas.reduce((s, [, x]) => s + x.piezas, 0);
    return filas.map(([fila, x]) => [fila, volumen > 0 ? (m3 * x.m3) / volumen : (m3 * x.piezas) / piezas]);
  }
  const especie = claveEspecie(corridaPorId.get(c.corridaId)?.especie);
  if (especie && claveEspecie(cargada.especie) !== especie) {
    const hermana = (hermanasPorGtf.get(cargada.gtf.trim()) ?? []).find((h) => claveEspecie(h.especie) === especie);
    if (hermana) return [[hermana.id, m3]];
  }
  return [[cargada.id, m3]];
}

interface AccEspecie {
  clave: string;
  especie: string;
  guias: number;
  piezas: number;
  ingresadoM3: number;
  consumidoM3: number;
  despachadoRollizaM3: number;
  corridas: number;
  producidoM3: number;
  despachadoM3: number;
}

interface AccDespacho {
  aserradaM3: number;
  rollizaM3: number;
  corridas: Set<string>;
  trozas: number;
}

/**
 * Arma el volumen y la trazabilidad de UN permiso a partir de las filas crudas.
 * Las reglas 1-6 del encabezado son el criterio; cada una está marcada abajo.
 */
export function armarVolumenDelPermiso(e: EntradaVolumenDelPermiso): VolumenDelPermiso {
  const guiasPorId = new Map(e.guias.map((g) => [g.id, g]));

  /* Filas hermanas de cada GTF: a dónde va una troza, y con ella su m³ consumido. */
  const hermanasPorGtf = new Map<string, GuiaEntrada[]>();
  for (const g of e.guias) {
    const k = g.gtf.trim();
    const hermanas = hermanasPorGtf.get(k) ?? [];
    hermanas.push(g);
    hermanasPorGtf.set(k, hermanas);
  }
  const corridaEntradaPorId = new Map(e.corridas.map((c) => [c.id, c]));

  /* Las trozas que cada corrida se comió de cada fila, por fila de DESTINO. */
  const marcadasPorConsumo = new Map<string, Map<string, { m3: number; piezas: number }>>();
  for (const t of e.trozas) {
    if (!t.consumidaEnId || !guiasPorId.has(t.woodEntryId)) continue;
    const destino = filaDeLaTroza(t, guiasPorId, hermanasPorGtf);
    if (!destino) continue;
    const k = `${t.woodEntryId}\u0000${t.consumidaEnId}`;
    const porDestino = marcadasPorConsumo.get(k) ?? new Map<string, { m3: number; piezas: number }>();
    marcadasPorConsumo.set(k, porDestino);
    const acc = porDestino.get(destino) ?? { m3: 0, piezas: 0 };
    acc.m3 += Math.max(numero(t.volumenM3), 0);
    acc.piezas += 1;
    porDestino.set(destino, acc);
  }

  /* ── Consumos (regla 2: el m³ consumido sale SÓLO de acá) ── */
  const vistos = new Set<string>();
  /** fila de destino → corrida → lo que esa corrida se comió de esa fila (exacto). */
  const consumosPorGuia = new Map<string, Map<string, ConsumoDeGuia>>();
  const consumidoPorGuia = new Map<string, number>();
  const deEstePorCorrida = new Map<string, number>();
  const totalPorCorrida = new Map<string, number>();
  const gtfsPorCorrida = new Map<string, Set<string>>();
  for (const c of e.consumos) {
    const k = c.id || `${c.corridaId}\u0000${c.woodEntryId}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    const m3 = numero(c.m3);
    totalPorCorrida.set(c.corridaId, (totalPorCorrida.get(c.corridaId) ?? 0) + m3);
    const g = guiasPorId.get(c.woodEntryId);
    if (!g) continue;
    deEstePorCorrida.set(c.corridaId, (deEstePorCorrida.get(c.corridaId) ?? 0) + m3);
    const gtfs = gtfsPorCorrida.get(c.corridaId) ?? new Set<string>();
    gtfs.add(g.gtf);
    gtfsPorCorrida.set(c.corridaId, gtfs);
    for (const [fila, parte] of repartirConsumo(c, g, m3, marcadasPorConsumo, hermanasPorGtf, corridaEntradaPorId)) {
      consumidoPorGuia.set(fila, (consumidoPorGuia.get(fila) ?? 0) + parte);
      const porCorrida = consumosPorGuia.get(fila) ?? new Map<string, ConsumoDeGuia>();
      consumosPorGuia.set(fila, porCorrida);
      const prev = porCorrida.get(c.corridaId);
      if (prev) prev.m3 += parte;
      else porCorrida.set(c.corridaId, { corridaId: c.corridaId, lineNo: c.corridaLineNo, fecha: c.corridaFecha, m3: parte });
    }
  }

  /* ── Despachos vivos ── */
  const despachosPorId = new Map(e.despachos.map((d) => [d.id, d]));
  const accDespachos = new Map<string, AccDespacho>();
  const accDespacho = (id: string): AccDespacho => {
    const prev = accDespachos.get(id);
    if (prev) return prev;
    const nuevo: AccDespacho = { aserradaM3: 0, rollizaM3: 0, corridas: new Set(), trozas: 0 };
    accDespachos.set(id, nuevo);
    return nuevo;
  };

  /* ── Trozas por guía (criterio ADR-431) y rolliza que salió sin aserrar ── */
  const trozasPorGuia = new Map<string, TrozasDeGuia>();
  const despachadoRollizaPorGuia = new Map<string, number>();
  for (const t of e.trozas) {
    const fila = filaDeLaTroza(t, guiasPorId, hermanasPorGtf);
    if (!fila) continue;
    const acc = trozasPorGuia.get(fila) ?? trozasEnCero();
    trozasPorGuia.set(fila, acc);
    acc.total += 1;
    const cubeta = cubetaDe(t);
    if (cubeta) acc[cubeta] += 1;
    if (cubeta === "despachadas" && t.despachadaEnId && despachosPorId.has(t.despachadaEnId)) {
      const v = numero(t.volumenM3);
      despachadoRollizaPorGuia.set(fila, (despachadoRollizaPorGuia.get(fila) ?? 0) + v);
      const d = accDespacho(t.despachadaEnId);
      d.rollizaM3 += v;
      d.trozas += 1;
    }
  }

  /* ── Guías ── */
  const guias: GuiaDelPermiso[] = e.guias.map((g) => {
    const consumos = [...(consumosPorGuia.get(g.id)?.values() ?? [])]
      .map<ConsumoDeGuia>((c) => ({ ...c, m3: r4(c.m3) }))
      .sort((a, b) => tiempo(a.fecha) - tiempo(b.fecha) || porNumero(a.lineNo, b.lineNo) || texto(a.corridaId, b.corridaId));
    const consumido = consumidoPorGuia.get(g.id) ?? 0;
    const despachado = despachadoRollizaPorGuia.get(g.id) ?? 0;
    const m3 = numero(g.m3);
    return {
      id: g.id,
      gtf: g.gtf,
      fecha: g.fechaRecepcion ?? g.fechaAsiento,
      especie: g.especie,
      producto: g.producto,
      m3: r4(m3),
      piezas: Math.round(numero(g.piezas)),
      proveedor: (g.proveedor ?? "").trim() || null,
      consumidoM3: r4(consumido),
      despachadoRollizaM3: r4(despachado),
      saldoM3: r4(m3 - consumido - despachado),
      trozas: trozasPorGuia.get(g.id) ?? null,
      consumos,
      fotos: g.fotos,
      costo: g.costo == null ? null : numero(g.costo),
    };
  });
  guias.sort((a, b) => tiempo(a.fecha) - tiempo(b.fecha) || texto(a.gtf, b.gtf) || texto(a.id, b.id));

  /* ── Corridas (regla 1: atadas + heredadas en proporción; las de otro permiso, a avisos) ── */
  const corridasDeOtroPermiso: AvisosDelPermiso["corridasDeOtroPermiso"] = [];
  const corridas: CorridaDelPermiso[] = [];
  const corridasVistas = new Set<string>();
  /* Sin redondear: la parte y el m³ del permiso se acumulan exactos y se redondean al publicar. */
  const parteExacta = new Map<string, number>();
  const m3DelPermisoExacto = new Map<string, number>();
  for (const c of e.corridas) {
    if (corridasVistas.has(c.id)) continue;
    corridasVistas.add(c.id);
    const atada = c.contratoId === e.contratoId;
    const comioDeAca = gtfsPorCorrida.has(c.id);
    const deEste = deEstePorCorrida.get(c.id) ?? 0;
    if (!atada) {
      if (!comioDeAca) continue;
      if (c.contratoId) {
        corridasDeOtroPermiso.push({
          id: c.id,
          lineNo: c.lineNo,
          contratoCodigo: e.codigosDeContratos[c.contratoId] ?? null,
          consumidoM3: r4(deEste),
        });
        continue;
      }
    }
    const total = totalPorCorrida.get(c.id) ?? 0;
    const parte = atada ? 1 : total > 0 ? Math.min(1, deEste / total) : 1;
    const m3 = m3DeCantidad(c.cantidad, c.unidad);
    parteExacta.set(c.id, parte);
    m3DelPermisoExacto.set(c.id, m3 == null ? 0 : m3 * parte);
    corridas.push({
      id: c.id,
      lineNo: c.lineNo,
      fecha: c.fecha,
      especie: c.especie,
      tipo: c.tipo,
      cantidad: numero(c.cantidad),
      unidad: c.unidad,
      piezas: c.piezas,
      m3: m3 == null ? null : r4(m3),
      origen: atada ? "atada" : "heredada",
      parte: r4(parte),
      m3DelPermiso: m3 == null ? null : r4(m3 * parte),
      consumidoM3: r4(deEste),
      guias: [...(gtfsPorCorrida.get(c.id) ?? [])].sort(texto),
      lote: (c.lote ?? "").trim() || null,
      despachadoM3: 0,
    });
  }
  corridas.sort((a, b) => tiempo(a.fecha) - tiempo(b.fecha) || porNumero(a.lineNo, b.lineNo) || texto(a.id, b.id));
  const corridaPorId = new Map(corridas.map((c) => [c.id, c]));

  /* ── Aserrada que salió: cada tramo en la unidad de su corrida, × la parte del permiso ── */
  const despachadoPorCorrida = new Map<string, number>();
  for (const o of e.origenes) {
    const c = corridaPorId.get(o.corridaId);
    if (!c || !despachosPorId.has(o.despachoId)) continue;
    const m3 = m3DeCantidad(o.cantidad, c.unidad);
    const delPermiso = m3 == null ? 0 : m3 * (parteExacta.get(c.id) ?? 1);
    despachadoPorCorrida.set(c.id, (despachadoPorCorrida.get(c.id) ?? 0) + delPermiso);
    const d = accDespacho(o.despachoId);
    d.aserradaM3 += delPermiso;
    d.corridas.add(c.id);
  }
  for (const c of corridas) c.despachadoM3 = r4(despachadoPorCorrida.get(c.id) ?? 0);

  const despachos: DespachoDelPermiso[] = [...accDespachos.entries()]
    .map(([id, acc]) => {
      const d = despachosPorId.get(id);
      return d
        ? {
            id,
            lineNo: d.lineNo,
            fecha: d.fecha,
            gtf: d.gtf,
            destino: d.destino,
            especie: d.especie,
            tipo: d.tipo,
            m3: r4(acc.aserradaM3 + acc.rollizaM3),
            rollizaM3: r4(acc.rollizaM3),
            corridaIds: [...acc.corridas].sort(texto),
            trozas: acc.trozas,
          }
        : null;
    })
    .filter((d): d is DespachoDelPermiso => d != null)
    .sort((a, b) => tiempo(a.fecha) - tiempo(b.fecha) || porNumero(a.lineNo, b.lineNo) || texto(a.id, b.id));

  /* ── Por especie: la guía pone el nombre; la corrida, si no entró por guía ── */
  const especiesAcc = new Map<string, AccEspecie>();
  const especieDe = (clave: string, rotulo: string): AccEspecie => {
    const prev = especiesAcc.get(clave);
    if (prev) return prev;
    const nuevo: AccEspecie = {
      clave,
      especie: rotulo.trim() || SIN_ESPECIE,
      guias: 0,
      piezas: 0,
      ingresadoM3: 0,
      consumidoM3: 0,
      despachadoRollizaM3: 0,
      corridas: 0,
      producidoM3: 0,
      despachadoM3: 0,
    };
    especiesAcc.set(clave, nuevo);
    return nuevo;
  };
  for (const g of guias) {
    const acc = especieDe(claveEspecie(g.especie), g.especie);
    acc.guias += 1;
    acc.piezas += g.piezas;
    acc.ingresadoM3 += numero(guiasPorId.get(g.id)?.m3);
    acc.consumidoM3 += consumidoPorGuia.get(g.id) ?? 0;
    acc.despachadoRollizaM3 += despachadoRollizaPorGuia.get(g.id) ?? 0;
  }
  const porTipoAcc = new Map<string, FilaTipoDelPermiso & { m3Exacto: number; sinConvertir: boolean }>();
  for (const c of corridas) {
    const clave = claveEspecie(c.especie);
    const acc = especieDe(clave, c.especie ?? "");
    const m3 = m3DelPermisoExacto.get(c.id) ?? 0;
    acc.corridas += 1;
    acc.producidoM3 += m3;
    acc.despachadoM3 += despachadoPorCorrida.get(c.id) ?? 0;

    const tipo = (c.tipo ?? "").trim() || SIN_TIPO;
    const kTipo = `${clave}\u0000${tipo}`;
    const fila = porTipoAcc.get(kTipo) ?? {
      clave,
      especie: acc.especie,
      tipo,
      corridas: 0,
      piezas: 0,
      m3: 0,
      pt: 0,
      m3Exacto: 0,
      sinConvertir: false,
    };
    porTipoAcc.set(kTipo, fila);
    fila.corridas += 1;
    /* Las piezas de una heredada también van en proporción: la corrida entera no es de este permiso. */
    fila.piezas += Math.round(numero(c.piezas) * (parteExacta.get(c.id) ?? 1));
    fila.m3Exacto += m3;
    /* Regla 3 + 6: una corrida en kg dentro de la fila deja su m³ sin calcular — «—», no un total parcial. */
    if (c.m3 == null) fila.sinConvertir = true;
  }

  const especies: FilaEspecieDelPermiso[] = [...especiesAcc.values()]
    .map((a) => {
      const aserrablePt = pieTablarAserrableDe(a.ingresadoM3, RENDIMIENTO_META);
      const producidoPt = Math.round(a.producidoM3 * PT_POR_M3);
      return {
        clave: a.clave,
        especie: a.especie,
        guias: a.guias,
        piezas: a.piezas,
        ingresadoM3: r4(a.ingresadoM3),
        consumidoM3: r4(a.consumidoM3),
        despachadoRollizaM3: r4(a.despachadoRollizaM3),
        saldoRollizaM3: r4(a.ingresadoM3 - a.consumidoM3 - a.despachadoRollizaM3),
        aserrablePt,
        corridas: a.corridas,
        producidoM3: r4(a.producidoM3),
        producidoPt,
        despachadoM3: r4(a.despachadoM3),
        saldoPt: aserrablePt - producidoPt,
        sinIngreso: a.guias === 0,
      };
    })
    .sort(
      (a, b) =>
        Number(a.sinIngreso) - Number(b.sinIngreso) ||
        b.ingresadoM3 - a.ingresadoM3 ||
        b.producidoM3 - a.producidoM3 ||
        texto(a.especie, b.especie),
    );

  const porTipo: FilaTipoDelPermiso[] = [...porTipoAcc.values()]
    .map(({ m3Exacto, sinConvertir, ...f }) => ({
      ...f,
      m3: sinConvertir ? null : r4(m3Exacto),
      pt: sinConvertir ? null : Math.round(m3Exacto * PT_POR_M3),
    }))
    /* Dentro de la especie, m³ desc; la fila sin calcular («—») al final. */
    .sort((a, b) => texto(a.especie, b.especie) || (b.m3 ?? -1) - (a.m3 ?? -1) || texto(a.tipo, b.tipo));

  /* ── Avisos ── */
  /* Sin materia prima = atada sin un m³ de las guías de ESTE permiso (`consumidoM3` 0), aunque haya comido de
     otro: la producción queda acá y ninguna guía de acá la respalda. Es la misma lista que pinta Trazabilidad. */
  const sinMateriaPrima = corridas.filter((c) => c.origen === "atada" && !(c.consumidoM3 > 0));
  const avisos: AvisosDelPermiso = {
    especiesSinIngreso: especies
      .filter((f) => f.sinIngreso)
      .map((f) => ({ especie: f.especie, m3: f.producidoM3, corridas: f.corridas }))
      .sort((a, b) => b.m3 - a.m3 || texto(a.especie, b.especie)),
    corridasSinAtar: corridas
      .filter((c) => c.origen === "heredada")
      .map((c) => ({ id: c.id, lineNo: c.lineNo, especie: c.especie, m3: c.m3, consumidoM3: c.consumidoM3 })),
    corridasDeOtroPermiso: corridasDeOtroPermiso.sort((a, b) => porNumero(a.lineNo, b.lineNo) || texto(a.id, b.id)),
    corridasSinMateriaPrima: {
      cantidad: sinMateriaPrima.length,
      m3: r4(sinMateriaPrima.reduce((s, c) => s + (c.m3 ?? 0), 0)),
      ids: sinMateriaPrima.map((c) => c.id),
    },
    guiasSinTrozas: guias.filter((g) => g.trozas == null).map((g) => ({ id: g.id, gtf: g.gtf, m3: g.m3 })),
    /* La especie sin ingreso ya tiene su aviso: su techo es 0 y repetirla acá sería el mismo hecho dos veces. */
    excesos: especies
      .filter((f) => !f.sinIngreso && f.saldoPt < 0)
      .map((f) => ({ especie: f.especie, pt: -f.saldoPt }))
      .sort((a, b) => b.pt - a.pt || texto(a.especie, b.especie)),
    sinConvertir: corridas
      .filter((c) => c.m3 == null)
      .map((c) => ({ id: c.id, lineNo: c.lineNo, cantidad: c.cantidad, unidad: c.unidad })),
  };

  /* ── Totales = Σ filas (así la tabla y la cabecera no pueden discrepar) ── */
  const suma = (f: (x: FilaEspecieDelPermiso) => number) => especies.reduce((s, x) => s + f(x), 0);
  const ingresadoM3 = r4(suma((x) => x.ingresadoM3));
  const producidoM3 = r4(suma((x) => x.producidoM3));
  const aserrablePt = suma((x) => x.aserrablePt);
  const producidoPt = suma((x) => x.producidoPt);
  const totales: TotalesDelPermiso = {
    guias: guias.length,
    trozas: guias.reduce((s, g) => s + (g.trozas ? g.trozas.total - g.trozas.retrozadas : 0), 0),
    piezas: suma((x) => x.piezas),
    ingresadoM3,
    consumidoM3: r4(suma((x) => x.consumidoM3)),
    despachadoRollizaM3: r4(suma((x) => x.despachadoRollizaM3)),
    saldoRollizaM3: r4(suma((x) => x.saldoRollizaM3)),
    aserrablePt,
    corridas: corridas.length,
    producidoM3,
    producidoPt,
    despachos: despachos.length,
    despachadoM3: r4(despachos.reduce((s, d) => s + d.m3, 0)),
    saldoPt: aserrablePt - producidoPt,
    rendimientoPct: ingresadoM3 > 0 && producidoM3 > 0 ? r2((producidoM3 / ingresadoM3) * 100) : null,
  };

  return { contratoId: e.contratoId, codigo: e.codigo, totales, especies, porTipo, guias, corridas, despachos, avisos };
}
