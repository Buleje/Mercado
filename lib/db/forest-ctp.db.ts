/**
 * ForestCtpDB — Libro CTP: producción/transformación + despacho + saldos de planta (ADR-127).
 * El ingreso de materia prima vive en `WoodEntry` (ADR-124); acá producción y despacho.
 * Patrón Buleje: tenantId 1er param · cache invalidate · lineNo correlativo.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import {
  MOTIVO_TITULAR_DEL_CENTRO,
  esDuenoMadera,
  etiquetaDeDueno,
  revisarDueno,
  titularQueQueda,
} from "@/lib/forestal/dueno-de-la-madera";
import {
  MOTIVO_TITULAR_COBRADO,
  debeDejarDeCobrar,
  precioManualDelDetalle,
  titularBloqueadoPorCobro,
} from "@/lib/forestal/aserrio-cobro";
import type { ResultadoCobro } from "@/lib/forestal/tarifa-aserrio";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { esCampoSinDato, marcadorDeAusencia } from "@/lib/forestal/campo-sin-dato";
import {
  ForestCtpConsumoDB,
  CtpInvariantError,
  CONSUMO_VIGENTE,
  CTP_TX_OPTS,
} from "./forest-ctp-consumo.db";
import { ORIGEN_VIGENTE, ForestCtpDespachoDB } from "./forest-ctp-despacho.db";
import { ForestCtpCierreDB } from "./forest-ctp-cierre.db";
import { ForestEspeciesDB } from "./forest-especies.db";
/* El cobro del aserrío (ADR-412) no importa este archivo: la dependencia va en
   un solo sentido, igual que con `wood-entries.db`. */
import { ForestAserrioDB } from "./forest-aserrio.db";
import { saldosDeCorridas } from "./forest-ctp-saldo-corrida";
/* Las trozas de una corrida se leen SIEMPRE por acá (ADR-326 §6: las tres
   lecturas dicen lo mismo). `wood-entries.db` no importa este archivo, así que
   la dependencia va en un solo sentido. */
import { WoodEntriesDB } from "./wood-entries.db";
import {
  agruparMovimiento,
  pasoParaBarras,
  type MovimientoDelLibro,
} from "@/lib/forestal/movimiento-libro";
import { RENDIMIENTO_TOPE_PCT, topeDeclarableM3 } from "@/lib/forestal/produccion-paquetes";
import { estaDisponible, type TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { jornadasDesdeFilas, SIN_DUENO, type JornadaDelLibro } from "@/lib/forestal/detalle-de-jornada";
import {
  entraConDuenos,
  resumirJornadas,
  type DuenosPorDia,
  type ResumenDeJornadas,
} from "@/lib/forestal/resumen-de-jornadas";
import type { CorridaDelDia } from "@/lib/forestal/piezas-del-dia";
import { agregarSinOrigen, type CorridaSinOrigen } from "@/lib/forestal/loctp-consumos-analisis";
import { reservasVencidas, type ReservaVencida } from "@/lib/forestal/reservas-vencidas";
import { limaDateKey } from "@/lib/utils";
import { ForestContratoDB } from "@/lib/db/forest-contrato.db";

export const CTP_SECTIONS = ["produccion", "despacho"] as const;
export type CtpSection = (typeof CTP_SECTIONS)[number];

const CACHE_PREFIX = "forest-ctp";
const dec = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? null : new Prisma.Decimal(v);

/** Redondeo a 4 decimales — precisión forestal (igual que `WoodEntry.volumeM3`). */
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * La reserva VIVA de una fila del patio, como la lee la pantalla (ADR-418).
 *
 * `hasta` sale como DÍA («2026-09-18») y no como instante, a propósito: es un
 * plazo que se pacta por día, y mandarlo con hora lo expone al off-by-one de
 * Lima (medianoche UTC formateada en UTC-5 es el día anterior — la misma trampa
 * de `fecha sin hora`). `creadoAt` sí es un instante y va en ISO completo.
 */
function apartadoDto(a: {
  id: string;
  para: string;
  hasta: Date | null;
  nota: string | null;
  creadoAt: Date;
}): { id: string; para: string; hasta: string | null; nota: string | null; creadoAt: string } {
  return {
    id: a.id,
    para: a.para,
    hasta: a.hasta ? a.hasta.toISOString().slice(0, 10) : null,
    nota: a.nota,
    creadoAt: a.creadoAt.toISOString(),
  };
}

/**
 * Qué corrida tiene producto EN EL PATIO: la misma respuesta para Productos
 * disponibles y para la campana de reservas vencidas (2026-09-23).
 *
 * Antes la campana sólo descartaba lo anulado/borrado, y una reserva sobre
 * madera ya marcada como usada —o ya despachada entera— salía «congelada»,
 * sumaba en la pestaña y «Ver en Productos disponibles» llevaba a una fila que
 * la tabla no dibuja. Dos lecturas del mismo patio con dos criterios mienten
 * en una de las dos: por eso el criterio vive acá, una vez.
 *
 * Es la mitad del criterio que se puede decir en el WHERE; la otra mitad es el
 * saldo (`tieneDisponible`), que sale de `saldosDeCorridas`.
 */
function whereCorridaEnElPatio(
  tenantId: string,
  opts: { incluirUsados?: boolean } = {},
): Prisma.ForestCtpEntryWhereInput {
  return {
    tenantId,
    section: "produccion",
    deletedAt: null,
    status: "registrado",
    /* Sin cantidad declarada no hay producto: es una corrida que consumió y
       todavía no dijo qué salió (ADR-340). */
    quantity: { not: null },
    /**
     * Y sin ORIGEN tampoco hay producto disponible (Brandon, 2026-09-10).
     *
     * Las corridas de «Producir sin lote» declaran producto antes de que
     * exista el lote: el hecho físico ocurrió y el libro lo registra, pero
     * esa madera **no se puede despachar ni vender** hasta que diga de qué
     * trozas salió. Ofrecerla en Productos disponibles sería ofrecer madera
     * sin cadena de custodia, que es exactamente lo que una GTF no puede
     * amparar.
     *
     * Origen = volumen de entrada declarado, o consumos atribuidos. (El lote
     * vinculado escribe las dos cosas, así que no hace falta mirarlo aparte.)
     * En cuanto se vincula, la corrida aparece sola: no hay nada que tocar
     * después.
     */
    OR: [{ volumeInputM3: { gt: 0 } }, { consumos: { some: {} } }],
    ...(opts.incluirUsados ? {} : { usadoAt: null }),
  };
}

/**
 * «Solo este permiso» (ADR-421) para las líneas del libro: producción,
 * despacho y lo que sigue en el patio.
 *
 * Una línea es del contrato si lo tiene ATADO (`contratoId`) o si la madera de
 * la que sale lo tiene: la corrida hereda el permiso de lo que consumió —igual
 * que `productosDisponibles` hereda el `originCode`— y el despacho el de las
 * corridas (o trozas) que despacha. Sin la herencia, el filtro sólo vería las
 * líneas cargadas con el chip puesto y escondería justo la producción
 * vinculada a guías de ese permiso.
 *
 * Una corrida que mezcla madera de dos permisos aparece en los dos: contesta
 * «¿esto toca este permiso?», no reparte volumen. Cada salto lleva `tenantId`
 * aunque la FK ya lo implique: el aislamiento no descansa en la FK.
 *
 * Va siempre dentro de un `AND`: el `OR` de arriba es de la búsqueda libre (y
 * del criterio de patio), y pisarlo devolvería cualquier cosa.
 */
export function whereCtpDelContrato(
  tenantId: string,
  contratoId: string,
): Prisma.ForestCtpEntryWhereInput {
  const ingresoDelContrato: Prisma.WoodEntryWhereInput = { tenantId, contratoId, deletedAt: null };
  const corridaDelContrato: Prisma.ForestCtpEntryWhereInput = {
    tenantId,
    OR: [
      { contratoId },
      { consumos: { some: { tenantId, woodEntry: ingresoDelContrato } } },
      { trozasConsumidas: { some: { tenantId, entry: ingresoDelContrato } } },
    ],
  };
  return {
    OR: [
      ...(corridaDelContrato.OR as Prisma.ForestCtpEntryWhereInput[]),
      { trozasDespachadas: { some: { tenantId, entry: ingresoDelContrato } } },
      { origenes: { some: { tenantId, produccion: corridaDelContrato } } },
    ],
  };
}

/** Un producto agotado no es un producto disponible con cero: es uno que ya no está. */
const tieneDisponible = (s: { disponible: number } | undefined): boolean => (s?.disponible ?? 0) > 0;

/** Filtro de rango de fechas compartido por `list` y `saldos` (undefined = sin límite). */
function dateRange(opts: { fromDate?: Date; toDate?: Date }): Prisma.DateTimeFilter | undefined {
  if (!opts.fromDate && !opts.toDate) return undefined;
  const range: Prisma.DateTimeFilter = {};
  if (opts.fromDate) range.gte = opts.fromDate;
  if (opts.toDate) range.lte = opts.toDate;
  return range;
}

/**
 * Clave de agrupación por especie. Normaliza para que "Shihuahuaco",
 * "shihuahuaco " y "SHIHUAHUACO" (WoodEntry vs. ForestCtpEntry, tipeados a
 * mano en formularios distintos) caigan en el mismo balance.
 *
 * FIX 2026-08-22: delega en `claveEspecie` (misma fuente que LOTH) — la
 * versión anterior no quitaba tildes, así que "Ishpingo" (WoodEntry) e
 * "Ishpíngo" (ForestCtpEntry, mismo caso que el comentario de arriba
 * describe) caían en DOS baldes separados. Con `especiesEnNegativo` restando
 * hasta 25 puntos del score de cumplimiento, un typo de tilde entre las dos
 * tablas podía inventar un "saldo negativo" falso — el ingreso de uno se
 * contaba aparte del consumo del otro.
 */
function speciesKey(raw: string | null | undefined): string {
  return claveEspecie(raw) || "—";
}

/**
 * Clave de agrupación de un producto transformado (tipo + especie).
 *
 * SINGLE SOURCE: antes `saldos()` usaba `"tipo · especie"` y `availableSource()`
 * usaba `"tipo|especie"`, sin normalizar ninguna de las dos — o sea que
 * "Tablones|Tornillo" y "tablones|tornillo " contaban como productos distintos
 * y el stock se partía en dos. Mismo criterio que `speciesKey`.
 */
function productKey(
  productType: string | null | undefined,
  species: string | null | undefined,
): string {
  return `${speciesKey(productType)}|${speciesKey(species)}`;
}

/** Etiqueta legible del producto (la clave es para agrupar, esto es para mostrar). */
function productLabel(
  productType: string | null | undefined,
  species: string | null | undefined,
): string {
  return `${productType ?? "—"} · ${species ?? "—"}`;
}

/**
 * La especie que lleva dentro una etiqueta de producto («Tablones · Tornillo»).
 *
 * Hace falta porque el snapshot de un cierre guarda el producto SÓLO como
 * etiqueta, sin la especie en un campo aparte, y la apertura de la conciliación
 * tiene que poder recortarse por especie igual que el movimiento (ADR-400). Se
 * corta por el ÚLTIMO separador: el tipo de producto puede traer el suyo, la
 * especie va siempre al final porque así la escribe `productLabel`.
 */
function especieDeProductLabel(label: string): string {
  const i = label.lastIndexOf(" · ");
  return i >= 0 ? label.slice(i + 3).trim() : "";
}

/**
 * Los campos de una corrida que se pueden COMPLETAR cuando están vacíos
 * (ADR-401 §1.2). Ni `quantity` ni `volumeInputM3` ni `unit` ni `entryDate`:
 * ponerles un valor mueve saldos e invariantes, y para eso está
 * `declarar_produccion`, que es otra puerta con otras reglas.
 */
export const CAMPOS_COMPLETABLES = [
  "observations",
  "presentacion",
  "materiaPrimaRef",
  "speciesCommon",
  "speciesScientific",
  "productType",
  /* De quién es la madera (ADR-412). Va acá y no en los «del registro»: no
     cambia qué se produjo ni cuánto, así que ningún saldo depende de él. */
  "duenoMadera",
  "titularNombre",
] as const;
export type CampoCompletable = (typeof CAMPOS_COMPLETABLES)[number];

/**
 * Los campos que se pueden CORREGIR (sobrescribir) — ADR-401 §1. Incluye los
 * numéricos, que `completarLinea` no toca: ahí ponerle valor a un hueco movería
 * saldos, pero corregir uno ya escrito es justamente lo que se pide cuando se
 * cargó mal.
 */
export const CAMPOS_CORREGIBLES = [
  "observations",
  "presentacion",
  "materiaPrimaRef",
  "speciesCommon",
  "speciesScientific",
  "productType",
  "unit",
  "quantity",
  "volumeInputM3",
  "originCode",
  "duenoMadera",
  "titularNombre",
] as const;
export type CampoCorregible = (typeof CAMPOS_CORREGIBLES)[number];

/**
 * Los del REGISTRO entre los corregibles: piden que nada dependa del asiento.
 *
 * `originCode` NO está, y es deliberado (ADR-402): el permiso declarado del
 * asiento sólo existe donde no hay guía de la que heredarlo, así que hoy es un
 * **hueco**, no una afirmación que algo esté citando. Además el permiso de una
 * guía ya se corrige con los mismos candados (`WoodEntriesDB.corregirGuia`):
 * ser más estricto acá dejaría el mismo dato con dos reglas según dónde viva.
 */
const CAMPOS_CORREGIBLES_DEL_REGISTRO: readonly CampoCorregible[] = [
  "speciesCommon",
  "speciesScientific",
  "productType",
  "unit",
  "quantity",
  "volumeInputM3",
];

const ETIQUETA_CAMPO_CORREGIBLE: Record<CampoCorregible, string> = {
  originCode: "N° de permiso",
  duenoMadera: "dueño de la madera",
  titularNombre: "titular de la madera",
  observations: "observaciones",
  presentacion: "presentación",
  materiaPrimaRef: "referencia de materia prima",
  speciesCommon: "especie",
  speciesScientific: "especie científica",
  productType: "producto",
  unit: "unidad",
  quantity: "cantidad",
  volumeInputM3: "volumen consumido",
};

/** Los que definen QUÉ se produjo: no se tocan si algo depende del asiento. */
const CAMPOS_DEL_REGISTRO: readonly CampoCompletable[] = [
  "speciesCommon",
  "speciesScientific",
  "productType",
];

/** Cómo se llama cada campo en el detalle de auditoría, en el idioma del libro. */
const ETIQUETA_CAMPO: Record<CampoCompletable, string> = {
  observations: "observaciones",
  duenoMadera: "dueño de la madera",
  titularNombre: "titular de la madera",
  presentacion: "presentación",
  materiaPrimaRef: "referencia de materia prima",
  speciesCommon: "especie",
  speciesScientific: "especie científica",
  productType: "producto",
};

export interface SpeciesBalance {
  especie: string;
  scientific: string | null;
  cites: boolean;
  /** m³ de madera validada/procesada que entró en el período. */
  ingresoM3: number;
  /** m³ registrados pero aún sin validar — no computan como disponible. */
  pendienteM3: number;
  /** m³ consumidos en líneas de producción. */
  consumidoM3: number;
  /**
   * m³ que salieron SIN ASERRAR (ADR-363): madera vendida en rollo. Dejó el
   * patio igual que la consumida, pero no pasó por ninguna corrida — por eso es
   * una columna propia y no se suma a `consumidoM3`, que significa "se aserró".
   */
  despachadoDirectoM3: number;
  /** ingresoM3 − consumidoM3 − despachadoDirectoM3. Negativo = salió más de lo que entró. */
  saldoM3: number;
  ingresosCount: number;
  /**
   * Trozas de esta especie que HOY se pueden mandar a la sierra —mismo
   * predicado que el patio (`estaDisponible`, ADR-345): ni consumida, ni
   * despachada sin aserrar, ni sin recepcionar, ni descarte, ni madre
   * retrozada. Es el conteo que se ve parado frente a la pila, no una cuenta
   * nueva — reusar el predicado evita la tercera lectura divergente de la
   * misma madera (memoria: "47 vs 30").
   */
  piezasDisponibles: number;
}

/**
 * Conciliación de período (ADR-139 rollforward): existencia de APERTURA + movimientos del
 * período = existencia FINAL. Sin apertura, un saldo mensual ignora el stock
 * heredado y no cuadra ante un fiscalizador. La apertura sale del cierre anterior
 * (frozen) o se calcula acumulada hasta el inicio del período.
 */
export interface ConciliacionPeriodo {
  /** De dónde salió la apertura: "cierre" (snapshot congelado), "calculada" (acumulada), "sin_apertura" (período histórico). */
  fuenteApertura: "cierre" | "calculada" | "sin_apertura";
  /** Etiqueta del cierre que dio la apertura, si aplica ("marzo de 2026"). */
  aperturaLabel: string | null;
  materiaPrima: {
    especie: string;
    cites: boolean;
    apertura: number;
    ingreso: number;
    consumido: number;
    /** m³ que salieron SIN aserrar (ADR-363). También dejan el patio. */
    despachadoDirecto: number;
    final: number;
    negativa: boolean;
  }[];
  productos: {
    producto: string;
    apertura: number;
    producido: number;
    despachado: number;
    final: number;
    negativo: boolean;
  }[];
}

export interface CtpEntryInput {
  section: CtpSection;
  entryDate?: Date;
  gtfIngreso?: string | null;
  materiaPrimaRef?: string | null;
  /**
   * El permiso DECLARADO del asiento (ADR-402): sólo vale para la corrida que
   * no consumió ninguna guía de la que heredarlo —una existencia de apertura o
   * una producción sin lote (ADR-408)—. Donde hay consumos manda el
   * `originCode` del ingreso; acá no se pisa nada, se llena un hueco.
   */
  originCode?: string | null;
  /** El contrato/permiso bajo el que se produjo (ADR-421). Cuando la corrida
   *  consume guías, lo natural es heredarlo de ellas; acá se guarda el elegido
   *  para las que no consumen ninguna. */
  contratoId?: string | null;
  /**
   * De quién es la madera (ADR-412): `"propia"` | `"tercero"` | `null`.
   *
   * Mismo hueco que `originCode`: una corrida sin lote no tiene de dónde
   * heredar el titular, y un centro que asierra por encargo produce madera que
   * no es suya. `null` es «no se declaró», no «es propia».
   */
  duenoMadera?: string | null;
  /** Quién, cuando es de tercero. Acta: se guarda tal como se certificó. */
  titularNombre?: string | null;
  speciesCommon?: string | null;
  speciesScientific?: string | null;
  cites?: boolean;
  productType?: string | null;
  volumeInputM3?: number | string | null;
  rendimientoPct?: number | string | null;
  quantity?: number | string | null;
  unit?: string | null;
  pieces?: number | null;
  gtfNumber?: string | null;
  /** (3) Tipo de documento con el que sale el producto: GTF | GRR (ADR-311). */
  docType?: string | null;
  /** Línea de producción de la corrida: LP | LRE (Cuadro Resumen 3). */
  lineaProduccion?: string | null;
  /** (9) "Código del producto" de la Sección 4 del formato oficial. */
  codigoProducto?: string | null;
  presentacion?: string | null;
  destino?: string | null;
  /** Sello de la verificación de la GTF de salida contra SERFOR (ADR-312). */
  serforNumeroRegistro?: string | null;
  serforVerificadoEn?: Date | null;
  observations?: string | null;
  /** Aserrío / secado / mano de obra (ADR-134). Sin esto no hay margen. */
  costoProceso?: number | string | null;
  /**
   * En cuánto se vendió lo que sale (sólo despacho). Hasta ahora se cargaba
   * únicamente después, con `set_venta` desde el panel de Rentabilidad: quien
   * registraba la salida tenía el precio delante y no había dónde ponerlo, y
   * volver a buscarlo despacho por despacho es lo que dejaba el 100% sin valor.
   * Sigue siendo opcional — a veces la venta se cierra después del camión.
   */
  valorVenta?: number | string | null;
  moneda?: string | null;
  /**
   * La línea es una salida de TROZAS SIN ASERRAR (ADR-363).
   *
   * No se persiste: sólo apaga el chequeo de stock por producto (I3), que no
   * aplica cuando lo que sale es materia prima. El stock de esa línea son las
   * piezas, y lo valida T2 (`assertTrozasDespachables`) antes de crearla.
   */
  desdeTrozas?: boolean;
  /**
   * Qué ingresos alimentaron esta corrida y con cuántos m³ (ADR-134 D5).
   * Se escriben con `ForestCtpConsumoDB.setConsumos`, que valida I1/I2 y tenant.
   */
  consumos?: { woodEntryId: string; volumeM3: number | string }[];
  /**
   * De qué corridas salió el producto de este despacho (ADR-135).
   * Se escriben con `ForestCtpDespachoDB.setOrigenes`, que valida I4/I5,
   * tenant, orientación y que el producto/unidad coincidan.
   */
  origenes?: { produccionEntryId: string; quantity: number | string }[];
  /**
   * Los paquetes que esta corrida ya declara (ADR-349), cuando el llamador los
   * trae de entrada — el import del libro y del inventario de aserrada, que no
   * pasan por `declararProduccion`. El código es único por planta: el llamador
   * valida que esté libre ANTES de llamar (`codigosDePaqueteEnUso`); acá se
   * confía en esa validación, igual que hacen `ampliarProduccion` y
   * `declararProduccion` con la suya.
   */
  paquetes?: {
    codigo: string;
    cantidad: number;
    volumenM3: number | string;
    productType?: string | null;
    presentacion?: string | null;
    espesorCm?: number | string | null;
    anchoCm?: number | string | null;
    largoM?: number | string | null;
    observations?: string | null;
  }[];
  createdBy: string;
}

/**
 * Clave estable de una corrida para el dedup de importación (ADR-138 etapa 2):
 * fecha date-only + producto + especie + cantidad(4 dec). La usan la DB class y
 * el endpoint de import — misma fórmula a ambos lados o el dedup no matchea.
 */
/**
 * La clave VIEJA, sin paquete ni lote.
 *
 * Existe sólo por compatibilidad: las corridas que se importaron antes de que la
 * clave incluyera el paquete no tienen con qué distinguirse. Si al re-importar
 * el mismo libro se las midiera con la clave nueva, no matchearían y la
 * producción entraría DOS VECES — declarar de más es exactamente lo que el
 * libro no puede hacer.
 */
export function produccionKeyBase(
  entryDate: Date | string,
  productType: string | null,
  speciesCommon: string | null,
  quantity: unknown,
): string {
  const d =
    entryDate instanceof Date
      ? entryDate.toISOString().slice(0, 10)
      : String(entryDate ?? "").slice(0, 10);
  const q = quantity == null || quantity === "" ? "" : Number(quantity).toFixed(4);
  return [
    d,
    (productType ?? "").trim().toLowerCase(),
    /* La especie va por `claveEspecie`, la MISMA con la que el libro decide qué
       grafía guardar (ADR-410). Con `toLowerCase()` a secas, un archivo que dice
       «Ishpíngo» o «Tornillo (Cedrelinga cateniformis)» se guardaba como
       «Ishpingo» / «Tornillo» y al reimportar la clave ya no matcheaba: la misma
       corrida entraba DOS VECES. Declarar de más es exactamente lo que el libro
       no puede hacer (encontrado por auditoría, 2026-09-11). */
    claveEspecie(speciesCommon),
    q,
  ].join("|");
}

export function produccionKey(
  entryDate: Date | string,
  productType: string | null,
  speciesCommon: string | null,
  quantity: unknown,
  /**
   * El código del PAQUETE y el LOTE, cuando el archivo los trae.
   *
   * Sin ellos, dos paquetes distintos de la misma especie, el mismo producto y
   * el mismo volumen —lo NORMAL en un inventario de aserrada: los paquetes se
   * arman iguales— tenían la misma clave y el importador descartaba el segundo
   * como «duplicado en el archivo». Se perdía madera que existe en el depósito.
   */
  codigoProducto?: string | null,
  materiaPrimaRef?: string | null,
): string {
  const d =
    entryDate instanceof Date
      ? entryDate.toISOString().slice(0, 10)
      : String(entryDate ?? "").slice(0, 10);
  const q = quantity == null || quantity === "" ? "" : Number(quantity).toFixed(4);
  const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
  return [
    d,
    norm(productType),
    /* Misma normalización que el guardado (ver `produccionKeyBase`). */
    claveEspecie(speciesCommon),
    q,
    norm(codigoProducto),
    norm(materiaPrimaRef),
  ].join("|");
}

/**
 * Clave de un despacho para el dedup de importación (ADR-138 etapa 2b): por su
 * GTF de salida si la tiene (identificador natural), o composite fecha+producto+
 * especie+cantidad+destino si aún no se emitió GTF. Misma fórmula en DB y endpoint.
 */
export function despachoKey(
  gtfNumber: string | null,
  entryDate: Date | string,
  productType: string | null,
  speciesCommon: string | null,
  quantity: unknown,
  destino: string | null,
): string {
  const g = (gtfNumber ?? "").trim();
  if (g) return `gtf:${g.toLowerCase()}`;
  const d =
    entryDate instanceof Date
      ? entryDate.toISOString().slice(0, 10)
      : String(entryDate ?? "").slice(0, 10);
  const q = quantity == null || quantity === "" ? "" : Number(quantity).toFixed(4);
  return [
    d,
    (productType ?? "").trim().toLowerCase(),
    /* Misma normalización que el guardado (ver `produccionKeyBase`). Acá pega
       sólo en los despachos SIN GTF: con guía, la clave es el número. */
    claveEspecie(speciesCommon),
    q,
    (destino ?? "").trim().toLowerCase(),
  ].join("|");
}

/**
 * Los días de un resumen de jornadas, limpios: `YYYY-MM-DD`, sin repetir, en
 * orden y con tope de 31 — el caso real es una semana o un mes; sin tope, una
 * URL armada a mano pediría dos años de golpe.
 */
function diasDeJornadas(dias: readonly string[]): string[] {
  const formato = /^\d{4}-\d{2}-\d{2}$/;
  return [...new Set(dias.filter((d) => formato.test(d)))].slice(0, 31).sort();
}

/**
 * Las corridas vivas de producción de esos días. Un OR de días exactos y no un
 * rango: los días marcados pueden no ser consecutivos, y un `gte/lte` traería
 * los del medio que nadie pidió.
 */
function whereDeJornadas(tenantId: string, dias: readonly string[]): Prisma.ForestCtpEntryWhereInput {
  return {
    tenantId,
    section: "produccion",
    status: "registrado",
    deletedAt: null,
    OR: dias.map((d) => ({
      entryDate: {
        gte: new Date(`${d}T00:00:00.000Z`),
        lt: new Date(new Date(`${d}T00:00:00.000Z`).getTime() + 86_400_000),
      },
    })),
  };
}

export class ForestCtpDB {
  /**
   * Los conteos que ubican a un CTP en su camino de arranque.
   *
   * Un solo viaje a la base con cinco `count`: la guía de primeros pasos se
   * pinta en cada carga del libro y traer las listas enteras para contarlas
   * sería pagar el patio completo para saber si está vacío.
   *
   * La Ficha y el catálogo de especies NO salen de acá: viven en
   * `ForestCtpFichaDB` y `ForestEspeciesDB` (KV, no tablas), y quien arma el
   * estado los pide ahí.
   */
  static async contarParaArranque(tenantId: string): Promise<{
    ingresos: number;
    lotes: number;
    corridas: number;
    despachos: number;
  }> {
    if (!tenantId) throw new Error("tenantId is required");
    const [ingresos, lotes, corridas, despachos] = await Promise.all([
      prisma.woodEntry.count({ where: { tenantId, deletedAt: null } }),
      prisma.forestLoteAserrio.count({ where: { tenantId, deletedAt: null } }),
      prisma.forestCtpEntry.count({ where: { tenantId, deletedAt: null, section: "produccion" } }),
      prisma.forestCtpEntry.count({ where: { tenantId, deletedAt: null, section: "despacho" } }),
    ]);
    return { ingresos, lotes, corridas, despachos };
  }

  /**
   * I3 — no se puede despachar producto que no existe.
   *
   * Simétrico a I2 (que impide consumir materia prima inexistente). Sin esto el
   * módulo era asimétrico: blindaba la entrada y dejaba la salida abierta, y un
   * sobre-despacho sólo se veía en rojo en Saldos DESPUÉS de haberse registrado
   * — o sea, después de que la GTF de salida ya se emitió.
   *
   * `tx` obligatorio + lock: el stock de un producto no vive en una fila, se
   * deriva de N líneas. Se lockean las de producción que lo respaldan, así dos
   * despachos concurrentes del mismo producto se serializan en vez de leer los
   * dos el mismo stock y pasar ambos (el TOCTOU que I2 ya sufrió).
   */
  private static async assertStockDisponible(
    tx: Prisma.TransactionClient,
    tenantId: string,
    input: CtpEntryInput,
  ): Promise<void> {
    const pedido = Number(input.quantity ?? 0);
    if (pedido <= 0) return; // Sin cantidad no hay nada que validar.

    const key = productKey(input.productType, input.speciesCommon);

    // Lock de las líneas de producción del producto = el recurso disputado.
    await tx.$queryRaw`
      SELECT "id" FROM "ForestCtpEntry"
      WHERE "tenantId" = ${tenantId} AND "deletedAt" IS NULL
        AND "status" = 'registrado' AND "section" = 'produccion'
      ORDER BY "id"
      FOR UPDATE
    `;

    const lineas = await tx.forestCtpEntry.findMany({
      where: { tenantId, deletedAt: null, status: "registrado" },
      select: {
        id: true,
        section: true,
        productType: true,
        speciesCommon: true,
        quantity: true,
        unit: true,
      },
    });

    let producido = 0;
    let despachado = 0;
    const idsDelProducto: string[] = [];
    for (const l of lineas) {
      if (productKey(l.productType, l.speciesCommon) !== key) continue;
      if (l.section === "produccion") {
        producido += Number(l.quantity ?? 0);
        idsDelProducto.push(l.id);
      }
      if (l.section === "despacho") despachado += Number(l.quantity ?? 0);
    }

    // Lo que se fue a REPROCESO también salió del stock (ADR-316): esa tabla se
    // convirtió en tablillas y ya no está para despachar. I5 descuenta el
    // reproceso corrida por corrida; acá hace falta el agregado del producto,
    // porque I3 mira el total y no las atribuciones.
    let reprocesado = 0;
    if (idsDelProducto.length > 0) {
      const rep = await tx.forestCtpReproceso.aggregate({
        // Las DOS condiciones: anular una línea pone `status = "anulado"` y no
        // hace soft-delete. Un reproceso anulado devolvió su madera al stock.
        where: {
          tenantId,
          origenEntryId: { in: idsDelProducto },
          destino: { deletedAt: null, status: "registrado" },
        },
        _sum: { quantity: true },
      });
      reprocesado = Number(rep._sum.quantity ?? 0);
    }

    const stock = r4(producido - despachado - reprocesado);

    if (r4(pedido) > stock) {
      const label = productLabel(input.productType, input.speciesCommon);
      const salidas =
        `ya se despacharon ${r4(despachado)}` +
        (reprocesado > 0 ? ` y ${r4(reprocesado)} se reprocesaron` : "");
      throw new CtpInvariantError(
        stock <= 0
          ? `No hay stock de ${label} para despachar: se produjeron ${r4(producido)} y ${salidas}.`
          : `Sólo quedan ${stock} de ${label} sin despachar; estás pidiendo ${r4(pedido)}.`,
        "I3_SOBRE_DESPACHO",
        {
          producto: label,
          stock,
          pedido: r4(pedido),
          producido: r4(producido),
          despachado: r4(despachado),
          reprocesado: r4(reprocesado),
        },
      );
    }
  }

  static async create(tenantId: string, input: CtpEntryInput) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!CTP_SECTIONS.includes(input.section)) throw new Error(`invalid section: ${input.section}`);
    if (!input.createdBy?.trim()) throw new Error("createdBy is required");

    // Cierre de período (ADR-139): no se registra una línea con fecha dentro de
    // un mes ya cerrado — sería alterar un acta inmutable.
    const cerradoCreate = await ForestCtpCierreDB.closedPeriodOf(
      tenantId,
      input.entryDate ?? new Date(),
    );
    if (cerradoCreate) {
      throw new CtpInvariantError(
        `El período ${cerradoCreate.label} está cerrado: no se puede registrar una línea con fecha de un mes cerrado.`,
        "PERIODO_CERRADO",
        { periodKey: cerradoCreate.periodKey },
      );
    }

    // Rendimiento auto si hay input+output en m³ y no se pasó explícito
    let rendimiento = input.rendimientoPct;
    const inVol = input.volumeInputM3 != null ? Number(input.volumeInputM3) : 0;
    const outQty = input.quantity != null ? Number(input.quantity) : 0;
    if (
      rendimiento == null &&
      input.section === "produccion" &&
      inVol > 0 &&
      outQty > 0 &&
      input.unit === "m3"
    ) {
      rendimiento = Math.round((outQty / inVol) * 10000) / 100;
    }

    /* La especie del asiento, contra el catálogo de la planta (ADR-410): se
       escribe como la escribe esta planta y, si el asiento no trae el binomio,
       sale de ahí —es una columna del LO-CTP y el que carga una corrida rara
       vez se lo acuerda—. Se resuelve ACÁ, antes de la transacción: es un KV
       cacheado, no tiene por qué estirar el lock del insert. */
    const especie = await ForestEspeciesDB.resolverEspecie(tenantId, input.speciesCommon);
    const cientifico = input.speciesScientific?.trim() || especie.cientifico;

    // La validación de stock y el INSERT van en UNA transacción: si se valida
    // fuera, entre el chequeo y el insert entra otro despacho y el guard no sirve.
    const entry = await prisma.$transaction(async (tx) => {
      /* Una salida de trozas SIN ASERRAR no se mide contra `producido −
         despachado` (ADR-363): su stock son las PIEZAS, y T2 ya validó que cada
         una esté libre. Medirla con I3 daría stock 0 —nadie produjo madera en
         rollo— y rechazaría una venta legítima. */
      if (input.section === "despacho" && !input.desdeTrozas) {
        await ForestCtpDB.assertStockDisponible(tx, tenantId, input);
      }

      const max = await tx.forestCtpEntry.aggregate({
        where: { tenantId, section: input.section },
        _max: { lineNo: true },
      });
      const lineNo = (max._max.lineNo ?? 0) + 1;

      return tx.forestCtpEntry.create({
        data: {
          tenantId,
          section: input.section,
          lineNo,
          entryDate: input.entryDate ?? new Date(),
          gtfIngreso: input.gtfIngreso?.trim() || null,
          materiaPrimaRef: input.materiaPrimaRef?.trim() || null,
          originCode: input.originCode?.trim() || null,
          contratoId: input.contratoId ?? (await ForestContratoDB.idPorCodigo(tenantId, input.originCode)),
          /* Lo que llegue se normaliza con las reglas del libro: «de tercero»
             sin nombre y «propia» con titular no se guardan a medias. */
          ...(() => {
            const d = revisarDueno({
              dueno: esDuenoMadera(input.duenoMadera) ? input.duenoMadera : null,
              titularNombre: input.titularNombre ?? null,
            }).normalizado;
            return { duenoMadera: d.dueno, titularNombre: d.titularNombre };
          })(),
          speciesCommon: especie.nombre || null,
          speciesScientific: cientifico,
          cites: input.cites ?? false,
          productType: input.productType?.trim() || null,
          volumeInputM3: dec(input.volumeInputM3),
          rendimientoPct: dec(rendimiento),
          quantity: dec(input.quantity),
          unit: input.unit?.trim() || null,
          pieces: input.pieces ?? null,
          gtfNumber: input.gtfNumber?.trim() || null,
          docType: input.docType?.trim() || null,
          lineaProduccion:
            input.section === "produccion" ? input.lineaProduccion?.trim() || "LP" : null,
          codigoProducto: input.codigoProducto?.trim() || null,
          presentacion: input.presentacion?.trim().toUpperCase() || null,
          destino: input.destino?.trim() || null,
          serforNumeroRegistro: input.serforNumeroRegistro?.trim() || null,
          serforVerificadoEn: input.serforVerificadoEn ?? null,
          observations: input.observations?.trim() || null,
          costoProceso: dec(input.costoProceso),
          // Sólo la salida tiene precio de venta: en una corrida de producción
          // no se vende nada todavía.
          valorVenta: input.section === "despacho" ? dec(input.valorVenta) : null,
          moneda: input.moneda?.trim() || "PEN",
          status: "registrado",
          createdBy: input.createdBy,
          /* El BULTO de la corrida (ADR-349), cuando el llamador lo trae. Sin
             esto el import escribía el volumen y descartaba en silencio el
             código, las piezas y las medidas del paquete — el dato estaba en
             el archivo y nunca llegaba a "Productos disponibles". */
          ...(input.paquetes && input.paquetes.length > 0
            ? {
                paquetes: {
                  create: input.paquetes.map((p) => ({
                    tenantId,
                    codigo: p.codigo.trim(),
                    productType: p.productType?.trim() || input.productType?.trim() || null,
                    presentacion: p.presentacion?.trim() || null,
                    cantidad: Math.max(0, Math.round(p.cantidad)),
                    unit: "m3",
                    volumenM3: p.volumenM3,
                    espesorCm: p.espesorCm ?? null,
                    anchoCm: p.anchoCm ?? null,
                    largoM: p.largoM ?? null,
                    observations: p.observations?.trim() || null,
                    createdBy: input.createdBy,
                  })),
                },
              }
            : {}),
        },
      });
    }, CTP_TX_OPTS);

    auditCtp({
      tenantId,
      action: "ctp_linea_create",
      entity: "ForestCtpEntry",
      entityId: entry.id,
      detail: `Registró la línea #${entry.lineNo} de ${input.section} · ${entry.speciesCommon ?? "sin especie"} · ${entry.productType ?? "sin producto"}${entry.quantity != null ? ` · ${Number(entry.quantity)} ${entry.unit ?? ""}` : ""}`,
      user: input.createdBy,
    });

    // La atribución de materia prima va por su propia vía: valida I1/I2 y que
    // los ingresos sean del tenant (ADR-134 D7). Si viola una invariante tira,
    // y la línea recién creada queda sin consumos — visible como `sinAtribuirM3`,
    // que es justo lo que el operador tiene que ir a corregir.
    if (input.consumos?.length) {
      await ForestCtpConsumoDB.setConsumos(tenantId, entry.id, input.consumos, input.createdBy);
    }
    // Ídem para la salida: valida I4/I5 + orientación + producto (ADR-135).
    if (input.origenes?.length) {
      await ForestCtpDespachoDB.setOrigenes(tenantId, entry.id, input.origenes, input.createdBy);
    }

    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {}
    return entry;
  }

  static async list(
    tenantId: string,
    filters: {
      section?: CtpSection;
      search?: string;
      includeAnnulled?: boolean;
      fromDate?: Date;
      toDate?: Date;
      /** «Solo este permiso»: ver `whereCtpDelContrato`. Sin valor = todas. */
      contratoId?: string;
    } = {},
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const where: Prisma.ForestCtpEntryWhereInput = { tenantId, deletedAt: null };
    if (filters.section) where.section = filters.section;
    if (filters.contratoId) where.AND = [whereCtpDelContrato(tenantId, filters.contratoId)];
    if (!filters.includeAnnulled) where.status = "registrado";
    const range = dateRange(filters);
    if (range) where.entryDate = range;
    if (filters.search) {
      where.OR = [
        { speciesCommon: { contains: filters.search, mode: "insensitive" } },
        { productType: { contains: filters.search, mode: "insensitive" } },
        { gtfNumber: { contains: filters.search, mode: "insensitive" } },
        { gtfIngreso: { contains: filters.search, mode: "insensitive" } },
        // El código del paquete es por lo que pregunta el comprador y lo que
        // está pintado en el atado: buscarlo tiene que funcionar.
        { codigoProducto: { contains: filters.search, mode: "insensitive" } },
      ];
    }
    const [entries, total] = await Promise.all([
      prisma.forestCtpEntry.findMany({
        where,
        orderBy: [{ section: "asc" }, { lineNo: "asc" }],
        take: 500,
      }),
      prisma.forestCtpEntry.count({ where }),
    ]);

    /**
     * Cuánto hay en TOTAL para esta sección, sin la ventana de fecha.
     *
     * "Productos disponibles" no filtra por período a propósito (ADR: es una
     * FOTO del depósito, no un movimiento del mes) — así que una corrida vieja
     * sigue apareciendo ahí aunque el libro la esconda por fecha. Sin este
     * número, la diferencia se lee como "se comió un registro" cuando en
     * realidad está fuera de la ventana activa. Sólo se pide cuando HAY un
     * rango: sin fecha no hay nada que esconder.
     */
    const totalSinFiltro = range
      ? await prisma.forestCtpEntry.count({ where: { ...where, entryDate: undefined } })
      : undefined;

    /**
     * ¿Cuánto de cada despacho tiene origen declarado?
     *
     * La atribución parcial es LEGAL (invariante I4: siempre `≤`, nunca `==` —
     * forzar el 100% fabrica el fraude que previene), pero tiene que VERSE: un
     * despacho de 10 m³ con 5 atribuidos son 5 m³ que salieron de la planta sin
     * corrida de origen, y es lo primero que cruza un fiscalizador. Hasta ahora
     * sólo se sabía abriendo el despacho, de a uno.
     *
     * Un `groupBy` por página, igual que el de las corridas de abajo.
     */
    const despachos = entries.filter((e) => e.section === "despacho").map((e) => e.id);
    const atribuido = new Map<string, number>();
    if (despachos.length > 0) {
      const filas = await prisma.forestCtpDespachoOrigen.groupBy({
        by: ["despachoEntryId"],
        where: { tenantId, despachoEntryId: { in: despachos } },
        _sum: { quantity: true },
      });
      for (const f of filas) atribuido.set(f.despachoEntryId, Number(f._sum.quantity ?? 0));
    }

    // ¿Este paquete ya salió? Es la pregunta del reporte "estado de productos":
    // se produjo, ¿sigue en el patio o ya se lo llevaron? Va agregado acá y no
    // en el cliente porque la respuesta son dos tablas puente, no un campo.
    const corridas = entries.filter((e) => e.section === "produccion").map((e) => e.id);
    if (corridas.length === 0) {
      return {
        entries: entries.map((e) =>
          e.section === "despacho" ? { ...e, atribuidoQty: atribuido.get(e.id) ?? 0 } : e,
        ),
        total,
        totalSinFiltro,
      };
    }

    /**
     * ¿De qué ingreso salió la madera que entró a esta corrida?
     *
     * Una corrida sin materia prima atribuida es producto que apareció de la
     * nada: el libro lo admite —el guard vive en el certificado, no en el
     * guardado— pero la fila tiene que decirlo. Consumos ya lo calculaba
     * (`corridasSinOrigen`), sólo que ahí hay que ir a buscarlo; en la tabla de
     * Producción, que es donde se miran las corridas, no se veía.
     *
     * Cierra el trío: el ingreso se cuadra contra sus piezas, la corrida contra
     * su materia prima, el despacho contra su corrida.
     */
    const [salidas, reprocesos, entraPorReproceso, consumos, consumosConOrigen] = await Promise.all(
      [
        prisma.forestCtpDespachoOrigen.groupBy({
          by: ["produccionEntryId"],
          where: {
            tenantId,
            produccionEntryId: { in: corridas },
            despacho: { deletedAt: null, status: "registrado" },
          },
          _sum: { quantity: true },
        }),
        prisma.forestCtpReproceso.groupBy({
          by: ["origenEntryId"],
          // Si la corrida DESTINO se anuló, ese reproceso no consumió nada: la
          // madera del origen volvió a estar disponible. Mismo criterio que el
          // despacho de arriba.
          where: {
            tenantId,
            origenEntryId: { in: corridas },
            destino: { deletedAt: null, status: "registrado" },
          },
          _sum: { quantity: true },
        }),
        /* La MISMA tabla, mirada al revés: lo que ENTRA a la corrida por
         reproceso. `reprocesos` (arriba) agrupa por origen y contesta «cuánto
         de esta corrida se fue a reprocesar»; ésta agrupa por destino y
         contesta «cuánta materia prima llegó desde otra corrida».

         Sin ella, una corrida nacida de un reproceso tenía `mpAtribuidaM3 = 0`
         —porque no consumió ningún WoodEntry— y la fila la acusaba de «sin
         origen declarado» teniendo su cadena completa. Simétrico al filtro de
         arriba: si el ORIGEN se anuló, ese reproceso no aportó nada. */
        prisma.forestCtpReproceso.groupBy({
          by: ["destinoEntryId"],
          where: {
            tenantId,
            destinoEntryId: { in: corridas },
            origen: { deletedAt: null, status: "registrado" },
          },
          _sum: { quantity: true },
        }),
        prisma.forestCtpConsumo.groupBy({
          by: ["ctpEntryId"],
          where: { tenantId, ctpEntryId: { in: corridas } },
          _sum: { volumeM3: true },
        }),
        /* El N° de Permiso de la corrida es el `originCode` del ingreso que la
         * alimentó (mismo dato que ya usa `productosDisponibles` como
         * `titularOrigen`) — no un campo propio: una corrida no tiene permiso
         * propio, hereda el de la madera que consumió. `groupBy` no puede
         * traer el campo del padre (`WoodEntry`), así que va por `findMany`. */
        prisma.forestCtpConsumo.findMany({
          where: { tenantId, ctpEntryId: { in: corridas } },
          select: { ctpEntryId: true, woodEntry: { select: { originCode: true } } },
        }),
      ],
    );
    const desp = new Map(salidas.map((r) => [r.produccionEntryId, Number(r._sum.quantity ?? 0)]));
    const repro = new Map(reprocesos.map((r) => [r.origenEntryId, Number(r._sum.quantity ?? 0)]));
    const mpAtribuida = new Map(consumos.map((c) => [c.ctpEntryId, Number(c._sum.volumeM3 ?? 0)]));
    const mpDesdeReproceso = new Map(
      entraPorReproceso.map((r) => [r.destinoEntryId, Number(r._sum.quantity ?? 0)]),
    );
    const permisoDeCorrida = new Map<string, string[]>();
    for (const c of consumosConOrigen) {
      const codigo = (c.woodEntry?.originCode ?? "").trim();
      if (!codigo) continue;
      const previos = permisoDeCorrida.get(c.ctpEntryId) ?? [];
      if (!previos.includes(codigo)) permisoDeCorrida.set(c.ctpEntryId, [...previos, codigo]);
    }
    /* Sin permiso heredado vale el declarado en el asiento (ADR-402) — es el
       único que tiene una existencia de apertura, que no consumió guía. */
    for (const e of entries) {
      const propio = (e.originCode ?? "").trim();
      if (propio && !permisoDeCorrida.has(e.id)) permisoDeCorrida.set(e.id, [propio]);
    }

    return {
      entries: entries.map((e) =>
        e.section === "produccion"
          ? {
              ...e,
              despachadoQty: desp.get(e.id) ?? 0,
              reprocesadoQty: repro.get(e.id) ?? 0,
              mpAtribuidaM3: mpAtribuida.get(e.id) ?? 0,
              /* Materia prima que llegó desde OTRA corrida (reproceso, ADR-316)
                 en vez de desde un ingreso con GTF. Va en su propio campo y no
                 sumada a `mpAtribuidaM3`: ese campo significa «atado a una GTF»
                 y hay pantallas que lo leen así. Quien evalúa si la corrida
                 tiene origen suma los dos.

                 SÓLO cuando la unidad es m³. `quantity` está en la unidad del
                 producto y `volumeInputM3` en metros cúbicos de materia prima;
                 con la misma unidad son la misma madera —el producto que entra
                 a la sierra ES la materia prima de la corrida nueva— pero en pt
                 o kg haría falta una conversión (el pie tablar sale de ÷424) y
                 un m³ inventado en el libro que se declara ante SERFOR es peor
                 que un campo en cero. El caso no-m³ se queda sin sumar y la
                 fila lo dice con su chip de reproceso, igual que un costo sin
                 factura es `null` y nunca 0. */
              mpReprocesoM3:
                (e.unit ?? "").toLowerCase() === "m3" ? (mpDesdeReproceso.get(e.id) ?? 0) : 0,
              /* Varios ingresos con distinto permiso pueden alimentar la
                 misma corrida (dos guías de dos concesiones aserradas
                 juntas): se listan todos, no se elige uno. */
              permisoOrigen: permisoDeCorrida.get(e.id) ?? [],
              /* Lo cobrado por el aserrío (ADR-412) como número: el Decimal
                 viajaría como texto. El dueño y el trato van explícitos para
                 que la pantalla de cobrar muestre lo que la corrida TIENE. */
              duenoParteId: e.duenoParteId ?? null,
              aserrioImporte: e.aserrioImporte != null ? Number(e.aserrioImporte) : null,
              aserrioPrecioManualPt: precioManualDelDetalle(e.aserrioDetalle),
            }
          : e.section === "despacho"
            ? { ...e, atribuidoQty: atribuido.get(e.id) ?? 0 }
            : e,
      ),
      total,
      totalSinFiltro,
    };
  }

  /**
   * Una corrida por id, con los paquetes que declaró.
   *
   * Los paquetes viajan porque quien amplía la producción (ADR-361) necesita
   * saber qué códigos ya están tomados: el código es lo que se busca en la pila
   * y la DB rechaza el repetido — enterarse recién en el 422, con la tanda
   * entera tipeada, es enterarse tarde.
   */
  static async getById(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const entry = await prisma.forestCtpEntry.findFirst({
      where: { tenantId, id, deletedAt: null },
      include: {
        paquetes: {
          select: {
            id: true,
            codigo: true,
            productType: true,
            presentacion: true,
            cantidad: true,
            volumenM3: true,
            espesorCm: true,
            anchoCm: true,
            largoM: true,
            pieTablar: true,
            precioVentaPt: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!entry) return null;
    /* El PT medido y el precio de venta (ADR-429) viajan como número: el
       Decimal llegaría como texto y `null` tiene que seguir siendo «no se
       guardó» / «sin precio», nunca 0. */
    return {
      ...entry,
      paquetes: entry.paquetes.map((p) => ({
        ...p,
        pieTablar: p.pieTablar != null ? Number(p.pieTablar) : null,
        precioVentaPt: p.precioVentaPt != null ? Number(p.precioVentaPt) : null,
      })),
    };
  }

  /**
   * DECLARAR LA PRODUCCIÓN de una corrida abierta en el patio (ADR-340).
   *
   * La corrida nació al consumir —con su materia prima y sin `quantity`— y esto
   * la cierra: qué producto salió, cuánto y en qué unidad. Es la Sección 3 del
   * LO-CTP, que tiene su propia fecha y su propio acto.
   *
   * Sólo completa corridas **en proceso**: si ya declaró producción, corregirla
   * es otra cosa (y hoy se hace anulando y rehaciendo, que deja rastro). El
   * rendimiento se calcula con la misma fórmula del alta — una sola regla.
   */
  /**
   * El código de paquete es único **en toda la planta**, no en la corrida
   * (`@@unique([tenantId, codigo])`): es lo que se busca en la pila y lo que se
   * cita en la guía de salida, y dos pilas con el mismo cartel no se distinguen.
   *
   * Sin este guard el choque llegaba al índice de Postgres y volvía como **500
   * `internal_error`** — una pantalla que se rompe sin decir por qué, con la
   * tanda entera tipeada. Verificado en el tenant real: declarar `PQ-001` una
   * segunda vez tiraba 500.
   *
   * Se mira el código ocupado por CUALQUIER corrida (borrada incluida: el índice
   * tampoco filtra `deletedAt`) y se nombra dónde está, que es lo único que
   * permite resolverlo.
   */
  private static async assertCodigosLibres(tenantId: string, codigos: readonly string[]) {
    const buscar = [...new Set(codigos.map((c) => c.trim()).filter(Boolean))];
    if (buscar.length === 0) return;
    const choques = await prisma.forestCtpPaquete.findMany({
      where: { tenantId, codigo: { in: buscar } },
      select: { codigo: true, entry: { select: { lineNo: true, deletedAt: true } } },
      take: 5,
    });
    if (choques.length === 0) return;
    const c = choques[0];
    throw new CtpInvariantError(
      `El código de paquete «${c.codigo}» ya está usado en la corrida N° ${c.entry.lineNo}` +
        `${c.entry.deletedAt ? " (borrada)" : ""}. El código no se repite en la planta: es lo que se busca ` +
        "en la pila y lo que se cita en la guía.",
      "PAQUETE_DUPLICADO",
    );
  }

  /**
   * AMPLIAR una corrida que ya declaró producción (ADR-361).
   *
   * El lote no sale de la sierra en un solo acto: se asierra una parte del turno,
   * salen los paquetes, y al día siguiente sale el resto de la MISMA materia
   * prima —tablillas, recuperación, lo que quedó del bloque—. Hasta acá había que
   * declarar todo junto o no declarar nada: `declararProduccion` rechaza la
   * corrida que ya declaró, y volver a consumir habría exigido trozas nuevas que
   * no existen porque la madera ya entró.
   *
   * Ampliar NO es corregir. Los paquetes anteriores quedan intactos y se suman
   * los nuevos: el libro gana filas, no las reescribe. Para corregir sigue
   * estando anular y rehacer, que es lo que deja rastro.
   *
   * El tope del 56 % se aplica sobre el **total acumulado** (ADR-358), no sobre
   * lo que se agrega ahora: si no, dos tandas del 40 % darían 80 % entre las dos.
   */
  static async ampliarProduccion(
    tenantId: string,
    id: string,
    campos: {
      paquetes: {
        codigo: string;
        productType?: string | null;
        presentacion?: string | null;
        cantidad: number;
        volumenM3: number;
        espesorCm?: number | null;
        anchoCm?: number | null;
        largoM?: number | null;
        observations?: string | null;
      }[];
      observations?: string | null;
    },
    user: string,
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const nuevos = campos.paquetes ?? [];
    if (nuevos.length === 0) {
      throw new CtpInvariantError("No hay paquetes que agregar.", "CANTIDAD_INVALIDA");
    }
    const suma = r4(nuevos.reduce((a, p) => a + (Number(p.volumenM3) || 0), 0));
    if (!(suma > 0)) {
      throw new CtpInvariantError(
        "Los paquetes que se agregan no suman volumen.",
        "CANTIDAD_INVALIDA",
      );
    }

    // Lock + lectura + escritura de `quantity` en UNA transacción (auditoría
    // 2026-08-25): dos operadores ampliando la MISMA corrida a la vez leían
    // el mismo `quantity` viejo y el que escribía último pisaba al otro —
    // los paquetes de los dos quedaban creados, pero el total declarado sólo
    // reflejaba uno. Mismo patrón que `setConsumos`/`setOrigenes`.
    const entry = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        {
          id: string;
          section: string;
          status: string;
          lineNo: number;
          entryDate: Date;
          quantity: Prisma.Decimal | null;
          unit: string | null;
          volumeInputM3: Prisma.Decimal | null;
          productType: string | null;
          presentacion: string | null;
        }[]
      >`
        SELECT "id", "section", "status", "lineNo", "entryDate", "quantity", "unit",
               "volumeInputM3", "productType", "presentacion"
        FROM "ForestCtpEntry"
        WHERE "id" = ${id} AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      if (locked.length === 0)
        throw new CtpInvariantError("Esa corrida no existe.", "LINEA_NO_EDITABLE");
      const actual = locked[0];
      if (actual.section !== "produccion") {
        throw new CtpInvariantError(
          "Sólo una corrida de producción declara producción.",
          "SECCION_INVALIDA",
        );
      }
      if (actual.status !== "registrado") {
        throw new CtpInvariantError(`Esa corrida está ${actual.status}.`, "LINEA_NO_EDITABLE");
      }
      if (actual.quantity == null) {
        throw new CtpInvariantError(
          `La corrida #${actual.lineNo} todavía no declaró producción: declárala primero.`,
          "LINEA_NO_EDITABLE",
        );
      }
      const cerrado = await ForestCtpCierreDB.closedPeriodOf(tenantId, actual.entryDate);
      if (cerrado) {
        throw new CtpInvariantError(
          `El período ${cerrado.label} está cerrado: no se puede ampliar una corrida de un mes cerrado.`,
          "PERIODO_CERRADO",
          { periodKey: cerrado.periodKey },
        );
      }

      const paquetesActuales = await tx.forestCtpPaquete.findMany({
        where: { ctpEntryId: id, tenantId },
        select: { codigo: true },
      });

      /* El código de paquete es lo que se busca en la pila y lo que se cita en la
         guía de salida: no puede repetirse ni contra los que ya están. */
      const yaEstan = new Set(paquetesActuales.map((p) => p.codigo.trim().toLowerCase()));
      const choque = nuevos.find((p) => yaEstan.has(p.codigo.trim().toLowerCase()));
      if (choque) {
        throw new CtpInvariantError(
          `El código de paquete «${choque.codigo}» ya está en esta corrida.`,
          "PAQUETE_DUPLICADO",
        );
      }
      /* Y contra el resto de la planta, que es el alcance real del índice. */
      await ForestCtpDB.assertCodigosLibres(
        tenantId,
        nuevos.map((p) => p.codigo),
      );
      const repetido = nuevos.find(
        (p, i) => nuevos.findIndex((q) => q.codigo.trim() === p.codigo.trim()) !== i,
      );
      if (repetido) {
        throw new CtpInvariantError(
          `El código de paquete «${repetido.codigo}» viene dos veces.`,
          "PAQUETE_DUPLICADO",
        );
      }

      const total = r4(Number(actual.quantity) + suma);

      /* El tope, sobre el TOTAL: dos tandas del 40 % son 80 % entre las dos, y el
         techo existe justo para que eso no pase (ADR-358). */
      const entrada = Number(actual.volumeInputM3 ?? 0);
      if (entrada > 0 && (actual.unit ?? "m3") === "m3") {
        const tope = topeDeclarableM3(entrada);
        if (total > tope + 0.001) {
          throw new CtpInvariantError(
            `Con ${fmtM3(entrada)} m³ de materia prima el tope (${RENDIMIENTO_TOPE_PCT} %) permite ` +
              `${fmtM3(tope)} m³ en total. Esta corrida ya declaró ${r4(Number(actual.quantity))} y estás ` +
              `agregando ${suma}: quedan ${r4(Math.max(0, tope - Number(actual.quantity)))} m³.`,
            "RENDIMIENTO_SOBRE_TOPE",
          );
        }
      }

      const rendimiento =
        entrada > 0 && (actual.unit ?? "m3") === "m3"
          ? Math.round((total / entrada) * 10000) / 100
          : null;

      return tx.forestCtpEntry.update({
        where: { id, tenantId } satisfies Prisma.ForestCtpEntryWhereUniqueInput,
        data: {
          quantity: total,
          rendimientoPct: rendimiento,
          ...(campos.observations?.trim() ? { observations: campos.observations.trim() } : {}),
          paquetes: {
            create: nuevos.map((p) => ({
              tenantId,
              codigo: p.codigo.trim(),
              productType: p.productType?.trim() || actual.productType || null,
              presentacion: p.presentacion?.trim() || actual.presentacion || null,
              cantidad: Math.max(0, Math.round(p.cantidad)),
              unit: actual.unit ?? "m3",
              volumenM3: p.volumenM3,
              espesorCm: p.espesorCm ?? null,
              anchoCm: p.anchoCm ?? null,
              largoM: p.largoM ?? null,
              observations: p.observations?.trim() || null,
              createdBy: user,
            })),
          },
        },
      });
    });
    auditCtp({
      tenantId,
      action: "ctp_linea_produccion_declarada",
      entity: "ForestCtpEntry",
      entityId: id,
      detail:
        `Amplió la corrida #${entry.lineNo}: +${nuevos.length} paquete(s) · +${suma} ` +
        `(total ${Number(entry.quantity)}${entry.rendimientoPct != null ? ` · rendimiento ${Number(entry.rendimientoPct)}%` : ""})`,
      user,
    });
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {
      /* best-effort */
    }
    return entry;
  }

  static async declararProduccion(
    tenantId: string,
    id: string,
    campos: {
      productType?: string | null;
      presentacion?: string | null;
      quantity: number;
      unit: string;
      pieces?: number | null;
      codigoProducto?: string | null;
      lineaProduccion?: string | null;
      observations?: string | null;
      /**
       * Los PAQUETES que salieron (ADR-349). El formato del SNIFFS declara
       * paquetes, no un volumen suelto: cada uno con su código, su producto y
       * —si se dimensionó— espesor, ancho y largo.
       *
       * Son el detalle de `quantity`, no otra cantidad: se valida que sumen lo
       * declarado. Sin paquetes, la corrida se declara como antes.
       */
      paquetes?: {
        codigo: string;
        productType?: string | null;
        presentacion?: string | null;
        cantidad: number;
        volumenM3: number;
        espesorCm?: number | null;
        anchoCm?: number | null;
        largoM?: number | null;
        observations?: string | null;
      }[];
    },
    user = "unknown",
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const actual = await prisma.forestCtpEntry.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: {
        id: true,
        section: true,
        status: true,
        lineNo: true,
        entryDate: true,
        quantity: true,
        volumeInputM3: true,
        observations: true,
      },
    });
    if (!actual) return null;
    if (actual.section !== "produccion") {
      throw new CtpInvariantError(
        "Sólo una corrida de producción declara producción.",
        "SECCION_INVALIDA",
      );
    }
    if (actual.status !== "registrado") {
      throw new CtpInvariantError(`Esa corrida está ${actual.status}.`, "LINEA_NO_EDITABLE");
    }
    if (actual.quantity != null) {
      throw new CtpInvariantError(
        `La corrida #${actual.lineNo} ya declaró producción. Para corregirla, anúlala y vuelve a registrarla.`,
        "LINEA_NO_EDITABLE",
      );
    }
    const cerrado = await ForestCtpCierreDB.closedPeriodOf(tenantId, actual.entryDate);
    if (cerrado) {
      throw new CtpInvariantError(
        `El período ${cerrado.label} está cerrado: no se puede declarar producción de un mes cerrado.`,
        "PERIODO_CERRADO",
        { periodKey: cerrado.periodKey },
      );
    }
    if (!(campos.quantity > 0)) {
      throw new CtpInvariantError("La cantidad producida debe ser mayor a 0.", "CANTIDAD_INVALIDA");
    }

    /* El techo del 56 % (ADR-358), también acá y no sólo en el formulario.
       Una regla que vive únicamente en la pantalla la saltea cualquier POST, y
       ésta existe justamente para que el libro no declare más producto del que
       sale físicamente de una troza. Sólo aplica cuando la corrida declara en
       m³: dividir pies tablares por m³ no es un rendimiento. */
    const entrada = Number(actual.volumeInputM3 ?? 0);
    if (entrada > 0 && (campos.unit ?? "m3") === "m3") {
      const tope = topeDeclarableM3(entrada);
      if (campos.quantity > tope + 0.001) {
        throw new CtpInvariantError(
          `Con ${fmtM3(entrada)} m³ de materia prima el tope de rendimiento (${RENDIMIENTO_TOPE_PCT} %) ` +
            `permite ${fmtM3(tope)} m³; estás declarando ${campos.quantity}.`,
          "RENDIMIENTO_SOBRE_TOPE",
        );
      }
    }

    /* Los paquetes son el DETALLE de lo declarado: si suman otra cosa, uno de
       los dos números está mal y no se puede saber cuál. `≤` no alcanza acá —no
       es una atribución parcial, es la misma cantidad contada de dos maneras—,
       pero la tolerancia es la del negocio (un litro), no la del float. */
    const paquetes = campos.paquetes ?? [];
    if (paquetes.length > 0) {
      const suma =
        Math.round(paquetes.reduce((a, p) => a + (Number(p.volumenM3) || 0), 0) * 10000) / 10000;
      if (Math.abs(suma - campos.quantity) > 0.001) {
        throw new CtpInvariantError(
          `Los paquetes suman ${suma} y la producción declara ${campos.quantity}: tienen que ser lo mismo.`,
          "PAQUETES_NO_CUADRAN",
        );
      }
      const repetido = paquetes.find(
        (p, i) => paquetes.findIndex((q) => q.codigo.trim() === p.codigo.trim()) !== i,
      );
      if (repetido) {
        throw new CtpInvariantError(
          `El código de paquete «${repetido.codigo}» está dos veces: es lo que se busca en la pila, no puede repetirse.`,
          "PAQUETE_DUPLICADO",
        );
      }
      /* Y contra los que ya existen en la planta: el índice es por tenant, así
         que el choque con OTRA corrida volvía como 500 sin explicación. */
      await ForestCtpDB.assertCodigosLibres(
        tenantId,
        paquetes.map((p) => p.codigo),
      );
    }

    const inVol = actual.volumeInputM3 != null ? Number(actual.volumeInputM3) : 0;
    const rendimiento =
      inVol > 0 && campos.unit === "m3"
        ? Math.round((campos.quantity / inVol) * 10000) / 100
        : null;

    const entry = await prisma.forestCtpEntry.update({
      where: { id, tenantId } satisfies Prisma.ForestCtpEntryWhereUniqueInput,
      data: {
        productType: campos.productType?.trim() || null,
        presentacion: campos.presentacion?.trim() || null,
        quantity: campos.quantity,
        unit: campos.unit,
        pieces: campos.pieces ?? null,
        codigoProducto: campos.codigoProducto?.trim() || null,
        lineaProduccion: campos.lineaProduccion?.trim() || "LP",
        rendimientoPct: rendimiento,
        /* La nota del consumo («producción por declarar») deja de ser cierta: se
           reemplaza si el operador escribió una, y si no se limpia el aviso. */
        observations: campos.observations?.trim() || null,
        ...(paquetes.length > 0
          ? {
              /* `create` y no `set`: la corrida se declara una sola vez (más
                 arriba se rechaza la que ya declaró), así que no hay paquetes
                 viejos que reemplazar. */
              paquetes: {
                create: paquetes.map((p) => ({
                  tenantId,
                  codigo: p.codigo.trim(),
                  productType: p.productType?.trim() || campos.productType?.trim() || null,
                  presentacion: p.presentacion?.trim() || campos.presentacion?.trim() || null,
                  cantidad: Math.max(0, Math.round(p.cantidad)),
                  unit: campos.unit,
                  volumenM3: p.volumenM3,
                  espesorCm: p.espesorCm ?? null,
                  anchoCm: p.anchoCm ?? null,
                  largoM: p.largoM ?? null,
                  observations: p.observations?.trim() || null,
                  createdBy: user,
                })),
              },
            }
          : {}),
      },
    });
    auditCtp({
      tenantId,
      action: "ctp_linea_produccion_declarada",
      entity: "ForestCtpEntry",
      entityId: id,
      detail:
        `Declaró la producción de la corrida #${entry.lineNo}: ${campos.quantity} ${campos.unit}` +
        (paquetes.length > 0 ? ` en ${paquetes.length} paquete(s)` : "") +
        (rendimiento != null ? ` · rendimiento ${rendimiento}%` : ""),
      user,
    });
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {
      /* cache best-effort */
    }
    return entry;
  }

  /**
   * LAS MEDIDAS DE SIEMPRE: los paquetes que este aserradero más declara.
   *
   * Cada turno se retipean las mismas dimensiones —2.5 × 20 cm × 3 m, otra vez—
   * y tipear cuatro números con guantes es donde se pierde el tiempo y donde
   * entran los errores. En vez de inventar un catálogo que alguien tendría que
   * mantener, se leen del propio libro: lo que más se produjo ES la plantilla.
   *
   * Sólo combinaciones DIMENSIONADAS y de corridas vivas: un paquete sin medidas
   * no ahorra tipeo, y uno de una corrida anulada no representa lo que la planta
   * hace hoy.
   */
  /**
   * Los códigos de paquete que la planta ya usó, los más nuevos primero.
   *
   * Alimenta `sugerirCodigoPaquete()`: el índice es `@@unique[tenantId, codigo]`,
   * así que sugerir «el siguiente de esta corrida» chocaba con la corrida de al
   * lado. Se leen los últimos —no todos— porque la serie vive en la cola: un
   * aserradero con 40.000 paquetes numera sobre los últimos, no sobre el primero.
   *
   * Van los BORRADOS también: el índice tampoco los filtra, y un código
   * propuesto que revienta contra un paquete borrado es igual de inservible.
   */
  /**
   * TODOS los códigos de paquete en uso, plegados a minúsculas.
   *
   * Distinto de `codigosDePaquete`, que trae los últimos 200 para proponer el
   * siguiente en la pantalla: acá se necesita la lista completa para saber si
   * un código del archivo choca con uno existente. Son cadenas cortas; traer
   * cinco mil no pesa nada al lado de perder una línea del libro.
   */
  static async codigosDePaqueteEnUso(tenantId: string): Promise<Set<string>> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await prisma.forestCtpPaquete.findMany({
      where: { tenantId },
      select: { codigo: true },
    });
    return new Set(filas.map((f) => f.codigo.trim().toLowerCase()));
  }

  /**
   * Las corridas de producción SIN materia prima atribuida — lo que el saldo
   * por permiso resta (ADR-409).
   *
   * «Sin materia prima» es literal: ni consumos (`ForestCtpConsumo`) ni volumen
   * de entrada declarado. Es exactamente la corrida que nace de «Producir sin
   * lote» (ADR-408) y la existencia de apertura (ADR-394). Una corrida que SÍ
   * consumió trozas queda afuera a propósito: su madera ya salió del patio
   * —la pieza figura consumida— y restarla otra vez contaría dos veces la
   * misma madera.
   *
   * Sin período: el saldo de un título habilitante no empieza el día 1 del mes.
   * El permiso declarado del asiento (ADR-402) viaja tal cual; las que no
   * declararon ninguno vuelven con `permiso: null` para que la pantalla las
   * pueda señalar en vez de esconderlas.
   */
  /**
   * Asigna el MISMO permiso declarado a varias corridas de una vez (ADR-409).
   *
   * Es el relleno masivo que ADR-401 dejó pendiente, acotado a un solo campo:
   * el `originCode` del asiento. Nace de un hecho medido — en el libro de
   * pruebas, ocho de ocho producciones sin lote no tenían permiso, porque hasta
   * ADR-409 no había dónde escribirlo—: asignarlas de a una es la clase de
   * trabajo que nadie hace, y sin eso el saldo por permiso muestra todo junto
   * bajo «Sin permiso declarado».
   *
   * **Sólo corridas SIN materia prima atribuida.** Donde hay consumos, el
   * permiso lo pone la guía (ADR-402) y escribir el del asiento no cambiaría
   * nada: se rechaza con el motivo, en vez de simular que se aplicó.
   *
   * Línea por línea y no en una transacción: cada asiento vale por sí mismo y
   * un mes cerrado en la quinta no puede tirar abajo las cuatro anteriores. El
   * resultado dice exactamente qué entró y qué no —mismo criterio que las
   * trozas rechazadas de un lote.
   */
  static async asignarPermisoMasivo(
    tenantId: string,
    ids: readonly string[],
    originCode: string,
    user = "unknown",
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const permiso = originCode.trim();
    if (!permiso) throw new CtpInvariantError("Falta el N° de permiso.", "VALIDACION");

    const corridas = await prisma.forestCtpEntry.findMany({
      where: { id: { in: [...ids] }, tenantId, deletedAt: null },
      select: {
        id: true,
        lineNo: true,
        section: true,
        originCode: true,
        volumeInputM3: true,
        _count: { select: { consumos: true } },
      },
    });
    const porId = new Map(corridas.map((c) => [c.id, c]));

    const aplicados: { id: string; lineNo: number | null }[] = [];
    const rechazados: { id: string; lineNo: number | null; motivo: string }[] = [];

    for (const id of ids) {
      const c = porId.get(id);
      if (!c) {
        rechazados.push({ id, lineNo: null, motivo: "esa línea ya no está en el libro" });
        continue;
      }
      if (c.section !== "produccion") {
        rechazados.push({ id, lineNo: c.lineNo, motivo: "no es una línea de producción" });
        continue;
      }
      if (c._count.consumos > 0 || Number(c.volumeInputM3 ?? 0) > 0) {
        rechazados.push({
          id,
          lineNo: c.lineNo,
          motivo: "ya tiene materia prima: su permiso sale de la guía, no del asiento",
        });
        continue;
      }
      if ((c.originCode ?? "").trim() === permiso) {
        rechazados.push({ id, lineNo: c.lineNo, motivo: "ya declaraba ese permiso" });
        continue;
      }
      try {
        const r = await ForestCtpDB.corregirLinea(tenantId, id, { originCode: permiso }, user);
        if (r.ok) aplicados.push({ id, lineNo: c.lineNo });
        else {
          rechazados.push({
            id,
            lineNo: c.lineNo,
            motivo: r.rechazados[0]?.motivo ?? "el libro no aceptó el cambio",
          });
        }
      } catch (e) {
        rechazados.push({
          id,
          lineNo: c.lineNo,
          motivo: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return { permiso, aplicados, rechazados };
  }

  /**
   * Qué se produjo cada día de un rango: la tira de jornadas del aserradero.
   *
   * El Libro se registra **día por día** y el parte llega tarde —la sierra
   * cortó el sábado, el papel aparece el lunes—, así que al declarar una
   * corrida hay que poder elegir el día y VER cuál ya tiene producción anotada:
   * sin eso la misma jornada se carga dos veces, o se anota el lunes lo que fue
   * del sábado y el libro queda diciendo otra cosa que el parte de la sierra.
   *
   * Devuelve una fila por día CON producción (los días vacíos no viajan: la
   * pantalla dibuja los siete igual y un cero explícito no agrega nada).
   *
   * `entryDate` es date-only —viaja como `"2026-09-14"`— y se agrupa por su día
   * **UTC**, que es la misma zona con la que lo formatea todo el módulo
   * forestal. Agruparlo en hora local partiría una jornada en dos casilleros.
   *
   * El rango se arma acá y no con el `dateRange` general a propósito: ese usa
   * `lte`, y un asiento guardado a las 00:00 de Lima (05:00 UTC) del último día
   * del rango cae FUERA de un `lte` a medianoche. Acá el corte es `lt` del día
   * siguiente, que incluye el día entero venga con la hora que venga.
   */
  static async jornadasDeProduccion(
    tenantId: string,
    rango: { desde: string; hasta: string },
    /**
     * Qué hecho del libro cuenta la tira (2026-09-12, la tira llegó a Consumos
     * y Despacho): `produccion` = lo que salió de la sierra; `consumo` = lo que
     * entró a la sierra (la corrida con su materia prima); `despacho` = lo que
     * salió de la planta con guía. La forma de la respuesta es la misma: un día
     * con cuántos registros, cuánto volumen y cuántas piezas.
     */
    seccion: "produccion" | "consumo" | "despacho" = "produccion",
  ): Promise<JornadaDelLibro[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const dia = /^\d{4}-\d{2}-\d{2}$/;
    if (!dia.test(rango.desde) || !dia.test(rango.hasta)) return [];
    const gte = new Date(`${rango.desde}T00:00:00.000Z`);
    const lt = new Date(new Date(`${rango.hasta}T00:00:00.000Z`).getTime() + 86_400_000);
    if (!Number.isFinite(gte.getTime()) || !Number.isFinite(lt.getTime()) || lt <= gte) return [];

    const filas = await prisma.forestCtpEntry.findMany({
      where: {
        tenantId,
        section: seccion === "despacho" ? "despacho" : "produccion",
        status: "registrado",
        deletedAt: null,
        entryDate: { gte, lt },
        /* Un consumo es una corrida que YA tiene materia prima: la que se abrió
           sin lote (volumen de entrada nulo o cero) no cuenta como consumo. */
        ...(seccion === "consumo" ? { volumeInputM3: { gt: 0 } } : {}),
      },
      select: {
        entryDate: true,
        quantity: true,
        unit: true,
        pieces: true,
        volumeInputM3: true,
        /* Las piezas del consumo son las trozas que entraron, no las que
           salieron: se cuentan del puente, que es donde viven (ADR-326). */
        _count: { select: { consumos: true, reprocesosEntrada: true } },
        /* Lo que el panel flotante de la tira cuenta de cada día (2026-09-14):
           especie, dueño, permiso, línea, los paquetes vivos con su
           clasificación y si la corrida tiene origen (consumos + reprocesos
           que la producen, la regla de `corridaSinOrigen`). Viaja en ESTA
           consulta —no una por día— y sólo se arma en producción. */
        lineNo: true,
        speciesCommon: true,
        duenoMadera: true,
        titularNombre: true,
        originCode: true,
        lineaProduccion: true,
        materiaPrimaRef: true,
        paquetes: {
          where: { deletedAt: null },
          select: { productType: true, cantidad: true, volumenM3: true },
        },
      },
      /* El orden del libro: dentro de un día, por N.º. El detalle suma en este
         orden y muestra el nombre de especie de la corrida más vieja. */
      orderBy: [{ entryDate: "asc" }, { lineNo: "asc" }],
      /* Un rango de semanas, no de años: el tope es una red, no una página. */
      take: 2000,
    });

    /* La cuenta vive en `jornadasDesdeFilas` (pura y probada): acá sólo se
       traduce cada asiento a su día UTC y a los conteos de sus puentes. */
    return jornadasDesdeFilas(
      filas.map((f) => ({
        dia: f.entryDate.toISOString().slice(0, 10),
        lineNo: f.lineNo,
        quantity: f.quantity,
        unit: f.unit,
        pieces: f.pieces,
        volumeInputM3: f.volumeInputM3,
        consumos: f._count.consumos,
        reprocesosEntrada: f._count.reprocesosEntrada,
        speciesCommon: f.speciesCommon,
        duenoMadera: f.duenoMadera,
        titularNombre: f.titularNombre,
        originCode: f.originCode,
        lineaProduccion: f.lineaProduccion,
        materiaPrimaRef: f.materiaPrimaRef,
        paquetes: f.paquetes,
      })),
      seccion,
    );
  }

  /**
   * El detalle de una o varias jornadas: qué salió, de qué especie y en qué
   * producto.
   *
   * Pedido de Brandon (2026-09-11): al elegir un día que ya tiene corridas,
   * poder abrir el **resumen por especie** de ese día — y marcando varios, el
   * resumen de todos juntos, para comparar semanas o cerrar un mes.
   *
   * El corte es por ESPECIE y, dentro, por producto: es como se lee el Cuadro
   * Resumen del LO-CTP y como pregunta el comprador («¿cuánto tornillo en
   * tablas sacamos esta semana?»). El PT se deriva del m³ con `PT_POR_M3`, una
   * sola vez y en el mismo lugar que el resto del libro.
   *
   * Los días llegan sueltos, no como rango: marcar el lunes y el jueves de una
   * semana es un caso normal, y un rango los traería con los tres del medio.
   */
  static async resumenDeJornadas(
    tenantId: string,
    dias: readonly string[],
    /** Días de los que entran sólo algunos dueños (ver `DuenosPorDia`). */
    soloDuenos: DuenosPorDia = {},
  ): Promise<ResumenDeJornadas> {
    if (!tenantId) throw new Error("tenantId is required");
    const limpios = diasDeJornadas(dias);
    if (limpios.length === 0) return resumirJornadas(limpios, []);

    const filas = await prisma.forestCtpEntry.findMany({
      where: whereDeJornadas(tenantId, limpios),
      select: {
        id: true,
        lineNo: true,
        entryDate: true,
        speciesCommon: true,
        lineaProduccion: true,
        quantity: true,
        unit: true,
        pieces: true,
        materiaPrimaRef: true,
        duenoMadera: true,
        titularNombre: true,
        paquetes: {
          where: { deletedAt: null },
          select: { productType: true, cantidad: true, volumenM3: true },
        },
      },
      orderBy: [{ entryDate: "asc" }, { lineNo: "asc" }],
      take: 500,
    });
    /* La cuenta (por especie, por día y por día·especie·producto) vive en
       `resumirJornadas`, pura y probada: acá sólo se traduce cada asiento. */
    return resumirJornadas(
      limpios,
      filas.map((f) => ({
        id: f.id,
        lineNo: f.lineNo,
        dia: f.entryDate.toISOString().slice(0, 10),
        especie: f.speciesCommon,
        linea: f.lineaProduccion,
        /* La misma etiqueta que el detalle flotante del día: con ella se
           eligen los dueños en la tira, y tiene que coincidir letra a letra. */
        dueno:
          etiquetaDeDueno({
            dueno: esDuenoMadera(f.duenoMadera) ? f.duenoMadera : null,
            titularNombre: f.titularNombre,
          }) ?? SIN_DUENO,
        /* El volumen sólo se suma si está declarado en m³: convertir otra
           unidad a ojo inventaría la producción del día. */
        m3: !f.unit || f.unit === "m3" ? Number(f.quantity ?? 0) : 0,
        piezasAsiento: f.pieces ?? 0,
        materiaPrimaRef: f.materiaPrimaRef,
        paquetes: f.paquetes.map((q) => ({
          productType: q.productType,
          cantidad: q.cantidad,
          volumenM3: Number(q.volumenM3 ?? 0),
        })),
      })),
      soloDuenos,
    );
  }

  /**
   * Lo que salió en una o varias jornadas, PAQUETE POR PAQUETE, con el resumen
   * de siempre al lado (Brandon, 2026-09-23: «Ver qué salió ese día» con el
   * detalle pieza por pieza para editarlo, traer TODO el día al cubicado y el
   * Anexo 04 de los días marcados).
   *
   * UNA consulta alimenta las dos cosas: el resumen sale de `resumirJornadas`
   * sobre las mismas filas, y el detalle de `entraConDuenos` con el mismo
   * filtro. Antes, traer un día al cubicado pedía `?entryId=` corrida por
   * corrida — nueve pedidos para el 23/09 de QA.
   *
   * Cada corrida trae también lo que pide su editor (ADR-401): de qué guías
   * hereda el permiso y si está atada. Esa regla es la de `corregirLinea`
   * (despachos → reprocesos → lote); el servidor la vuelve a decidir al
   * guardar, esto es sólo para no ofrecer lo que va a rechazar.
   */
  static async jornadasConPaquetes(
    tenantId: string,
    dias: readonly string[],
    soloDuenos: DuenosPorDia = {},
  ): Promise<ResumenDeJornadas & { detalle: CorridaDelDia[] }> {
    if (!tenantId) throw new Error("tenantId is required");
    const limpios = diasDeJornadas(dias);
    if (limpios.length === 0) return { ...resumirJornadas(limpios, []), detalle: [] };

    const filas = await prisma.forestCtpEntry.findMany({
      where: whereDeJornadas(tenantId, limpios),
      select: {
        id: true,
        lineNo: true,
        entryDate: true,
        speciesCommon: true,
        speciesScientific: true,
        productType: true,
        presentacion: true,
        lineaProduccion: true,
        quantity: true,
        unit: true,
        pieces: true,
        volumeInputM3: true,
        observations: true,
        materiaPrimaRef: true,
        originCode: true,
        gtfIngreso: true,
        duenoMadera: true,
        titularNombre: true,
        duenoParteId: true,
        paquetes: {
          where: { deletedAt: null },
          /* El orden en que se declararon, que es el de la pila (`ordenarDetalle`). */
          orderBy: [{ createdAt: "asc" }, { codigo: "asc" }],
          select: {
            id: true,
            codigo: true,
            productType: true,
            presentacion: true,
            cantidad: true,
            volumenM3: true,
            espesorCm: true,
            anchoCm: true,
            largoM: true,
            pieTablar: true,
          },
        },
        consumos: { select: { woodEntry: { select: { gtfNumber: true, originCode: true } } } },
        _count: { select: { salidas: true, reprocesosSalida: true, loteMiembros: true } },
      },
      orderBy: [{ entryDate: "asc" }, { lineNo: "asc" }],
      take: 500,
    });

    const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? null : Number(v));
    const detalle: CorridaDelDia[] = filas.map((f) => {
      const unicos = (xs: (string | null | undefined)[]) => [...new Set(xs.map((x) => (x ?? "").trim()).filter(Boolean))];
      const gtfs = unicos(f.consumos.map((x) => x.woodEntry?.gtfNumber));
      const heredados = unicos(f.consumos.map((x) => x.woodEntry?.originCode));
      const propio = (f.originCode ?? "").trim();
      return {
        id: f.id,
        lineNo: f.lineNo,
        dia: f.entryDate.toISOString().slice(0, 10),
        fecha: f.entryDate.toISOString(),
        especie: f.speciesCommon,
        especieCientifica: f.speciesScientific,
        producto: f.productType,
        presentacion: f.presentacion,
        unidad: f.unit,
        cantidad: num(f.quantity),
        m3: !f.unit || f.unit === "m3" ? Number(f.quantity ?? 0) : 0,
        piezasAsiento: f.pieces ?? 0,
        volumenConsumidoM3: num(f.volumeInputM3),
        observaciones: f.observations,
        materiaPrimaRef: f.materiaPrimaRef,
        dueno:
          etiquetaDeDueno({
            dueno: esDuenoMadera(f.duenoMadera) ? f.duenoMadera : null,
            titularNombre: f.titularNombre,
          }) ?? SIN_DUENO,
        duenoMadera: f.duenoMadera,
        titularNombre: f.titularNombre,
        duenoParteId: f.duenoParteId,
        /* Los mismos criterios que «Productos disponibles» (`productosDisponibles`):
           la guía manda; sin guía, el `gtfIngreso` a mano; el permiso del
           asiento (ADR-402) sólo si no hay heredado. */
        gtfOrigen: gtfs.length > 0 ? gtfs : f.gtfIngreso ? [f.gtfIngreso] : [],
        permisos: heredados.length > 0 ? heredados : propio ? [propio] : [],
        atadaPorque:
          f._count.salidas > 0
            ? "ya tiene despachos que la citan como origen"
            : f._count.reprocesosSalida > 0
              ? "ya alimentó un reproceso"
              : f._count.loteMiembros > 0
                ? "es miembro de un lote de producción"
                : null,
        paquetes: f.paquetes.map((q) => ({
          id: q.id,
          codigo: q.codigo,
          producto: q.productType,
          presentacion: q.presentacion,
          cantidad: q.cantidad,
          volumenM3: Number(q.volumenM3 ?? 0),
          espesorCm: num(q.espesorCm),
          anchoCm: num(q.anchoCm),
          largoM: num(q.largoM),
          pieTablar: num(q.pieTablar),
        })),
      };
    });

    const lineaDe = new Map(filas.map((f) => [f.id, f.lineaProduccion]));
    const resumen = resumirJornadas(
      limpios,
      detalle.map((c) => ({
        id: c.id,
        lineNo: c.lineNo,
        dia: c.dia,
        especie: c.especie,
        linea: lineaDe.get(c.id) ?? null,
        dueno: c.dueno,
        m3: c.m3,
        piezasAsiento: c.piezasAsiento,
        materiaPrimaRef: c.materiaPrimaRef,
        paquetes: c.paquetes.map((q) => ({ productType: q.producto, cantidad: q.cantidad, volumenM3: q.volumenM3 })),
      })),
      soloDuenos,
    );
    return { ...resumen, detalle: detalle.filter((c) => entraConDuenos(c, soloDuenos)) };
  }

  static async produccionSinMateriaPrima(tenantId: string, limite = 1000) {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await prisma.forestCtpEntry.findMany({
      where: {
        tenantId,
        section: "produccion",
        status: "registrado",
        deletedAt: null,
        consumos: { none: {} },
        OR: [{ volumeInputM3: null }, { volumeInputM3: 0 }],
      },
      orderBy: [{ entryDate: "desc" }, { lineNo: "desc" }],
      take: Math.min(Math.max(limite, 1), 2000),
      select: {
        id: true,
        lineNo: true,
        entryDate: true,
        speciesCommon: true,
        originCode: true,
        quantity: true,
        unit: true,
        materiaPrimaRef: true,
      },
    });
    return filas.map((f) => ({
      id: f.id,
      lineNo: f.lineNo,
      fecha: f.entryDate.toISOString(),
      especie: f.speciesCommon,
      permiso: (f.originCode ?? "").trim() || null,
      cantidad: f.quantity != null ? Number(f.quantity) : 0,
      unidad: f.unit,
      referencia: f.materiaPrimaRef,
    }));
  }

  static async codigosDePaquete(tenantId: string, limite = 200): Promise<string[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await prisma.forestCtpPaquete.findMany({
      where: { tenantId },
      select: { codigo: true },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limite, 1), 500),
    });
    return filas.map((f) => f.codigo);
  }

  /**
   * BUSCAR UN PAQUETE POR SU CÓDIGO — el círculo completo (ADR-366).
   *
   * Alguien tiene un atado delante y lee el cartel: `PQ-0290`. La pregunta que
   * sigue es siempre la misma —«¿de dónde salió esto?»— y hasta ahora el libro
   * no la podía contestar: el código vivía dentro de la corrida y no había por
   * dónde entrar. Es la misma pregunta que `CtpBuscarGtf` ya contesta para una
   * guía, del otro extremo de la cadena.
   *
   * Devuelve el paquete con **su corrida y el saldo de esa corrida** (de
   * `saldosDeCorridas`, la única fuente — ADR-316). Y cuando la búsqueda cae en
   * UNO solo, suma la cadena hacia atrás: las trozas que entraron a esa corrida
   * y las guías que las ampararon. Un solo viaje para la pregunta entera.
   *
   * ⚠️ El saldo es de la CORRIDA, no del paquete (ADR-362): el libro no sabe
   * cuál de los atados salió, sabe cuántos m³ salieron. Decir «este paquete está
   * despachado» sería inventar un dato.
   */
  static async buscarPaquetes(tenantId: string, texto: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const q = texto.trim();
    if (!q) return { resultados: [], trozas: [], guias: [] };

    const paquetes = await prisma.forestCtpPaquete.findMany({
      where: {
        tenantId,
        deletedAt: null,
        /* Exacto primero, pero se acepta el parcial: en el patio se lee «290» de
           un cartel embarrado y con eso hay que poder encontrarlo. */
        codigo: { contains: q, mode: "insensitive" },
        entry: { deletedAt: null },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 20,
      include: {
        entry: {
          select: {
            id: true,
            lineNo: true,
            entryDate: true,
            section: true,
            status: true,
            speciesCommon: true,
            speciesScientific: true,
            productType: true,
            presentacion: true,
            quantity: true,
            unit: true,
            volumeInputM3: true,
            rendimientoPct: true,
            materiaPrimaRef: true,
            lineaProduccion: true,
            observations: true,
          },
        },
      },
    });
    if (paquetes.length === 0) return { resultados: [], trozas: [], guias: [] };

    /* El exacto manda: buscar «PQ-1» no puede enterrar a PQ-1 debajo de PQ-10. */
    const exacto = (c: string) => c.trim().toLowerCase() === q.toLowerCase();
    paquetes.sort((a, b) => Number(exacto(b.codigo)) - Number(exacto(a.codigo)));

    const saldos = await saldosDeCorridas(prisma, tenantId, [
      ...new Set(paquetes.map((p) => p.ctpEntryId)),
    ]);
    const num = (v: unknown) => (v == null ? null : Number(v));
    const resultados = paquetes.map((p) => {
      const s = saldos.get(p.ctpEntryId);
      return {
        id: p.id,
        codigo: p.codigo,
        productType: p.productType,
        presentacion: p.presentacion,
        cantidad: p.cantidad,
        volumenM3: num(p.volumenM3),
        espesorCm: num(p.espesorCm),
        anchoCm: num(p.anchoCm),
        largoM: num(p.largoM),
        /* ADR-429: el PT medido y el precio de venta, si el paquete los guardó. */
        pieTablar: num(p.pieTablar),
        precioVentaPt: num(p.precioVentaPt),
        observations: p.observations,
        createdAt: p.createdAt,
        corrida: {
          id: p.entry.id,
          lineNo: p.entry.lineNo,
          entryDate: p.entry.entryDate,
          status: p.entry.status,
          speciesCommon: p.entry.speciesCommon,
          speciesScientific: p.entry.speciesScientific,
          productType: p.entry.productType,
          unit: p.entry.unit,
          quantity: num(p.entry.quantity),
          volumeInputM3: num(p.entry.volumeInputM3),
          rendimientoPct: num(p.entry.rendimientoPct),
          lote: p.entry.materiaPrimaRef,
          lineaProduccion: p.entry.lineaProduccion,
        },
        /* De la corrida, no del paquete: el libro no sabe cuál atado salió. */
        saldoCorrida: {
          producido: s?.producido ?? 0,
          despachado: s?.despachado ?? 0,
          reprocesado: s?.reprocesado ?? 0,
          disponible: s?.disponible ?? 0,
        },
      };
    });

    /* La cadena hacia atrás sólo cuando la búsqueda cayó en uno: con veinte
       resultados serían veinte lecturas del patio para algo que nadie mira. */
    if (resultados.length !== 1) return { resultados, trozas: [], guias: [] };
    const corridaId = paquetes[0].ctpEntryId;
    const [trozas, consumos] = await Promise.all([
      WoodEntriesDB.trozasDeCorrida(tenantId, corridaId),
      ForestCtpConsumoDB.listByEntry(tenantId, corridaId),
    ]);
    return {
      resultados,
      trozas,
      guias: consumos.map((c) => ({
        woodEntryId: c.woodEntryId,
        volumeM3: num(c.volumeM3),
        gtfNumber: c.woodEntry?.gtfNumber ?? null,
        especie: c.woodEntry?.speciesCommonName ?? null,
        fechaIngreso: c.woodEntry?.entryDate ?? null,
      })),
    };
  }

  static async medidasFrecuentes(
    tenantId: string,
    opts: { limite?: number; producto?: string } = {},
  ): Promise<
    {
      productType: string | null;
      presentacion: string | null;
      espesorCm: number;
      anchoCm: number;
      largoM: number;
      veces: number;
    }[]
  > {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await prisma.forestCtpPaquete.groupBy({
      by: ["productType", "presentacion", "espesorCm", "anchoCm", "largoM"],
      where: {
        tenantId,
        espesorCm: { not: null },
        anchoCm: { not: null },
        largoM: { not: null },
        /* Las de ESE producto cuando se pide: «las de siempre» mezcladas hacen
           que el que declara listones vea las medidas de la paquetería. */
        ...(opts.producto?.trim() ? { productType: opts.producto.trim() } : {}),
        entry: { deletedAt: null, status: "registrado" },
      },
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
      take: Math.min(Math.max(opts.limite ?? 6, 1), 20),
    });
    return filas
      .filter((f) => f.espesorCm != null && f.anchoCm != null && f.largoM != null)
      .map((f) => ({
        productType: f.productType,
        presentacion: f.presentacion,
        espesorCm: Number(f.espesorCm),
        anchoCm: Number(f.anchoCm),
        largoM: Number(f.largoM),
        veces: f._count._all,
      }));
  }

  /**
   * Las escrituras de ANULAR una línea, con el cliente que se le pase: `prisma`
   * desde `annul` (una línea suelta) o la transacción de `ForestCtpAnularDiaDB`
   * (todas las de un día, todas o ninguna — 2026-09-23). Es UNA sola manera de
   * anular: el día no reescribe la regla, la repite dentro de su transacción.
   *
   * Sin guard de período, auditoría ni caché: eso lo hace quien llama, una vez
   * por pedido y no por línea.
   */
  static async anularLineaEn(
    db: Pick<Prisma.TransactionClient, "forestCtpEntry" | "woodEntryTroza">,
    tenantId: string,
    id: string,
    reason: string,
  ) {
    const e = await db.forestCtpEntry.update({
      where: { id, tenantId } satisfies Prisma.ForestCtpEntryWhereUniqueInput,
      data: { status: "anulado", annulledReason: reason.trim() },
    });
    // Las piezas vuelven al patio (ADR-326). Anular una corrida deshace el
    // consumo: en la realidad esa madera está ahí y se va a asserar en otra. Sin
    // esto quedaban marcadas "ya consumida" para siempre y nadie podía usarlas.
    await db.woodEntryTroza.updateMany({
      where: { tenantId, consumidaEnId: id },
      data: { consumidaEnId: null, fechaConsumo: null },
    });
    /* Y las que salieron SIN ASERRAR (ADR-363): anular el despacho es decir que
       ese camión no salió, así que la madera sigue en el patio. Sin esto la
       pieza quedaba marcada "ya despachada" para siempre. */
    await db.woodEntryTroza.updateMany({
      where: { tenantId, despachadaEnId: id },
      data: { despachadaEnId: null, fechaDespacho: null },
    });
    return e;
  }

  static async annul(tenantId: string, id: string, reason: string, user = "unknown") {
    if (!tenantId) throw new Error("tenantId is required");
    if (!reason?.trim()) throw new Error("reason is required");
    // Cierre de período (ADR-139): una línea de un mes cerrado no se anula.
    const curAnnul = await prisma.forestCtpEntry.findFirst({
      where: { id, tenantId },
      select: { entryDate: true },
    });
    const cerradoAnnul = curAnnul
      ? await ForestCtpCierreDB.closedPeriodOf(tenantId, curAnnul.entryDate)
      : null;
    if (cerradoAnnul) {
      throw new CtpInvariantError(
        `El período ${cerradoAnnul.label} está cerrado: no se puede anular una línea de un mes cerrado. Reabre el período para corregir.`,
        "PERIODO_CERRADO",
        { periodKey: cerradoAnnul.periodKey },
      );
    }
    const e = await ForestCtpDB.anularLineaEn(prisma, tenantId, id, reason);
    /* Si a esta corrida se le cobraba el aserrío (ADR-412 §4), ese cargo deja
       de deberse. Awaited para que el saldo de la cuenta ya no lo muestre al
       volver, pero sin poder tumbar la anulación: el libro manda. */
    try {
      await ForestAserrioDB.alAnular(tenantId, id, user);
    } catch (err) {
      logger.error("[forest-ctp.annul] no se pudo dar de baja el cargo de aserrío", {
        error: String(err),
        tenantId,
        entryId: id,
      });
    }
    // Anular saca la línea del balance: quién y por qué es dato de fiscalización.
    auditCtp({
      tenantId,
      action: "ctp_linea_annul",
      entity: "ForestCtpEntry",
      entityId: id,
      detail: `Anuló la línea #${e.lineNo} de ${e.section} (${e.speciesCommon ?? "sin especie"}) · motivo: ${reason.trim()}`,
      user,
    });
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {}
    return e;
  }

  /**
   * Marca (o desmarca) una corrida de PRODUCCIÓN como "ya se usó" (Brandon,
   * 2026-09-01): sale de "Productos disponibles" sin despacharla ni
   * reprocesarla.
   *
   * Para el resto que quedó sin salida formal —mermas, ajustes de inventario,
   * existencias de apertura ya repartidas por fuera del libro— fabricar un
   * despacho que no ocurrió rompería I3/I5 y falsearía la cadena de custodia.
   * Esto es sólo una etiqueta de visibilidad: el saldo real que da
   * `saldosDeCorridas` NO cambia, y la corrida sigue en el libro con su
   * historia completa. Reversible por diseño: desmarcar la vuelve a mostrar.
   *
   * ── Por qué NO lleva el guard de período cerrado (ADR-139) ─────────────────
   * Una auditoría lo marcó como bypass del candado, y la observación es cierta
   * al pie de la letra: escribe tres campos de una línea que puede estar
   * fechada en un mes cerrado. Se deja igual a propósito, y esta es la razón:
   *
   *  · El hecho que registra ocurre HOY —«este resto ya se usó»—, no en el mes
   *    cerrado. La marca lleva `new Date()`, no `entryDate`.
   *  · **No toca ningún número declarado.** `usadoAt` lo lee UNA sola cosa:
   *    `productosDisponibles()`, que es la foto del depósito de hoy. `saldos()`,
   *    `conciliacionPeriodo()`, el snapshot de cierre y el export SERFOR no lo
   *    miran. El acta congelada del mes sigue diciendo exactamente lo mismo.
   *    (Desde 2026-09-06 la «Capacidad de la planta» de Saldos también lee la
   *    foto, y va al reporte de existencias — pero como COTA MÁXIMA derivada y
   *    declarada como tal, con la conciliación contra el libro al lado. No es
   *    un número que se firme: la condición sigue en pie.)
   *  · Bloquearlo obligaría a REABRIR un período cerrado —que sí es un evento
   *    de compliance, y queda en el historial del cierre— para esconder una
   *    tarjeta del depósito. El remedio sería más grave que la enfermedad.
   *
   * ⚠️ **La condición de esa excepción es la segunda viñeta.** Si algún día un
   * número que se declara empieza a leer `usadoAt`, esto pasa a necesitar el
   * guard como cualquier otra escritura. La auditoría deja constancia de sobre
   * qué período cerrado se marcó, para que un fiscalizador lo vea sin buscarlo.
   */
  static async marcarUsado(
    tenantId: string,
    id: string,
    input: { usado: boolean; motivo?: string; user: string },
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const { usado, motivo, user } = input;
    if (usado && !motivo?.trim()) {
      throw new CtpInvariantError(
        "Pon el motivo por el que se marca como usado.",
        "MOTIVO_REQUERIDO",
      );
    }
    const e = await prisma.forestCtpEntry.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!e) throw new CtpInvariantError("Esa línea no existe.", "LOTE_NO_ENCONTRADO");
    if (e.section !== "produccion") {
      throw new CtpInvariantError(
        "Sólo una corrida de producción se puede marcar como usada.",
        "LOTE_NO_EDITABLE",
      );
    }
    /* No bloquea (ver la cabecera), pero SÍ se deja dicho: una marca sobre una
       línea de un mes cerrado tiene que poder rastrearse sin cruzar tablas. */
    const cerradoUsado = await ForestCtpCierreDB.closedPeriodOf(tenantId, e.entryDate);
    const actualizada = await prisma.forestCtpEntry.update({
      where: { id, tenantId },
      data: usado
        ? { usadoAt: new Date(), usadoPor: user, usadoMotivo: motivo!.trim() }
        : { usadoAt: null, usadoPor: null, usadoMotivo: null },
    });
    auditCtp({
      tenantId,
      action: usado ? "ctp_linea_marcar_usado" : "ctp_linea_desmarcar_usado",
      entity: "ForestCtpEntry",
      entityId: id,
      detail:
        (usado
          ? `Marcó la corrida N° ${e.lineNo} como ya usada: sale de Productos disponibles · motivo: ${motivo!.trim()}`
          : `Desmarcó la corrida N° ${e.lineNo}: vuelve a Productos disponibles`) +
        (cerradoUsado
          ? ` · la línea está fechada en ${cerradoUsado.label}, período CERRADO (la marca no altera el acta: ningún saldo declarado lee este campo)`
          : ""),
      user,
    });
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {}
    return actualizada;
  }

  /**
   * APARTAR un producto del patio (ADR-418): reservarlo a nombre de alguien
   * mientras se termina de armar la guía de salida.
   *
   * El hueco que tapa: entre que el operador elige los paquetes de un pedido y
   * emite la GTF pasan horas o días —hay que confirmar transportista, conductor
   * y placa—. En ese hueco la madera sigue apareciendo libre para todos, y dos
   * vendedores prometían los mismos paquetes.
   *
   * Se aparta una FILA de «Productos disponibles», que son dos cosas distintas:
   * un paquete con su código (`paqueteId`) o la corrida entera cuando no declaró
   * paquetes (`paqueteId = null`).
   *
   * ── Qué NO hace ────────────────────────────────────────────────────────────
   * No mueve stock, no descuenta saldo y no toca ningún número declarado: es
   * exactamente el mismo criterio que `marcarUsado` (ver su cabecera). Por eso
   * tampoco lleva el guard de período cerrado — el hecho que registra («esto lo
   * tiene fulano desde hoy») ocurre HOY, no en el mes de la corrida, y ningún
   * acta, cierre ni export SERFOR lee esta tabla. Es una etiqueta de visibilidad
   * con nombre, fecha y responsable.
   *
   * ⚠️ Si algún día un saldo declarado empieza a descontar lo apartado, esto pasa
   * a necesitar el guard como cualquier otra escritura del libro.
   *
   * Una fila no puede tener dos reservas vivas: se chequea acá para poder decir
   * QUIÉN la tiene —un choque de índice crudo no sirve al operador—, y la red
   * contra dos clics simultáneos es el índice parcial `ForestCtpApartado_vivo_unico`
   * (`prisma/migrations/adr-418-ctp-apartar-productos.sql`).
   */
  static async apartarProducto(
    tenantId: string,
    input: {
      ctpEntryId: string;
      paqueteId?: string | null;
      para: string;
      hasta?: Date | null;
      nota?: string | null;
    },
    user: string,
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const para = (input.para ?? "").trim();
    if (!para) {
      throw new CtpInvariantError("Pon para quién se aparta el producto.", "VALIDACION");
    }
    const paqueteId = (input.paqueteId ?? "").trim() || null;
    const nota = (input.nota ?? "").trim() || null;

    const corrida = await prisma.forestCtpEntry.findFirst({
      where: { id: input.ctpEntryId, tenantId, deletedAt: null },
      select: { id: true, lineNo: true, section: true, speciesCommon: true, productType: true },
    });
    if (!corrida) throw new CtpInvariantError("Esa corrida no existe.", "LOTE_NO_ENCONTRADO");
    /* El patio sólo tiene producto terminado de una corrida de producción: una
       línea de despacho es madera que YA se fue, no hay qué reservar. */
    if (corrida.section !== "produccion") {
      throw new CtpInvariantError(
        "Sólo se aparta producto de una corrida de producción.",
        "SECCION_INVALIDA",
      );
    }

    /* El paquete tiene que ser de ESTA corrida: apartar el paquete de otra
       dejaría la reserva colgada de una fila que la pantalla nunca muestra
       junto a él (y el índice único la contaría en el lugar equivocado). */
    let paqueteCodigo: string | null = null;
    if (paqueteId) {
      const paquete = await prisma.forestCtpPaquete.findFirst({
        where: { id: paqueteId, tenantId, ctpEntryId: corrida.id, deletedAt: null },
        select: { id: true, codigo: true },
      });
      if (!paquete) {
        throw new CtpInvariantError("Ese paquete no existe o es de otra corrida.", "VALIDACION");
      }
      paqueteCodigo = paquete.codigo;
    }

    const yaApartado = await prisma.forestCtpApartado.findFirst({
      where: { tenantId, ctpEntryId: corrida.id, paqueteId, liberadoAt: null },
      select: { para: true, creadoAt: true },
    });
    if (yaApartado) {
      throw new CtpInvariantError(
        /* Concordancia de género: «la corrida … ya está apartadA». El mensaje
           lo lee el operador en un cartel rojo; una falta de acuerdo ahí se
           nota más que en cualquier otro lado. */
        (paqueteCodigo
          ? `El paquete ${paqueteCodigo} ya está apartado`
          : `La corrida N° ${corrida.lineNo} ya está apartada`) +
          ` para ${yaApartado.para.replace(/\.$/, "")}. Libera esa reserva antes de apartar${paqueteCodigo ? "lo" : "la"} de nuevo.`,
        "VALIDACION",
      );
    }

    let apartado;
    try {
      apartado = await prisma.forestCtpApartado.create({
        data: {
          tenantId,
          ctpEntryId: corrida.id,
          paqueteId,
          para,
          hasta: input.hasta ?? null,
          nota,
          creadoPor: user,
        },
      });
    } catch (err) {
      /* Dos clics a la vez: el chequeo de arriba pasó en los dos y el índice
         parcial frenó al segundo. Se traduce al mismo idioma, no a un 500. */
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new CtpInvariantError(
          "Alguien acaba de apartar ese producto. Recarga la lista para ver quién lo tiene.",
          "VALIDACION",
        );
      }
      throw err;
    }

    const queCosa = paqueteCodigo
      ? `el paquete ${paqueteCodigo}`
      : `la corrida N° ${corrida.lineNo}`;
    auditCtp({
      tenantId,
      action: "ctp_apartar",
      entity: "ForestCtpApartado",
      entityId: apartado.id,
      detail:
        `Apartó ${queCosa} (${corrida.productType ?? "sin producto"} · ${corrida.speciesCommon ?? "sin especie"}) para ${para}` +
        (input.hasta ? ` · hasta el ${input.hasta.toISOString().slice(0, 10)}` : " · sin plazo") +
        (nota ? ` · nota: ${nota}` : ""),
      user,
    });
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {}
    return apartado;
  }

  /**
   * LIBERAR un apartado (ADR-418): el producto vuelve a estar disponible.
   *
   * No se borra la fila: el historial de quién tuvo reservado qué y por cuánto
   * tiempo es justo lo que se consulta cuando un cliente reclama que su madera
   * se vendió a otro. La reserva queda muerta con fecha, responsable y motivo.
   *
   * Idempotente a propósito: dos clics seguidos en «Liberar» no pueden dar
   * error —el producto ya está libre, que es lo que el operador pidió—, pero el
   * segundo NO vuelve a auditar ni pisa quién la soltó primero.
   */
  static async liberarApartado(
    tenantId: string,
    apartadoId: string,
    motivo: string | null,
    user: string,
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const apartado = await prisma.forestCtpApartado.findFirst({
      where: { id: apartadoId, tenantId },
      include: {
        ctpEntry: { select: { lineNo: true } },
        paquete: { select: { codigo: true } },
      },
    });
    if (!apartado) throw new CtpInvariantError("Esa reserva no existe.", "LOTE_NO_ENCONTRADO");
    const { ctpEntry, paquete, ...fila } = apartado;
    /* Ya estaba liberada: se devuelve tal cual, sin re-escribir ni re-auditar.
       Reabrir el renglón borraría a quién la soltó de verdad. */
    if (fila.liberadoAt) return fila;

    const razon = (motivo ?? "").trim() || null;
    /* Doble filtro tenantId + id aunque la lectura de arriba ya lo probó:
       un update del libro nunca sale sin el tenant en el WHERE (regla 3). */
    const liberado = await prisma.forestCtpApartado.update({
      where: { id: apartadoId, tenantId },
      data: { liberadoAt: new Date(), liberadoPor: user, liberadoMotivo: razon },
    });

    const queCosa = paquete?.codigo
      ? `el paquete ${paquete.codigo}`
      : `la corrida N° ${ctpEntry.lineNo}`;
    auditCtp({
      tenantId,
      action: "ctp_liberar_apartado",
      entity: "ForestCtpApartado",
      entityId: apartadoId,
      detail:
        `Liberó ${queCosa}, que estaba apartado para ${apartado.para}: vuelve a Productos disponibles` +
        (razon ? ` · motivo: ${razon}` : ""),
      user,
    });
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {}
    return liberado;
  }

  /**
   * CAMBIAR una reserva viva (ADR-418): a quién, hasta cuándo o su nota.
   *
   * Hasta el 2026-09-23 no existía: «Guardar cambios» del modal volvía a llamar
   * a `apartarProducto`, que rechaza —con razón— una fila que ya tiene reserva
   * viva, así que editar un apartado respondía 422 «ya está apartada». Y los
   * pendientes del libro necesitan EXTENDER una reserva vencida sin soltarla y
   * volver a tomarla (eso pierde la fecha original y deja un hueco en el que
   * otro puede apartarla).
   *
   * Sólo toca los campos que vienen (`undefined` = no cambia; `hasta: null` =
   * sin plazo). Que el plazo nuevo no esté vencido lo valida el endpoint con el
   * MISMO esquema que al apartar. Igual que apartar, no mueve stock ni lleva el
   * guard de período: es una etiqueta de visibilidad (ver `apartarProducto`).
   *
   * Carrera con «Liberar» en otra pestaña: el `updateMany` lleva
   * `liberadoAt: null` en el WHERE — si otro la soltó entre la lectura y la
   * escritura, no se revive una reserva muerta (0 filas → se dice).
   *
   * Y la madera tiene que seguir en el libro: la corrida registrada y sin
   * borrar, y el paquete (si lo hay) sin borrar. Desde una pestaña vieja se
   * podía extender la reserva de una corrida ya anulada. Va en el WHERE de la
   * lectura Y de la escritura, porque la corrida también se puede anular entre
   * las dos.
   */
  static async cambiarApartado(
    tenantId: string,
    apartadoId: string,
    cambios: { para?: string; hasta?: Date | null; nota?: string | null },
    user: string,
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const maderaViva: Prisma.ForestCtpApartadoWhereInput = {
      ctpEntry: { deletedAt: null, status: "registrado" },
      OR: [{ paqueteId: null }, { paquete: { deletedAt: null } }],
    };
    const apartado = await prisma.forestCtpApartado.findFirst({
      where: { id: apartadoId, tenantId, ...maderaViva },
      include: {
        ctpEntry: { select: { lineNo: true } },
        paquete: { select: { codigo: true } },
      },
    });
    if (!apartado) {
      throw new CtpInvariantError(
        "Esa reserva no existe o su madera ya no está en el libro (la corrida se anuló o se borró).",
        "LOTE_NO_ENCONTRADO",
      );
    }
    const { ctpEntry, paquete, ...fila } = apartado;
    const yaLiberada = new CtpInvariantError(
      "Esa reserva ya se liberó y la madera está libre. Apártala de nuevo si todavía va.",
      "VALIDACION",
    );
    if (fila.liberadoAt) throw yaLiberada;

    const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    const data: { para?: string; hasta?: Date | null; nota?: string | null } = {};
    if (cambios.para !== undefined) {
      const para = cambios.para.trim();
      if (!para) throw new CtpInvariantError("Pon para quién es el apartado.", "VALIDACION");
      if (para !== fila.para) data.para = para;
    }
    if (cambios.hasta !== undefined && dia(cambios.hasta) !== dia(fila.hasta)) {
      data.hasta = cambios.hasta;
    }
    if (cambios.nota !== undefined) {
      const nota = (cambios.nota ?? "").trim() || null;
      if (nota !== fila.nota) data.nota = nota;
    }
    /* Nada cambió: se devuelve tal cual, sin escribir ni auditar un renglón vacío. */
    if (Object.keys(data).length === 0) return fila;

    const { count } = await prisma.forestCtpApartado.updateMany({
      where: { id: apartadoId, tenantId, liberadoAt: null, ...maderaViva },
      data,
    });
    /* 0 filas: otra pestaña la liberó, o anuló la corrida, entre la lectura y
       la escritura. Las dos se resuelven igual: recargar y mirar. */
    if (count === 0) {
      throw new CtpInvariantError(
        "Esa reserva cambió mientras tanto (se liberó o su corrida se anuló). Recarga la lista.",
        "VALIDACION",
      );
    }

    /* «del paquete», no «de el paquete»: la línea la lee una persona en el historial. */
    const deQue = paquete?.codigo
      ? `del paquete ${paquete.codigo}`
      : `de la corrida N° ${ctpEntry.lineNo}`;
    const plazo = (d: Date | null) => (d ? `el ${dia(d)}` : "sin plazo");
    auditCtp({
      tenantId,
      action: "ctp_cambiar_apartado",
      entity: "ForestCtpApartado",
      entityId: apartadoId,
      detail:
        `Cambió la reserva ${deQue}` +
        (data.para !== undefined ? ` · para: ${fila.para} → ${data.para}` : ` · para ${fila.para}`) +
        (data.hasta !== undefined ? ` · plazo: ${plazo(fila.hasta)} → ${plazo(data.hasta)}` : "") +
        (data.nota !== undefined ? ` · nota: ${data.nota ?? "(sin nota)"}` : ""),
      user,
    });
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {}
    return { ...fila, ...data };
  }

  /**
   * Las reservas VIVAS con el plazo vencido, para los pendientes del libro.
   *
   * «Vencida» la decide `reservasVencidas` (la misma cuenta que pinta la celda);
   * el WHERE sólo recorta a las candidatas: `hasta` antes de la medianoche UTC
   * del día de hoy en Lima. Como `hasta` es date-only, eso equivale exactamente
   * a «el día del plazo es anterior a hoy» y no trae ninguna de más.
   *
   * Sólo las de madera que Productos disponibles MUESTRA — el mismo criterio,
   * no uno parecido: corrida en el patio (`whereCorridaEnElPatio`: registrada,
   * con cantidad y origen, sin «ya usado») y con saldo (`tieneDisponible`), y
   * paquete no borrado. Una reserva sobre madera que ya salió no congela nada:
   * contarla sumaba en la pestaña y «Ver en Productos disponibles» llevaba a
   * una fila que no está. Sin período a propósito: una reserva vencida en
   * agosto sigue frenando madera hoy.
   */
  static async reservasVencidas(tenantId: string, ahora: Date): Promise<ReservaVencida[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const hoyUtc = new Date(`${limaDateKey(ahora)}T00:00:00.000Z`);
    const filas = await prisma.forestCtpApartado.findMany({
      where: {
        tenantId,
        liberadoAt: null,
        hasta: { lt: hoyUtc },
        ctpEntry: whereCorridaEnElPatio(tenantId),
        OR: [{ paqueteId: null }, { paquete: { deletedAt: null } }],
      },
      orderBy: { hasta: "asc" },
      take: 200,
      include: {
        ctpEntry: { select: { lineNo: true, speciesCommon: true, productType: true } },
        paquete: { select: { codigo: true, volumenM3: true } },
      },
    });
    if (filas.length === 0) return [];
    const saldos = await saldosDeCorridas(
      prisma,
      tenantId,
      filas.map((a) => a.ctpEntryId),
    );
    return reservasVencidas(
      filas
        .filter((a) => tieneDisponible(saldos.get(a.ctpEntryId)))
        .map((a) => ({
        id: a.id,
        para: a.para,
        hasta: a.hasta ? a.hasta.toISOString().slice(0, 10) : null,
        liberadoAt: a.liberadoAt,
        lineNo: a.ctpEntry.lineNo,
        especie: a.ctpEntry.speciesCommon,
        producto: a.ctpEntry.productType,
        paqueteCodigo: a.paquete?.codigo ?? null,
        volumenM3: a.paquete?.volumenM3 != null ? Number(a.paquete.volumenM3) : null,
      })),
      ahora,
    );
  }

  /**
   * Completar los campos VACÍOS de una corrida (ADR-401 §1.2).
   *
   * No es «editar»: es llenar un hueco. Un asiento que decía `presentacion:
   * null` y pasa a decir «Paquete 2×8» no contradice nada de lo que el libro
   * afirmó — agrega lo que faltaba. Por eso esta puerta existe y la de
   * sobrescribir un valor ya escrito, no: **un campo con dato NO se toca acá**,
   * aunque venga en el payload. Se ignora en silencio del lado del dato y se
   * dice en la respuesta.
   *
   * Dos niveles, como el ADR:
   *  · Descriptivos (`observations`, `presentacion`, `materiaPrimaRef`) — se
   *    completan con el período abierto, aunque la corrida ya se haya usado.
   *  · Del registro (`speciesCommon`, `speciesScientific`, `productType`) —
   *    sólo si NADA depende del asiento: sin despachos que lo citen, sin
   *    reproceso, sin lote, y no anulado.
   *
   * `quantity`, `volumeInputM3`, `unit` y `entryDate` quedan afuera: aunque
   * estén vacíos, ponerles un número mueve saldos e invariantes — eso es
   * declarar producción (`declarar_produccion`), que ya tiene su propia puerta
   * con sus propias reglas.
   */
  /**
   * El libro dejó de decir que la madera es de un tercero: no hay a quién
   * cobrarle el aserrío (ADR-412 §4). Baja lógica del cargo y la corrida sin
   * dueño de cobro — si no, la corrida diría «propia» mientras la cuenta de
   * otro sigue debiendo por ella.
   *
   * Corre DESPUÉS de guardar la corrección y no la puede tumbar: el asiento del
   * libro manda. `null` = no había nada que soltar.
   */
  private static async dejarDeCobrarSiNoEsDeTercero(
    tenantId: string,
    id: string,
    d: { escribioDueno: boolean; duenoMadera: string | null; duenoParteId: string | null },
    user: string,
  ): Promise<ResultadoCobro | null> {
    if (!debeDejarDeCobrar(d)) return null;
    try {
      return await ForestAserrioDB.cobrarCorrida(tenantId, id, { duenoParteId: null }, user);
    } catch (err) {
      logger.error("[forest-ctp] el dueño se corrigió pero el cobro de aserrío no se soltó", {
        error: String(err),
        tenantId,
        entryId: id,
      });
      return null;
    }
  }

  static async completarLinea(
    tenantId: string,
    id: string,
    campos: Partial<Record<CampoCompletable, string>>,
    user = "unknown",
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id) throw new Error("id is required");

    const actual = await prisma.forestCtpEntry.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: {
        id: true, lineNo: true, section: true, status: true, entryDate: true,
        observations: true, presentacion: true, materiaPrimaRef: true,
        speciesCommon: true, speciesScientific: true, productType: true,
        duenoMadera: true, titularNombre: true, duenoParteId: true,
      },
    });
    if (!actual) throw new CtpInvariantError("Esa línea no existe.", "LOTE_NO_ENCONTRADO");
    if (actual.status !== "registrado") {
      throw new CtpInvariantError(
        `Una línea ${actual.status} no se completa: regístrala de nuevo.`,
        "ESTADO_NO_EDITABLE",
        { status: actual.status },
      );
    }
    const cerrado = await ForestCtpCierreDB.closedPeriodOf(tenantId, actual.entryDate);
    if (cerrado) {
      throw new CtpInvariantError(
        `El período ${cerrado.label} está cerrado: no se completan líneas de un mes cerrado. Reabre el período para corregir.`,
        "PERIODO_CERRADO",
        { periodKey: cerrado.periodKey },
      );
    }

    /* ¿Algo depende de este asiento? Decide si los campos del REGISTRO se
       pueden tocar. Se cuenta en paralelo: son tres lecturas chicas por id. */
    const [despachos, reprocesos, enLote] = await Promise.all([
      prisma.forestCtpDespachoOrigen.count({ where: { tenantId, produccionEntryId: id } }),
      prisma.forestCtpReproceso.count({ where: { tenantId, origenEntryId: id } }),
      prisma.forestProdLoteMiembro.count({ where: { tenantId, produccionEntryId: id } }),
    ]);
    const atado =
      despachos > 0 ? "ya tiene despachos que la citan como origen"
      : reprocesos > 0 ? "ya alimentó un reproceso"
      : enLote > 0 ? "es miembro de un lote de producción"
      : null;

    /* Mismo candado que `corregirLinea`: completar un titular vacío de una
       corrida que se cobra (quedó así al cobrarla en un mes cerrado) también
       escribiría un nombre distinto del de la cuenta. El dueño sólo cuenta como
       cambio si estaba vacío: completar no pisa lo que ya dice. */
    const duenoCompleta = esCampoSinDato(actual.duenoMadera) ? (campos.duenoMadera ?? "").trim() : "";
    const titularAtado = titularBloqueadoPorCobro({
      escribioDueno: duenoCompleta !== "",
      duenoMadera: duenoCompleta || actual.duenoMadera,
      duenoParteId: actual.duenoParteId,
    });
    /* El par dueño/titular se completa entero (misma regla que `corregirLinea`):
       «de tercero» sin nombre no se guarda, y «del centro» no lleva titular —
       completar «propia» sobre un titular escrito lo deja en `null`. El titular
       ya escrito no se pisa: completar sólo llena huecos. */
    const titularPedido = titularAtado ? "" : (campos.titularNombre ?? "").trim();
    const parDueno = duenoCompleta
      ? revisarDueno({
          dueno: esDuenoMadera(duenoCompleta) ? duenoCompleta : null,
          titularNombre: esCampoSinDato(actual.titularNombre) ? titularPedido || null : actual.titularNombre,
        })
      : null;
    const rechazoDueno =
      parDueno && !parDueno.valido && parDueno.normalizado.dueno === "tercero"
        ? (parDueno.problema ?? "falta el titular")
        : null;

    const aplicados: string[] = [];
    const omitidos: { campo: string; motivo: string }[] = [];
    const data: Record<string, string> = {};

    for (const [campo, bruto] of Object.entries(campos) as [CampoCompletable, string][]) {
      const valor = (bruto ?? "").trim();
      if (!valor) continue;
      const previo = actual[campo] as string | null;
      /* Un «—» está tan vacío como un `null`: la tabla pinta lo mismo para los
         dos, así que bloquearlo por «ya tiene dato» dejaba al operario mirando
         un guion que no podía completar. */
      if (!esCampoSinDato(previo)) {
        omitidos.push({ campo, motivo: `ya dice «${previo}»` });
        continue;
      }
      if (campo === "titularNombre" && titularAtado) {
        omitidos.push({ campo, motivo: MOTIVO_TITULAR_COBRADO });
        continue;
      }
      if (campo === "duenoMadera" && rechazoDueno) {
        omitidos.push({ campo, motivo: rechazoDueno });
        continue;
      }
      /* Si se completa el dueño, el titular va con el par (después del bucle). */
      if (campo === "titularNombre" && duenoCompleta) continue;
      if (campo === "titularNombre" && actual.duenoMadera === "propia") {
        omitidos.push({ campo, motivo: MOTIVO_TITULAR_DEL_CENTRO });
        continue;
      }
      if (CAMPOS_DEL_REGISTRO.includes(campo) && atado) {
        omitidos.push({ campo, motivo: `la corrida ${atado}` });
        continue;
      }
      data[campo] = valor;
      /* Reemplazar un marcador NO es lo mismo que llenar un hueco: el rastro lo
         dice, porque el campo antes ocupaba lugar con algo escrito. */
      const marcador = marcadorDeAusencia(previo);
      aplicados.push(`${ETIQUETA_CAMPO[campo]} ${marcador ? `«${marcador}» ` : ""}→ ${valor}`);
    }

    if (parDueno && data.duenoMadera) {
      const titularFinal = titularQueQueda(parDueno.normalizado.dueno, parDueno.normalizado.titularNombre);
      if (titularFinal !== (actual.titularNombre ?? null)) {
        data.titularNombre = titularFinal ?? "";
        aplicados.push(`${ETIQUETA_CAMPO.titularNombre} ${actual.titularNombre ?? "—"} → ${titularFinal ?? "—"}`);
      }
    }

    if (aplicados.length === 0) {
      return { ok: false as const, aplicados: [], omitidos };
    }

    await prisma.forestCtpEntry.update({
      where: { id, tenantId },
      /* `""` = el titular que el par vació («del centro»): se guarda `null`. */
      data: { ...data, ...(data.titularNombre === "" ? { titularNombre: null } : {}) },
    });
    auditCtp({
      tenantId,
      action: "ctp_linea_completar",
      entity: "ForestCtpEntry",
      entityId: id,
      /* Sólo los campos que estaban VACÍOS, con lo que se les puso: el «antes»
         era la nada, así que el detalle no necesita narrarlo. */
      detail:
        `Completó campos vacíos de la línea N° ${actual.lineNo ?? "?"} · ${aplicados.join(" · ")}` +
        (omitidos.length ? ` · sin tocar: ${omitidos.map((o) => `${o.campo} (${o.motivo})`).join(", ")}` : ""),
      user,
    });
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {}
    const aserrio = await ForestCtpDB.dejarDeCobrarSiNoEsDeTercero(
      tenantId,
      id,
      { escribioDueno: "duenoMadera" in data, duenoMadera: data.duenoMadera ?? actual.duenoMadera, duenoParteId: actual.duenoParteId },
      user,
    );
    return {
      ok: true as const,
      aplicados,
      omitidos,
      /** Los campos que de verdad se escribieron: decide si hay que recotizar. */
      camposAplicados: Object.keys(data) as CampoCompletable[],
      ...(aserrio ? { aserrio } : {}),
    };
  }

  /**
   * Corregir campos YA CARGADOS de una corrida (ADR-401 §1 y §2).
   *
   * Es la hermana peligrosa de `completarLinea`: acá se SOBRESCRIBE lo que el
   * libro ya afirmaba. Por eso lleva los seis candados del ADR y no uno menos:
   *
   *  · **Descriptivos** (`observations`, `presentacion`, `materiaPrimaRef`) —
   *    con el período abierto, aunque la corrida ya se haya usado. No cambian
   *    ninguna cuenta ni ninguna cadena de custodia.
   *  · **Del registro** (`speciesCommon`, `speciesScientific`, `productType`,
   *    `unit`, `quantity`, `volumeInputM3`) — sólo si NADA depende del asiento:
   *    sin despachos que lo citen, sin reproceso, sin lote. Cambiar la especie
   *    de una corrida ya despachada dejaría una guía emitida citando madera que
   *    el libro ahora dice que era otra.
   *
   * `entryDate` no está: mover la fecha cambia de qué mes es la producción y
   * toca dos períodos a la vez (decisión de Brandon, ADR-401 §1.1). Una fecha
   * mal puesta se anula y se rehace.
   *
   * La auditoría narra **el antes y el después de cada campo**. Una corrección
   * sin ese detalle es indistinguible de una adulteración.
   */
  /**
   * Cargar o corregir la escuadría de un paquete ya declarado (ADR-417).
   *
   * Por qué existe: 27 de los 33 paquetes del tenant real no tienen espesor,
   * ancho ni largo, así que su volumen no se puede recalcular ni imprimir una
   * lista de empaque — y el freno de cifras imposibles cae a su criterio flojo.
   *
   * **No toca `volumenM3` del paquete ni `quantity` de la corrida.** La
   * escuadría se carga para poder COTEJAR lo declarado, no para reemplazarlo: si
   * la medida y el volumen no cuadran, eso es justamente lo que hay que ver, y
   * pisar uno con el otro borraría la pregunta. `cantidad` sólo se completa
   * cuando el paquete venía en cero (19 de esos 27 llegaron así en la importación).
   */
  static async corregirMedidasDePaquete(
    tenantId: string,
    ctpEntryId: string,
    input: { paqueteId: string; espesorCm: number; anchoCm: number; largoM: number; cantidad?: number },
    user = "unknown",
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!ctpEntryId) throw new Error("ctpEntryId is required");

    const corrida = await prisma.forestCtpEntry.findFirst({
      where: { id: ctpEntryId, tenantId, deletedAt: null },
      select: { id: true, lineNo: true, status: true, entryDate: true },
    });
    if (!corrida) throw new CtpInvariantError("Esa corrida no existe.", "LOTE_NO_ENCONTRADO");
    if (corrida.status !== "registrado") {
      throw new CtpInvariantError(
        `Una corrida ${corrida.status} no se corrige: regístrala de nuevo.`,
        "ESTADO_NO_EDITABLE",
        { status: corrida.status },
      );
    }
    const cerrado = await ForestCtpCierreDB.closedPeriodOf(tenantId, corrida.entryDate);
    if (cerrado) {
      throw new CtpInvariantError(
        `El período ${cerrado.label} está cerrado: no se corrigen paquetes de un mes cerrado. Reabre el período.`,
        "PERIODO_CERRADO",
        { periodKey: cerrado.periodKey },
      );
    }

    /* El paquete se busca por tenant Y por corrida: un `paqueteId` de otra
       corrida —o de otro tenant— no se toca ni se dice que sí. */
    const paquete = await prisma.forestCtpPaquete.findFirst({
      where: { id: input.paqueteId, tenantId, ctpEntryId, deletedAt: null },
      select: { id: true, codigo: true, cantidad: true, espesorCm: true, anchoCm: true, largoM: true },
    });
    if (!paquete) throw new CtpInvariantError("Ese paquete no existe en esta corrida.", "LOTE_NO_ENCONTRADO");

    const data: Prisma.ForestCtpPaqueteUpdateInput = {
      espesorCm: new Prisma.Decimal(input.espesorCm),
      anchoCm: new Prisma.Decimal(input.anchoCm),
      largoM: new Prisma.Decimal(input.largoM),
    };
    /* Sólo se completa lo que faltaba: bajar las piezas de un paquete que ya las
       declaraba cambiaría cuentas que el libro ya publicó. */
    const completaPiezas = typeof input.cantidad === "number" && paquete.cantidad === 0;
    if (completaPiezas) data.cantidad = input.cantidad;

    await prisma.forestCtpPaquete.update({ where: { id: paquete.id, tenantId }, data });

    auditCtp({
      tenantId,
      action: "ctp_paquete_escuadria",
      entity: "ForestCtpPaquete",
      entityId: paquete.id,
      detail:
        `Cargó la escuadría del paquete ${paquete.codigo} (corrida N° ${corrida.lineNo ?? "?"}): ` +
        `${input.espesorCm} × ${input.anchoCm} cm × ${input.largoM} m` +
        (completaPiezas ? ` · piezas ${input.cantidad}` : ""),
      user,
    });
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {}
    return { ok: true as const, paqueteId: paquete.id, piezasCompletadas: completaPiezas };
  }

  static async corregirLinea(
    tenantId: string,
    id: string,
    campos: Partial<Record<CampoCorregible, string>>,
    user = "unknown",
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id) throw new Error("id is required");

    const actual = await prisma.forestCtpEntry.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: {
        id: true, lineNo: true, section: true, status: true, entryDate: true,
        observations: true, presentacion: true, materiaPrimaRef: true,
        speciesCommon: true, speciesScientific: true, productType: true,
        unit: true, quantity: true, volumeInputM3: true, originCode: true,
        duenoMadera: true, titularNombre: true, duenoParteId: true,
      },
    });
    if (!actual) throw new CtpInvariantError("Esa línea no existe.", "LOTE_NO_ENCONTRADO");
    if (actual.status !== "registrado") {
      throw new CtpInvariantError(
        `Una línea ${actual.status} no se corrige: regístrala de nuevo.`,
        "ESTADO_NO_EDITABLE",
        { status: actual.status },
      );
    }
    const cerrado = await ForestCtpCierreDB.closedPeriodOf(tenantId, actual.entryDate);
    if (cerrado) {
      throw new CtpInvariantError(
        `El período ${cerrado.label} está cerrado: no se corrigen líneas de un mes cerrado. Reabre el período.`,
        "PERIODO_CERRADO",
        { periodKey: cerrado.periodKey },
      );
    }

    const [despachos, reprocesos, enLote, salidas, reproSalida, consumido] = await Promise.all([
      prisma.forestCtpDespachoOrigen.count({ where: { tenantId, produccionEntryId: id } }),
      prisma.forestCtpReproceso.count({ where: { tenantId, origenEntryId: id } }),
      prisma.forestProdLoteMiembro.count({ where: { tenantId, produccionEntryId: id } }),
      prisma.forestCtpDespachoOrigen.aggregate({ where: { tenantId, produccionEntryId: id }, _sum: { quantity: true } }),
      prisma.forestCtpReproceso.aggregate({ where: { tenantId, origenEntryId: id }, _sum: { quantity: true } }),
      /* Lo que la corrida YA tiene atribuido de materia prima: bajar el volumen
         consumido por debajo de eso rompe I1 (Σ consumos ≤ volumeInputM3). */
      prisma.forestCtpConsumo.aggregate({ where: { tenantId, ctpEntryId: id }, _sum: { volumeM3: true } }),
    ]);
    const atado =
      /* Un DESPACHO no pasa por acá con sus campos del registro: sus ataduras
         son otras (I3 Σ despachado ≤ Σ producido, I4 Σ orígenes ≤ quantity) y
         se cuentan sobre `despachoEntryId`, que estas tres lecturas no miran.
         Dejarlo entrar significaría subir la cantidad de una salida —o cambiar
         su producto con la GTF ya emitida— sin que ninguna invariante lo vea.
         Los descriptivos sí: no tocan ninguna cuenta. */
      actual.section === "despacho" ? "es una línea de despacho: sus cantidades y su producto se corrigen desde la guía"
      : despachos > 0 ? "ya tiene despachos que la citan como origen"
      : reprocesos > 0 ? "ya alimentó un reproceso"
      : enLote > 0 ? "es miembro de un lote de producción"
      : null;
    /** Lo ya comprometido: ninguna cantidad nueva puede quedar por debajo. */
    const comprometido =
      Number(salidas._sum.quantity ?? 0) + Number(reproSalida._sum.quantity ?? 0);
    /** Materia prima ya atribuida a esta corrida (I1). */
    const atribuidoM3 = Number(consumido._sum.volumeM3 ?? 0);

    /* El titular de una corrida que se cobra (ADR-412) no se reescribe a mano:
       el libro nombraría a uno y la cuenta le cobraría a otro. Se libera sólo
       si esta misma corrección saca a la madera de «de tercero». */
    const duenoPedido = (campos.duenoMadera ?? "").trim();
    const cambiaDueno = duenoPedido !== "" && duenoPedido !== (actual.duenoMadera ?? "");
    const titularAtado = titularBloqueadoPorCobro({
      escribioDueno: cambiaDueno,
      duenoMadera: cambiaDueno ? duenoPedido : actual.duenoMadera,
      duenoParteId: actual.duenoParteId,
    });

    const cambios: string[] = [];
    const rechazados: { campo: string; motivo: string }[] = [];
    const data: Record<string, string | number> = {};

    for (const [campo, bruto] of Object.entries(campos) as [CampoCorregible, string][]) {
      const valor = (bruto ?? "").trim();
      if (!valor) continue;
      if (CAMPOS_CORREGIBLES_DEL_REGISTRO.includes(campo) && atado) {
        rechazados.push({
          campo,
          motivo: actual.section === "despacho" ? atado : `la corrida ${atado}`,
        });
        continue;
      }
      const previo = actual[campo];
      const previoTexto = previo == null ? "—" : String(previo);
      if (previoTexto === valor) continue;
      if (campo === "titularNombre" && titularAtado) {
        rechazados.push({ campo, motivo: MOTIVO_TITULAR_COBRADO });
        continue;
      }
      /* Si esta corrección cambia el dueño, el titular va con el par (abajo). */
      if (campo === "titularNombre" && cambiaDueno) continue;
      if (campo === "titularNombre" && actual.duenoMadera === "propia") {
        rechazados.push({ campo, motivo: MOTIVO_TITULAR_DEL_CENTRO });
        continue;
      }

      if (campo === "quantity" || campo === "volumeInputM3") {
        const n = Number(valor);
        if (!Number.isFinite(n) || n < 0) {
          rechazados.push({ campo, motivo: "no es un número válido" });
          continue;
        }
        /* Defensa en profundidad (ADR-401 §3): el guard de arriba ya hace
           imposible este caso —una corrida despachada no llega hasta acá— y
           aun así se revalida, porque las invariantes son ley traducida a
           código, no una optimización. */
        if (campo === "quantity" && n < comprometido) {
          rechazados.push({
            campo,
            motivo: `ya hay ${comprometido} comprometidos entre despachos y reprocesos: la cantidad no puede quedar por debajo (I3/I5)`,
          });
          continue;
        }
        /* I1: la corrida no puede declarar que consumió MENOS de lo que ya
           tiene atribuido de las guías. El acta y la atribución dicen lo mismo
           o el libro se contradice consigo mismo. */
        if (campo === "volumeInputM3" && n < atribuidoM3) {
          rechazados.push({
            campo,
            motivo: `ya tiene ${atribuidoM3.toFixed(4)} m³ atribuidos de las guías de ingreso: el volumen consumido no puede quedar por debajo (I1). Cambia primero la atribución.`,
          });
          continue;
        }
        data[campo] = n;
      } else {
        data[campo] = valor;
      }
      cambios.push(`${ETIQUETA_CAMPO_CORREGIBLE[campo]} ${previoTexto} → ${valor}`);
    }

    /* Las dos mitades del dueño tienen que quedar contándose la misma historia
       (ADR-412). Pasar a «propia» sin borrar el titular dejaría la corrida
       diciendo que la madera es del centro Y de la CC.NN. San Luis — y por acá
       no se puede vaciar un campo, porque un valor vacío se saltea. Así que al
       corregir el dueño se corrige el par entero. */
    if (data.duenoMadera != null) {
      /* El titular pedido sale de `campos`: el bucle lo dejó para acá. */
      const titularPedido = titularAtado ? "" : (campos.titularNombre ?? "").trim();
      const d = revisarDueno({
        dueno: esDuenoMadera(String(data.duenoMadera)) ? (String(data.duenoMadera) as "propia" | "tercero") : null,
        titularNombre: titularPedido || actual.titularNombre || null,
      });
      if (!d.valido && d.normalizado.dueno === "tercero") {
        /* «De tercero» sin nombre: no se guarda a medias. Y se saca su renglón
           de `cambios`, que el bucle ya había escrito: el rastro no puede
           narrar un cambio que no se guardó. */
        rechazados.push({ campo: "duenoMadera", motivo: d.problema ?? "falta el titular" });
        delete data.duenoMadera;
        delete data.titularNombre;
        const renglon = cambios.findIndex((c) => c.startsWith(`${ETIQUETA_CAMPO_CORREGIBLE.duenoMadera} `));
        if (renglon >= 0) cambios.splice(renglon, 1);
      } else {
        /* «Propia» deja el titular en `null` explícito: `normalizado` conserva
           el nombre y guardarlo dejaría «propia» + «CC.NN. San Luis». */
        const titularFinal = titularQueQueda(d.normalizado.dueno, d.normalizado.titularNombre);
        if (titularFinal !== (actual.titularNombre ?? null)) {
          data.titularNombre = titularFinal ?? "";
          cambios.push(
            `${ETIQUETA_CAMPO_CORREGIBLE.titularNombre} ${actual.titularNombre ?? "—"} → ${titularFinal ?? "—"}`,
          );
        }
      }
    }

    if (cambios.length === 0) {
      return { ok: false as const, cambios: [], rechazados };
    }

    await prisma.forestCtpEntry.update({
      where: { id, tenantId },
      /* El único campo que se puede VACIAR por esta vía, y sólo como
         consecuencia de la regla de arriba: `""` se guarda como `null`. */
      data: { ...data, ...(data.titularNombre === "" ? { titularNombre: null } : {}) },
    });
    auditCtp({
      tenantId,
      action: "ctp_linea_update",
      entity: "ForestCtpEntry",
      entityId: id,
      detail:
        `Corrigió la línea N° ${actual.lineNo ?? "?"} · ${cambios.join(" · ")}` +
        (rechazados.length ? ` · sin tocar: ${rechazados.map((r) => `${r.campo} (${r.motivo})`).join(", ")}` : ""),
      user,
    });
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {}
    const aserrio = await ForestCtpDB.dejarDeCobrarSiNoEsDeTercero(
      tenantId,
      id,
      {
        escribioDueno: "duenoMadera" in data,
        duenoMadera: typeof data.duenoMadera === "string" ? data.duenoMadera : actual.duenoMadera,
        duenoParteId: actual.duenoParteId,
      },
      user,
    );
    return {
      ok: true as const,
      cambios,
      rechazados,
      /** Los campos que de verdad se escribieron: decide si hay que recotizar. */
      camposCambiados: Object.keys(data) as CampoCorregible[],
      ...(aserrio ? { aserrio } : {}),
    };
  }



  /**
   * Declara (o deshace) que una corrida es EXISTENCIA DE APERTURA (ADR-394):
   * madera anterior al libro, sin guía ni piezas que atar.
   *
   * Calco de `marcarUsado`: exige motivo al declarar, no al deshacer; no toca
   * ningún número (saldo, libro, cierre y export SERFOR no leen este campo) y
   * el certificado sigue bloqueado para la corrida — la declaración cambia
   * cómo se LEE el hueco, no si existe. Una corrida con materia prima atada no
   * es apertura: tiene origen.
   */
  static async declararApertura(
    tenantId: string,
    id: string,
    input: { apertura: boolean; motivo?: string; user: string },
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const { apertura, motivo, user } = input;
    if (apertura && !motivo?.trim()) {
      throw new CtpInvariantError(
        "Pon por qué esta corrida es existencia de apertura.",
        "MOTIVO_REQUERIDO",
      );
    }
    const e = await prisma.forestCtpEntry.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { _count: { select: { consumos: true } } },
    });
    if (!e) throw new CtpInvariantError("Esa línea no existe.", "LOTE_NO_ENCONTRADO");
    if (e.section !== "produccion") {
      throw new CtpInvariantError(
        "Sólo una corrida de producción puede ser existencia de apertura.",
        "LOTE_NO_EDITABLE",
      );
    }
    if (apertura && e._count.consumos > 0) {
      throw new CtpInvariantError(
        `La corrida N° ${e.lineNo} tiene materia prima atada: tiene origen, no es existencia de apertura.`,
        "LOTE_NO_EDITABLE",
      );
    }
    const actualizada = await prisma.forestCtpEntry.update({
      where: { id, tenantId },
      data: apertura
        ? {
            aperturaDeclaradaAt: new Date(),
            aperturaDeclaradaPor: user,
            aperturaDeclaradaMotivo: motivo!.trim(),
          }
        : { aperturaDeclaradaAt: null, aperturaDeclaradaPor: null, aperturaDeclaradaMotivo: null },
    });
    auditCtp({
      tenantId,
      action: apertura ? "ctp_apertura_declarar" : "ctp_apertura_deshacer",
      entity: "ForestCtpEntry",
      entityId: id,
      detail: apertura
        ? `Declaró la corrida N° ${e.lineNo} como existencia de apertura (madera anterior al libro) · motivo: ${motivo!.trim()}`
        : `Deshizo la declaración de existencia de apertura de la corrida N° ${e.lineNo}`,
      user,
    });
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {}
    return actualizada;
  }

  static async softDelete(tenantId: string, id: string, user = "unknown") {
    if (!tenantId) throw new Error("tenantId is required");
    const curDel = await prisma.forestCtpEntry.findFirst({
      where: { id, tenantId },
      select: { entryDate: true },
    });
    const cerradoDel = curDel
      ? await ForestCtpCierreDB.closedPeriodOf(tenantId, curDel.entryDate)
      : null;
    if (cerradoDel) {
      throw new CtpInvariantError(
        `El período ${cerradoDel.label} está cerrado: no se puede eliminar una línea de un mes cerrado.`,
        "PERIODO_CERRADO",
        { periodKey: cerradoDel.periodKey },
      );
    }
    const e = await prisma.forestCtpEntry.update({
      where: { id, tenantId } satisfies Prisma.ForestCtpEntryWhereUniqueInput,
      data: { deletedAt: new Date() },
    });
    // Igual que al anular: la FK es SET NULL al DELETE real, que acá nunca pasa
    // (es soft-delete), así que las piezas hay que soltarlas a mano.
    await prisma.woodEntryTroza.updateMany({
      where: { tenantId, consumidaEnId: id },
      data: { consumidaEnId: null, fechaConsumo: null },
    });
    /* Y las que salieron SIN ASERRAR (ADR-363): anular el despacho es decir que
       ese camión no salió, así que la madera sigue en el patio. Sin esto la
       pieza quedaba marcada "ya despachada" para siempre. */
    await prisma.woodEntryTroza.updateMany({
      where: { tenantId, despachadaEnId: id },
      data: { despachadaEnId: null, fechaDespacho: null },
    });
    /* Mismo criterio que al anular: el aserrío de una corrida borrada no se debe. */
    try {
      await ForestAserrioDB.alAnular(tenantId, id, user);
    } catch (err) {
      logger.error("[forest-ctp.softDelete] no se pudo dar de baja el cargo de aserrío", {
        error: String(err),
        tenantId,
        entryId: id,
      });
    }
    auditCtp({
      tenantId,
      action: "ctp_linea_delete",
      entity: "ForestCtpEntry",
      entityId: id,
      detail: `Eliminó (soft) la línea #${e.lineNo} de ${e.section} (${e.speciesCommon ?? "sin especie"})`,
      user,
    });
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {}
    return e;
  }

  /**
   * Saldos de planta del CTP, desglosados **por especie** (es lo que se
   * fiscaliza: el balance global puede dar positivo mientras una especie está
   * en negativo).
   *
   *  - materia prima por especie = Σ ingreso validado/procesado (WoodEntry)
   *                                − Σ consumido en producción
   *  - stock de productos (tipo · especie) = Σ producido − Σ despachado
   *
   * La madera `pendiente` de validar NO cuenta como materia prima disponible
   * (criterio alineado con `WoodEntriesDB.aggregateBySpecies`); se reporta
   * aparte en `pendienteM3` para que el número siga siendo visible.
   */
  /**
   * PRODUCTOS DISPONIBLES: lo aserrado que todavía está en la planta (ADR-349).
   *
   * Una corrida de producción con saldo es producto que existe: se puede
   * despachar, reprocesar o mostrar en la pila. El saldo NO se recalcula acá —lo
   * da `saldosDeCorridas`, la única fuente (ADR-316)— y los **paquetes** son su
   * detalle: código, presentación y dimensiones para encontrarlo.
   *
   * Se listan sólo las corridas con `disponible > 0`: un producto agotado no es
   * un producto disponible con cero, es uno que ya no está.
   *
   * ⚠️ **No se filtra por período, y es a propósito.** Lo disponible es una FOTO
   * del depósito, no un movimiento del mes: un paquete aserrado en 2024 que
   * nadie despachó sigue estando hoy en la pila. Con el filtro puesto, un libro
   * abierto en "últimos 3 meses" mostraba 4 de 40 paquetes y el KPI declaraba
   * 8.9 m³ en vez de 34.7 — el dueño veía un depósito casi vacío que en la
   * realidad estaba lleno. El período sigue mandándose para acotar por fecha
   * cuando alguien lo pide EXPLÍCITAMENTE (`soloDelPeriodo`).
   */
  static async productosDisponibles(
    tenantId: string,
    opts: {
      fromDate?: Date;
      toDate?: Date;
      especie?: string;
      producto?: string;
      /** Acotar a lo producido en el período. Por omisión se ve TODO lo que hay. */
      soloDelPeriodo?: boolean;
      /** Traer TAMBIÉN lo marcado como "ya usado" (Brandon, 2026-09-01): por
       *  omisión quedan afuera — es justo lo que pide esa marca —, pero hace
       *  falta poder mirarlas para desmarcar una por error. */
      incluirUsados?: boolean;
      /** «Solo este permiso»: ver `whereCtpDelContrato`. Sin valor = todo el patio. */
      contratoId?: string;
    } = {},
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    /* El criterio de «está en el patio» es compartido con la campana de
       reservas vencidas: ver `whereCorridaEnElPatio`. */
    const where = whereCorridaEnElPatio(tenantId, { incluirUsados: opts.incluirUsados });
    /* En `AND`: el `OR` de `whereCorridaEnElPatio` es el criterio de origen. */
    if (opts.contratoId) where.AND = [whereCtpDelContrato(tenantId, opts.contratoId)];
    if (opts.soloDelPeriodo && (opts.fromDate || opts.toDate)) {
      where.entryDate = {
        ...(opts.fromDate ? { gte: opts.fromDate } : {}),
        ...(opts.toDate ? { lte: opts.toDate } : {}),
      };
    }
    if (opts.especie?.trim())
      where.speciesCommon = { contains: opts.especie.trim(), mode: "insensitive" };
    if (opts.producto?.trim())
      where.productType = { contains: opts.producto.trim(), mode: "insensitive" };

    const corridas = await prisma.forestCtpEntry.findMany({
      where,
      orderBy: [{ entryDate: "desc" }, { lineNo: "desc" }],
      take: 500,
      include: {
        paquetes: {
          where: { deletedAt: null },
          orderBy: { codigo: "asc" },
          /* La reserva VIVA del paquete (ADR-418): es la fila que el operador
             ve en la pila, así que el «apartado para…» tiene que viajar con
             ella o la pantalla ofrecería madera que ya tiene dueño. */
          include: { apartados: { where: { liberadoAt: null } } },
        },
        /* Las reservas vivas colgadas de la CORRIDA. Vienen todas —las de la
           corrida entera y las de sus paquetes—; abajo se toma la que tiene
           `paqueteId: null`, que es la que representa la fila sin paquete. */
        apartados: { where: { liberadoAt: null } },
        /* De qué guía y de qué título habilitante viene la madera de la corrida.
           Es lo que la GTF de salida declara como origen del recurso: sin esto,
           el picker de la guía puede decir "qué producto" pero no "de dónde
           salió", que es justo lo que compara un puesto de control. Se leen
           cuatro columnas del ingreso, no el ingreso entero: las dos del origen
           y las dos con las que se valoriza el patio (ADR-418). */
        consumos: {
          select: {
            volumeM3: true,
            costoUnitarioSnap: true,
            woodEntry: {
              select: {
                gtfNumber: true,
                originCode: true,
                costoTotal: true,
                volumeM3: true,
              },
            },
          },
        },
      },
    });
    if (corridas.length === 0)
      return { corridas: [], totales: { volumen: 0, paquetes: 0, corridas: 0 } };

    const saldos = await saldosDeCorridas(
      prisma,
      tenantId,
      corridas.map((c) => c.id),
    );

    const conSaldo = corridas
      .map((c) => {
        const s = saldos.get(c.id);
        const disponible = s?.disponible ?? 0;
        /* Únicos y en orden de aparición: una corrida mezcla guías (ADR-134) y
           repetir "1-19-0313629" cinco veces no agrega información. Si la
           corrida se cargó a mano, queda el resumen de texto `gtfIngreso`. */
        const gtfOrigen = [
          ...new Set(c.consumos.map((x) => (x.woodEntry?.gtfNumber ?? "").trim()).filter(Boolean)),
        ];
        const heredados = [
          ...new Set(c.consumos.map((x) => (x.woodEntry?.originCode ?? "").trim()).filter(Boolean)),
        ];
        /* El permiso DECLARADO del asiento (ADR-402) sólo se usa cuando no hay
           ninguno heredado: la guía manda cuando existe, o la misma corrida
           mostraría dos orígenes distintos según quién la lea. */
        const propio = (c.originCode ?? "").trim();
        const titularOrigen = heredados.length > 0 ? heredados : propio ? [propio] : [];
        /* La reserva de la FILA SIN PAQUETE (ADR-418). Las reservas de los
           paquetes cuelgan de la misma corrida, así que se distingue por
           `paqueteId: null` — es lo que la pantalla dibuja en la fila madre. */
        const apartadoCorrida = c.apartados.find((a) => a.paqueteId == null) ?? null;
        return {
          id: c.id,
          lineNo: c.lineNo,
          fecha: c.entryDate.toISOString(),
          especie: c.speciesCommon,
          especieCientifica: c.speciesScientific,
          /** La guía de salida marca la especie protegida: es legal CON permiso. */
          cites: c.cites,
          producto: c.productType,
          presentacion: c.presentacion,
          unidad: c.unit,
          lote: c.materiaPrimaRef,
          lineaProduccion: c.lineaProduccion,
          /** GTF de ingreso de la materia prima que alimentó la corrida. */
          gtfOrigen: gtfOrigen.length > 0 ? gtfOrigen : c.gtfIngreso ? [c.gtfIngreso] : [],
          /** Título habilitante / plan de manejo del que salió esa madera. */
          titularOrigen,
          /** El declarado a mano en el asiento, si lo tiene (ADR-402): la
           *  pantalla necesita saber si el valor que muestra es de la guía o
           *  del propio asiento, porque no se corrigen en el mismo lugar. */
          permisoPropio: propio || null,
          rendimientoPct: c.rendimientoPct != null ? Number(c.rendimientoPct) : null,
          /** Materia prima que la corrida declara haber consumido (m³). Es un
           *  campo del asiento —no un derivado—: el editor lo corrige (ADR-401). */
          volumenConsumidoM3: c.volumeInputM3 != null ? Number(c.volumeInputM3) : null,
          /** `quantity` tal como está en el asiento. `producido` es lo mismo
           *  pasado por `saldosDeCorridas`; el editor necesita el campo, no el
           *  derivado —un `null` tiene que llegar como null y no como 0—. */
          cantidad: c.quantity != null ? Number(c.quantity) : null,
          /* Con qué texto arranca la nota de la corrida — "Inventario de
             apertura" es lo que escribe siempre el import (`ctp-serfor-a-libro.ts`):
             alcanza para que la pantalla distinga un paquete importado de uno
             que salió hoy de la sierra, sin columna nueva en el schema. */
          observations: c.observations,
          /** De quién es la madera (ADR-412). Va en la foto del depósito porque
           *  es lo que decide si ese producto se puede vender: lo que se asierra
           *  por encargo no es del centro. `null` = la corrida no lo declaró. */
          duenoMadera: c.duenoMadera,
          titularNombre: c.titularNombre,
          /** A quién se le cobra el aserrío y cuánto quedó cobrado (ADR-412).
           *  `aserrioImporte: null` = no se le cobró (sin dueño o sin precio). */
          duenoParteId: c.duenoParteId ?? null,
          aserrioImporte: c.aserrioImporte != null ? Number(c.aserrioImporte) : null,
          /** El precio a mano pactado, si se cobró así. `null` = con tarifa o sin cobro. */
          aserrioPrecioManualPt: precioManualDelDetalle(c.aserrioDetalle),
          /** Marcado a mano como "ya usado" (Brandon, 2026-09-01): `null` = sigue disponible como siempre. */
          usadoAt: c.usadoAt ? c.usadoAt.toISOString() : null,
          /** Existencia de apertura declarada a mano (ADR-394); lo importado se reconoce por su nota. */
          aperturaDeclaradaAt: c.aperturaDeclaradaAt ? c.aperturaDeclaradaAt.toISOString() : null,
          aperturaDeclaradaPor: c.aperturaDeclaradaPor,
          aperturaDeclaradaMotivo: c.aperturaDeclaradaMotivo,
          usadoMotivo: c.usadoMotivo,
          producido: s?.producido ?? 0,
          despachado: s?.despachado ?? 0,
          reprocesado: s?.reprocesado ?? 0,
          disponible,
          /** Quién tiene reservada la corrida entera (ADR-418). `null` = libre. */
          apartado: apartadoCorrida ? apartadoDto(apartadoCorrida) : null,
          /** Los consumos con lo que hace falta para valorizar la materia prima
           *  (ADR-418). El cálculo lo hace `lib/forestal/valor-del-patio.ts`: acá
           *  sólo viajan los insumos crudos, sin derivar nada.
           *  `costoUnitarioSnap` = el costo congelado al cierre (D6), que MANDA
           *  sobre el vivo; `costoTotalGuia`/`volumenGuiaM3` = la factura de la
           *  guía, de la que sale el costo vivo. `null` = no se sabe, nunca 0. */
          costoConsumos: c.consumos.map((x) => ({
            volumeM3: Number(x.volumeM3),
            costoUnitarioSnap: x.costoUnitarioSnap != null ? Number(x.costoUnitarioSnap) : null,
            costoTotalGuia: x.woodEntry?.costoTotal != null ? Number(x.woodEntry.costoTotal) : null,
            volumenGuiaM3: x.woodEntry?.volumeM3 != null ? Number(x.woodEntry.volumeM3) : null,
            gtfNumber: x.woodEntry?.gtfNumber ?? null,
          })),
          paquetes: c.paquetes.map((p) => ({
            id: p.id,
            codigo: p.codigo,
            producto: p.productType,
            presentacion: p.presentacion,
            cantidad: p.cantidad,
            volumenM3: Number(p.volumenM3),
            espesorCm: p.espesorCm != null ? Number(p.espesorCm) : null,
            anchoCm: p.anchoCm != null ? Number(p.anchoCm) : null,
            largoM: p.largoM != null ? Number(p.largoM) : null,
            /** El PT medido al cubicar (ADR-429). `null` = paquete viejo: el PT sale del m³. */
            pieTablar: p.pieTablar != null ? Number(p.pieTablar) : null,
            /** S/ por PT de la madera propia (ADR-429): lo que se propone al
             *  despachar este paquete. `null` = sin precio, nunca 0. */
            precioVentaPt: p.precioVentaPt != null ? Number(p.precioVentaPt) : null,
            observations: p.observations,
            /** Quién tiene reservado ESTE paquete (ADR-418). `null` = libre. */
            apartado: p.apartados[0] ? apartadoDto(p.apartados[0]) : null,
          })),
        };
      })
      .filter((c) => tieneDisponible(c));

    /**
     * El costo de la materia prima por GUÍA, para las corridas SIN consumos
     * (ADR-418).
     *
     * Por qué existe además de `costoConsumos`: en el libro real de Blas hay
     * **0 filas en ForestCtpConsumo**, así que la vía "oficial" —el costo que
     * viaja con la atribución ingreso→corrida— no devuelve nada y la columna
     * S/ quedaría vacía para siempre. La corrida igual nombra sus guías en
     * `gtfIngreso` (texto del acta), y esa guía sí tiene su factura.
     *
     * Es un costo por GUÍA, no atribuido: quien lo use tiene que decir que es
     * una aproximación por número de guía. Por eso viaja crudo y aparte, y no
     * mezclado con `costoConsumos` — dos cosas distintas no pueden llegar
     * indistinguibles a la pantalla.
     *
     * UNA query para todas las corridas (`gtfNumber: { in: [...] }`, que pega
     * en el índice `(tenantId, gtfNumber)` de WoodEntry), nunca una por corrida.
     */
    const gtfsDelResultado = [...new Set(conSaldo.flatMap((c) => c.gtfOrigen))].filter(Boolean);
    const guias = gtfsDelResultado.length
      ? await prisma.woodEntry.findMany({
          where: { tenantId, gtfNumber: { in: gtfsDelResultado }, deletedAt: null },
          select: { gtfNumber: true, costoTotal: true, volumeM3: true },
        })
      : [];
    /* Una guía es N filas (una por especie/producto): se suman, porque la
       factura del proveedor ampara el camión entero. `costoTotal` null en todas
       ⇒ null, no 0 — un 0 fingiría que la madera salió gratis. */
    const costoDeGuia = new Map<string, { costoTotal: number | null; volumeM3: number | null }>();
    for (const g of guias) {
      const prev = costoDeGuia.get(g.gtfNumber) ?? { costoTotal: null, volumeM3: null };
      costoDeGuia.set(g.gtfNumber, {
        costoTotal:
          g.costoTotal != null ? (prev.costoTotal ?? 0) + Number(g.costoTotal) : prev.costoTotal,
        volumeM3: g.volumeM3 != null ? (prev.volumeM3 ?? 0) + Number(g.volumeM3) : prev.volumeM3,
      });
    }
    const corridasConCosto = conSaldo.map((c) => ({
      ...c,
      /** Costo de las guías que la corrida nombra como origen (ADR-418). Vacío
       *  si ninguna de sus guías está en el libro de ingresos. */
      costoPorGtf: c.gtfOrigen.map((gtf) => ({
        gtfNumber: gtf,
        costoTotal: costoDeGuia.get(gtf)?.costoTotal ?? null,
        volumeM3: costoDeGuia.get(gtf)?.volumeM3 ?? null,
      })),
    }));

    return {
      corridas: corridasConCosto,
      totales: {
        volumen: Math.round(conSaldo.reduce((a, c) => a + c.disponible, 0) * 10000) / 10000,
        paquetes: conSaldo.reduce((a, c) => a + c.paquetes.length, 0),
        corridas: conSaldo.length,
      },
    };
  }

  static async saldos(
    tenantId: string,
    opts: { fromDate?: Date; toDate?: Date; especie?: string } = {},
  ) {
    if (!tenantId) throw new Error("tenantId is required");

    const range = dateRange(opts);
    /**
     * El recorte por especie (ADR-400): el agregado entero —totales, productos,
     * sobreconsumo, piezas— habla de UNA especie.
     *
     * Se aplica en memoria y no en el `where` de cada query a propósito: la
     * especie de una troza puede venir de la pieza o heredarse de su ingreso, y
     * un `where` sobre una sola columna perdería justo las que la heredan. Acá
     * el predicado es el MISMO `speciesKey` con el que se agrupa, así que lo
     * que se filtra y lo que se agrupa no pueden discrepar. Las cuatro listas ya
     * se traen enteras (este agregado no pagina), así que no cuesta una query
     * más.
     */
    const claveEspecie = opts.especie?.trim() ? speciesKey(opts.especie) : null;
    const esDeLaEspecie = (raw: string | null | undefined) =>
      claveEspecie == null || speciesKey(raw ?? "") === claveEspecie;
    const woodWhere: Prisma.WoodEntryWhereInput = {
      tenantId,
      deletedAt: null,
      status: { in: ["validado", "procesado", "pendiente"] },
    };
    const ctpWhere: Prisma.ForestCtpEntryWhereInput = {
      tenantId,
      deletedAt: null,
      status: "registrado",
    };
    if (range) {
      woodWhere.entryDate = range;
      ctpWhere.entryDate = range;
    }

    const [ingresosTodos, ctpTodas, trozasFueraTodas, trozasPatioTodas] = await Promise.all([
      prisma.woodEntry.findMany({
        where: woodWhere,
        select: {
          speciesCommonName: true,
          speciesScientificName: true,
          speciesCites: true,
          volumeM3: true,
          status: true,
        },
      }),
      prisma.forestCtpEntry.findMany({
        where: ctpWhere,
        select: {
          section: true,
          productType: true,
          speciesCommon: true,
          volumeInputM3: true,
          quantity: true,
          unit: true,
          pieces: true,
          /* Cuántas guías respaldan el consumo de esta corrida. Cero NO es un
             error —el libro admite huecos, el certificado no—, pero es dónde
             vive el sobreconsumo: un saldo negativo se explica casi siempre por
             corridas que declararon volumen sin ninguna GTF atribuida. Sin este
             conteo, el aviso sólo puede decir «o falta validar un ingreso, o una
             corrida cargó de más» y manda a buscar a mano. */
          _count: { select: { consumos: true } },
        },
      }),
      /* La madera que salió SIN ASERRAR (ADR-363) también dejó el patio, pero no
         pasó por ninguna corrida: si no se resta acá, el saldo de materia prima
         declara madera que ya se fue en un camión. Se filtra por el DESPACHO
         vivo y por su fecha, no por la del ingreso: es cuando salió. */
      prisma.woodEntryTroza.findMany({
        where: {
          tenantId,
          despachadaEnId: { not: null },
          despachadaEn: {
            deletedAt: null,
            status: "registrado",
            ...(range ? { entryDate: range } : {}),
          },
        },
        select: {
          volumenM3: true,
          especieComun: true,
          entry: { select: { speciesCommonName: true } },
        },
      }),
      /* Piezas del patio, para el conteo de "cantidad de piezas" (pedido de
         Brandon): mismo `estaDisponible()` que usa la pantalla del patio — no
         una cuenta aparte, que es justo el patrón que ya rompió dos veces
         (memoria: "47 vs 30"). Se filtra por la fecha del ingreso, igual que
         el resto de `saldos()`. */
      prisma.woodEntryTroza.findMany({
        where: {
          tenantId,
          entry: {
            deletedAt: null,
            status: { in: ["validado", "procesado", "pendiente"] },
            ...(range ? { entryDate: range } : {}),
          },
        },
        select: {
          id: true,
          especieComun: true,
          volumenM3: true,
          consumidaEnId: true,
          despachadaEnId: true,
          noRecepcionada: true,
          descarte: true,
          entry: { select: { speciesCommonName: true } },
          _count: { select: { retrozos: true } },
        },
      }),
    ]);

    /**
     * Las especies del período, SIN el recorte: son las opciones del filtro, y
     * sacarlas de lo ya filtrado dejaría una sola — no se podría volver atrás
     * desde el propio desplegable.
     */
    const especiesDelPeriodo = [
      ...new Map(
        [
          ...ingresosTodos.map((i) => i.speciesCommonName),
          ...ctpTodas.map((c) => c.speciesCommon),
          ...trozasPatioTodas.map((t) => t.especieComun ?? t.entry.speciesCommonName),
          /* También las que YA salieron en rollo: alimentan `porEspecie` con su
             `despachadoDirectoM3`, así que sin ellas el panel podría mostrar una
             especie que el desplegable no ofrece. */
          ...trozasFueraTodas.map((t) => t.especieComun ?? t.entry.speciesCommonName),
        ]
          .map((raw) => (raw ?? "").trim())
          .filter(Boolean)
          .map((nombre) => [speciesKey(nombre), nombre] as const),
      ).values(),
    ].sort((a, b) => a.localeCompare(b, "es-PE"));

    const ingresos = ingresosTodos.filter((i) => esDeLaEspecie(i.speciesCommonName));
    const ctp = ctpTodas.filter((c) => esDeLaEspecie(c.speciesCommon));
    const trozasFuera = trozasFueraTodas.filter((t) =>
      esDeLaEspecie(t.especieComun ?? t.entry.speciesCommonName),
    );
    const trozasPatio = trozasPatioTodas.filter((t) =>
      esDeLaEspecie(t.especieComun ?? t.entry.speciesCommonName),
    );

    const bySpecies = new Map<string, SpeciesBalance>();
    const bucket = (raw: string | null, scientific?: string | null, cites?: boolean) => {
      const key = speciesKey(raw);
      let b = bySpecies.get(key);
      if (!b) {
        b = {
          especie: raw?.trim() || "Sin especie",
          scientific: scientific?.trim() || null,
          cites: false,
          ingresoM3: 0,
          pendienteM3: 0,
          consumidoM3: 0,
          despachadoDirectoM3: 0,
          saldoM3: 0,
          ingresosCount: 0,
          piezasDisponibles: 0,
        };
        bySpecies.set(key, b);
      }
      // El nombre científico puede venir sólo en una de las dos fuentes.
      if (!b.scientific && scientific?.trim()) b.scientific = scientific.trim();
      if (cites) b.cites = true;
      return b;
    };

    let ingresoM3 = 0;
    let pendienteM3 = 0;
    let ingresosCount = 0;
    for (const e of ingresos) {
      const vol = e.volumeM3 ? Number(e.volumeM3) : 0;
      const b = bucket(e.speciesCommonName, e.speciesScientificName, e.speciesCites);
      if (e.status === "pendiente") {
        b.pendienteM3 += vol;
        pendienteM3 += vol;
        continue;
      }
      b.ingresoM3 += vol;
      b.ingresosCount += 1;
      ingresoM3 += vol;
      ingresosCount += 1;
    }

    let consumidoM3 = 0;
    /* De dónde sale ese consumo. No cambia el total: lo PARTE, para que el aviso
       de saldo negativo pueda decir dónde mirar en vez de enumerar hipótesis. */
    let consumoSinOrigenM3 = 0;
    let consumoSinOrigenCount = 0;
    let consumoSinDeclararM3 = 0;
    let consumoSinDeclararCount = 0;
    // Agrupado por clave normalizada; se guarda la etiqueta de la 1ª aparición.
    const prod: Record<
      string,
      {
        label: string;
        producido: number;
        despachado: number;
        piezasProducido: number;
        piezasDespachado: number;
      }
    > = {};
    for (const e of ctp) {
      const key = productKey(e.productType, e.speciesCommon);
      prod[key] ??= {
        label: productLabel(e.productType, e.speciesCommon),
        producido: 0,
        despachado: 0,
        piezasProducido: 0,
        piezasDespachado: 0,
      };
      if (e.section === "produccion") {
        const consumido = Number(e.volumeInputM3 ?? 0);
        consumidoM3 += consumido;
        bucket(e.speciesCommon).consumidoM3 += consumido;
        if (consumido > 0 && e._count.consumos === 0) {
          consumoSinOrigenM3 += consumido;
          consumoSinOrigenCount += 1;
        }
        /* Corrida abierta (ADR-364): consumió y todavía no declaró qué salió.
           Su madera ya bajó del patio, así que resta del saldo, pero el producto
           que la respalda no existe todavía. Es un estado normal a media
           jornada; deja de serlo cuando se olvida. */
        if (consumido > 0 && e.quantity == null) {
          consumoSinDeclararM3 += consumido;
          consumoSinDeclararCount += 1;
        }
        prod[key].producido += Number(e.quantity ?? 0);
        prod[key].piezasProducido += e.pieces ?? 0;
      }
      if (e.section === "despacho") {
        bucket(e.speciesCommon);
        prod[key].despachado += Number(e.quantity ?? 0);
        prod[key].piezasDespachado += e.pieces ?? 0;
      }
    }

    /* Lo que se fue en rollo, por especie. La especie viaja EN LA TROZA (una
       guía puede mezclar), con el ingreso como respaldo cuando la pieza no la
       declara. */
    let despachadoDirectoM3 = 0;
    for (const t of trozasFuera) {
      const vol = Number(t.volumenM3 ?? 0);
      if (!(vol > 0)) continue;
      bucket(t.especieComun ?? t.entry.speciesCommonName).despachadoDirectoM3 += vol;
      despachadoDirectoM3 += vol;
    }

    for (const t of trozasPatio) {
      const candidata: TrozaConsumible = {
        id: t.id,
        woodEntryId: "",
        codificacion: null,
        especieComun: t.especieComun,
        volumenM3: t.volumenM3 != null ? Number(t.volumenM3) : null,
        consumidaEnId: t.consumidaEnId,
        despachadaEnId: t.despachadaEnId,
        noRecepcionada: t.noRecepcionada,
        descarte: t.descarte,
        retrozos: t._count.retrozos,
      };
      if (!estaDisponible(candidata)) continue;
      bucket(t.especieComun ?? t.entry.speciesCommonName).piezasDisponibles += 1;
    }

    const porEspecie = [...bySpecies.values()]
      .map((b) => ({
        ...b,
        ingresoM3: r4(b.ingresoM3),
        pendienteM3: r4(b.pendienteM3),
        consumidoM3: r4(b.consumidoM3),
        despachadoDirectoM3: r4(b.despachadoDirectoM3),
        saldoM3: r4(b.ingresoM3 - b.consumidoM3 - b.despachadoDirectoM3),
      }))
      // Los sobreconsumos primero: es el hallazgo que hay que ver sin buscar.
      .sort((a, b) => {
        const aNeg = a.saldoM3 < 0 ? 1 : 0;
        const bNeg = b.saldoM3 < 0 ? 1 : 0;
        if (aNeg !== bNeg) return bNeg - aNeg;
        return b.ingresoM3 - a.ingresoM3;
      });

    return {
      materiaPrima: {
        ingresoM3: r4(ingresoM3),
        ingresosCount,
        consumidoM3: r4(consumidoM3),
        despachadoDirectoM3: r4(despachadoDirectoM3),
        saldoM3: r4(ingresoM3 - consumidoM3 - despachadoDirectoM3),
        pendienteM3: r4(pendienteM3),
        especiesEnNegativo: porEspecie.filter((e) => e.saldoM3 < 0).length,
        /** m³ consumidos en corridas SIN ninguna guía atribuida (ADR-134 D3). */
        consumoSinOrigenM3: r4(consumoSinOrigenM3),
        consumoSinOrigenCount,
        /** m³ consumidos en corridas que todavía no declararon qué salió. */
        consumoSinDeclararM3: r4(consumoSinDeclararM3),
        consumoSinDeclararCount,
      },
      porEspecie,
      /** Todas las especies del período, para el desplegable del filtro. */
      especiesDelPeriodo,
      // `label` y no la clave: la clave va normalizada en minúsculas para
      // agrupar, pero lo que se muestra es "Tablones · Tornillo".
      productos: Object.values(prod)
        /* Una corrida abierta —consumió, no declaró— no tiene productType, así
           que caía en la clave "— · TORNILLO" y publicaba una línea de producto
           con producido, despachado y stock en cero. Un producto que nunca
           existió, con nombre de dato roto, en la tabla que se firma. El
           consumo de esa corrida sigue contando en `consumidoM3` y ahora se
           reporta con nombre propio en `consumoSinDeclararM3`. */
        .filter(
          (v) =>
            v.producido !== 0 ||
            v.despachado !== 0 ||
            v.piezasProducido !== 0 ||
            v.piezasDespachado !== 0,
        )
        .map((v) => ({
          producto: v.label,
          producido: r4(v.producido),
          despachado: r4(v.despachado),
          stock: r4(v.producido - v.despachado),
          /* Piezas producidas menos despachadas: mismo criterio que el
             volumen (`stock`), sobre el mismo campo `pieces` que ya guarda
             cada línea del libro — no una cuenta nueva. */
          piezasDisponibles: Math.max(0, v.piezasProducido - v.piezasDespachado),
        })),
    };
  }

  /**
   * Existencia heredada al INICIO del período — el punto de partida de todo
   * rollforward (ADR-139).
   *
   * Sale del cierre inmediatamente anterior (snapshot congelado, que es el dato
   * declarado) o, si no hay cierre previo, del acumulado hasta el instante antes
   * del inicio. Sin `fromDate` no hay apertura: el período abarca todo.
   *
   * Vive acá y no dentro de `conciliacionPeriodo` porque la conciliación y la
   * curva de saldo tienen que arrancar EXACTAMENTE del mismo número: dos
   * aperturas calculadas por separado se desincronizan en cuanto una cambia, y
   * la pantalla mostraría dos gráficos que se contradicen.
   */
  private static async aperturaDePeriodo(
    tenantId: string,
    fromDate?: Date,
    /**
     * El recorte por especie (ADR-400). La apertura tiene que llevar el MISMO
     * recorte que el movimiento: con el movimiento filtrado y la apertura
     * global, la conciliación mostraba una especie ajena con su stock heredado
     * y cero movimiento —«Shihuahuaco 5.20 + 0 − 0 = 5.20» bajo el filtro
     * «Tornillo»— y el total del cuadro que firma el libro salía inflado.
     */
    especie?: string,
  ): Promise<{
    fuenteApertura: ConciliacionPeriodo["fuenteApertura"];
    aperturaLabel: string | null;
    materiaPrima: { especie: string; cites: boolean; existencia: number }[];
    productos: { producto: string; existencia: number }[];
  }> {
    const materiaPrima: { especie: string; cites: boolean; existencia: number }[] = [];
    const productos: { producto: string; existencia: number }[] = [];
    if (!fromDate)
      return { fuenteApertura: "sin_apertura", aperturaLabel: null, materiaPrima, productos };

    const claveEspecie = especie?.trim() ? speciesKey(especie) : null;
    const esDeLaEspecie = (raw: string | null | undefined) =>
      claveEspecie == null || speciesKey(raw ?? "") === claveEspecie;

    const cierres = await ForestCtpCierreDB.list(tenantId);
    const prev = cierres
      .filter((c) => !c.reabierto && new Date(c.to).getTime() < fromDate.getTime())
      .sort((a, b) => new Date(b.to).getTime() - new Date(a.to).getTime())[0];
    if (prev) {
      for (const m of prev.saldoCierre.materiaPrima)
        if (esDeLaEspecie(m.especie))
          materiaPrima.push({ especie: m.especie, cites: m.cites, existencia: m.existenciaM3 });
      for (const p of prev.saldoCierre.productos)
        /* El snapshot guarda el producto sólo como etiqueta («Tablones ·
           Tornillo»), sin la especie aparte: se lee de la cola, que es como la
           escribe `productLabel`. Una etiqueta sin separador no se puede
           atribuir a ninguna especie, así que con el filtro puesto queda fuera
           —contarla sería sumar madera de origen desconocido al cuadro. */
        if (esDeLaEspecie(especieDeProductLabel(p.producto)))
          productos.push({ producto: p.producto, existencia: p.existencia });
      return { fuenteApertura: "cierre", aperturaLabel: prev.label, materiaPrima, productos };
    }

    const acum = await ForestCtpDB.saldos(tenantId, {
      toDate: new Date(fromDate.getTime() - 1),
      especie,
    });
    for (const e of acum.porEspecie)
      materiaPrima.push({ especie: e.especie, cites: e.cites, existencia: e.saldoM3 });
    for (const p of acum.productos) productos.push({ producto: p.producto, existencia: p.stock });
    return { fuenteApertura: "calculada", aperturaLabel: null, materiaPrima, productos };
  }

  /**
   * Conciliación del período (ADR-139 rollforward): existencia de APERTURA + movimientos =
   * existencia FINAL, por especie y por producto. La apertura sale del cierre
   * inmediatamente anterior (snapshot congelado) o, si no hay cierre previo, se
   * calcula acumulada hasta el inicio del período. Cierra el bug de que un saldo
   * mensual ignoraba el stock heredado y no cuadraba ante un fiscalizador.
   */
  static async conciliacionPeriodo(
    tenantId: string,
    opts: { fromDate?: Date; toDate?: Date; especie?: string } = {},
  ): Promise<ConciliacionPeriodo> {
    if (!tenantId) throw new Error("tenantId is required");

    const mov = await ForestCtpDB.saldos(tenantId, opts);

    // ── Apertura ──────────────────────────────────────────────────────────
    const {
      fuenteApertura,
      aperturaLabel,
      materiaPrima: aperturaMP,
      productos: aperturaProd,
    } = await ForestCtpDB.aperturaDePeriodo(tenantId, opts.fromDate, opts.especie);

    // ── Combinar apertura + movimientos → final (materia prima) ───────────
    const mp = new Map<
      string,
      {
        label: string;
        cites: boolean;
        apertura: number;
        ingreso: number;
        consumido: number;
        despachadoDirecto: number;
      }
    >();
    /* `speciesKey` y NO un `trim().toLowerCase()` propio: la apertura puede venir
       de un snapshot de cierre escrito hace meses y el movimiento de la tabla de
       hoy. Con dos normalizaciones distintas, "Ishpíngo" heredado e "Ishpingo"
       del mes caían en filas separadas — la apertura sin movimiento y el consumo
       sin apertura— y la conciliación inventaba una existencia negativa que no
       existe. Es el mismo bug que `speciesKey` documenta arriba, en la misma
       clase; acá había una tercera normalización que se lo saltaba. */
    const mpUpsert = (especie: string, cites: boolean) => {
      const key = speciesKey(especie);
      let x = mp.get(key);
      if (!x) {
        x = { label: especie, cites, apertura: 0, ingreso: 0, consumido: 0, despachadoDirecto: 0 };
        mp.set(key, x);
      }
      if (cites) x.cites = true;
      return x;
    };
    for (const a of aperturaMP) mpUpsert(a.especie, a.cites).apertura = a.existencia;
    for (const e of mov.porEspecie) {
      const x = mpUpsert(e.especie, e.cites);
      x.ingreso = e.ingresoM3;
      x.consumido = e.consumidoM3;
      x.despachadoDirecto = e.despachadoDirectoM3 ?? 0;
    }

    const materiaPrima = [...mp.values()]
      .map((x) => {
        /* La madera vendida en rollo (ADR-363) también dejó el patio. `saldos()`
           la resta desde que existe la figura; la conciliación no, así que la
           existencia final del rollforward declaraba madera que ya se fue en un
           camión — y no coincidía con el KPI de la misma pantalla. */
        const final = r4(x.apertura + x.ingreso - x.consumido - x.despachadoDirecto);
        return {
          especie: x.label,
          cites: x.cites,
          apertura: r4(x.apertura),
          ingreso: r4(x.ingreso),
          consumido: r4(x.consumido),
          despachadoDirecto: r4(x.despachadoDirecto),
          final,
          negativa: final < 0,
        };
      })
      .sort((a, b) => (a.negativa === b.negativa ? b.final - a.final : a.negativa ? -1 : 1));

    // ── Combinar apertura + movimientos → final (productos) ───────────────
    const pr = new Map<
      string,
      { producto: string; apertura: number; producido: number; despachado: number }
    >();
    const prUpsert = (producto: string) => {
      let x = pr.get(producto);
      if (!x) {
        x = { producto, apertura: 0, producido: 0, despachado: 0 };
        pr.set(producto, x);
      }
      return x;
    };
    for (const a of aperturaProd) prUpsert(a.producto).apertura = a.existencia;
    for (const p of mov.productos) {
      const x = prUpsert(p.producto);
      x.producido = p.producido;
      x.despachado = p.despachado;
    }

    const productos = [...pr.values()]
      .map((x) => {
        const final = r4(x.apertura + x.producido - x.despachado);
        return {
          producto: x.producto,
          apertura: r4(x.apertura),
          producido: r4(x.producido),
          despachado: r4(x.despachado),
          final,
          negativo: final < 0,
        };
      })
      .sort((a, b) => b.final - a.final);

    return { fuenteApertura, aperturaLabel, materiaPrima, productos };
  }

  /**
   * Curva del saldo de materia prima a lo largo del período.
   *
   * Los KPIs y la cascada dan una FOTO: cuánto hay hoy y de dónde salió. Lo que
   * no contestaban es la pregunta de planificación —«¿el patio se está llenando
   * o vaciando?»—, que sólo se ve con el saldo dibujado en el tiempo. Un patio
   * que baja 3 m³ por semana y uno que sube 3 muestran el mismo total de hoy.
   *
   * Arranca en la apertura del período (misma fuente que la conciliación) y
   * acumula ingresos validados − consumo de producción, con los mismos filtros
   * que `saldos()`: el último punto DEBE dar `apertura + saldoM3` del período.
   * Si no cuadra, uno de los dos está mal.
   *
   * La granularidad la elige la longitud del período: 90 puntos diarios se leen,
   * 900 son una mancha. Sin snapshots ni tabla nueva — derivado de las fechas.
   */
  static async curvaSaldo(
    tenantId: string,
    opts: { fromDate?: Date; toDate?: Date; especie?: string } = {},
  ): Promise<CurvaSaldo> {
    if (!tenantId) throw new Error("tenantId is required");

    const range = dateRange(opts);
    /**
     * El recorte por especie (ADR-400). La curva va PEGADA al saldo del panel
     * como su trayectoria: si el número dice una especie y la línea dibuja
     * todas, la caída que se ve no es la del número que se está mirando.
     * Alcanza también a la apertura, que es donde arranca la línea.
     */
    const claveEspecie = opts.especie?.trim() ? speciesKey(opts.especie) : null;
    const esDeLaEspecie = (raw: string | null | undefined) =>
      claveEspecie == null || speciesKey(raw ?? "") === claveEspecie;
    // Mismos predicados que `saldos()`: la madera `pendiente` NO es saldo (está
    // en el patio pero no validada), así que tampoco mueve la curva.
    const woodWhere: Prisma.WoodEntryWhereInput = {
      tenantId,
      deletedAt: null,
      status: { in: ["validado", "procesado"] },
    };
    const prodWhere: Prisma.ForestCtpEntryWhereInput = {
      tenantId,
      deletedAt: null,
      status: "registrado",
      section: "produccion",
    };
    if (range) {
      woodWhere.entryDate = range;
      prodWhere.entryDate = range;
    }

    const [ap, ingresosTodos, corridasTodas] = await Promise.all([
      ForestCtpDB.aperturaDePeriodo(tenantId, opts.fromDate, opts.especie),
      prisma.woodEntry.findMany({
        where: woodWhere,
        select: { entryDate: true, volumeM3: true, speciesCommonName: true },
      }),
      prisma.forestCtpEntry.findMany({
        where: prodWhere,
        select: { entryDate: true, volumeInputM3: true, speciesCommon: true },
      }),
    ]);

    const ingresos = ingresosTodos.filter((i) => esDeLaEspecie(i.speciesCommonName));
    const corridas = corridasTodas.filter((c) => esDeLaEspecie(c.speciesCommon));

    /* La apertura ya viene recortada por la misma especie: filtrarla otra vez
       acá sería una segunda regla que puede desincronizarse de aquélla. */
    const apertura = r4(ap.materiaPrima.reduce((a, m) => a + m.existencia, 0));
    const vacia: CurvaSaldo = {
      apertura,
      fuenteApertura: ap.fuenteApertura,
      aperturaLabel: ap.aperturaLabel,
      paso: "dia",
      puntos: [],
      final: apertura,
      pico: null,
      valle: null,
    };

    const marcas = [...ingresos.map((i) => i.entryDate), ...corridas.map((c) => c.entryDate)];
    if (!marcas.length && !opts.fromDate) return vacia;
    const msMin = marcas.length
      ? Math.min(...marcas.map((d) => d.getTime()))
      : Number.POSITIVE_INFINITY;
    const msMax = marcas.length
      ? Math.max(...marcas.map((d) => d.getTime()))
      : Number.NEGATIVE_INFINITY;
    // El eje arranca en el inicio del período aunque los primeros días estén
    // vacíos: si empezara en el primer movimiento, la curva escondería una
    // semana sin ingresos, que es justo lo que hay que ver.
    const desde = opts.fromDate ?? new Date(msMin);
    // El eje no dibuja el futuro: un patio no tiene existencia mañana. Sin este
    // recorte, "mes actual" mostraba 27 días de línea plana y el trimestre
    // cerraba en un 1-de-septiembre vacío (el `to` local en UTC cae al día
    // siguiente). Si hay un movimiento cargado con fecha futura sí se dibuja
    // —está en el libro—, pero no se inventa una meseta hasta fin de mes.
    const finPeriodo = opts.toDate?.getTime() ?? (marcas.length ? msMax : Date.now());
    const tope = Math.min(finPeriodo, Date.now());
    const hasta = new Date(marcas.length ? Math.max(tope, msMax) : tope);
    if (hasta.getTime() < desde.getTime()) return vacia;

    const span = Math.floor((hasta.getTime() - desde.getTime()) / 86_400_000) + 1;
    const paso: CurvaSaldo["paso"] = span <= 120 ? "dia" : span <= 730 ? "semana" : "mes";
    const inicioDe = (d: Date): Date => {
      const u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      if (paso === "mes") return new Date(Date.UTC(u.getUTCFullYear(), u.getUTCMonth(), 1));
      if (paso === "semana") {
        u.setUTCDate(u.getUTCDate() - ((u.getUTCDay() + 6) % 7));
        return u;
      } // lunes
      return u;
    };
    const avanzar = (d: Date): Date => {
      const n = new Date(d.getTime());
      if (paso === "mes") n.setUTCMonth(n.getUTCMonth() + 1);
      else n.setUTCDate(n.getUTCDate() + (paso === "semana" ? 7 : 1));
      return n;
    };
    const clave = (d: Date) => inicioDe(d).toISOString().slice(0, 10);

    const cubos = new Map<string, { ingreso: number; consumo: number }>();
    const orden: string[] = [];
    // Tope duro: con "mes" un período de 30 años da 360 puntos. Más que eso es
    // data corrupta, no un libro — se corta en vez de colgar la pantalla.
    for (
      let c = inicioDe(desde), fin = inicioDe(hasta);
      c.getTime() <= fin.getTime() && orden.length < 400;
      c = avanzar(c)
    ) {
      const k = c.toISOString().slice(0, 10);
      cubos.set(k, { ingreso: 0, consumo: 0 });
      orden.push(k);
    }
    if (!orden.length) return vacia;

    // Un movimiento fuera de la ventana dibujada (o pasado el tope) se imputa al
    // extremo más cercano: descartarlo dejaría la curva sin cerrar en el saldo real.
    const dentro = (k: string) =>
      cubos.has(k) ? k : k < orden[0] ? orden[0] : orden[orden.length - 1];
    for (const i of ingresos)
      cubos.get(dentro(clave(i.entryDate)))!.ingreso += Number(i.volumeM3 ?? 0);
    for (const c of corridas)
      cubos.get(dentro(clave(c.entryDate)))!.consumo += Number(c.volumeInputM3 ?? 0);

    let saldo = apertura;
    const puntos = orden.map((fecha) => {
      const b = cubos.get(fecha)!;
      saldo = r4(saldo + b.ingreso - b.consumo);
      return { fecha, ingreso: r4(b.ingreso), consumo: r4(b.consumo), saldo };
    });

    const pico = puntos.reduce(
      (m, p) => (m == null || p.saldo > m.saldo ? p : m),
      null as (typeof puntos)[number] | null,
    );
    const valle = puntos.reduce(
      (m, p) => (m == null || p.saldo < m.saldo ? p : m),
      null as (typeof puntos)[number] | null,
    );
    return {
      apertura,
      fuenteApertura: ap.fuenteApertura,
      aperturaLabel: ap.aperturaLabel,
      paso,
      puntos,
      final: saldo,
      pico: pico ? { fecha: pico.fecha, saldo: pico.saldo } : null,
      valle: valle ? { fecha: valle.fecha, saldo: valle.saldo } : null,
    };
  }

  /**
   * Ítems seleccionables (data-driven):
   *  - produccion → ingresos de materia prima (WoodEntry) con saldo sin consumir
   *  - despacho   → productos producidos con stock > 0 (producido − despachado)
   *
   * ADR-134: devuelve `id` y `disponible`.
   *  · `id` — antes se omitía del `select`, así que el picker de guías no tenía
   *    qué guardar y la línea quedaba atada por TEXTO. Sin `id` no hay puente N:M.
   *  · `disponible` = volumeM3 − Σ consumos de otras líneas. Es el número que
   *    la invariante I2 va a exigir igual: mejor mostrarlo que hacer fallar el
   *    guardado después de que el operador cargó todo.
   *
   * Sólo ofrece ingresos `validado`/`procesado`: `saldos()` no cuenta la madera
   * `pendiente` como materia prima disponible, así que producir desde un ingreso
   * sin validar dejaría el saldo de esa especie en negativo — una alarma falsa
   * fabricada por el picker. Validar primero, producir después.
   *
   * @param excludeCtpEntryId al EDITAR una línea, lo que esa línea ya consume no
   *        cuenta contra el disponible (si no, sus propios ingresos aparecerían
   *        agotados). Mismo criterio que usa I2 en `setConsumos`.
   */
  static async availableSource(
    tenantId: string,
    section: CtpSection,
    opts: { excludeCtpEntryId?: string } = {},
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    if (section === "produccion") {
      const ing = await prisma.woodEntry.findMany({
        where: { tenantId, deletedAt: null, status: { in: ["validado", "procesado"] } },
        orderBy: { entryDate: "desc" },
        take: 300,
        select: {
          id: true,
          gtfNumber: true,
          entryDate: true,
          speciesCommonName: true,
          speciesScientificName: true,
          speciesCites: true,
          volumeM3: true,
          costoTotal: true,
          moneda: true,
        },
      });
      if (ing.length === 0) return [];

      const consumido = await prisma.forestCtpConsumo.groupBy({
        by: ["woodEntryId"],
        where: {
          tenantId,
          woodEntryId: { in: ing.map((w) => w.id) },
          ...(opts.excludeCtpEntryId ? { ctpEntryId: { not: opts.excludeCtpEntryId } } : {}),
          ...CONSUMO_VIGENTE, // mismo criterio que I2 y que saldos(): sin líneas muertas
        },
        _sum: { volumeM3: true },
      });
      const usado = new Map(consumido.map((c) => [c.woodEntryId, Number(c._sum.volumeM3 ?? 0)]));

      return (
        ing
          .map((w) => {
            const total = w.volumeM3 ? Number(w.volumeM3) : 0;
            const disponible = r4(total - (usado.get(w.id) ?? 0));
            return {
              kind: "ingreso" as const,
              id: w.id,
              code: w.gtfNumber,
              entryDate: w.entryDate,
              species: w.speciesCommonName,
              scientific: w.speciesScientificName,
              cites: w.speciesCites,
              vol: total,
              disponible,
              /** S/ por m³ — null si la factura todavía no llegó (ADR-134 D6). */
              costoUnitario:
                w.costoTotal != null && total > 0
                  ? Math.round((Number(w.costoTotal) / total) * 100) / 100
                  : null,
              moneda: w.moneda ?? "PEN",
            };
          })
          // Ya consumido del todo = no es "available".
          .filter((w) => w.disponible > 0)
      );
    }
    if (section === "despacho") {
      // ADR-135: devuelve CORRIDAS, no productos agregados.
      //
      // Antes agregaba por `productKey` y no devolvía ids — el mismo bug que
      // ADR-134 arregló del lado de producción: sin el id de la corrida no hay
      // puente que construir, y el despacho no puede decir de DÓNDE salió.
      // Elegir corridas (y no "un producto en stock") es además lo que espeja a
      // producción, que elige guías y no "una especie disponible".
      const corridas = await prisma.forestCtpEntry.findMany({
        where: { tenantId, deletedAt: null, status: "registrado", section: "produccion" },
        orderBy: { entryDate: "desc" },
        take: 300,
        select: {
          id: true,
          lineNo: true,
          entryDate: true,
          productType: true,
          speciesCommon: true,
          speciesScientific: true,
          cites: true,
          quantity: true,
          unit: true,
        },
      });
      if (corridas.length === 0) return [];

      const salido = await prisma.forestCtpDespachoOrigen.groupBy({
        by: ["produccionEntryId"],
        where: {
          tenantId,
          produccionEntryId: { in: corridas.map((c) => c.id) },
          ...(opts.excludeCtpEntryId ? { despachoEntryId: { not: opts.excludeCtpEntryId } } : {}),
          ...ORIGEN_VIGENTE, // un despacho anulado no sigue reservando la corrida
        },
        _sum: { quantity: true },
      });
      const usado = new Map(salido.map((s) => [s.produccionEntryId, Number(s._sum.quantity ?? 0)]));

      return corridas
        .map((c) => {
          const producido = c.quantity ? Number(c.quantity) : 0;
          return {
            kind: "corrida" as const,
            id: c.id,
            /** Lo que se muestra como identificador de la corrida. */
            code: `Corrida #${c.lineNo}`,
            lineNo: c.lineNo,
            entryDate: c.entryDate,
            productType: c.productType,
            species: c.speciesCommon,
            scientific: c.speciesScientific,
            cites: c.cites,
            unit: c.unit,
            producido,
            /** Lo que I5 va a exigir igual: mejor mostrarlo que fallar al guardar. */
            disponible: r4(producido - (usado.get(c.id) ?? 0)),
          };
        })
        .filter((c) => c.disponible > 0);
    }
    return [];
  }

  /**
   * Cuántas corridas del período quedaron SIN ORIGEN, y cuánto produjeron.
   *
   * Por qué existe (radar 2026-09-15): el pendiente «corridas sin origen» del
   * libro estaba **hardcodeado en 0** (`hooks/use-ctp-pendientes.ts`) porque
   * calcularlo pedía bajar el grafo entero al cliente. Resultado: el único
   * pendiente que BLOQUEA el cierre no se disparó nunca, con corridas que
   * declaran volumen de entrada y no tienen un solo consumo atribuido.
   *
   * La regla es la misma de Consumos y del detalle del día —`corridaSinOrigen`,
   * un solo lugar— para no repetir el error de 2026-09-14, cuando dos reglas
   * distintas decían 14 y 9 sobre las mismas corridas. El volumen de entrada
   * escrito en el asiento NO da origen: es un número, no una atribución.
   *
   * Cuenta en el servidor y devuelve dos cifras (regla #6: totales en backend).
   */
  static async contarCorridasSinOrigen(
    tenantId: string,
    opts: { fromDate?: Date; toDate?: Date } = {},
  ): Promise<{ corridas: number; producidoM3: number; detalle: CorridaSinOrigen[] }> {
    if (!tenantId) throw new Error("tenantId is required");
    const range = dateRange(opts);
    const where: Prisma.ForestCtpEntryWhereInput = {
      tenantId,
      deletedAt: null,
      status: "registrado",
      section: "produccion",
    };
    if (range) where.entryDate = range;

    const filas = await prisma.forestCtpEntry.findMany({
      where,
      /* Sólo los dos contadores de puente y la cifra producida: no hace falta
         traer la corrida entera para saber si algo le llega. */
      select: {
        id: true,
        lineNo: true,
        entryDate: true,
        quantity: true,
        unit: true,
        /* Lo que el asiento DECLARA que entró: es la cifra que el pendiente
           pone primero, porque el propio libro la afirma sin respaldo. */
        volumeInputM3: true,
        _count: { select: { consumos: true, reprocesosEntrada: true } },
      },
      /* Mismo tope que la tira de días: una red, no una página. */
      take: 2000,
    });

    /* La cuenta vive en `agregarSinOrigen` (pura y probada): acá sólo se
       traducen los contadores de puente de cada asiento. */
    return agregarSinOrigen(
      filas.map((f) => ({
        /* `quantity` y `volumeInputM3` son Decimal de Prisma: se cruzan a
           number acá, en la frontera, como el resto del libro — no dentro de la
           función pura. La fecha es date-only: se corta el ISO, sin zona. */
        quantity: f.quantity == null ? null : Number(f.quantity),
        unit: f.unit,
        consumos: f._count.consumos,
        reprocesos: f._count.reprocesosEntrada,
        id: f.id,
        lineNo: f.lineNo,
        entryDate: f.entryDate ? f.entryDate.toISOString().slice(0, 10) : null,
        volumeInputM3: f.volumeInputM3 == null ? null : Number(f.volumeInputM3),
      })),
    );
  }

  /**
   * Grafo de la cadena de custodia del período: 3 capas (ingresos → corridas →
   * despachos) con sus enlaces (consumos / orígenes). Es la versión visual de
   * las mismas tablas puente que enforcean I1–I5; el Radar de trazabilidad lo
   * dibuja. Read-only. Los edges se filtran a endpoints VIVOS (soft-delete no
   * cascada) para no dibujar líneas colgando de un nodo que ya no está.
   */
  static async grafoTrazabilidad(
    tenantId: string,
    opts: { fromDate?: Date; toDate?: Date } = {},
  ): Promise<TrazaGrafo> {
    if (!tenantId) throw new Error("tenantId is required");
    const range = dateRange(opts);
    const woodWhere: Prisma.WoodEntryWhereInput = {
      tenantId,
      deletedAt: null,
      status: { in: ["validado", "procesado", "pendiente"] },
    };
    const ctpWhere: Prisma.ForestCtpEntryWhereInput = {
      tenantId,
      deletedAt: null,
      status: "registrado",
    };
    if (range) {
      woodWhere.entryDate = range;
      ctpWhere.entryDate = range;
    }

    const [ing, ctp] = await Promise.all([
      prisma.woodEntry.findMany({
        where: woodWhere,
        /* Los casilleros que la Sección 2 pinta por ingreso viajan ACÁ (ADR-347).
           Antes la vista pedía `wood-entries?limit=5000` sólo para completarlos:
           traía el ingreso entero —notas, fotos, GTF de SERFOR— de miles de
           filas para leerle seis campos. */
        select: {
          id: true,
          gtfNumber: true,
          speciesCommonName: true,
          volumeM3: true,
          speciesCites: true,
          entryDate: true,
          productType: true,
          speciesScientificName: true,
          originCode: true,
          ctpProductCode: true,
          originSourceNumber: true,
          unit: true,
          // `originType` es lo que distingue una concesión de un permiso: el
          // radar lo necesita para etiquetar la columna del título habilitante,
          // que es el eslabón que va ANTES de la GTF (EUDR pide llegar al monte).
          originType: true,
        },
        orderBy: { entryDate: "asc" },
        take: 300,
      }),
      prisma.forestCtpEntry.findMany({
        where: ctpWhere,
        select: {
          id: true,
          section: true,
          lineNo: true,
          productType: true,
          speciesCommon: true,
          quantity: true,
          unit: true,
          destino: true,
          gtfNumber: true,
          cites: true,
          entryDate: true,
          observations: true,
        },
        orderBy: { lineNo: "asc" },
        take: 300,
      }),
    ]);
    const corridas = ctp.filter((e) => e.section === "produccion");
    const despachos = ctp.filter((e) => e.section === "despacho");
    const ingIds = new Set(ing.map((w) => w.id));
    const corridaIds = corridas.map((c) => c.id);
    const despachoIds = despachos.map((d) => d.id);

    const [consumos, origenes, reprocesos] = await Promise.all([
      corridaIds.length
        ? prisma.forestCtpConsumo.findMany({
            where: { tenantId, ctpEntryId: { in: corridaIds } },
            select: { woodEntryId: true, ctpEntryId: true, volumeM3: true },
          })
        : Promise.resolve([]),
      despachoIds.length
        ? prisma.forestCtpDespachoOrigen.findMany({
            where: { tenantId, despachoEntryId: { in: despachoIds } },
            select: { produccionEntryId: true, despachoEntryId: true, quantity: true },
          })
        : Promise.resolve([]),
      /* La tercera arista de la cadena: corrida → corrida por reproceso
         (ADR-316). Faltaba, y sin ella una corrida nacida de un reproceso no
         tiene ninguna arista que llegue: `corridasSinOrigen` (Consumos, Radar)
         la contaba como huérfana —«producto que apareció de la nada»— cuando su
         madera vino de otra corrida del mismo libro, con su propio origen atado
         a GTF. Medido sobre la L95053. */
      corridaIds.length
        ? prisma.forestCtpReproceso.findMany({
            where: { tenantId, destinoEntryId: { in: corridaIds } },
            select: { origenEntryId: true, destinoEntryId: true, quantity: true },
          })
        : Promise.resolve([]),
    ]);
    const corridaIdSet = new Set(corridaIds);

    return {
      ingresos: ing.map((w) => ({
        id: w.id,
        gtf: w.gtfNumber,
        species: w.speciesCommonName,
        volumeM3: Number(w.volumeM3 ?? 0),
        cites: w.speciesCites,
        fecha: w.entryDate.toISOString(),
        productType: w.productType,
        speciesScientificName: w.speciesScientificName,
        originCode: w.originCode,
        ctpProductCode: w.ctpProductCode,
        originSourceNumber: w.originSourceNumber,
        unit: w.unit,
        originType: w.originType,
      })),
      corridas: corridas.map((c) => ({
        id: c.id,
        lineNo: c.lineNo,
        label: `${c.productType ?? "—"} · ${c.speciesCommon ?? "—"}`,
        quantity: Number(c.quantity ?? 0),
        unit: c.unit,
        cites: c.cites,
        productType: c.productType,
        species: c.speciesCommon,
        fecha: c.entryDate.toISOString(),
        observations: c.observations,
      })),
      despachos: despachos.map((d) => ({
        id: d.id,
        lineNo: d.lineNo,
        label: `${d.productType ?? "—"} · ${d.speciesCommon ?? "—"}`,
        quantity: Number(d.quantity ?? 0),
        unit: d.unit,
        destino: d.destino,
        gtf: d.gtfNumber,
        fecha: d.entryDate.toISOString(),
      })),
      // Edge sólo si ambos extremos siguen en el grafo (endpoint vivo).
      consumos: consumos
        .filter((c) => ingIds.has(c.woodEntryId) && corridaIdSet.has(c.ctpEntryId))
        .map((c) => ({ from: c.woodEntryId, to: c.ctpEntryId, volumeM3: Number(c.volumeM3 ?? 0) })),
      origenes: origenes
        .filter((o) => corridaIdSet.has(o.produccionEntryId))
        .map((o) => ({
          from: o.produccionEntryId,
          to: o.despachoEntryId,
          quantity: Number(o.quantity ?? 0),
        })),
      // Misma regla que las otras aristas: sólo si ambos extremos siguen vivos.
      reprocesos: reprocesos
        .filter((r) => corridaIdSet.has(r.origenEntryId) && corridaIdSet.has(r.destinoEntryId))
        .map((r) => ({
          from: r.origenEntryId,
          to: r.destinoEntryId,
          quantity: Number(r.quantity ?? 0),
        })),
    };
  }

  /**
   * Kardex (cuenta corriente) de la materia prima de UNA especie: cada
   * movimiento cronológico con su saldo corriente. Es el detalle que forma el
   * saldo neto que muestra Saldos — un fiscalizador lo reconstruye a mano; acá
   * sale derecho. El saldo final coincide EXACTO con `saldos().porEspecie.saldoM3`
   * (mismos criterios: ingresos validado/procesado en +, volumeInputM3 de las
   * corridas de esa especie en −, misma `speciesKey` normalizada).
   */
  static async kardexEspecie(
    tenantId: string,
    especie: string,
    opts: { fromDate?: Date; toDate?: Date } = {},
  ): Promise<KardexEspecie> {
    if (!tenantId) throw new Error("tenantId is required");
    const target = speciesKey(especie);
    const range = dateRange(opts);
    const woodWhere: Prisma.WoodEntryWhereInput = {
      tenantId,
      deletedAt: null,
      status: { in: ["validado", "procesado"] },
    };
    const prodWhere: Prisma.ForestCtpEntryWhereInput = {
      tenantId,
      deletedAt: null,
      status: "registrado",
      section: "produccion",
    };
    if (range) {
      woodWhere.entryDate = range;
      prodWhere.entryDate = range;
    }

    const [ingresos, corridas] = await Promise.all([
      prisma.woodEntry.findMany({
        where: woodWhere,
        select: { entryDate: true, gtfNumber: true, speciesCommonName: true, volumeM3: true },
      }),
      prisma.forestCtpEntry.findMany({
        where: prodWhere,
        select: {
          entryDate: true,
          lineNo: true,
          productType: true,
          speciesCommon: true,
          volumeInputM3: true,
        },
      }),
    ]);

    const movs = [
      ...ingresos
        .filter((i) => speciesKey(i.speciesCommonName) === target)
        .map((i) => ({
          fecha: i.entryDate,
          tipo: "ingreso" as const,
          doc: `GTF ${i.gtfNumber}`,
          entra: Number(i.volumeM3 ?? 0),
          sale: 0,
        })),
      ...corridas
        .filter((c) => speciesKey(c.speciesCommon) === target && c.volumeInputM3 != null)
        .map((c) => ({
          fecha: c.entryDate,
          tipo: "consumo" as const,
          doc: `Corrida #${c.lineNo}${c.productType ? ` · ${c.productType}` : ""}`,
          entra: 0,
          sale: Number(c.volumeInputM3 ?? 0),
        })),
    ].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

    let saldo = 0;
    let ingresoTotal = 0;
    let consumoTotal = 0;
    const movimientos = movs.map((m) => {
      saldo = r4(saldo + m.entra - m.sale);
      ingresoTotal += m.entra;
      consumoTotal += m.sale;
      return {
        fecha: m.fecha,
        tipo: m.tipo,
        doc: m.doc,
        entra: r4(m.entra),
        sale: r4(m.sale),
        saldo,
      };
    });
    return {
      especie,
      movimientos,
      ingresoTotal: r4(ingresoTotal),
      consumoTotal: r4(consumoTotal),
      saldo: r4(ingresoTotal - consumoTotal),
    };
  }

  /**
   * Reorden predictivo: por especie, cuántos DÍAS de materia prima quedan al
   * ritmo de consumo reciente. saldo actual (all-time) ÷ (consumo últimos 90
   * días / 90). null si la especie no se consume (no se agota) — no se inventa
   * una urgencia donde no la hay.
   */
  static async proyeccionReorden(tenantId: string): Promise<ReordenProyeccion[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const desde = new Date(Date.now() - 90 * 86_400_000);
    const [ingresos, corridas] = await Promise.all([
      prisma.woodEntry.findMany({
        where: { tenantId, deletedAt: null, status: { in: ["validado", "procesado"] } },
        select: {
          speciesCommonName: true,
          speciesScientificName: true,
          speciesCites: true,
          volumeM3: true,
        },
      }),
      prisma.forestCtpEntry.findMany({
        where: { tenantId, deletedAt: null, status: "registrado", section: "produccion" },
        select: { speciesCommon: true, volumeInputM3: true, entryDate: true },
      }),
    ]);
    const map = new Map<
      string,
      {
        especie: string;
        scientific: string | null;
        cites: boolean;
        ingreso: number;
        consumo: number;
        consumo90: number;
      }
    >();
    const get = (raw: string | null, sci?: string | null, cites?: boolean) => {
      const k = speciesKey(raw);
      let m = map.get(k);
      if (!m) {
        m = {
          especie: raw?.trim() || "Sin especie",
          scientific: sci?.trim() || null,
          cites: false,
          ingreso: 0,
          consumo: 0,
          consumo90: 0,
        };
        map.set(k, m);
      }
      if (sci && !m.scientific) m.scientific = sci.trim();
      if (cites) m.cites = true;
      return m;
    };
    for (const i of ingresos)
      get(i.speciesCommonName, i.speciesScientificName, i.speciesCites).ingreso += Number(
        i.volumeM3 ?? 0,
      );
    for (const c of corridas) {
      const m = get(c.speciesCommon);
      const v = Number(c.volumeInputM3 ?? 0);
      m.consumo += v;
      if (c.entryDate >= desde) m.consumo90 += v;
    }
    return [...map.values()]
      .map((m) => {
        const saldo = r4(m.ingreso - m.consumo);
        const ratePorDia = m.consumo90 / 90;
        const diasHastaAgotar = ratePorDia > 0 && saldo > 0 ? Math.round(saldo / ratePorDia) : null;
        return {
          especie: m.especie,
          scientific: m.scientific,
          cites: m.cites,
          saldo,
          consumo90: r4(m.consumo90),
          ratePorDia: r4(ratePorDia),
          diasHastaAgotar,
        };
      })
      .filter((r) => r.saldo > 0 || r.consumo90 > 0)
      .sort(
        (a, b) =>
          (a.diasHastaAgotar ?? Number.POSITIVE_INFINITY) -
          (b.diasHastaAgotar ?? Number.POSITIVE_INFINITY),
      );
  }

  /**
   * Tendencias mensuales (últimos `meses`): volumen ingresado, producido,
   * consumido y rendimiento ponderado por mes. Derivado de las fechas de los
   * registros existentes — sin snapshots ni tabla nueva. Meses sin datos van
   * en 0 para que la serie no tenga huecos.
   */
  /**
   * TODO lo que se movió en el libro, por cubo de tiempo (tablero de Control).
   *
   * Las cuatro secciones del LO-CTP en una sola serie: lo que entró, lo que se
   * gastó en la sierra, lo que salió de producto y lo que se despachó. Hasta
   * acá cada una vivía en su pestaña y nadie podía ver si la planta traga más
   * de lo que saca.
   *
   * Mismos predicados que `saldos()` y `curvaSaldo()` —la madera `pendiente` no
   * es saldo, la corrida anulada no produjo— para que el tablero no discuta con
   * el balance de la pestaña de al lado.
   *
   * El reparto en cubos es puro y vive en `movimiento-libro.ts`: lo comparte con
   * la curva de saldo, así las dos series de la misma pantalla empiezan la
   * semana el mismo lunes.
   */
  static async movimientoDelLibro(
    tenantId: string,
    opts: { fromDate?: Date; toDate?: Date; hoy?: Date; especie?: string } = {},
  ): Promise<MovimientoDelLibro> {
    if (!tenantId) throw new Error("tenantId is required");
    const range = dateRange(opts);
    /**
     * El recorte por especie (ADR-400), en memoria y con el MISMO `speciesKey`
     * que agrupa el resto del libro. Alcanza a las tres series Y a la apertura:
     * si la apertura quedara global, «días de materia prima» proyectaría el
     * consumo de una especie sobre el stock de todas.
     */
    const claveEspecie = opts.especie?.trim() ? speciesKey(opts.especie) : null;
    const esDeLaEspecie = (raw: string | null | undefined) =>
      claveEspecie == null || speciesKey(raw ?? "") === claveEspecie;

    const woodWhere: Prisma.WoodEntryWhereInput = {
      tenantId,
      deletedAt: null,
      status: { in: ["validado", "procesado"] },
      ...(range ? { entryDate: range } : {}),
    };
    const linea = (section: "produccion" | "despacho"): Prisma.ForestCtpEntryWhereInput => ({
      tenantId,
      deletedAt: null,
      status: "registrado",
      section,
      ...(range ? { entryDate: range } : {}),
    });

    const [apertura, ingresosTodos, corridasTodas, despachosTodos] = await Promise.all([
      /* Lo que YA había en el patio: sin esto, «días de materia prima» se
         proyectaría sobre la variación del período y no sobre el stock. Lleva
         el mismo recorte por especie, o el stock de todas quedaría respaldando
         el consumo de una. */
      ForestCtpDB.aperturaDePeriodo(tenantId, opts.fromDate, opts.especie),
      prisma.woodEntry.findMany({
        where: woodWhere,
        select: { entryDate: true, volumeM3: true, speciesCommonName: true, pieces: true },
      }),
      prisma.forestCtpEntry.findMany({
        where: linea("produccion"),
        select: {
          entryDate: true,
          volumeInputM3: true,
          quantity: true,
          unit: true,
          speciesCommon: true,
        },
      }),
      prisma.forestCtpEntry.findMany({
        where: linea("despacho"),
        select: { entryDate: true, quantity: true, speciesCommon: true },
      }),
    ]);

    /** Las especies del período SIN recorte: son las opciones del filtro. */
    const especiesDelPeriodo = [
      ...new Map(
        [
          ...ingresosTodos.map((i) => i.speciesCommonName),
          ...corridasTodas.map((c) => c.speciesCommon),
          ...despachosTodos.map((d) => d.speciesCommon),
        ]
          .map((raw) => (raw ?? "").trim())
          .filter(Boolean)
          .map((nombre) => [speciesKey(nombre), nombre] as const),
      ).values(),
    ].sort((a, b) => a.localeCompare(b, "es-PE"));

    const ingresos = ingresosTodos.filter((i) => esDeLaEspecie(i.speciesCommonName));
    const corridas = corridasTodas.filter((c) => esDeLaEspecie(c.speciesCommon));
    const despachos = despachosTodos.filter((d) => esDeLaEspecie(d.speciesCommon));

    /* El eje arranca en el inicio del período aunque los primeros días estén
       vacíos, y NO dibuja el futuro: un patio no tiene movimiento mañana. Sin
       período, se abre desde el primer movimiento del libro. */
    const hoy = opts.hoy ?? new Date();
    const marcas = [
      ...ingresos.map((i) => i.entryDate.getTime()),
      ...corridas.map((c) => c.entryDate.getTime()),
      ...despachos.map((d) => d.entryDate.getTime()),
    ];
    const desde = opts.fromDate ?? (marcas.length ? new Date(Math.min(...marcas)) : hoy);
    const topeSuperior = Math.min(opts.toDate?.getTime() ?? hoy.getTime(), hoy.getTime());
    const hasta = new Date(
      marcas.length ? Math.max(topeSuperior, Math.max(...marcas)) : topeSuperior,
    );

    return agruparMovimiento({
      ingresos: ingresos.map((i) => ({
        fecha: i.entryDate,
        volumenM3: Number(i.volumeM3 ?? 0),
        especie: i.speciesCommonName,
        piezas: i.pieces,
      })),
      corridas: corridas.map((c) => ({
        fecha: c.entryDate,
        consumidoM3: Number(c.volumeInputM3 ?? 0),
        producido: Number(c.quantity ?? 0),
        unidad: c.unit,
        especie: c.speciesCommon,
      })),
      despachos: despachos.map((d) => ({
        fecha: d.entryDate,
        cantidad: Number(d.quantity ?? 0),
        especie: d.speciesCommon,
      })),
      desde: desde <= hasta ? desde : hasta,
      hasta,
      aperturaM3: apertura.materiaPrima.reduce((a, m) => a + m.existencia, 0),
      /* Este endpoint alimenta BARRAS: el trimestre en días daba 67 barras
         apretadas y casi todas en cero. */
      paso: pasoParaBarras(
        Math.max(
          1,
          Math.floor((hasta.getTime() - Math.min(desde.getTime(), hasta.getTime())) / 86_400_000) +
            1,
        ),
      ),
      especiesDelPeriodo,
    });
  }

  static async tendenciasMensuales(tenantId: string, meses = 6): Promise<TendenciaMes[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const n = Math.min(Math.max(meses, 1), 24);
    const now = new Date();
    const startMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1), 1));
    const keyOf = (d: Date) => d.toISOString().slice(0, 7);
    const [ingresos, corridas, despachos] = await Promise.all([
      prisma.woodEntry.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: ["validado", "procesado"] },
          entryDate: { gte: startMonth },
        },
        select: { entryDate: true, volumeM3: true },
      }),
      prisma.forestCtpEntry.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: "registrado",
          section: "produccion",
          entryDate: { gte: startMonth },
        },
        select: { entryDate: true, quantity: true, volumeInputM3: true, rendimientoPct: true },
      }),
      prisma.forestCtpEntry.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: "registrado",
          section: "despacho",
          entryDate: { gte: startMonth },
        },
        select: { entryDate: true, quantity: true },
      }),
    ]);
    const buckets = new Map<
      string,
      {
        ingresoM3: number;
        producido: number;
        despachado: number;
        consumidoM3: number;
        rendW: number;
        rendPeso: number;
      }
    >();
    for (let i = 0; i < n; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1) + i, 1));
      buckets.set(keyOf(d), {
        ingresoM3: 0,
        producido: 0,
        despachado: 0,
        consumidoM3: 0,
        rendW: 0,
        rendPeso: 0,
      });
    }
    for (const i of ingresos) {
      const b = buckets.get(keyOf(i.entryDate));
      if (b) b.ingresoM3 += Number(i.volumeM3 ?? 0);
    }
    for (const c of corridas) {
      const b = buckets.get(keyOf(c.entryDate));
      if (!b) continue;
      b.producido += Number(c.quantity ?? 0);
      const vin = Number(c.volumeInputM3 ?? 0);
      b.consumidoM3 += vin;
      const rend = Number(c.rendimientoPct ?? 0);
      if (rend > 0 && vin > 0) {
        b.rendW += rend * vin;
        b.rendPeso += vin;
      }
    }
    // Despachado: cantidad de producto que salió por mes (como el `producido`, en
    // unidades de producto declaradas — por eso va en el chart de salida, no en el
    // de materia prima m³, para no mezclar unidades).
    for (const d of despachos) {
      const b = buckets.get(keyOf(d.entryDate));
      if (b) b.despachado += Number(d.quantity ?? 0);
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mes, b]) => ({
        mes,
        ingresoM3: r4(b.ingresoM3),
        producido: r4(b.producido),
        despachado: r4(b.despachado),
        consumidoM3: r4(b.consumidoM3),
        rendimiento: b.rendPeso > 0 ? Math.round((b.rendW / b.rendPeso) * 10) / 10 : 0,
      }));
  }

  /**
   * Claves compuestas de las corridas de producción vivas — para la importación
   * idempotente (ADR-138 etapa 2): una corrida no tiene GTF propio, así que se
   * deduplica por `fecha|producto|especie|cantidad` (evita re-crear + el estado
   * parcial de re-importar, donde I2 rechazaría los consumos ya atribuidos).
   */
  /**
   * CUÁNTAS corridas hay de cada clave, no si hay alguna.
   *
   * Un depósito tiene ocho paquetes armados iguales —misma fecha, especie,
   * producto, volumen y hasta el mismo código de lote— y eso no es un error de
   * carga: son ocho bultos. Con un `Set` el importador declaraba UNO y perdía
   * siete (en el inventario real del aserradero fueron 6 filas y 0.489 m³ que
   * nunca llegaron a la base, sin un solo error en pantalla).
   *
   * Contando, la idempotencia se mantiene: si el archivo trae ocho y la base ya
   * tiene ocho, no se crea ninguna; si tiene tres, se crean las cinco que
   * faltan.
   */
  static async existingProduccionKeys(tenantId: string): Promise<Map<string, number>> {
    if (!tenantId) throw new Error("tenantId is required");
    const rows = await prisma.forestCtpEntry.findMany({
      where: { tenantId, section: "produccion", deletedAt: null, status: "registrado" },
      select: {
        entryDate: true,
        productType: true,
        speciesCommon: true,
        quantity: true,
        codigoProducto: true,
        materiaPrimaRef: true,
      },
    });
    const claves = new Map<string, number>();
    const sumar = (k: string) => claves.set(k, (claves.get(k) ?? 0) + 1);
    for (const r of rows) {
      sumar(
        produccionKey(
          r.entryDate,
          r.productType,
          r.speciesCommon,
          r.quantity,
          r.codigoProducto,
          r.materiaPrimaRef,
        ),
      );
      /* Sólo las corridas SIN paquete ni lote aportan además su clave vieja: son
         las que se importaron antes y no se pueden distinguir de otra igual. Una
         corrida que sí tiene código no bloquea a un paquete distinto. */
      if (!r.codigoProducto && !r.materiaPrimaRef) {
        sumar(produccionKeyBase(r.entryDate, r.productType, r.speciesCommon, r.quantity));
      }
    }
    return claves;
  }

  /** Claves de los despachos vivos — dedup idempotente del import (ADR-138 2b). */
  static async existingDespachoKeys(tenantId: string): Promise<Set<string>> {
    if (!tenantId) throw new Error("tenantId is required");
    const rows = await prisma.forestCtpEntry.findMany({
      where: { tenantId, section: "despacho", deletedAt: null, status: "registrado" },
      select: {
        gtfNumber: true,
        entryDate: true,
        productType: true,
        speciesCommon: true,
        quantity: true,
        destino: true,
      },
    });
    return new Set(
      rows.map((r) =>
        despachoKey(
          r.gtfNumber,
          r.entryDate,
          r.productType,
          r.speciesCommon,
          r.quantity,
          r.destino,
        ),
      ),
    );
  }

  /**
   * Mapa `gtfNumber → campos comparables` de los despachos vivos CON GTF, para la
   * vista de reconciliación del importador (ADR-138): un despacho cuyo GTF ya
   * existe pero con cantidad/producto/destino distinto se marca «difiere». Solo
   * despachos con GTF (los «sin GTF» se dedupean por clave compuesta, sin diff).
   */
  static async despachoComparableByGtf(
    tenantId: string,
  ): Promise<
    Map<string, { quantity: number; productType: string; speciesCommon: string; destino: string }>
  > {
    if (!tenantId) throw new Error("tenantId is required");
    const rows = await prisma.forestCtpEntry.findMany({
      where: {
        tenantId,
        section: "despacho",
        deletedAt: null,
        status: "registrado",
        gtfNumber: { not: null },
      },
      select: {
        gtfNumber: true,
        quantity: true,
        productType: true,
        speciesCommon: true,
        destino: true,
      },
    });
    const map = new Map<
      string,
      { quantity: number; productType: string; speciesCommon: string; destino: string }
    >();
    for (const r of rows) {
      if (!r.gtfNumber) continue;
      map.set(r.gtfNumber, {
        quantity: Number(r.quantity ?? 0),
        productType: r.productType ?? "",
        speciesCommon: r.speciesCommon ?? "",
        destino: r.destino ?? "",
      });
    }
    return map;
  }

  /**
   * Trazabilidad HACIA ADELANTE de un ingreso: ¿a dónde fue esta madera?
   * GTF de ingreso → corridas de producción que la consumieron (puente
   * ForestCtpConsumo) → despachos que salieron de esas corridas (puente
   * ForestCtpDespachoOrigen). Complementa al Radar (que dibuja el período
   * entero) con el detalle de UN ingreso — la pregunta que hace un fiscalizador:
   * "esta guía, ¿dónde terminó?". Read-only, tenant-scoped, 3 queries batched.
   *
   * `sinConsumirM3` = volumen que aún no entró a ninguna corrida (Σ consumos ≤
   * volumeM3, invariante I2). No es un hueco de trazabilidad: es patio.
   */
  static async trazaForwardIngreso(
    tenantId: string,
    woodEntryId: string,
  ): Promise<TrazaForwardIngreso | null> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!woodEntryId) throw new Error("woodEntryId is required");

    const wood = await prisma.woodEntry.findFirst({
      where: { id: woodEntryId, tenantId, deletedAt: null },
      select: { volumeM3: true },
    });
    if (!wood) return null;

    // Corridas que consumieron ESTE ingreso (con cuánto de él entró a cada una).
    const consumos = await prisma.forestCtpConsumo.findMany({
      where: { tenantId, woodEntryId },
      select: { ctpEntryId: true, volumeM3: true },
    });
    const corridaIds = consumos.map((c) => c.ctpEntryId);

    const [corridaRows, origenRows] = await Promise.all([
      corridaIds.length
        ? prisma.forestCtpEntry.findMany({
            where: { id: { in: corridaIds }, tenantId, deletedAt: null },
            select: {
              id: true,
              lineNo: true,
              entryDate: true,
              productType: true,
              speciesCommon: true,
              quantity: true,
              unit: true,
              status: true,
            },
          })
        : Promise.resolve([]),
      corridaIds.length
        ? prisma.forestCtpDespachoOrigen.findMany({
            where: { tenantId, produccionEntryId: { in: corridaIds } },
            select: { produccionEntryId: true, despachoEntryId: true, quantity: true },
          })
        : Promise.resolve([]),
    ]);

    const despachoIds = [...new Set(origenRows.map((o) => o.despachoEntryId))];
    const despachoRows = despachoIds.length
      ? await prisma.forestCtpEntry.findMany({
          where: { id: { in: despachoIds }, tenantId, deletedAt: null },
          select: {
            id: true,
            lineNo: true,
            entryDate: true,
            destino: true,
            gtfNumber: true,
            unit: true,
            status: true,
          },
        })
      : [];
    const despachoById = new Map(despachoRows.map((d) => [d.id, d]));
    const corridaById = new Map(corridaRows.map((c) => [c.id, c]));

    const volumeM3 = Number(wood.volumeM3 ?? 0);
    const consumidoM3 = consumos.reduce((a, c) => a + Number(c.volumeM3 ?? 0), 0);

    const corridas = consumos
      .map((c) => {
        const corrida = corridaById.get(c.ctpEntryId);
        if (!corrida) return null;
        const despachos = origenRows
          .filter((o) => o.produccionEntryId === c.ctpEntryId)
          .map((o) => {
            const d = despachoById.get(o.despachoEntryId);
            if (!d) return null;
            return {
              despachoEntryId: o.despachoEntryId,
              lineNo: d.lineNo,
              entryDate: d.entryDate.toISOString(),
              destino: d.destino,
              gtfNumber: d.gtfNumber,
              quantity: r4(Number(o.quantity ?? 0)),
              unit: d.unit,
              status: d.status,
            };
          })
          .filter((d): d is NonNullable<typeof d> => d !== null)
          .sort((a, b) => a.lineNo - b.lineNo);
        return {
          produccionEntryId: c.ctpEntryId,
          lineNo: corrida.lineNo,
          entryDate: corrida.entryDate.toISOString(),
          productType: corrida.productType,
          speciesCommon: corrida.speciesCommon,
          volumeConsumidoM3: r4(Number(c.volumeM3 ?? 0)),
          quantity: corrida.quantity != null ? r4(Number(corrida.quantity)) : null,
          unit: corrida.unit,
          status: corrida.status,
          despachos,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => a.lineNo - b.lineNo);

    return {
      volumeM3: r4(volumeM3),
      consumidoM3: r4(consumidoM3),
      sinConsumirM3: r4(Math.max(0, volumeM3 - consumidoM3)),
      corridas,
    };
  }
}

export interface ReordenProyeccion {
  especie: string;
  scientific: string | null;
  cites: boolean;
  saldo: number;
  consumo90: number;
  ratePorDia: number;
  /** Días hasta agotar al ritmo reciente; null si no se consume. */
  diasHastaAgotar: number | null;
}

export interface TendenciaMes {
  mes: string; // YYYY-MM
  ingresoM3: number;
  producido: number;
  despachado: number;
  consumidoM3: number;
  rendimiento: number;
}

/** Serie del saldo de materia prima en el tiempo. Ver `curvaSaldo`. */
export interface CurvaSaldo {
  /** Existencia heredada al inicio del período; 0 si el período no tiene inicio. */
  apertura: number;
  fuenteApertura: ConciliacionPeriodo["fuenteApertura"];
  aperturaLabel: string | null;
  /** Granularidad del eje, elegida por la longitud del período. */
  paso: "dia" | "semana" | "mes";
  /** `fecha` = inicio del cubo (YYYY-MM-DD). `saldo` = acumulado hasta ese cubo. */
  puntos: { fecha: string; ingreso: number; consumo: number; saldo: number }[];
  /** Saldo al cierre de la serie. Cuadra con `apertura + saldoM3` del período. */
  final: number;
  pico: { fecha: string; saldo: number } | null;
  valle: { fecha: string; saldo: number } | null;
}

/** Trazabilidad hacia adelante de un ingreso: corridas que lo consumieron y
 *  los despachos que salieron de esas corridas. Ver `trazaForwardIngreso`. */
export interface TrazaForwardIngreso {
  volumeM3: number;
  consumidoM3: number;
  sinConsumirM3: number;
  corridas: {
    produccionEntryId: string;
    lineNo: number;
    entryDate: string; // ISO
    productType: string | null;
    speciesCommon: string | null;
    /** m³ de ESTE ingreso que entraron a la corrida. */
    volumeConsumidoM3: number;
    /** producido total de la corrida (todas sus materias primas). */
    quantity: number | null;
    unit: string | null;
    status: string;
    despachos: {
      despachoEntryId: string;
      lineNo: number;
      entryDate: string; // ISO
      destino: string | null;
      gtfNumber: string | null;
      /** cantidad de la corrida que salió en este despacho. */
      quantity: number;
      unit: string | null;
      status: string;
    }[];
  }[];
}

export interface KardexEspecie {
  especie: string;
  movimientos: {
    fecha: Date;
    tipo: "ingreso" | "consumo";
    doc: string;
    entra: number;
    sale: number;
    saldo: number;
  }[];
  ingresoTotal: number;
  consumoTotal: number;
  saldo: number;
}

export interface TrazaGrafo {
  ingresos: {
    id: string;
    gtf: string;
    species: string | null;
    volumeM3: number;
    cites: boolean;
    fecha: string;
    /** Los casilleros por ingreso que pinta la Sección 2 (ADR-347). Opcionales
     *  en el tipo: el endpoint siempre los manda, los fixtures no los declaran. */
    productType?: string | null;
    speciesScientificName?: string | null;
    originCode?: string | null;
    ctpProductCode?: string | null;
    originSourceNumber?: string | null;
    unit?: string | null;
    /** Concesión, permiso, comunidad… — el tipo del título habilitante de origen. */
    originType?: string | null;
  }[];
  corridas: {
    id: string;
    lineNo: number;
    label: string;
    quantity: number;
    unit: string | null;
    cites: boolean;
    productType: string | null;
    species: string | null;
    fecha: string;
    observations?: string | null;
  }[];
  despachos: {
    id: string;
    lineNo: number;
    label: string;
    quantity: number;
    unit: string | null;
    destino: string | null;
    gtf: string | null;
    fecha: string;
  }[];
  /** woodEntryId → corridaId (m³ consumido). */
  consumos: { from: string; to: string; volumeM3: number }[];
  /** corridaId → despachoId (cantidad atribuida). */
  origenes: { from: string; to: string; quantity: number }[];
  /**
   * corridaId → corridaId (cantidad reprocesada, ADR-316).
   *
   * La tercera arista de la cadena: un producto que vuelve a la sierra. Sin
   * ella, la corrida que nace del reproceso no recibe ninguna arista y todo lo
   * que mire "quién no tiene origen" la cuenta como huérfana.
   *
   * Opcional en el tipo por los fixtures viejos, que arman grafos sin esta
   * clave; el endpoint siempre la manda (array vacío si no hubo reprocesos).
   */
  reprocesos?: { from: string; to: string; quantity: number }[];
}
