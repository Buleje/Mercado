/**
 * WoodEntriesDB — DB class para ingresos de madera al CTP (ADR-124).
 *
 * Patrón estándar Buleje:
 * - tenantId 1er parámetro (multi-tenant guard)
 * - Sin Prisma directo desde API/UI (siempre via esta clase)
 * - Cache + invalidate por write
 * - Audit log fire-and-forget en mutaciones
 */
import { prisma } from "@/lib/prisma";
import { leerGtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { esCampoSinDato, marcadorDeAusencia } from "@/lib/forestal/campo-sin-dato";
import { Prisma } from "@/lib/generated/prisma/client";
import { claveDeGuia, resumirGuia, type GuiaIngreso } from "@/lib/forestal/ingresos-por-guia";
import { resumirIngresosPorGuia, type IngresosPorGuia } from "@/lib/forestal/reporte-diario-ingresos";
import type {
  WoodEntryStatus,
  WoodOriginType,
  WoodProductType,
  DocumentType,
} from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { exigirFotosPropias } from "@/lib/storage-url";
import { detalleDeFotosGuia, diffFotosGuia, motivoSiNoPuedeGuardar } from "@/lib/forestal/fotos-guia-diff";
import { normalizarFotos, tieneFotos, urlsDeFotos, type FotoCarga } from "@/lib/forestal/fotos-carga";
import { FotoNoValidaError, resolverFotosEntrantes } from "@/lib/forestal/fotos-carga-firma";
import { ForestEspeciesDB } from "./forest-especies.db";
import { mismaEspecie } from "@/lib/forestal/loth-constants";
import { colocarAlCargar, type FilaQueRecibe, type NotaDeColocacion } from "@/lib/forestal/acomodar-trozas";
import { PLAZO_REGISTRO_DIAS, estaFueraDePlazo } from "@/lib/forestal/ctp-compliance";
import { auditCtp, m3 } from "@/lib/forestal/ctp-audit";
import { calcularRetrozado, type RetrozoNuevo } from "@/lib/forestal/ctp-retrozado";
import type { CambioRecepcion } from "@/lib/forestal/recepcion-trozas";
import { guiaRecibida, type TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { asignarCorrelativos, planearEtiquetado, tieneCodigoPlanta } from "@/lib/forestal/etiquetado-trozas";
import { ForestCtpCierreDB } from "./forest-ctp-cierre.db";
import { closedPeriodOf } from "@/lib/forestal/ctp-cierre-types";
import { CtpInvariantError, exigirIngresoAntesDeLaCorrida } from "./forest-ctp-consumo.db";
import { exigirCostoNoCongelado } from "./costo-congelado.db";
import { ForestCuentaDB } from "./forest-cuenta.db";
import { FILTRO_REQUIERE_COSTO, FILTRO_REQUIERE_COSTO_SQL } from "@/lib/forestal/madera-de-servicio";
import { ForestContratoDB } from "@/lib/db/forest-contrato.db";
import { ForestRecepcionDB } from "./forest-recepcion.db";
import { problemaDeLlegada, type ConfirmacionDeVencida } from "@/lib/forestal/fecha-de-llegada";
import { limaDateKey } from "@/lib/utils";
import type { FiltroPago } from "@/lib/forestal/ingresos-filtros-columna";
import { GuiaPlataDB } from "./guia-plata.db";
import { planearMedida, type CambioMedidaTroza, type PlanMedida } from "@/lib/forestal/medidas-troza";
import { fmtPt } from "@/lib/forestal/cubicacion-formato";
import { mensajeApartadasEnMixto, mixtoVivo } from "@/lib/forestal/lote-mixto";
import { logger } from "@/lib/logger";

/**
 * Alta de una GTF de SERFOR completa (ADR-312): la cabecera es del documento y
 * se repite en cada línea; `lineas` es lo que declara la guía, una por especie.
 */
export interface WoodEntryDesdeGtfInput {
  entryDate?: Date;
  docType?: string | null;
  serforNumeroRegistro?: string | null;
  /** La ficha tal como la devolvió SERFOR AL SERVIDOR (nunca la del navegador). */
  serforGtf?: Record<string, unknown> | null;
  /**
   * La MISMA ficha leída como cuerpo de guía (propietario, destinatario,
   * transportista): así el ingreso de SERFOR y el manual dejan el mismo dato
   * consultable, en vez de uno el blob y el otro los campos (ADR-336).
   */
  gtfDatos?: Record<string, unknown> | null;
  gtfNumber: string;
  gtfDate?: Date | null;
  gtfSeries?: string | null;

  providerName: string;
  providerDocument?: string | null;
  providerDocumentType?: DocumentType | null;

  originType?: WoodOriginType;
  originCode?: string | null;
  originSourceNumber?: string | null;
  originRegion?: string | null;
  /** El contrato/permiso bajo el que entró esta madera (ADR-421). Lo elige la
   *  pantalla; `originCode` sigue siendo el texto que se declara. */
  contratoId?: string | null;
  originDistrict?: string | null;

  /** Lo que pone el CTP, no el documento: se repite en las N líneas. */
  ctpProductCode?: string | null;
  humidityPct?: number | string | null;
  notes?: string | null;

  lineas: Array<{
    especieComun: string;
    especieCientifica: string | null;
    cites?: boolean;
    productType?: WoodProductType;
    unit?: string | null;
    /** La presentación que declara ESA línea de la guía (ADR-314). */
    presentacion?: string | null;
    volumenM3: number;
    piezas?: number;
    trozas: WoodEntryTrozaInput[];
  }>;

  createdBy: string;
}

/**
 * Una pieza de la lista de trozas, como entra al libro.
 *
 * Estaba escrito tres veces (alta desde SERFOR, alta manual y ahora el agregado
 * a un ingreso existente). Un campo nuevo en una copia y no en las otras deja
 * una vía por la que el dato se pierde en silencio.
 */
export interface WoodEntryTrozaInput {
  orden: number;
  codificacion: string | null;
  especieComun: string | null;
  especieCientifica: string | null;
  dimensiones: string | null;
  largoM: number | null;
  diametroCm: number | null;
  d1Cm: number | null;
  d2Cm: number | null;
  cantidad: number | null;
  volumenM3: number | null;
  /**
   * El código que ESTE centro marca sobre la pieza, distinto del que trae del
   * bosque. El inventario del SNIFFS los publica en dos columnas («Código Troza»
   * y «Código Planta») y guardar uno solo pierde por cuál se la busca en el patio.
   */
  codigoPlanta?: string | null;
  /** Parcela de corta del POA, cuando el documento la declara. */
  parcela?: string | null;
  /** Cuándo bajó ESTA pieza del camión (ADR-336). NULL = la fecha del ingreso. */
  fechaRecepcion?: Date | null;
  /** La guía la declara pero no llegó al patio (ADR-325). */
  noRecepcionada?: boolean;
}

/**
 * Tope de piezas por ingreso. Una guía real no trae más, y sin tope un pegado
 * accidental en el importador tumba la request. Es el mismo número que valida
 * el endpoint: si se cambia, se cambia en los dos lados.
 */
export const TOPE_TROZAS_POR_INGRESO = 500;

export interface WoodEntryCreateInput {
  /**
   * Lista de trozas de la guía, cuando se carga a mano o desde un Excel
   * (ADR-320). Se crean en la MISMA transacción que el ingreso: media guía
   * registrada deja un saldo que no corresponde a ningún documento.
   */
  trozas?: WoodEntryTrozaInput[];
  // Fecha + GTF
  entryDate?: Date; // default now
  /** (3) Tipo de documento del LO-CTP: GTF | GRR (ADR-311). */
  docType?: string | null;
  /** N° de constancia de registro del SNIFFS con el que se consultó la guía. */
  serforNumeroRegistro?: string | null;
  /** Ficha oficial devuelta por la consulta pública de SERFOR. */
  serforGtf?: Record<string, unknown> | null;
  gtfNumber: string;
  gtfDate?: Date | null;
  /** Cuándo llegó físicamente a la planta (ADR-335). */
  fechaRecepcion?: Date | null;
  gtfSeries?: string | null;

  // Proveedor
  providerName: string;
  providerDocument?: string | null;
  providerDocumentType?: DocumentType | null;
  /** Enlace opcional al maestro de proveedores (ADR-134). Validado contra el tenant. */
  supplierId?: string | null;

  // Costo de materia prima (ADR-134)
  /** S/ total de la factura. Llega TARDE ⇒ nullable por diseño. Sin factura → null, nunca 0. */
  costoTotal?: number | string | null;
  moneda?: string | null;

  // Origen
  originType?: WoodOriginType;
  /** (8) Código de origen/procedencia (concesión, predio, comunidad). */
  originCode?: string | null;
  /** (5) N° Fuente de origen/procedencia — el documento que ampara la fuente. */
  originSourceNumber?: string | null;
  /** (9) Código de CTP: sólo si la materia prima llega de OTRO centro. */
  ctpProductCode?: string | null;
  /** El contrato/permiso bajo el que entró esta madera (ADR-421). Lo elige la
   *  pantalla; `originCode` sigue siendo el texto que se declara. */
  contratoId?: string | null;
  originRegion?: string | null;
  originDistrict?: string | null;

  // Especie
  speciesCommonName: string;
  speciesScientificName?: string | null;
  speciesCites?: boolean;

  // Producto
  productType?: WoodProductType;
  /** (10) Unidad de medida declarada en el documento. El libro calcula en m³. */
  unit?: string | null;
  /** "Forma de presentación" del formato (ADR-314). */
  presentacion?: string | null;
  volumeM3: number | string; // (11) Cantidad — Decimal-friendly
  pieces?: number;
  avgLengthM?: number | string | null;
  avgDiameterCm?: number | string | null;
  humidityPct?: number | string | null;
  defectsNotes?: string | null;

  // Trazabilidad
  notes?: string | null;
  /** Fotos de la carga (ADR-434): objetos `FotoCarga`; un string suelto es el formato viejo. */
  photos?: (FotoCarga | string)[] | null;
  /**
   * El cuerpo del documento que ampara el ingreso: propietario del producto,
   * destinatario, transportista y vehículo (ADR-336). Forma validada por
   * `gtfDatosSchema` en el endpoint; acá viaja como JSON.
   */
  gtfDatos?: Record<string, unknown> | null;
  createdBy: string;
}

/** Columnas por las que se puede ordenar el listado (whitelist: el `sort` llega
 *  del cliente y jamás se interpola — se mapea contra esta tabla o se ignora). */
export const WOOD_ENTRY_SORT_FIELDS = [
  "entryDate",
  /** Cuándo se recibió: es el orden natural del ARCHIVO de GTF ingresadas —lo
   *  último que entró, arriba— (ADR-351). Ordenar el archivo por la fecha de la
   *  operación manda al fondo la guía que se acaba de recepcionar. */
  "fechaRecepcion",
  "volumeM3",
  "pieces",
  "providerName",
  "speciesCommonName",
  "createdAt",
] as const;
export type WoodEntrySortField = (typeof WOOD_ENTRY_SORT_FIELDS)[number];

/**
 * Los filtros del listado. Cuatro admiten VARIOS valores (Brandon, 2026-09-10:
 * «poder seleccionar dos o más opciones de filtros»): especie, proveedor,
 * producto y permiso. Adentro de un campo es OR, entre campos AND — el
 * autofiltro de Excel, que es como se lee este libro.
 *
 * Un `string` suelto sigue valiendo: se lee como una lista de uno, así que las
 * URLs guardadas y los llamadores viejos no cambian.
 */
export interface WoodEntryListFilters {
  /** Uno o varios estados (autofiltro de la cabecera, 2026-09-26): OR adentro. */
  status?: WoodEntryStatus | readonly WoodEntryStatus[];
  speciesCommonName?: string | readonly string[];
  gtfNumber?: string;
  fromDate?: Date;
  toDate?: Date;
  search?: string; // matches provider/gtf/species
  /** Proveedor (contains, insensitive) — el chip "solo este proveedor". */
  providerName?: string | readonly string[];
  /** Tipo de producto (rolliza/aserrada/…) — igualdad exacta. */
  productType?: WoodProductType | readonly WoodProductType[];
  /** true = solo CITES · false = solo NO-CITES · undefined = ambos. */
  cites?: boolean;
  /** true = solo los registrados fuera del plazo SERFOR (días hábiles op→registro). */
  late?: boolean;
  /** true = solo ingresos SIN código de origen. Son los que dejan el EUDR
   *  incompleto: sin código no hay parcela que geolocalizar (Reg. 2023/1115). */
  sinOrigenCode?: boolean;
  /** true = sólo ingresos SIN costo cargado: los que dejan al margen sin base
   *  (ADR-135). Es el filtro de la pastilla «sin costo» de Ingresos. */
  sinCosto?: boolean;
  /**
   * El título habilitante / contrato que ampara la madera (`originCode`) —
   * «el permiso» (ADR-400).
   *
   * Igualdad exacta y no `contains`: el valor sale de un desplegable armado con
   * los permisos que de verdad hay, y con `contains` un permiso que es prefijo
   * de otro (`CONC-25-1` dentro de `CONC-25-10`) arrastraría filas ajenas a un
   * número que después se declara.
   */
  originCode?: string | readonly string[];
  /**
   * «Solo este permiso» (ADR-421): el contrato ACTIVO de la banda, por su id.
   *
   * Es el vínculo interno (`WoodEntry.contratoId`), no el texto declarado: un
   * ingreso con `originCode` escrito distinto (un typo, otra ARFFS) pero atado
   * al mismo contrato entra igual, y uno sin atar no entra — no se adivina.
   * Sin valor = todos los ingresos, como siempre.
   */
  contratoId?: string;
  /**
   * Estado de recepción (ADR-339): `pendiente` es la bandeja del patio y
   * `cerrada` el archivo de «GTF ingresadas». Sin valor = las dos.
   */
  recepcion?: "pendiente" | "cerrada";
  /**
   * Autofiltro en la CABECERA de cada columna de Ingresos (Brandon, 2026-09-26).
   * Texto = `contains` sin mayúsculas; fechas = días `AAAA-MM-DD` inclusivos,
   * que se CRUZAN con el período (`fromDate`/`toDate`), no lo reemplazan.
   */
  cabecera?: WoodEntryFiltrosCabecera;
  sortBy?: WoodEntrySortField;
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

/**
 * Los filtros de la cabecera de Ingresos (una columna → su filtro).
 *
 * Los de ASIENTO van a `buildListWhere` y a su espejo SQL `buildLateConditions`.
 * Los de GUÍA (`vol*`, `pz*`) filtran por lo que muestra la columna: la SUMA de
 * los asientos de la guía — los resuelve `withGuiaFilter`.
 */
export interface WoodEntryFiltrosCabecera {
  /** N° de documento (`gtfNumber`), contains. */
  doc?: string;
  /** Constancia del SNIFFS (`serforNumeroRegistro`), contains. */
  sniffs?: string;
  /** Tipo de documento; un `docType` vacío es una GTF (es su default). */
  tipo?: string;
  /** Región o distrito de origen, contains. */
  origen?: string;
  /** Unidad de medida (`unit`), contains. */
  unidad?: string;
  /** Quién registró o validó (`createdBy`/`validatedBy` = username), contains. */
  registro?: string;
  /** Fecha del asiento (`entryDate`), días inclusivos. */
  fechaDesde?: string;
  fechaHasta?: string;
  /** Fecha de la guía (`gtfDate`), días inclusivos. */
  gtfDesde?: string;
  gtfHasta?: string;
  /** `con` = tiene lista de trozas · `sin` = no tiene. */
  trozas?: "con" | "sin";
  /** Sólo los que tienen costo cargado (el opuesto de `sinCosto`). */
  conCosto?: boolean;
  /** Σ m³ de la GUÍA, inclusivo. */
  volMin?: number;
  volMax?: number;
  /** Σ piezas de la GUÍA, inclusivo. */
  pzMin?: number;
  pzMax?: number;
  /**
   * La plata de la guía (ADR-437 §7 y §10): `servicio` = madera ajena
   * (`maderaDeTercero`, columna directa); `sin-pagar`/`pagada` son el estado
   * DERIVADO de la cuenta corriente (`GuiaPlataDB.estadoPagoPorGuia`) — se
   * resuelve en `withPagoFilter`, nunca acá (esta función es sync).
   */
  pago?: FiltroPago;
}

/**
 * Un día `AAAA-MM-DD` como rango UTC `[gte, lt)`.
 *
 * `hasta` es inclusivo: se traduce a `lt` el día SIGUIENTE, así una fecha con
 * hora (un `gtfDate` importado con 10:30) cae adentro. `entryDate`/`gtfDate`
 * son date-only guardados a medianoche UTC. Un día inválido (`2026-02-31`,
 * texto) se ignora — un query param roto no vacía el libro ni tira 500.
 */
export function rangoDeDias(
  desde: string | undefined,
  hasta: string | undefined,
): { gte?: Date; lt?: Date } {
  const dia = (s: string | undefined): Date | undefined => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s ?? "").trim());
    if (!m) return undefined;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const f = new Date(Date.UTC(y, mo - 1, d));
    // `Date.UTC(2026, 1, 31)` es el 3 de marzo: se rechaza en vez de correrse.
    return f.getUTCFullYear() === y && f.getUTCMonth() === mo - 1 && f.getUTCDate() === d ? f : undefined;
  };
  const r: { gte?: Date; lt?: Date } = {};
  const g = dia(desde);
  const h = dia(hasta);
  if (g) r.gte = g;
  if (h) r.lt = new Date(h.getTime() + 86_400_000);
  return r;
}

/** Texto de la cabecera, recortado; vacío = sin filtro. */
function textoDe(v: string | undefined): string | undefined {
  const t = (v ?? "").trim();
  return t ? t : undefined;
}

/** `tipo` pedido abarca a las GTF sin `docType` (el default de la columna). */
function tipoIncluyeGtf(tipo: string): boolean {
  return "gtf".includes(tipo.toLowerCase());
}

/** Un asiento con el resumen de sus piezas — lo que devuelven `list` y `listPorGuia`. */
type WoodEntryConTrozas = Prisma.WoodEntryGetPayload<object> & {
  trozasCount: number;
  trozasM3: number | null;
  trozasDecididas: number;
};

const CACHE_PREFIX = "wood-entries";

/**
 * Lo que se lee del LOTE MIXTO de una troza (ADR-441). El estado viaja porque
 * decide: una reserva en un mixto repartido, anulado o borrado ya no aparta nada
 * (`mixtoVivo`) — mismo criterio que la corrida y el despacho.
 */
const SELECT_LOTE_MIXTO = { id: true, code: true, status: true, deletedAt: true } as const;

/**
 * LM4 en los tres escritores que NO pasan por un lote (ADR-441): el consumo a
 * mano en una corrida, el despacho sin aserrar y el retrozado. Una pieza
 * apartada en un mixto ABIERTO está por ir a la sierra con su pila: si se
 * consume, se despacha o se corta por otro camino, el reparto la suelta en
 * silencio y la pila pierde una troza que el operador escaneó.
 *
 * Tira con el código del escritor (T1/T2/…); el mensaje dice en qué mixto está
 * y qué hacer (`mensajeApartadasEnMixto`). El llamador decide cuáles revisar:
 * las que ya eran de esa corrida o ese despacho no se revisan, así un asiento
 * viejo que quedó con una pieza en un mixto todavía se puede corregir.
 */
function exigirFueraDelMixto(
  trozas: readonly {
    id: string;
    codificacion: string | null;
    codigoPlanta?: string | null;
    loteMixto?: { code: string; status: string; deletedAt: Date | null } | null;
  }[],
  code: "T1_TROZA_NO_CONSUMIBLE" | "T2_TROZA_NO_DESPACHABLE" | "ESTADO_NO_EDITABLE",
): void {
  const apartadas = trozas.filter((t) => mixtoVivo(t.loteMixto));
  if (apartadas.length === 0) return;
  throw new CtpInvariantError(
    mensajeApartadasEnMixto(
      apartadas.map((t) => ({
        codigo: t.codigoPlanta?.trim() || t.codificacion?.trim() || t.id,
        mixto: t.loteMixto!.code,
      })),
    ),
    code,
    {
      trozas: apartadas.map((t) => t.id),
      lotesMixtos: [...new Set(apartadas.map((t) => t.loteMixto!.code))],
    },
  );
}

/** Lo elegido de un filtro, siempre como lista y sin vacíos. */
function valoresDe<T extends string>(v: T | readonly T[] | undefined): T[] {
  if (v == null) return [];
  return (Array.isArray(v) ? v : [v as T]).filter(Boolean) as T[];
}

/**
 * Single source del `where` de listado: `list` y `stats` deben filtrar
 * exactamente igual, si no los KPIs describen un conjunto distinto al de la
 * tabla que están encabezando.
 */
export function buildListWhere(
  tenantId: string,
  filters: WoodEntryListFilters,
): Prisma.WoodEntryWhereInput {
  const where: Prisma.WoodEntryWhereInput = { tenantId, deletedAt: null };

  const estados = valoresDe(filters.status);
  if (estados.length === 1) where.status = estados[0];
  else if (estados.length > 1) where.status = { in: [...estados] };
  /* Varios valores por campo = OR adentro del campo. Van por `AND` y cada uno
     con su propio `OR`: `where.OR` de arriba ya es de la búsqueda libre, y
     pisarlo haría que buscar + filtrar devuelva cualquier cosa. */
  const y: Prisma.WoodEntryWhereInput[] = [];
  const especies = valoresDe(filters.speciesCommonName);
  if (especies.length === 1) {
    where.speciesCommonName = { contains: especies[0], mode: "insensitive" };
  } else if (especies.length > 1) {
    y.push({ OR: especies.map((v) => ({ speciesCommonName: { contains: v, mode: "insensitive" as const } })) });
  }
  if (filters.gtfNumber) where.gtfNumber = filters.gtfNumber;
  /* Campo propio y no en `AND`: `stats()` recorta el `AND` por posición para
     separar lo que agregan fuera de plazo y recepción. */
  if (filters.contratoId) where.contratoId = filters.contratoId;
  const proveedores = valoresDe(filters.providerName);
  if (proveedores.length === 1) {
    where.providerName = { contains: proveedores[0], mode: "insensitive" };
  } else if (proveedores.length > 1) {
    y.push({ OR: proveedores.map((v) => ({ providerName: { contains: v, mode: "insensitive" as const } })) });
  }
  const productos = valoresDe(filters.productType);
  if (productos.length === 1) where.productType = productos[0];
  else if (productos.length > 1) where.productType = { in: [...productos] };
  const permisos = valoresDe(filters.originCode);
  if (permisos.length === 1) {
    where.originCode = { equals: permisos[0], mode: "insensitive" };
  } else if (permisos.length > 1) {
    y.push({ OR: permisos.map((v) => ({ originCode: { equals: v, mode: "insensitive" as const } })) });
  }
  if (y.length > 0) where.AND = y;
  if (filters.cites !== undefined) where.speciesCites = filters.cites;
  if (filters.sinOrigenCode) {
    // Va por AND y no por OR: `where.OR` ya lo usa la búsqueda libre, y
    // pisarlo haría que buscar + este filtro devolviera cualquier cosa.
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      { OR: [{ originCode: null }, { originCode: "" }] },
    ];
  }
  if (filters.sinCosto) {
    /* La madera de servicio no se compró: no le falta costo (ADR-437 §1). */
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      { costoTotal: null, ...FILTRO_REQUIERE_COSTO },
    ];
  }
  /* La cabecera va entera por `AND`, al final: `entryDate` ya lo ocupa el
     período y `OR` la búsqueda libre; ponerla en el campo pisaría uno de los
     dos. Espejo exacto en `condicionesCabeceraSql`. */
  const cab = condicionesCabecera(filters.cabecera);
  if (cab.length > 0) {
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), ...cab];
  }
  if (filters.fromDate || filters.toDate) {
    where.entryDate = {};
    if (filters.fromDate) where.entryDate.gte = filters.fromDate;
    if (filters.toDate) where.entryDate.lte = filters.toDate;
  }
  if (filters.search) {
    where.OR = [
      { gtfNumber: { contains: filters.search, mode: "insensitive" } },
      { providerName: { contains: filters.search, mode: "insensitive" } },
      { speciesCommonName: { contains: filters.search, mode: "insensitive" } },
      /* Contrato y N° de Resolución (Brandon, 2026-09-01): el importador de
         inventario los trae y hasta ahora no había forma de buscar por ellos —
         un operador que se acuerda del contrato no se acuerda del GTF. */
      { originCode: { contains: filters.search, mode: "insensitive" } },
      { originSourceNumber: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return where;
}

/** Los filtros de ASIENTO de la cabecera como condiciones de Prisma (una por columna). */
function condicionesCabecera(c: WoodEntryFiltrosCabecera | undefined): Prisma.WoodEntryWhereInput[] {
  if (!c) return [];
  const out: Prisma.WoodEntryWhereInput[] = [];
  const hay = (v: string) => ({ contains: v, mode: "insensitive" as const });
  const doc = textoDe(c.doc);
  if (doc) out.push({ gtfNumber: hay(doc) });
  const sniffs = textoDe(c.sniffs);
  if (sniffs) out.push({ serforNumeroRegistro: hay(sniffs) });
  const tipo = textoDe(c.tipo);
  if (tipo) {
    out.push(tipoIncluyeGtf(tipo) ? { OR: [{ docType: hay(tipo) }, { docType: null }] } : { docType: hay(tipo) });
  }
  const origen = textoDe(c.origen);
  if (origen) out.push({ OR: [{ originRegion: hay(origen) }, { originDistrict: hay(origen) }] });
  const unidad = textoDe(c.unidad);
  if (unidad) out.push({ unit: hay(unidad) });
  const registro = textoDe(c.registro);
  if (registro) out.push({ OR: [{ createdBy: hay(registro) }, { validatedBy: hay(registro) }] });
  const fecha = rangoDeDias(c.fechaDesde, c.fechaHasta);
  if (fecha.gte || fecha.lt) out.push({ entryDate: fecha });
  const gtf = rangoDeDias(c.gtfDesde, c.gtfHasta);
  if (gtf.gte || gtf.lt) out.push({ gtfDate: gtf });
  if (c.trozas === "con") out.push({ trozas: { some: {} } });
  else if (c.trozas === "sin") out.push({ trozas: { none: {} } });
  if (c.conCosto) out.push({ costoTotal: { not: null } });
  return out;
}

/** Espejo SQL de `condicionesCabecera` — placeholders, nunca interpolación. */
export function condicionesCabeceraSql(c: WoodEntryFiltrosCabecera | undefined): Prisma.Sql[] {
  if (!c) return [];
  const out: Prisma.Sql[] = [];
  const like = (v: string) => `%${v}%`;
  const doc = textoDe(c.doc);
  if (doc) out.push(Prisma.sql`"gtfNumber" ILIKE ${like(doc)}`);
  const sniffs = textoDe(c.sniffs);
  if (sniffs) out.push(Prisma.sql`"serforNumeroRegistro" ILIKE ${like(sniffs)}`);
  const tipo = textoDe(c.tipo);
  if (tipo) {
    out.push(
      tipoIncluyeGtf(tipo)
        ? Prisma.sql`("docType" ILIKE ${like(tipo)} OR "docType" IS NULL)`
        : Prisma.sql`"docType" ILIKE ${like(tipo)}`,
    );
  }
  const origen = textoDe(c.origen);
  if (origen) {
    out.push(Prisma.sql`("originRegion" ILIKE ${like(origen)} OR "originDistrict" ILIKE ${like(origen)})`);
  }
  const unidad = textoDe(c.unidad);
  if (unidad) out.push(Prisma.sql`"unit" ILIKE ${like(unidad)}`);
  const registro = textoDe(c.registro);
  if (registro) {
    out.push(Prisma.sql`("createdBy" ILIKE ${like(registro)} OR "validatedBy" ILIKE ${like(registro)})`);
  }
  const fecha = rangoDeDias(c.fechaDesde, c.fechaHasta);
  if (fecha.gte) out.push(Prisma.sql`"entryDate" >= ${fecha.gte}`);
  if (fecha.lt) out.push(Prisma.sql`"entryDate" < ${fecha.lt}`);
  const gtf = rangoDeDias(c.gtfDesde, c.gtfHasta);
  if (gtf.gte) out.push(Prisma.sql`"gtfDate" >= ${gtf.gte}`);
  if (gtf.lt) out.push(Prisma.sql`"gtfDate" < ${gtf.lt}`);
  const conTrozas = Prisma.sql`EXISTS (SELECT 1 FROM "WoodEntryTroza" t WHERE t."woodEntryId" = "WoodEntry"."id")`;
  if (c.trozas === "con") out.push(conTrozas);
  else if (c.trozas === "sin") out.push(Prisma.sql`NOT ${conTrozas}`);
  if (c.conCosto) out.push(Prisma.sql`"costoTotal" IS NOT NULL`);
  return out;
}

/**
 * Condiciones SQL de "fuera de plazo" (días HÁBILES(createdAt - entryDate) > 2,
 * RDE D000025-2023). El cálculo de días hábiles se agrega en `stats()`.
 * Prisma no expresa comparación columna-columna con su API fluida (mismo
 * caso que el low-stock de `analytics.db.ts`), así que se arma a mano con
 * `Prisma.sql` — placeholders reales ($1 $2…), nunca interpolación de string.
 * Espejo de `buildListWhere` (mismos campos, ignora `status` igual que el
 * resto de agregados de `stats()`).
 */
function buildLateConditions(
  tenantId: string,
  filters: Omit<WoodEntryListFilters, "status" | "limit" | "offset">,
): Prisma.Sql[] {
  const conditions = [Prisma.sql`"tenantId" = ${tenantId}`, Prisma.sql`"deletedAt" IS NULL`];
  /* Un campo con varios valores es un OR entre placeholders — nunca
     interpolación de string (regla 11: `$1 $2 $3`, jamás `${x}` crudo). */
  const oR = (partes: Prisma.Sql[]) => Prisma.sql`(${Prisma.join(partes, " OR ")})`;
  const especies = valoresDe(filters.speciesCommonName);
  if (especies.length > 0) {
    conditions.push(oR(especies.map((v) => Prisma.sql`"speciesCommonName" ILIKE ${`%${v}%`}`)));
  }
  if (filters.gtfNumber) conditions.push(Prisma.sql`"gtfNumber" = ${filters.gtfNumber}`);
  if (filters.contratoId) conditions.push(Prisma.sql`"contratoId" = ${filters.contratoId}`);
  const proveedores = valoresDe(filters.providerName);
  if (proveedores.length > 0) {
    conditions.push(oR(proveedores.map((v) => Prisma.sql`"providerName" ILIKE ${`%${v}%`}`)));
  }
  const productos = valoresDe(filters.productType);
  if (productos.length > 0) {
    conditions.push(oR(productos.map((v) => Prisma.sql`"productType" = ${v}`)));
  }
  const permisos = valoresDe(filters.originCode);
  if (permisos.length > 0) {
    conditions.push(oR(permisos.map((v) => Prisma.sql`LOWER("originCode") = LOWER(${v})`)));
  }
  if (filters.cites !== undefined) conditions.push(Prisma.sql`"speciesCites" = ${filters.cites}`);
  if (filters.sinOrigenCode) {
    conditions.push(Prisma.sql`("originCode" IS NULL OR "originCode" = '')`);
  }
  if (filters.sinCosto) conditions.push(Prisma.sql`"costoTotal" IS NULL AND ${Prisma.raw(FILTRO_REQUIERE_COSTO_SQL)}`);
  conditions.push(...condicionesCabeceraSql(filters.cabecera));
  if (filters.fromDate) conditions.push(Prisma.sql`"entryDate" >= ${filters.fromDate}`);
  if (filters.toDate) conditions.push(Prisma.sql`"entryDate" <= ${filters.toDate}`);
  if (filters.search) {
    const like = `%${filters.search}%`;
    /* Los cinco campos de la búsqueda de `buildListWhere` (contrato y N° de
       resolución entraron el 2026-09-01 y este espejo se había quedado en tres:
       buscar por contrato acotaba la tabla pero no «fuera de plazo»). */
    conditions.push(
      Prisma.sql`("gtfNumber" ILIKE ${like} OR "providerName" ILIKE ${like} OR "speciesCommonName" ILIKE ${like} OR "originCode" ILIKE ${like} OR "originSourceNumber" ILIKE ${like})`,
    );
  }
  return conditions;
}

/**
 * Fórmula cerrada de "días hábiles(operación → registro) > PLAZO", IDÉNTICA a
 * `diasHabilesDeRegistro()` en ctp-compliance.ts:
 *   n  = días calendario = GREATEST(0, floor(epoch(createdAt-entryDate)/86400))
 *   w0 = isodow(entryDate)  ·  hábiles = floor(n/7)*5 + Σ_{i=1..n%7}[dow(i) ≤ 5]
 * No descuenta feriados (ADR-137). `entryDate` es timestamp s/tz a medianoche
 * UTC, así que epoch e isodow se calculan sobre el valor guardado (UTC), igual
 * que el JS. Vive suelta porque la usan el CONTEO (stats) y el FILTRO (lateIds).
 */
/** Los días HÁBILES de la operación al registro, por fila. La usan el
 *  predicado de «fuera de plazo» y el promedio de `stats()`: un solo cálculo,
 *  así el conteo y el promedio no pueden discrepar. */
const DIAS_HABILES_REGISTRO_SQL = Prisma.sql`(
        (GREATEST(0, floor(extract(epoch from ("createdAt" - "entryDate")) / 86400)::int) / 7) * 5
        + (
          SELECT count(*)::int
          FROM generate_series(1, GREATEST(0, floor(extract(epoch from ("createdAt" - "entryDate")) / 86400)::int) % 7) AS gi
          WHERE ((extract(isodow from "entryDate")::int - 1 + gi) % 7) + 1 <= 5
        )
      )`;

const FUERA_DE_PLAZO_SQL = Prisma.sql`${DIAS_HABILES_REGISTRO_SQL} > ${PLAZO_REGISTRO_DIAS}`;

/** Condiciones completas de "fuera de plazo": filtros del período + vigencia +
 *  la fórmula de días hábiles. Single source del predicado entre conteo y filtro. */
function lateConditions(
  tenantId: string,
  filters: Omit<WoodEntryListFilters, "status" | "limit" | "offset">,
): Prisma.Sql[] {
  const conditions = buildLateConditions(tenantId, filters);
  // Un ingreso rechazado/anulado fuera de plazo es irrelevante — no cuenta.
  conditions.push(Prisma.sql`"status" NOT IN (${Prisma.join(["rechazado", "anulado"])})`);
  conditions.push(FUERA_DE_PLAZO_SQL);
  return conditions;
}

/**
 * Aplica el filtro "fuera de plazo" a un `where` de Prisma. El predicado es
 * SQL (comparación columna-columna con días hábiles: la API fluida no lo
 * expresa), así que se resuelven primero los ids y se intersectan. El período
 * ya acota el conjunto — un CTP maneja cientos de ingresos por mes, no millones.
 */
async function withLateFilter(
  tenantId: string,
  filters: WoodEntryListFilters,
  where: Prisma.WoodEntryWhereInput,
): Promise<Prisma.WoodEntryWhereInput> {
  if (!filters.late) return where;
  const { status: _s, limit: _l, offset: _o, late: _late, ...periodFilters } = filters;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "WoodEntry"
    WHERE ${Prisma.join(lateConditions(tenantId, periodFilters), " AND ")}
  `;
  return { ...where, id: { in: rows.map((r) => r.id) } };
}

/**
 * El predicado de «guía recepcionada» en SQL — el MISMO que
 * `estaRecepcionada()` de `lib/forestal/recepcion-guias.ts` (ADR-339).
 *
 * Vive duplicado a propósito, como el de fuera de plazo: la bandeja se pagina
 * en el servidor, así que el filtro tiene que poder correr en la base, y la
 * pantalla necesita el mismo criterio para explicar qué le falta a cada fila.
 * Si uno cambia, cambian los dos — hay un test que compara los dos caminos.
 */
const RECEPCION_CERRADA_SQL = Prisma.sql`(
  "status" = 'validado'
  OR "fechaRecepcion" IS NOT NULL
  OR (
    EXISTS (SELECT 1 FROM "WoodEntryTroza" t WHERE t."woodEntryId" = "WoodEntry"."id" AND t."trozaOrigenId" IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM "WoodEntryTroza" t
      WHERE t."woodEntryId" = "WoodEntry"."id" AND t."trozaOrigenId" IS NULL
        AND t."fechaRecepcion" IS NULL AND t."noRecepcionada" = false
    )
  )
)`;

/**
 * Acota la lista al estado de recepción pedido.
 *
 * `pendiente` = la bandeja del patio (lo que falta recibir) · `cerrada` = el
 * archivo de GTF ingresadas. Sin el filtro, las dos vistas mostrarían lo mismo.
 */
/**
 * Los ids con recepción cerrada. No depende de ningún otro filtro, así que las
 * lecturas EN VUELO del mismo tenant se comparten (la tabla, los KPIs y cada
 * faceta la piden a la vez); se borra al resolver, nunca sirve un dato viejo.
 */
const recepcionEnVuelo = new Map<string, Promise<string[]>>();
function idsRecepcionados(tenantId: string): Promise<string[]> {
  const previa = recepcionEnVuelo.get(tenantId);
  if (previa) return previa;
  const p = prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "WoodEntry"
    WHERE "tenantId" = ${tenantId} AND "deletedAt" IS NULL AND ${RECEPCION_CERRADA_SQL}
  `
    .then((rows) => rows.map((r) => r.id))
    .finally(() => recepcionEnVuelo.delete(tenantId));
  recepcionEnVuelo.set(tenantId, p);
  return p;
}

async function withRecepcionFilter(
  tenantId: string,
  filters: WoodEntryListFilters,
  where: Prisma.WoodEntryWhereInput,
): Promise<Prisma.WoodEntryWhereInput> {
  if (!filters.recepcion) return where;
  const ids = await idsRecepcionados(tenantId);
  /* Va por `AND` y no sobre `where.id`: el filtro de fuera de plazo ya usa `id`
     y pisarlo dejaría activo sólo uno de los dos — la tabla mostraría un
     conjunto que ningún filtro pidió. */
  const previas = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
  return {
    ...where,
    AND: [...previas, { id: filters.recepcion === "cerrada" ? { in: ids } : { notIn: ids } }],
  };
}

/**
 * Acota a las guías de la pastilla «plata de la guía» (ADR-437 §10; la tira
 * «guías sin pagar» salta acá con `pago=sin-pagar`).
 *
 *  · `servicio` es una columna: filtra directo, sin ir a la cuenta.
 *  · `sin-pagar`/`pagada` es el estado DERIVADO de `GuiaPlataDB.estadoPagoPorGuia`
 *    (single source con la tira de pendientes y el modal «¿Cuánto pagaste?»):
 *    nunca se recalcula acá. Una guía sin abono `madera` en la cuenta (sin
 *    costo anotado) no aparece en ningún lado — no es "pagada" ni "sin pagar".
 */
async function withPagoFilter(
  tenantId: string,
  filters: WoodEntryListFilters,
  where: Prisma.WoodEntryWhereInput,
): Promise<Prisma.WoodEntryWhereInput> {
  const pago = filters.cabecera?.pago;
  if (!pago) return where;
  const previas = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
  if (pago === "servicio") {
    return { ...where, AND: [...previas, { maderaDeTercero: true }] };
  }
  const estados = await GuiaPlataDB.estadoPagoPorGuia(tenantId);
  const gtfs = [...estados.entries()]
    .filter(([, estado]) => (pago === "pagada" ? estado === "pagada" : estado !== "pagada"))
    .map(([gtf]) => gtf);
  // Cero guías = `in: []`, que no trae nada (mismo criterio que `withGuiaFilter`).
  return { ...where, AND: [...previas, { gtfNumber: { in: gtfs }, maderaDeTercero: false }] };
}

/** ¿La guía entra en los topes de la cabecera? Un tope ausente = sin tope. */
export function guiaEnTopes(
  sumas: { volumeM3: number; pieces: number },
  c: Pick<WoodEntryFiltrosCabecera, "volMin" | "volMax" | "pzMin" | "pzMax">,
): boolean {
  const ok = (v: number, min?: number, max?: number) =>
    (min == null || v >= min) && (max == null || v <= max);
  return ok(sumas.volumeM3, c.volMin, c.volMax) && ok(sumas.pieces, c.pzMin, c.pzMax);
}

/**
 * Acota a las GUÍAS cuya suma cae en los topes de m³ / piezas (cabecera).
 *
 * La columna muestra el total de la guía, así que el filtro compara contra ESE
 * total y no contra cada asiento: con «m³ ≥ 10» una guía de 6 + 6 entra entera.
 * Se resuelven primero las claves (serie + número) con el resto del `where` ya
 * aplicado —la suma es la de lo que la tabla muestra— y se restringe por ellas.
 * Va por `AND` al final, igual que recepción: `list`, `listPorGuia` y `stats`
 * pasan por acá y no pueden describir conjuntos distintos. Cero guías = un
 * `where` que no trae nada (`id in []`), nunca «sin filtro».
 */
/** ¿Hay algún tope de m³ / piezas por guía en la cabecera? */
function tieneTopesDeGuia(c: WoodEntryFiltrosCabecera | undefined): boolean {
  return Boolean(c) && (c?.volMin != null || c?.volMax != null || c?.pzMin != null || c?.pzMax != null);
}

async function withGuiaFilter(
  filters: WoodEntryListFilters,
  where: Prisma.WoodEntryWhereInput,
): Promise<Prisma.WoodEntryWhereInput> {
  const c = filters.cabecera;
  if (!c || !tieneTopesDeGuia(c)) return where;
  const topes = { volMin: c.volMin, volMax: c.volMax, pzMin: c.pzMin, pzMax: c.pzMax };
  const ids = await idsDeGuiasEnTopes(where, topes);
  const previas = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
  /* Por `id` y no por `OR` de (serie, número): el `id IN` va por la clave
     primaria, y un OR de pares se repetía en cada una de las ~17 consultas de
     `stats()`. Cero guías = `in: []`, que no trae nada. */
  return { ...where, AND: [...previas, { id: { in: ids } }] };
}

/**
 * Las consultas EN VUELO de `idsDeGuiasEnTopes`, por `where` + topes.
 *
 * `listPorGuia` y `stats` corren en paralelo en el mismo pedido y, sin filtro
 * de estado, arman el MISMO `where`: sin esto la misma lectura salía dos veces.
 * Sólo se comparte lo que está en vuelo —se borra al resolver—, así que nunca
 * sirve un resultado viejo después de una escritura.
 */
const guiasEnVuelo = new Map<string, Promise<string[]>>();

/** Los asientos de las guías cuya SUMA (m³ / piezas) cae en los topes. Una sola lectura. */
function idsDeGuiasEnTopes(
  where: Prisma.WoodEntryWhereInput,
  topes: Pick<WoodEntryFiltrosCabecera, "volMin" | "volMax" | "pzMin" | "pzMax">,
): Promise<string[]> {
  const clave = JSON.stringify([where, topes]);
  const previa = guiasEnVuelo.get(clave);
  if (previa) return previa;
  const r4 = (n: number) => Math.round(n * 10000) / 10000;
  const p = prisma.woodEntry
    .findMany({ where, select: { id: true, gtfSeries: true, gtfNumber: true, volumeM3: true, pieces: true } })
    .then((filas) => {
      /* Se suma acá y no con un `groupBy`: el `groupBy` devuelve las claves y
         hacía falta OTRA pasada para llegar a los ids. */
      const porGuia = new Map<string, { ids: string[]; volumeM3: number; pieces: number }>();
      for (const f of filas) {
        const k = claveDeGuia(f);
        const g = porGuia.get(k) ?? { ids: [], volumeM3: 0, pieces: 0 };
        g.ids.push(f.id);
        g.volumeM3 += Number(f.volumeM3);
        g.pieces += f.pieces ?? 0;
        porGuia.set(k, g);
      }
      return [...porGuia.values()]
        .filter((g) => guiaEnTopes({ volumeM3: r4(g.volumeM3), pieces: g.pieces }, topes))
        .flatMap((g) => g.ids);
    })
    .finally(() => guiasEnVuelo.delete(clave));
  guiasEnVuelo.set(clave, p);
  return p;
}

/** La cadena completa de filtros del listado — una sola, para `list`, `listPorGuia` y `stats`. */
async function whereDelListado(
  tenantId: string,
  filters: WoodEntryListFilters,
): Promise<Prisma.WoodEntryWhereInput> {
  return withPagoFilter(
    tenantId,
    filters,
    await withGuiaFilter(
      filters,
      await withRecepcionFilter(
        tenantId,
        filters,
        await withLateFilter(tenantId, filters, buildListWhere(tenantId, filters)),
      ),
    ),
  );
}

/** Campos corregibles de un ingreso pendiente. Fuera quedan `status`,
 *  `validatedBy/At` y los costos: eso lo mueven acciones propias, no un form. */
export type WoodEntryUpdateInput = Partial<
  Pick<
    WoodEntryCreateInput,
    | "entryDate"
    | "docType"
    | "gtfNumber"
    | "gtfDate"
    | "fechaRecepcion"
    | "gtfSeries"
    | "serforNumeroRegistro"
    | "providerName"
    | "providerDocument"
    | "providerDocumentType"
    | "originType"
    | "originCode"
    | "originSourceNumber"
    | "ctpProductCode"
    | "originRegion"
    | "originDistrict"
    | "speciesCommonName"
    | "speciesScientificName"
    | "speciesCites"
    | "productType"
    | "unit"
    | "volumeM3"
    | "pieces"
    | "avgLengthM"
    | "avgDiameterCm"
    | "humidityPct"
    | "defectsNotes"
    | "notes"
    | "gtfDatos"
  >
>;

/** Campos que se narran en la auditoría de una corrección, con su etiqueta. */
const CAMPOS_AUDITABLES: [keyof WoodEntryUpdateInput, string][] = [
  ["entryDate", "fecha"],
  ["gtfNumber", "GTF"],
  ["gtfDate", "fecha GTF"],
  ["providerName", "proveedor"],
  ["originType", "origen"],
  ["originCode", "código de origen"],
  ["speciesCommonName", "especie"],
  ["speciesCites", "CITES"],
  ["productType", "producto"],
  ["volumeM3", "volumen"],
  ["pieces", "piezas"],
];

/** "volumen 5.2000 → 5.4000 · piezas 7 → 8" — el detalle que hace útil el rastro. */
function describirCambios(
  antes: Record<string, unknown>,
  despues: Record<string, unknown>,
): string {
  const texto = (v: unknown): string => {
    if (v == null) return "—";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v);
  };
  return CAMPOS_AUDITABLES.map(([campo, etiqueta]) => {
    const a = texto(antes[campo]);
    const b = texto(despues[campo]);
    return a === b ? null : `${etiqueta} ${a} → ${b}`;
  })
    .filter(Boolean)
    .join(" · ");
}

/** Valor presente en el período + su peso — alimenta un selector de filtro. */
export interface WoodEntryFacet {
  value: string;
  count: number;
  volumeM3: number;
}

/**
 * Un permiso del período (ADR-400): el código, y de quién vino.
 *
 * El proveedor y la resolución viajan con él porque el desplegable los muestra:
 * el operador se acuerda de «lo de Maderera X», no del número de contrato.
 */
export interface WoodEntryPermisoFacet extends WoodEntryFacet {
  proveedores: string[];
  resoluciones: string[];
}

export interface WoodEntryStats {
  totalCount: number;
  totalVolumeM3: number;
  totalPieces: number;
  speciesCount: number;
  citesCount: number;
  citesVolumeM3: number;
  /** Ingresos registrados fuera del plazo SERFOR (>2 días hábiles op→registro). */
  lateCount: number;
  /** Ingresos vigentes sin código de origen — sin eso no hay EUDR posible. */
  sinOrigenCount: number;
  /**
   * Ingresos vigentes cuya recepción NO está cerrada (ADR-339): la madera
   * figura en el libro pero nadie declaró haberla visto bajar del camión.
   *
   * Es distinto de `byStatus.pendiente`: validar es un acto administrativo que
   * se puede hacer en bloque desde el escritorio; recepcionar es mirar la pila.
   * Medido el 2026-09-15 en el tenant real: 21 de 24 guías sin recepcionar
   * dejaban 153 de 160 trozas (181 m³) fuera del alcance del cubicador.
   */
  sinRecepcionCount: number;
  /**
   * Ingresos vigentes sin costo cargado. No traba nada del libro —el
   * compliance no pide precios— pero es lo que deja al COGS sin base: lo que
   * salga de esa madera no puede mostrar margen.
   */
  sinCostoCount: number;
  /**
   * m³ vigentes sin costo cargado.
   *
   * Va junto al conteo porque el conteo SOLO no mueve a nadie: «3 ingresos sin
   * costo» suena a tres papeles; «3 ingresos · 32.93 m³ sin valorizar» es todo
   * el patio. Un aviso que subestima lo que está en juego se posterga para
   * siempre.
   */
  sinCostoM3: number;
  /**
   * Ingresos vigentes que tienen cargada su lista de trozas.
   *
   * Es la diferencia entre declarar 24 m³ y poder contarlos palo por palo, que
   * es como los cuenta un fiscalizador. Sin este número no hay forma de saber
   * qué parte del patio está registrada pieza por pieza.
   */
  conPiezasCount: number;
  /**
   * Ingresos vigentes SIN constancia del SNIFFS guardada (ADR-386).
   *
   * No dice «SERFOR no la tiene» —eso el libro no lo puede saber, el SNIFFS no
   * expone API— sino algo más honesto y igual de accionable: **este libro no
   * puede probar que SERFOR conoce esa guía**. Es la primera pregunta de una
   * fiscalización y hasta ahora sólo se contestaba abriendo los asientos de a
   * uno.
   */
  sinConstanciaCount: number;
  /** Ingresos vigentes CON costo, su volumen y lo que costaron (S/). */
  valorizadoCount: number;
  valorizadoM3: number;
  costoTotal: number;
  /** Trozas originales del período (sin pedazos de retrozado) y cuántas tienen volumen medido. */
  trozasCount: number;
  trozasConVolumen: number;
  trozasVolumeM3: number;
  /** m³ y asientos por día de ingreso — sólo los días que tuvieron. */
  serieDiaria: { fecha: string; volumeM3: number; count: number }[];
  /** Días hábiles de la operación al registro: promedio y el más lento (null sin ingresos). */
  registroDiasHabilesProm: number | null;
  registroDiasHabilesMax: number | null;
  byStatus: Record<WoodEntryStatus, number>;
  /**
   * Los estados presentes, con su peso — la faceta del autofiltro «Estado».
   * Excluye su propio filtro (como `species`/`providers`): elegido «pendiente»,
   * «validado» sigue en la lista para poder sumarlo.
   */
  statuses: WoodEntryFacet[];
  /** Especies / proveedores / productos presentes en el período (top 30 por volumen). */
  species: WoodEntryFacet[];
  providers: WoodEntryFacet[];
  products: WoodEntryFacet[];
  /** Los títulos habilitantes del período, con su proveedor y resolución. */
  permisos: WoodEntryPermisoFacet[];
}

/**
 * El código de planta es la marca FÍSICA que alguien pinta sobre la troza: dos
 * piezas con el mismo número son dos piezas que el patio no puede distinguir, y
 * un inventario que no distingue sus piezas no prueba nada ante OSINFOR.
 *
 * La garantía real es el índice único parcial `INDICE_CODIGO_PLANTA_UNICO`
 * (ADR-436, creado el 2026-09-26): dos clics simultáneos no pasan. Este guard
 * sigue porque dice CUÁL pieza ya tiene el número; el índice sólo dice «no».
 * Por eso compara igual que el índice —`upper(btrim(...))`, y SIN mirar el
 * estado del ingreso—: si el guard diera por libre un código que el índice
 * rechaza, el aviso previo mentiría y el choque llegaría sin nombre.
 *
 * `excluirIds` deja fuera a las propias filas que se están editando: al guardar
 * la misma troza con el mismo código, chocar consigo misma sería absurdo.
 */
async function guardCodigoPlantaUnico(
  tx: Prisma.TransactionClient,
  tenantId: string,
  codigos: (string | null | undefined)[],
  excluirIds: string[] = [],
): Promise<void> {
  const limpios = codigos.map((c) => (c ?? "").trim()).filter(Boolean);
  if (limpios.length === 0) return;
  /* El mismo candado que `marcarEtiquetadas` y `renumerarCodigosPlanta`
     (ADR-436): sin él, un alta y una tanda de etiquetas leen a la vez que el
     número está libre y lo ponen en dos palos. Se suelta con la transacción. */
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ctp-codigo-planta:${tenantId}`}))`;

  // 1 · Repetidos dentro del MISMO pedido. Rechazarlos con "ya existe" sería
  //     mentir: todavía no existe ninguno, vienen los dos en el mismo POST.
  const vistos = new Set<string>();
  const repetidos = new Set<string>();
  for (const c of limpios) {
    const k = c.toUpperCase();
    if (vistos.has(k)) repetidos.add(c);
    else vistos.add(k);
  }
  if (repetidos.size > 0) {
    throw new CtpInvariantError(
      `El código de planta ${[...repetidos].join(", ")} está puesto en más de una troza de esta misma lista. ` +
        "Cada pieza lleva su propio número: usa «Generar códigos» para renumerar.",
      "CODIGO_PLANTA_DUPLICADO",
      { codigos: [...repetidos] },
    );
  }

  // 2 · Repetidos contra lo que YA está en el libro. Va en SQL y no por Prisma
  //     porque la comparación tiene que ser insensible a mayúsculas ("13/a" y
  //     "13/A" son la misma marca sobre la misma madera) y `in` + `mode` no lo
  //     garantiza. Parametrizado: el código llega del cliente.
  //     Las piezas de ingresos ANULADOS cuentan: su fila sigue en la tabla y
  //     el índice único la mira. Desde 2026-09-26 anular/rechazar/borrar
  //     suelta los códigos (`soltarCodigosPlanta`), así que esto sólo pasa con
  //     una fila anterior a eso que la limpieza no alcanzó.
  const enUso = await tx.$queryRaw<
    { codigoPlanta: string; codificacion: string | null; gtfNumber: string; anulado: boolean }[]
  >`
    SELECT t."codigoPlanta", t."codificacion", e."gtfNumber",
           (e."deletedAt" IS NOT NULL OR e."status" IN ('anulado', 'rechazado')) AS anulado
    FROM "WoodEntryTroza" t
    JOIN "WoodEntry" e ON e."id" = t."woodEntryId"
    WHERE t."tenantId" = ${tenantId}
      AND UPPER(BTRIM(t."codigoPlanta")) = ANY(${[...vistos]})
      AND NOT (t."id" = ANY(${excluirIds.length > 0 ? excluirIds : [""]}))
    LIMIT 20
  `;
  if (enUso.length > 0) {
    const detalle = enUso
      .map(
        (t) =>
          `${t.codigoPlanta} (GTF ${t.gtfNumber}${t.codificacion ? `, troza ${t.codificacion}` : ""}` +
          `${t.anulado ? ", ingreso anulado" : ""})`,
      )
      .join("; ");
    throw new CtpInvariantError(
      `Ese código de planta ya está usado en el libro: ${detalle}. ` +
        "El código se pinta sobre la troza: dos piezas con el mismo número no se pueden distinguir en el patio.",
      "CODIGO_PLANTA_DUPLICADO",
      { codigos: enUso.map((t) => t.codigoPlanta) },
    );
  }
}

/**
 * El índice único parcial que garantiza el código de planta en la base
 * (ADR-436): `("tenantId", upper(btrim("codigoPlanta")))` donde hay código.
 * Vive sólo en `prisma/migrations/adr-436-codigo-planta-unico.sql` — Prisma no
 * sabe declarar un índice sobre expresión ni parcial.
 */
export const INDICE_CODIGO_PLANTA_UNICO = "WoodEntryTroza_tenant_codigoPlanta_unico";

/**
 * ¿Este error es el índice de arriba rechazando un código repetido?
 *
 * Se reconoce por el NOMBRE del índice y no por el código de Prisma a secas:
 * según la vía, el choque llega como `P2002` (createMany) o como `P2010` con el
 * 23505 del driver adentro (UPDATE crudo), y un P2002 de otra restricción no es
 * este problema. El nombre viaja en el mensaje de Postgres en los dos casos.
 */
export function esChoqueCodigoPlanta(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { message?: unknown; meta?: unknown; cause?: unknown };
  let texto = String(e.message ?? "");
  try {
    texto += ` ${JSON.stringify(e.meta ?? null)} ${String((e.cause as { message?: unknown } | undefined)?.message ?? "")}`;
  } catch {
    /* meta circular: con el mensaje alcanza */
  }
  return texto.includes(INDICE_CODIGO_PLANTA_UNICO);
}

/**
 * El guard ya avisa con nombre y apellido, pero entre su lectura y el INSERT
 * hay una ventana que sólo cierra el índice. Si el índice es el que frena, el
 * operador tiene que ver el mismo 422 «código repetido», no un 500 mudo.
 */
function traducirChoqueCodigoPlanta(err: unknown): never {
  if (esChoqueCodigoPlanta(err)) {
    throw new CtpInvariantError(
      "Ese código de planta ya está puesto en otra troza del libro. " +
        "El código se pinta sobre la troza: dos piezas con el mismo número no se pueden distinguir en el patio.",
      "CODIGO_PLANTA_DUPLICADO",
      { indice: INDICE_CODIGO_PLANTA_UNICO },
    );
  }
  throw err;
}

/** Una troza que soltó su código de planta: lo que tenía, para la auditoría. */
export interface CodigoSoltado {
  id: string;
  codigoPlanta: string;
  codificacion: string | null;
}

/**
 * Al ANULAR, RECHAZAR o BORRAR (soft) un ingreso, sus trozas sueltan el código
 * de planta (2026-09-26).
 *
 * El índice único `INDICE_CODIGO_PLANTA_UNICO` mira TODAS las filas, también
 * las de ingresos muertos: la troza anulada seguía ocupando el número, y el
 * camino que el propio libro indica —«anula los ingresos y vuelve a cargarla»—
 * chocaba al recargar la hoja de SERFOR con su «Código Planta». En `main`, 149
 * piezas de ingresos borrados retenían su número. La madera de un ingreso
 * muerto no está en el patio: su número no identifica ninguna pieza.
 *
 * Va DENTRO de la transacción del cambio de estado: o el ingreso muere y suelta
 * sus números, o no pasa nada. Lo que tenía cada troza queda en la auditoría
 * (`detalleCodigosSoltados`). No existe «restaurar» un ingreso: si algún día
 * existe, tiene que re-asignar desde ese renglón y avisar cuál quedó sin código.
 */
async function soltarCodigosPlanta(
  tx: Prisma.TransactionClient,
  tenantId: string,
  woodEntryIds: string[],
): Promise<CodigoSoltado[]> {
  if (woodEntryIds.length === 0) return [];
  const conCodigo = await tx.woodEntryTroza.findMany({
    where: { tenantId, woodEntryId: { in: woodEntryIds }, codigoPlanta: { not: null } },
    select: { id: true, codigoPlanta: true, codificacion: true },
    orderBy: { orden: "asc" },
  });
  const soltados = conCodigo
    .filter((t) => (t.codigoPlanta ?? "").trim() !== "")
    .map((t) => ({ id: t.id, codigoPlanta: t.codigoPlanta!.trim(), codificacion: t.codificacion }));
  if (soltados.length > 0) {
    await tx.woodEntryTroza.updateMany({
      where: { tenantId, id: { in: soltados.map((t) => t.id) } },
      data: { codigoPlanta: null },
    });
  }
  return soltados;
}

/** Una troza que tenía apartada un lote mixto y se soltó con su ingreso. */
interface ReservaSoltada {
  id: string;
  codigo: string | null;
  mixto: string;
}

/**
 * Anular, rechazar o borrar un ingreso SUELTA las trozas que tenía apartadas en
 * un lote mixto (ADR-441), igual que suelta sus códigos de planta: la madera de
 * un ingreso muerto no está en el patio, y dejarla en la pila la repartiría a
 * un lote de aserrío. Va DENTRO de la transacción del cambio de estado y ANTES
 * de `soltarCodigosPlanta` (para poder nombrar la pieza por su chapa).
 */
async function soltarReservasMixto(
  tx: Prisma.TransactionClient,
  tenantId: string,
  woodEntryIds: string[],
): Promise<ReservaSoltada[]> {
  if (woodEntryIds.length === 0) return [];
  const apartadas = await tx.woodEntryTroza.findMany({
    where: { tenantId, woodEntryId: { in: woodEntryIds }, loteMixtoId: { not: null } },
    select: { id: true, codigoPlanta: true, codificacion: true, loteMixto: { select: { code: true } } },
    orderBy: { orden: "asc" },
  });
  if (apartadas.length > 0) {
    await tx.woodEntryTroza.updateMany({
      where: { tenantId, id: { in: apartadas.map((t) => t.id) } },
      data: { loteMixtoId: null, reservadaMixtoEn: null },
    });
  }
  return apartadas.map((t) => ({
    id: t.id,
    codigo: t.codigoPlanta?.trim() || t.codificacion?.trim() || null,
    mixto: t.loteMixto?.code ?? "mixto",
  }));
}

/** Cuántas piezas se nombran en un renglón antes de resumir «y N más». */
const MAX_CODIGOS_EN_DETALLE = 60;

/**
 * El renglón de auditoría de los códigos soltados: antes → después por pieza,
 * para que se pueda contestar «¿qué número tenía esta troza?» sin la fila.
 */
export function detalleCodigosSoltados(gtf: string, motivo: string, soltados: readonly CodigoSoltado[]): string {
  const piezas = soltados
    .slice(0, MAX_CODIGOS_EN_DETALLE)
    .map((t) => `${t.codigoPlanta}${t.codificacion ? ` (troza ${t.codificacion})` : ""} → sin código`);
  const resto = soltados.length - piezas.length;
  return (
    `Liberó el código de planta de ${soltados.length} troza(s) de la GTF ${gtf} (${motivo}): ` +
    piezas.join("; ") +
    (resto > 0 ? `; y ${resto} más` : "")
  );
}

/**
 * ¿Esta línea (corrida que consumió una troza, despacho que la sacó) sigue
 * VIVA — activa y no anulada? Una troza que apunta a una línea muerta está
 * libre en la práctica, aunque la columna todavía la referencie. Compartido
 * entre T1 (`marcarTrozasConsumidas`) y T2 (`trozasNoDespachables`): las dos
 * caras del mismo hecho —consumida vs. despachada— no pueden divergir en qué
 * cuenta como "todavía tomada", o una troza queda contada dos veces en el
 * libro (auditoría 2026-08-25).
 */
export function vivaLinea(l: { status: string; deletedAt: Date | null } | null): boolean {
  return Boolean(l && l.status === "registrado" && !l.deletedAt);
}

/**
 * La plata que comparten los asientos VIVOS de una guía (ADR-437 §1-2): si es
 * de servicio, de quién es la madera, y a quién se le paga. Un asiento que
 * entra a la guía (alta o mudanza de guía) la hereda: si no, la guía queda
 * mezclada —una especie «de servicio» y otra «pide costo»— y el modal de la
 * plata ya no sabe qué es. `null` = la guía no tiene asientos vivos (nueva).
 * Si alguna hermana está marcada de servicio, gana esa (la marca se escribe
 * por guía entera; una mezcla vieja no debe contagiar «pide costo»).
 */
async function plataDeLaGuiaEnTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  gtfNumber: string,
  excluirId?: string,
): Promise<{ maderaDeTercero: boolean; duenoParteId: string | null; duenoNombre: string | null; proveedorParteId: string | null } | null> {
  const h = await tx.woodEntry.findFirst({
    where: {
      tenantId,
      gtfNumber,
      deletedAt: null,
      status: { notIn: ["anulado", "rechazado"] },
      ...(excluirId ? { id: { not: excluirId } } : {}),
    },
    orderBy: [{ maderaDeTercero: "desc" }, { entryDate: "asc" }, { id: "asc" }],
    select: { maderaDeTercero: true, duenoParteId: true, duenoNombre: true, proveedorParteId: true },
  });
  if (!h) return null;
  return h.maderaDeTercero
    ? { maderaDeTercero: true, duenoParteId: h.duenoParteId, duenoNombre: h.duenoNombre, proveedorParteId: null }
    : { maderaDeTercero: false, duenoParteId: null, duenoNombre: null, proveedorParteId: h.proveedorParteId };
}

/** El freno de «servicio no lleva costo» cuando un asiento CON costo entra a una guía de servicio. */
function costoEnGuiaDeServicio(gtfNumber: string, dueno: string | null): CtpInvariantError {
  return new CtpInvariantError(
    `La guía ${gtfNumber} es madera de servicio${dueno ? ` de ${dueno}` : ""}: no lleva costo. Quítale el costo a este asiento o la marca de servicio a la guía.`,
    "ESTADO_NO_EDITABLE",
    { motivo: "ES_MADERA_DE_SERVICIO", gtfNumber },
  );
}

/**
 * El permiso que manda la pantalla tiene que ser de ESTE negocio. `contratoId`
 * es una FK global: sin esto, un id de otro tenant quedaba aceptado y el
 * ingreso imputado a un contrato ajeno (hallazgo de la revisión de ADR-442,
 * 2026-09-27 — la guía guardada ya lo validaba; el alta, no).
 */
async function contratoDelTenant(tenantId: string, contratoId: string): Promise<string> {
  if (await ForestContratoDB.get(tenantId, contratoId)) return contratoId;
  throw new CtpInvariantError(
    "Ese permiso no está en tu lista de permisos. Elígelo de nuevo o deja que se deduzca del código del título.",
    "VALIDACION",
  );
}

export class WoodEntriesDB {
  /**
   * Crea un nuevo ingreso de madera al CTP.
   * Status default = `pendiente` (validación posterior).
   */
  static async create(tenantId: string, input: WoodEntryCreateInput) {
    /* El ingreso ya trae el código del permiso: si ese permiso es un contrato
       cargado, queda imputado solo (ADR-421). Se resuelve ACÁ, fuera de la
       transacción: una consulta a otra tabla adentro alarga el lock del folio
       sin ninguna razón. */
    const contratoDelCodigo = input.contratoId
      ? await contratoDelTenant(tenantId, input.contratoId)
      : await ForestContratoDB.idPorCodigo(tenantId, input.originCode);
    if (!tenantId) throw new Error("tenantId is required");
    if (!input.gtfNumber?.trim()) throw new Error("gtfNumber is required");
    if (!input.providerName?.trim()) throw new Error("providerName is required");
    if (!input.speciesCommonName?.trim()) throw new Error("speciesCommonName is required");
    if (!input.createdBy?.trim()) throw new Error("createdBy is required");
    // Defensa en profundidad además del Zod de la ruta (auditoría 2026-09-25,
    // ver `lib/storage-url.ts`): una foto sólo puede ser del storage de ESTE
    // tenant, nunca una URL externa ni la de otro negocio.
    try {
      exigirFotosPropias(tenantId, input.photos);
    } catch (e) {
      throw new CtpInvariantError(e instanceof Error ? e.message : String(e), "VALIDACION");
    }

    const volumeDecimal = new Prisma.Decimal(input.volumeM3);
    if (volumeDecimal.lte(0)) throw new Error("volumeM3 must be > 0");

    // El FK de Postgres NO impide apuntar a un Supplier de otro tenant — el
    // aislamiento de Buleje es app-level (ADR-134 D3, probado en el ensayo).
    if (input.supplierId) {
      const ok = await prisma.supplier.count({ where: { id: input.supplierId, tenantId } });
      if (ok === 0) throw new Error("supplierId no pertenece a este tenant");
    }
    if (input.costoTotal != null && Number(input.costoTotal) < 0) {
      throw new Error("costoTotal no puede ser negativo");
    }

    // Cierre de período (ADR-139): no se ingresa madera con fecha de un mes ya
    // cerrado (ni a mano ni por importación — no se backdatea a un acta cerrada).
    const cerradoWe = await ForestCtpCierreDB.closedPeriodOf(
      tenantId,
      input.entryDate ?? new Date(),
    );
    if (cerradoWe) {
      throw new CtpInvariantError(
        `El período ${cerradoWe.label} está cerrado: no se puede ingresar madera con fecha de un mes cerrado.`,
        "PERIODO_CERRADO",
        { periodKey: cerradoWe.periodKey },
      );
    }

    /* Fotos: lo ya guardado en ESTA guía (otra especie de la misma GTF) se
       conserva como está; lo nuevo necesita la firma del servidor y no puede
       ser evidencia de otra guía (2026-09-26). */
    const fotosFinales =
      input.photos && input.photos.length > 0
        ? await WoodEntriesDB.resolverFotosDeGuia(tenantId, input.gtfNumber.trim(), normalizarFotos(input.photos))
        : [];

    // El folio del libro (columna 1 del formato oficial) y el INSERT van en la
    /* La especie se escribe como la escribe esta planta (ADR-410): si el
       catálogo conoce la clave, manda su grafía y su binomio. Una guía que dice
       «TORNILLO» y un lote que dice «Tornillo» son la misma madera, y si entran
       escritas distinto el libro las cuenta como dos. Va antes de la
       transacción: es un KV cacheado. */
    const especie = await ForestEspeciesDB.resolverEspecie(tenantId, input.speciesCommonName);

    /* Las hermanas de la MISMA guía que aceptarían piezas por sí solas
       (pendientes, de un mes abierto): una troza de otra especie va a la fila de
       la suya (ADR-435). Antes de la tx, por lo mismo que la especie. */
    const hermanasQueReciben: FilaQueRecibe[] = [];
    if (input.trozas?.length) {
      const serie = (input.gtfSeries ?? "").trim();
      const pendientes = await prisma.woodEntry.findMany({
        where: { tenantId, deletedAt: null, status: "pendiente", gtfNumber: input.gtfNumber.trim() },
        select: { id: true, gtfSeries: true, speciesCommonName: true, speciesScientificName: true, entryDate: true },
      });
      for (const h of pendientes) {
        if ((h.gtfSeries ?? "").trim() !== serie) continue;
        if (await ForestCtpCierreDB.closedPeriodOf(tenantId, h.entryDate)) continue;
        hermanasQueReciben.push({ id: h.id, especie: h.speciesCommonName, cientifico: h.speciesScientificName, puedeRecibir: true });
      }
    }
    let acomodo: {
      aOtrasFilas: { woodEntryId: string; especie: string; trozas: number }[];
      fueraDeSuFila: { codigo: string | null; especie: string | null; nota: NotaDeColocacion }[];
      /** Iban a una fila hermana que ya las tenía (misma codificación): no entraron. */
      yaEstabanEnSuFila: { codigo: string | null; especie: string | null }[];
    } = { aOtrasFilas: [], fueraDeSuFila: [], yaEstabanEnSuFila: [] };

    // MISMA transacción: si se calcula fuera, dos ingresos simultáneos se llevan
    // el mismo número y el libro queda con folios repetidos — lo primero que
    // mira un fiscalizador. Mismo patrón que `lineNo` de ForestCtpEntry.
    let cuentaDeLaGuia: "sin_cuenta" | "actualizada" | "baja" = "sin_cuenta";
    const entry = await prisma.$transaction(async (tx) => {
      /* La plata de la guía (ADR-437): con la guía bloqueada —mismo lock que el
         modal de la plata—, el asiento nuevo hereda la marca de servicio y el
         dueño, o a quién se le paga, de sus hermanas vivas. Sin esto, una
         especie que se agrega a una guía de WASACO pedía costo (revisión 2026-09-26). */
      const gtfAlta = input.gtfNumber.trim();
      await ForestCuentaDB.bloquearGuiasEnTx(tx, tenantId, [gtfAlta]);
      const plataGuia = await plataDeLaGuiaEnTx(tx, tenantId, gtfAlta);
      if (plataGuia?.maderaDeTercero && input.costoTotal != null) throw costoEnGuiaDeServicio(gtfAlta, plataGuia.duenoNombre);
      const max = await tx.woodEntry.aggregate({
        where: { tenantId },
        _max: { libroNro: true },
      });
      const libroNro = (max._max.libroNro ?? 0) + 1;
      const creado = await tx.woodEntry.create({
        data: {
          tenantId,
          ...(plataGuia ?? {}),
          libroNro,
          entryDate: input.entryDate ?? new Date(),
          supplierId: input.supplierId ?? null,
          costoTotal: input.costoTotal != null ? new Prisma.Decimal(input.costoTotal) : null,
          moneda: input.moneda ?? "PEN",
          docType: input.docType?.trim() || "GTF",
          serforNumeroRegistro: input.serforNumeroRegistro?.trim() || null,
          serforGtf: input.serforGtf ? (input.serforGtf as Prisma.InputJsonValue) : Prisma.DbNull,
          gtfNumber: input.gtfNumber.trim(),
          gtfDate: input.gtfDate ?? null,
          fechaRecepcion: input.fechaRecepcion ?? null,
          gtfSeries: input.gtfSeries ?? null,
          providerName: input.providerName.trim(),
          providerDocument: input.providerDocument ?? null,
          providerDocumentType: input.providerDocumentType ?? null,
          originType: input.originType ?? "otro",
          originCode: input.originCode ?? null,
          contratoId: contratoDelCodigo,
          originSourceNumber: input.originSourceNumber?.trim() || null,
          ctpProductCode: input.ctpProductCode?.trim() || null,
          originRegion: input.originRegion ?? null,
          originDistrict: input.originDistrict ?? null,
          speciesCommonName: especie.nombre,
          speciesScientificName: input.speciesScientificName?.trim() || especie.cientifico,
          speciesCites: input.speciesCites ?? false,
          productType: input.productType ?? "rolliza",
          unit: input.unit?.trim() || "m3",
          presentacion: input.presentacion?.trim().toUpperCase() || null,
          volumeM3: volumeDecimal,
          pieces: input.pieces ?? 0,
          avgLengthM: input.avgLengthM != null ? new Prisma.Decimal(input.avgLengthM) : null,
          avgDiameterCm:
            input.avgDiameterCm != null ? new Prisma.Decimal(input.avgDiameterCm) : null,
          humidityPct: input.humidityPct != null ? new Prisma.Decimal(input.humidityPct) : null,
          defectsNotes: input.defectsNotes ?? null,
          notes: input.notes ?? null,
          /* Siempre objetos: las nuevas, tal como las firmó el servidor al subirlas. */
          photos: fotosFinales.length > 0 ? (fotosFinales as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          gtfDatos: input.gtfDatos ? (input.gtfDatos as Prisma.InputJsonValue) : Prisma.DbNull,
          status: "pendiente",
          createdBy: input.createdBy,
        },
      });

      // La lista de trozas viaja con su guía y en la misma tx (ADR-312/320): si
      // falla, no queda un ingreso al que después haya que pegarle las piezas.
      if (input.trozas?.length) {
        /* Cada troza a la fila de SU especie (ADR-435); lo que no tiene fila
           de su especie se queda en ésta, como antes, y se dice. `orden` es la
           posición en la lista de la GTF y viaja igual: reimprimir la guía
           junta las filas y sale en el orden del papel. */
        const colocadas = colocarAlCargar(
          input.trozas,
          [
            { id: creado.id, especie: creado.speciesCommonName, cientifico: creado.speciesScientificName, puedeRecibir: true },
            ...hermanasQueReciben,
          ],
          creado.id,
        );
        /* Una pieza que va a una fila hermana se compara por codificación
           contra lo que esa fila YA tiene: la lista es de la guía, y cargarla
           dos veces duplicaría madera. La repetida no entra y se dice. */
        const codigo = (c: string | null | undefined) => {
          const k = (c ?? "").trim().toUpperCase();
          return k === "-" ? "" : k;
        };
        const hermanasUsadas = [...new Set(colocadas.map((c) => c.filaId).filter((f) => f !== creado.id))];
        const yaEnHermana = new Set(
          hermanasUsadas.length === 0
            ? []
            : (
                await tx.woodEntryTroza.findMany({
                  where: { tenantId, woodEntryId: { in: hermanasUsadas } },
                  select: { woodEntryId: true, codificacion: true },
                })
              )
                .filter((t) => codigo(t.codificacion))
                .map((t) => `${t.woodEntryId}|${codigo(t.codificacion)}`),
        );
        const repetidas = colocadas.filter(
          (c) => c.filaId !== creado.id && codigo(c.troza.codificacion) && yaEnHermana.has(`${c.filaId}|${codigo(c.troza.codificacion)}`),
        );
        const saltear = new Set(repetidas.map((c) => c.troza));
        // El código de planta es único en el centro (ADR-336). Se valida DENTRO
        // de la tx: fuera, dos tablets numerando a la vez pasan las dos. Sobre
        // lo que de verdad entra: la repetida que se saltea ya tiene el suyo.
        await guardCodigoPlantaUnico(
          tx,
          tenantId,
          input.trozas.filter((t) => !saltear.has(t)).map((t) => t.codigoPlanta),
        );
        const filaDe = new Map(colocadas.map((c) => [c.troza, c.filaId]));
        const otras = new Map<string, number>();
        for (const c of colocadas) {
          if (c.filaId !== creado.id && !saltear.has(c.troza)) otras.set(c.filaId, (otras.get(c.filaId) ?? 0) + 1);
        }
        acomodo = {
          yaEstabanEnSuFila: repetidas.map((c) => ({
            codigo: c.troza.codificacion,
            especie: hermanasQueReciben.find((h) => h.id === c.filaId)?.especie ?? c.troza.especieComun,
          })),
          aOtrasFilas: [...otras].map(([woodEntryId, trozas]) => ({
            woodEntryId,
            especie: hermanasQueReciben.find((h) => h.id === woodEntryId)?.especie ?? "",
            trozas,
          })),
          fueraDeSuFila: colocadas.flatMap((c) =>
            c.nota ? [{ codigo: c.troza.codificacion, especie: c.troza.especieComun, nota: c.nota }] : [],
          ),
        };
        await tx.woodEntryTroza.createMany({
          data: input.trozas.filter((t) => !saltear.has(t)).map((t) => ({
            tenantId,
            woodEntryId: filaDe.get(t) ?? creado.id,
            orden: t.orden,
            codificacion: t.codificacion,
            /* La troza se escribe como la cabecera: la especie del ingreso ya
               pasó por el catálogo (ADR-410) y si la pieza guardaba el texto
               crudo, la MISMA guía quedaba escrita de dos formas —y el patio la
               contaba como dos maderas— (auditoría 2026-09-11). Sólo se canoniza
               cuando es la especie del ingreso: una troza de otra especie
               conserva la suya, que es un dato del documento. */
            especieComun: mismaEspecie(t.especieComun, input.speciesCommonName)
              ? especie.nombre
              : t.especieComun,
            especieCientifica:
              t.especieCientifica ??
              (mismaEspecie(t.especieComun, input.speciesCommonName) ? especie.cientifico : null),
            dimensiones: t.dimensiones,
            largoM: t.largoM != null ? new Prisma.Decimal(t.largoM) : null,
            diametroCm: t.diametroCm != null ? new Prisma.Decimal(t.diametroCm) : null,
            d1Cm: t.d1Cm != null ? new Prisma.Decimal(t.d1Cm) : null,
            d2Cm: t.d2Cm != null ? new Prisma.Decimal(t.d2Cm) : null,
            cantidad: t.cantidad,
            volumenM3: t.volumenM3 != null ? new Prisma.Decimal(t.volumenM3) : null,
            codigoPlanta: t.codigoPlanta ?? null,
            parcela: t.parcela ?? null,
            // Una pieza que no llegó no puede tener el día en que llegó.
            fechaRecepcion: t.noRecepcionada
              ? null
              : (t.fechaRecepcion ?? input.fechaRecepcion ?? null),
            noRecepcionada: t.noRecepcionada ?? false,
          })),
        });
      }
      /* Con costo en una guía ya anotada, el abono `madera` pasa a valer la suma. */
      if (creado.costoTotal != null) {
        cuentaDeLaGuia = await ForestCuentaDB.resincronizarMaderaDeGuiaEnTx(tx, tenantId, gtfAlta);
      }
      return creado;
    }).catch(traducirChoqueCodigoPlanta);
    if (cuentaDeLaGuia !== "sin_cuenta") {
      WoodEntriesDB.auditarCuentaDeGuia(tenantId, entry.gtfNumber, cuentaDeLaGuia, "agregó un asiento con costo", input.createdBy);
    }

    auditCtp({
      tenantId,
      action: "ctp_ingreso_create",
      entity: "WoodEntry",
      entityId: entry.id,
      detail:
        `Registró el ingreso ${entry.gtfNumber} · ${entry.speciesCommonName} · ${m3(Number(entry.volumeM3))} · ${entry.providerName}` +
        (estaFueraDePlazo(entry) ? ` · FUERA DE PLAZO (${PLAZO_REGISTRO_DIAS} días)` : "") +
        acomodo.aOtrasFilas.map((f) => ` · ${f.trozas} troza(s) a la fila de ${f.especie} de la misma guía`).join("") +
        (acomodo.yaEstabanEnSuFila.length > 0
          ? ` · ${acomodo.yaEstabanEnSuFila.length} troza(s) ya estaban en la fila de su especie: no se duplicaron`
          : ""),
      user: input.createdBy,
    });
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {}
    /* `acomodo` dice a qué otra fila fue cada troza y cuáles quedaron fuera de
       la suya (ADR-435): el importador lo muestra en su resultado. */
    return { ...entry, acomodo };
  }

  /**
   * Registra una GTF de SERFOR completa: **un ingreso por especie declarada**,
   * con su lista de trozas, todo en UNA transacción (ADR-312).
   *
   * Media guía registrada es peor que ninguna: deja un saldo que no corresponde
   * a ningún documento y obliga a corregir a mano un libro que ya tiene folio.
   * Por eso entra entera o no entra.
   *
   * `lineas` ya viene repartido por `repartirGtfEnIngresos` a partir de la ficha
   * que el SERVIDOR le pidió a SERFOR — nunca de la que mandó el navegador.
   */
  static async createDesdeGtfSerfor(tenantId: string, input: WoodEntryDesdeGtfInput) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!input.gtfNumber?.trim()) throw new Error("gtfNumber is required");
    if (!input.providerName?.trim()) throw new Error("providerName is required");
    if (!input.createdBy?.trim()) throw new Error("createdBy is required");
    if (input.lineas.length === 0) throw new Error("La guía no tiene líneas para registrar");

    const fecha = input.entryDate ?? new Date();

    // Cierre de período (ADR-139): mismo guard que el alta manual. Se chequea una
    // sola vez, antes de abrir la tx — las N líneas comparten fecha.
    const cerrado = await ForestCtpCierreDB.closedPeriodOf(tenantId, fecha);
    if (cerrado) {
      throw new CtpInvariantError(
        `El período ${cerrado.label} está cerrado: no se puede ingresar madera con fecha de un mes cerrado.`,
        "PERIODO_CERRADO",
        { periodKey: cerrado.periodKey },
      );
    }

    // Una guía no se registra dos veces. El chequeo va acá y no en un índice
    // único porque la misma GTF SÍ puede tener varias líneas (una por especie):
    // lo que no puede es entrar dos veces entera.
    // ⚠️ Los ingresos ANULADOS no bloquean: anular y volver a cargar es
    // justamente el camino que el ADR-312 prevé para corregir una guía mal
    // registrada. Anular una línea pone `status` y NO hace soft-delete, así
    // que filtrar sólo por `deletedAt` dejaba la guía trabada para siempre.
    const yaEsta = await prisma.woodEntry.count({
      where: {
        tenantId,
        deletedAt: null,
        status: { notIn: ["anulado", "rechazado"] },
        gtfNumber: input.gtfNumber.trim(),
        ...(input.serforNumeroRegistro ? { serforNumeroRegistro: input.serforNumeroRegistro } : {}),
      },
    });
    if (yaEsta > 0) {
      throw new CtpInvariantError(
        `La guía ${input.gtfNumber.trim()} ya está registrada en el libro (${yaEsta} ingreso(s)). Si hay que corregirla, anula los ingresos y vuelve a cargarla.`,
        "GTF_DUPLICADA",
        { gtfNumber: input.gtfNumber.trim() },
      );
    }

    const contratoDeLasLineas = input.contratoId
      ? await contratoDelTenant(tenantId, input.contratoId)
      : await ForestContratoDB.idPorCodigo(tenantId, input.originCode);

    const creados = await prisma.$transaction(async (tx) => {
      // El folio se lee UNA vez y avanza en memoria: leerlo por línea dentro de
      // la misma tx devolvería el mismo máximo y las líneas saldrían con folios
      // repetidos, que es lo primero que mira un fiscalizador.
      const max = await tx.woodEntry.aggregate({ where: { tenantId }, _max: { libroNro: true } });
      let libroNro = (max._max.libroNro ?? 0) + 1;

      const salida = [];
      for (const linea of input.lineas) {
        const entry = await tx.woodEntry.create({
          data: {
            tenantId,
            libroNro: libroNro++,
            entryDate: fecha,
            docType: input.docType?.trim() || "GTF",
            serforNumeroRegistro: input.serforNumeroRegistro?.trim() || null,
            serforGtf: input.serforGtf ? (input.serforGtf as Prisma.InputJsonValue) : Prisma.DbNull,
            gtfDatos: input.gtfDatos ? (input.gtfDatos as Prisma.InputJsonValue) : Prisma.DbNull,
            gtfNumber: input.gtfNumber.trim(),
            gtfDate: input.gtfDate ?? null,
            gtfSeries: input.gtfSeries ?? null,
            providerName: input.providerName.trim(),
            providerDocument: input.providerDocument ?? null,
            providerDocumentType: input.providerDocumentType ?? null,
            originType: input.originType ?? "otro",
            originCode: input.originCode ?? null,
            contratoId: contratoDeLasLineas,
            originSourceNumber: input.originSourceNumber ?? null,
            ctpProductCode: input.ctpProductCode ?? null,
            originRegion: input.originRegion ?? null,
            originDistrict: input.originDistrict ?? null,
            speciesCommonName: linea.especieComun,
            speciesScientificName: linea.especieCientifica,
            speciesCites: linea.cites ?? false,
            productType: linea.productType ?? "rolliza",
            unit: linea.unit ?? "m3",
            presentacion: linea.presentacion?.trim().toUpperCase() || null,
            volumeM3: new Prisma.Decimal(linea.volumenM3),
            pieces: linea.piezas ?? 0,
            humidityPct: input.humidityPct != null ? new Prisma.Decimal(input.humidityPct) : null,
            notes: input.notes ?? null,
            status: "pendiente",
            createdBy: input.createdBy,
          },
        });

        if (linea.trozas.length > 0) {
          await tx.woodEntryTroza.createMany({
            data: linea.trozas.map((t) => ({
              tenantId,
              woodEntryId: entry.id,
              orden: t.orden,
              codificacion: t.codificacion,
              especieComun: t.especieComun,
              especieCientifica: t.especieCientifica,
              dimensiones: t.dimensiones,
              largoM: t.largoM != null ? new Prisma.Decimal(t.largoM) : null,
              diametroCm: t.diametroCm != null ? new Prisma.Decimal(t.diametroCm) : null,
              d1Cm: t.d1Cm != null ? new Prisma.Decimal(t.d1Cm) : null,
              d2Cm: t.d2Cm != null ? new Prisma.Decimal(t.d2Cm) : null,
              cantidad: t.cantidad,
              volumenM3: t.volumenM3 != null ? new Prisma.Decimal(t.volumenM3) : null,
            })),
          });
        }
        salida.push({ entry, trozas: linea.trozas.length });
      }
      return salida;
    });

    const volumenTotal = creados.reduce((a, c) => a + Number(c.entry.volumeM3), 0);
    auditCtp({
      tenantId,
      action: "ctp_ingreso_create",
      entity: "WoodEntry",
      entityId: creados[0]?.entry.id ?? "",
      detail:
        `Registró la guía ${input.gtfNumber.trim()} desde SERFOR: ${creados.length} ingreso(s) ` +
        `(${creados.map((c) => c.entry.speciesCommonName).join(", ")}) · ${m3(volumenTotal)} · ` +
        `${creados.reduce((a, c) => a + c.trozas, 0)} troza(s)` +
        (creados[0] && estaFueraDePlazo(creados[0].entry)
          ? ` · FUERA DE PLAZO (${PLAZO_REGISTRO_DIAS} días)`
          : ""),
      user: input.createdBy,
    });
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {}
    return creados.map((c) => c.entry);
  }

  /**
   * Busca trozas por su codificación (ADR-312). Es lo que cruza un fiscalizador
   * de OSINFOR contra el POA del título habilitante: dado un código de troza,
   * de qué GTF entró y a qué ingreso pertenece.
   */
  static async buscarTrozas(tenantId: string, codificacion: string, limite = 50) {
    if (!tenantId) throw new Error("tenantId is required");
    const q = codificacion.trim();
    if (!q) return [];
    return prisma.woodEntryTroza.findMany({
      where: {
        tenantId,
        // Por el código del bosque O por el que marcó el patio: en planta se
        // pregunta "traeme la 118", que es el `codigoPlanta`, no la codificación
        // de SERFOR. Buscar sólo por una de las dos deja media planta sin buscar.
        OR: [
          { codificacion: { contains: q, mode: "insensitive" } },
          { codigoPlanta: { contains: q, mode: "insensitive" } },
        ],
        // Una troza de un ingreso anulado no cuenta como trazabilidad: se filtra
        // acá y no en el cliente, para que ninguna vista la muestre por olvido.
        // Hacen falta las DOS condiciones — anular pone `status`, no borra.
        entry: { deletedAt: null, status: { notIn: ["anulado", "rechazado"] } },
      },
      orderBy: [{ createdAt: "desc" }, { orden: "asc" }],
      take: Math.min(Math.max(limite, 1), 200),
      include: {
        entry: {
          select: {
            id: true,
            libroNro: true,
            gtfNumber: true,
            serforNumeroRegistro: true,
            entryDate: true,
            providerName: true,
            speciesCommonName: true,
            status: true,
            originCode: true,
            originRegion: true,
            originDistrict: true,
          },
        },
        // Lo mismo que trae `trozasDelPatio`, y por la misma razón: quien busca
        // una pieza necesita saber si se puede usar. Hace falta el ESTADO de la
        // corrida, no el id pelado — una corrida anulada devolvió la madera al
        // patio y un id que apunta a algo muerto no bloquea nada (ADR-326 §6).
        consumidaEn: { select: { id: true, status: true, deletedAt: true } },
        // El despacho que se la llevó SIN ASERRAR (ADR-363). Con su estado, por
        // lo mismo que la corrida: un despacho anulado devuelve la troza al
        // patio, y sin mirarlo la pieza quedaría bloqueada para siempre.
        despachadaEn: { select: { id: true, status: true, deletedAt: true } },
        loteAserrio: { select: { id: true, code: true, status: true } },
        /* El lote MIXTO donde está apartada (ADR-441), con su estado: una de
           las TRES lecturas de la troza — las tres dicen lo mismo. */
        loteMixto: { select: SELECT_LOTE_MIXTO },
        _count: { select: { retrozos: true } },
      },
    });
  }

  /**
   * Cierra la recepción física de las trozas de una guía (ADR-325).
   *
   * Guarda por pieza el código que el CTP le marca, la parcela de corta del POA
   * y si llegó o no. **No borra las que no llegaron ni toca `volumeM3` del
   * ingreso**: el volumen manda en los saldos (I2) y cambiarlo solo movería
   * consumos ya atribuidos. La diferencia se informa y la corrige el operador.
   *
   * Se valida que TODAS las trozas sean del mismo ingreso y del tenant antes de
   * escribir: un id colado de otra guía escribiría cross-tenant.
   */
  static async actualizarRecepcion(
    tenantId: string,
    woodEntryId: string,
    cambios: CambioRecepcion[],
    usuario = "unknown",
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!woodEntryId) throw new Error("woodEntryId is required");
    if (cambios.length === 0) return { actualizadas: 0 };

    return prisma.$transaction(async (tx) => {
      const entry = await tx.woodEntry.findFirst({
        where: { id: woodEntryId, tenantId, deletedAt: null },
        select: { id: true, gtfNumber: true, status: true, entryDate: true },
      });
      if (!entry) {
        throw new CtpInvariantError("Ese ingreso no existe en este tenant.", "TENANT_MISMATCH", {
          woodEntryId,
        });
      }
      if (entry.status === "anulado" || entry.status === "rechazado") {
        throw new CtpInvariantError(
          "El ingreso está anulado o rechazado: no se puede tocar su recepción.",
          "ESTADO_NO_EDITABLE",
          { woodEntryId },
        );
      }
      // Cierre de período (ADR-139): la recepción es parte del acta. Cambiar qué
      // trozas llegaron en un mes ya presentado altera un libro entregado a la
      // autoridad — para eso está reabrir, que deja rastro de quién y por qué.
      const cerrado = await ForestCtpCierreDB.closedPeriodOf(tenantId, entry.entryDate);
      if (cerrado) {
        throw new CtpInvariantError(
          `El período ${cerrado.label} está cerrado: no se puede cambiar la recepción de una guía de un mes cerrado. Reabre el período para corregir.`,
          "PERIODO_CERRADO",
          { periodKey: cerrado.periodKey },
        );
      }

      const ids = [...new Set(cambios.map((c) => c.id))];
      const propias = await tx.woodEntryTroza.findMany({
        where: { id: { in: ids }, tenantId, woodEntryId },
        select: {
          id: true,
          codificacion: true,
          codigoPlanta: true,
          noRecepcionada: true,
          consumidaEnId: true,
          // El ESTADO de la corrida, no sólo el id: si se anuló, la troza está
          // libre y marcarla "no llegó" no contradice nada. Mismo criterio que
          // `marcarTrozasConsumidas` — bloquear por un id que apunta a una
          // corrida muerta fue el primer bug de esta serie.
          consumidaEn: { select: { status: true, deletedAt: true } },
        },
      });
      if (propias.length !== ids.length) {
        throw new CtpInvariantError(
          "Alguna de esas trozas no pertenece a este ingreso.",
          "TENANT_MISMATCH",
          { woodEntryId, pedidas: ids.length, encontradas: propias.length },
        );
      }
      const previaPorId = new Map(propias.map((t) => [t.id, t]));

      // Una troza NO PUEDE haberse aserrado y no haber llegado nunca.
      //
      // El libro quedaba declarando las dos cosas a la vez —`noRecepcionada` y
      // `consumidaEnId` poblados— y eso es consumir madera que no existe, el
      // mismo patrón que I2 previene del lado del volumen. Se rechaza indicando
      // el camino: primero se saca de la corrida (auditoría 2026-08-01).
      const contradicen = cambios
        .filter((c) => c.noRecepcionada)
        .map((c) => previaPorId.get(c.id))
        .filter((t): t is (typeof propias)[number] =>
          Boolean(
            t?.consumidaEnId &&
            t.consumidaEn &&
            t.consumidaEn.status === "registrado" &&
            !t.consumidaEn.deletedAt,
          ),
        );
      if (contradicen.length > 0) {
        throw new CtpInvariantError(
          `No se puede marcar como no recibida${contradicen.length === 1 ? "" : "s"} ` +
            `${contradicen.map((t) => t.codificacion ?? t.id).join(", ")}: ya entró a una corrida de producción. ` +
            "Sácala primero del consumo de esa corrida.",
          "ESTADO_NO_EDITABLE",
          { trozas: contradicen.map((t) => t.id) },
        );
      }

      // El código de planta sigue siendo único después de editar (ADR-336). Se
      // excluyen SÓLO las trozas que mandan código: si guarda el mismo que ya
      // tenía chocaría consigo misma, y si lo cambia, el viejo se suelta abajo.
      // Una troza del pedido que no toca su código lo sigue ocupando: esa sí cuenta.
      await guardCodigoPlantaUnico(
        tx,
        tenantId,
        cambios
          .filter((c) => c.codigoPlanta !== undefined && !c.noRecepcionada)
          .map((c) => c.codigoPlanta),
        cambios.filter((c) => c.codigoPlanta !== undefined).map((c) => c.id),
      );

      const limpiar = (v: string | null | undefined) => (v ?? "").trim() || null;

      // Intercambiar números (101↔102) choca con el índice único si se escribe
      // de una: Postgres chequea cada fila al actualizarla, y la 101 todavía
      // está en la otra troza (23505, verificado 2026-09-26). Primero se
      // SUELTAN los códigos que cambian y después se escriben los nuevos, en
      // la misma transacción: nadie ve el intermedio sin código.
      const clave = (v: string | null | undefined) => (v ?? "").trim().toUpperCase();
      const cambiosDeCodigo = cambios
        .filter((c) => c.codigoPlanta !== undefined && clave(c.codigoPlanta) !== clave(previaPorId.get(c.id)?.codigoPlanta))
        .map((c) => ({
          id: c.id,
          antes: (previaPorId.get(c.id)?.codigoPlanta ?? "").trim() || null,
          despues: limpiar(c.codigoPlanta),
          codificacion: previaPorId.get(c.id)?.codificacion ?? null,
        }));
      if (cambiosDeCodigo.length > 0) {
        await tx.woodEntryTroza.updateMany({
          where: { tenantId, woodEntryId, id: { in: cambiosDeCodigo.map((c) => c.id) } },
          data: { codigoPlanta: null },
        });
      }

      // UNA query para las N trozas, no un UPDATE por fila.
      //
      // Recibir una guía de SERFOR son decenas de piezas (el tope del endpoint
      // es 500). Con un round-trip por troza —a ~30 ms de latencia contra
      // Supabase— la transacción se acercaba al timeout con los locks abiertos,
      // y el operador perdía la recepción entera a la mitad.
      //
      // El `set_*` de cada columna distingue "no lo mandó" de "lo mandó vacío":
      // sin eso, no tocar el código de planta lo borraría.
      // Los `::text` / `::boolean` NO son decoración: dentro de un VALUES,
      // Postgres no puede inferir el tipo de un parámetro y los toma todos como
      // `text` — el CASE/WHEN entonces revienta con "must be type boolean".
      const filas = cambios.map(
        (c) => Prisma.sql`(
          ${c.id}::text,
          ${limpiar(c.codigoPlanta)}::text, ${c.codigoPlanta !== undefined}::boolean,
          ${limpiar(c.parcela)}::text, ${c.parcela !== undefined}::boolean,
          ${Boolean(c.noRecepcionada)}::boolean, ${c.noRecepcionada !== undefined}::boolean,
          ${limpiar(c.recepcionObs)}::text, ${c.recepcionObs !== undefined}::boolean,
          ${c.fechaRecepcion ?? null}::timestamp, ${c.fechaRecepcion !== undefined}::boolean
        )`,
      );
      await tx.$executeRaw`
        UPDATE "WoodEntryTroza" AS t SET
          "codigoPlanta"   = CASE WHEN v.set_cp  THEN v.cp  ELSE t."codigoPlanta"   END,
          "parcela"        = CASE WHEN v.set_pa  THEN v.pa  ELSE t."parcela"        END,
          "noRecepcionada" = CASE WHEN v.set_nr  THEN v.nr  ELSE t."noRecepcionada" END,
          "recepcionObs"   = CASE WHEN v.set_obs THEN v.obs ELSE t."recepcionObs"   END,
          -- Marcarla "no llegó" le borra la fecha: una pieza que no bajó del
          -- camión no puede declarar el día en que bajó.
          "fechaRecepcion" = CASE
            WHEN (CASE WHEN v.set_nr THEN v.nr ELSE t."noRecepcionada" END) THEN NULL
            WHEN v.set_fr THEN v.fr
            ELSE t."fechaRecepcion" END
        FROM (VALUES ${Prisma.join(filas)})
          AS v(id, cp, set_cp, pa, set_pa, nr, set_nr, obs, set_obs, fr, set_fr)
        WHERE t."id" = v.id AND t."tenantId" = ${tenantId}
      `;

      // El detalle narra el hecho: cuáles se marcaron como no llegadas es lo que
      // un fiscalizador va a querer cruzar contra el conteo de la pila.
      const faltantes = cambios
        .filter((c) => c.noRecepcionada && !previaPorId.get(c.id)?.noRecepcionada)
        .map((c) => previaPorId.get(c.id)?.codificacion ?? c.id);
      auditCtp({
        tenantId,
        action: "ctp_troza_recepcion",
        entity: "WoodEntryTroza",
        entityId: woodEntryId,
        detail:
          `Actualizó la recepción de ${cambios.length} troza(s) de la GTF ${entry.gtfNumber}` +
          (faltantes.length > 0 ? ` · marcó como NO recibidas: ${faltantes.join(", ")}` : "") +
          /* El número pintado es lo que identifica la pieza: su cambio se narra
             con el antes y el después, no como «actualizó». */
          (cambiosDeCodigo.length > 0
            ? ` · código de planta: ${cambiosDeCodigo
                .slice(0, 60)
                .map((c) => `${c.codificacion ?? c.id} ${c.antes ?? "sin código"} → ${c.despues ?? "sin código"}`)
                .join(", ")}${cambiosDeCodigo.length > 60 ? ` y ${cambiosDeCodigo.length - 60} más` : ""}`
            : ""),
        user: usuario,
      });
      try {
        invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
      } catch {}

      return { actualizadas: cambios.length };
    }).catch(traducirChoqueCodigoPlanta);
  }

  /**
   * Las trozas que están en el patio, listas para entrar a la sierra (ADR-326).
   *
   * Trae TODAS —también las bloqueadas— porque el operador tiene que ver por qué
   * una pieza que él sabe que está ahí no se puede elegir. El motivo lo decide
   * `motivoBloqueo()` en el cliente, con la misma regla que valida el servidor.
   */
  /**
   * Cuánto se consumió ya de cada ingreso (ADR-353).
   *
   * Es el mismo número que mira I2 al guardar: `Σ ForestCtpConsumo` de las
   * corridas **vivas**. Se expone para que el picker pueda avisar ANTES de armar
   * el acta —«de esta guía sólo quedan 4.16 m³»— en vez de dejar que el operador
   * elija seis trozas y el servidor le diga que no al final.
   */
  static async consumidoPorIngreso(tenantId: string, ids: string[]): Promise<Map<string, number>> {
    const mapa = new Map<string, number>();
    if (!tenantId || ids.length === 0) return mapa;
    const filas = await prisma.forestCtpConsumo.groupBy({
      by: ["woodEntryId"],
      where: {
        tenantId,
        woodEntryId: { in: [...new Set(ids)] },
        /* Una corrida anulada NO consume: su madera volvió al patio. Mismo
           predicado que usa la invariante. */
        ctpEntry: { deletedAt: null, status: "registrado" },
      },
      _sum: { volumeM3: true },
    });
    for (const f of filas) mapa.set(f.woodEntryId, Number(f._sum.volumeM3 ?? 0));
    return mapa;
  }

  /**
   * El patio, pieza por pieza.
   *
   * ⚠️ Viene ACOTADO, y eso importa: un aserradero que pasa el tope veía menos
   * madera de la que tiene **sin ningún aviso** — el panel del lote listaba las
   * piezas que entraron en el corte y las otras simplemente no existían para la
   * pantalla. Quien llame tiene que poder decir «hay N y estás viendo M», por eso
   * el conteo real va aparte (`contarTrozasDelPatio`).
   *
   * `loteId` acota al lote: un lote tiene decenas de piezas, así que pedirlo
   * scopeado devuelve SIEMPRE la lista completa, sin depender del tope.
   *
   * `contratoId` es «Solo este permiso» (ADR-421/431): el vínculo interno de la
   * GUÍA (`WoodEntry.contratoId`, indexado con `tenantId`), no el texto del
   * permiso. `tenantId` va en la raíz del `where`, así que un id de contrato de
   * otro negocio no trae nada. Se combina con `loteId` (AND).
   */
  static async trozasDelPatio(
    tenantId: string,
    opts: { limite?: number; loteId?: string; contratoId?: string; ids?: string[] } = {},
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.woodEntryTroza.findMany({
      where: WoodEntriesDB.wherePatio(tenantId, opts),
      orderBy: [{ createdAt: "desc" }, { orden: "asc" }],
      /* 5000 y no 1000: es el máximo que la consulta ya admitía, y el default
         viejo dejaba fuera cuatro quintos de lo que el sistema podía traer. */
      take: Math.min(Math.max(opts.limite ?? 5000, 1), 5000),
      include: {
        /* Del ingreso hace falta también su ESTADO de recepción (ADR-339): en
           Consumos se ofrecen las piezas de guías ya recibidas, y sin esto había
           que adivinar cuáles bajaron del camión. */
        entry: {
          select: {
            id: true,
            /* (1) N° de registro del libro: va en la ficha que lleva el QR de
               la etiqueta (2026-09-26), la que se lee sin internet. */
            libroNro: true,
            gtfNumber: true,
            providerName: true,
            entryDate: true,
            status: true,
            fechaRecepcion: true,
            // Título habilitante (6) y resolución (8): por ahí agrupa el patio
            // cuando entra la carga de un permiso entero (ADR-342).
            originCode: true,
            originSourceNumber: true,
            /* ¿La GUÍA declara especie CITES? (ADR-431). Es de la guía, no de
               la troza: el filtro del patio lo rotula «guía CITES». */
            speciesCites: true,
            /* De dónde salió el DATO de esta pieza (Brandon, 2026-09-02:
               «importados o puestos»). No hay un campo que lo declare, pero
               el hecho sí está guardado: una guía traída del SNIFFS deja su
               N° de constancia. Sin él, alguien tipeó la troza a mano — y en
               una fiscalización no vale lo mismo un dato que vino del sistema
               oficial que uno cargado por el operador. Se pide sólo el número,
               nunca `serforGtf`: esa ficha es un JSON grande y traerla por
               cada una de 5.000 trozas pagaría megabytes para mostrar un chip. */
            serforNumeroRegistro: true,
            /* Lo que el asiento DECLARA (ADR-353). El consumo no puede pasarse
               de ahí (I2), así que el picker tiene que poder avisar ANTES de
               armar el acta —y no cuando el servidor la rechaza—. */
            volumeM3: true,
          },
        },
        // La corrida que se la comió: hace falta su ESTADO, no sólo el id. Una
        // corrida anulada devuelve la madera al patio, y sin mirarlo la pieza
        // quedaría bloqueada para siempre con "ya entró a otra corrida".
        consumidaEn: { select: { id: true, status: true, deletedAt: true } },
        // El despacho que se la llevó SIN ASERRAR (ADR-363). Con su estado, por
        // lo mismo que la corrida: un despacho anulado devuelve la troza al
        // patio, y sin mirarlo la pieza quedaría bloqueada para siempre.
        despachadaEn: { select: { id: true, status: true, deletedAt: true } },
        // El lote de aserrío donde está apartada (ADR-334). Sin esto, el picker
        // ofrece piezas que ya están reservadas para otra corrida y la pantalla
        // de Trozas no puede decir dónde está la que se busca.
        loteAserrio: { select: { id: true, code: true, status: true } },
        /* El lote MIXTO donde está apartada (ADR-441): sin esto el picker la
           ofrecería para un lote y el servidor la rechazaría (LM4). */
        loteMixto: { select: SELECT_LOTE_MIXTO },
        _count: { select: { retrozos: true } },
      },
    });
  }

  /**
   * El patio, ya en la forma que necesita un picker de consumo
   * (`TrozaConsumible`, `lib/forestal/consumo-trozas.ts`) — mismo mapeo que
   * antes vivía SOLO en `GET /api/admin/forestal/trozas/patio`, movido acá
   * para que un segundo llamador (el planificador de consumo) no reinvente el
   * whitelist. Dos copias del mismo mapeo es la clase de bug que ya dejó un
   * campo afuera del JSON una vez — una sola fuente, todos los que necesiten
   * "qué hay disponible en el patio" pasan por acá.
   */
  static async trozasComoConsumibles(
    tenantId: string,
    opts: { limite?: number; loteId?: string; contratoId?: string; ids?: string[] } = {},
  ): Promise<TrozaConsumible[]> {
    const filas = await WoodEntriesDB.trozasDelPatio(tenantId, opts);
    const consumido = await WoodEntriesDB.consumidoPorIngreso(
      tenantId,
      filas.map((t) => t.woodEntryId),
    );
    const num = (v: unknown) => (v == null ? null : Number(v));
    return filas.map((t) => ({
      id: t.id,
      woodEntryId: t.woodEntryId,
      codificacion: t.codificacion,
      codigoPlanta: t.codigoPlanta,
      parcela: t.parcela,
      especieComun: t.especieComun,
      especieCientifica: t.especieCientifica,
      dimensiones: t.dimensiones,
      d1Cm: num(t.d1Cm),
      d2Cm: num(t.d2Cm),
      /* El diámetro declarado de la pieza: la columna existía y no se mapeaba,
         así que el filtro por diámetro no tenía de dónde leer (ADR-431). */
      diametroCm: num(t.diametroCm),
      largoM: num(t.largoM),
      volumenM3: num(t.volumenM3),
      gtfNumber: t.entry.gtfNumber,
      libroNro: t.entry.libroNro,
      constanciaSniffs: t.entry.serforNumeroRegistro,
      proveedor: t.entry.providerName,
      fechaIngreso: t.entry.entryDate as unknown as string,
      fechaRecepcion: t.fechaRecepcion as unknown as string | null,
      /* Para la regla de fechas al vincular (`fechaIngresoDeTroza`): la pieza
         sin recepción propia hereda la de su guía, no el asiento. */
      guiaFechaRecepcion: (t.entry.fechaRecepcion ?? null) as unknown as string | null,
      /* La MISMA derivación que usa el escritor de lotes (`motivoNoElegible`):
         vive una sola vez en `guiaRecibida` para que la pantalla y el POST no
         puedan discrepar sobre si esa madera llegó. */
      guiaRecepcionada: guiaRecibida({
        estado: t.entry.status,
        fechaRecepcionGuia: t.entry.fechaRecepcion,
        fechaRecepcionTroza: t.fechaRecepcion,
      }),
      permiso: t.entry.originCode,
      resolucion: t.entry.originSourceNumber,
      /* DERIVADO de la guía, no de la troza (ver `TrozaConsumible.guiaCites`). */
      guiaCites: t.entry.speciesCites === true,
      /* DERIVADO, y se dice que lo es: «serfor» = la guía trae su constancia
         del SNIFFS, así que la troza bajó del documento oficial; «manual» =
         se cargó a mano. No es un campo declarado en la troza. */
      origenDato: t.entry.serforNumeroRegistro ? ("serfor" as const) : ("manual" as const),
      guiaVolumenM3: num(t.entry.volumeM3),
      guiaConsumidoM3: consumido.get(t.woodEntryId) ?? 0,
      consumidaEnId:
        t.consumidaEn && t.consumidaEn.status === "registrado" && !t.consumidaEn.deletedAt
          ? t.consumidaEnId
          : null,
      despachadaEnId:
        t.despachadaEn && t.despachadaEn.status === "registrado" && !t.despachadaEn.deletedAt
          ? t.despachadaEnId
          : null,
      noRecepcionada: t.noRecepcionada,
      trozaOrigenId: t.trozaOrigenId,
      descarte: t.descarte,
      retrozos: t._count.retrozos,
      loteAserrioId: t.loteAserrioId,
      loteAserrioCode: t.loteAserrio?.code ?? null,
      /* ADR-441: sólo si ese mixto sigue abierto — el estado, no el id pelado. */
      loteMixtoId: mixtoVivo(t.loteMixto) ? t.loteMixtoId : null,
      loteMixtoCode: mixtoVivo(t.loteMixto) ? (t.loteMixto?.code ?? null) : null,
      /* El sello de la etiqueta QR (ADR-436): la pantalla dice «ya etiquetada»
         y cuántas veces se reimprimió. */
      etiquetadaEn: t.etiquetadaEn ? t.etiquetadaEn.toISOString() : null,
      etiquetasImpresas: t.etiquetasImpresas,
      /* Cubicación Oxapampa (2026-09-26): el pt con que se paga. `oxPt` es el
         CONGELADO al guardar, no se recalcula acá. */
      oxD1Pulg: num(t.oxD1Pulg),
      oxD2Pulg: num(t.oxD2Pulg),
      oxLargoPies: num(t.oxLargoPies),
      oxPt: num(t.oxPt),
      oxMedidoEn: t.oxMedidoEn ? t.oxMedidoEn.toISOString() : null,
      oxMedidoPor: t.oxMedidoPor,
      d1d2MedidoEnPlanta: t.d1d2MedidoEnPlanta,
    }));
  }

  /**
   * Cuántas piezas llevan `dias` o más paradas, y cuántos m³ son.
   *
   * La madera tropical en troza se mancha y se raja: es plata perdiéndose sola,
   * pero el aviso no puede costar traerse el patio entero al navegador —esto lo
   * cuenta en la base para que la tira de pendientes del libro lo muestre sin
   * pagar cinco mil filas—.
   *
   * Va en SQL y no en Prisma por la fecha: la antigüedad se mide desde que la
   * PIEZA bajó del camión y, si no se sabe, desde el asiento de su guía. Ese
   * `COALESCE` entre dos tablas no se expresa en el query builder.
   *
   * El predicado de «sigue en el patio» es el mismo de `estadoDeTroza`
   * (`lib/forestal/trozas-patio.ts`): sin consumo ni despacho VIGENTE, sin
   * descartar, recibida, y sin pedazos —una madre retrozada ya no es madera
   * disponible: van sus retrozos (ADR-313)—.
   */
  static async contarTrozasVaradas(
    tenantId: string,
    dias: number,
  ): Promise<{ piezas: number; m3: number }> {
    if (!tenantId) throw new Error("tenantId is required");
    const corte = Math.max(1, Math.floor(dias));
    const filas = await prisma.$queryRaw<{ piezas: bigint; m3: number | null }[]>`
      SELECT COUNT(*)::bigint AS piezas, COALESCE(SUM(t."volumenM3"), 0)::float8 AS m3
      FROM "WoodEntryTroza" t
      JOIN "WoodEntry" e ON e."id" = t."woodEntryId"
      WHERE t."tenantId" = ${tenantId}
        AND e."deletedAt" IS NULL
        AND e."status" NOT IN ('anulado', 'rechazado')
        AND t."descarte" = false
        AND t."noRecepcionada" = false
        AND NOT EXISTS (SELECT 1 FROM "WoodEntryTroza" r WHERE r."trozaOrigenId" = t."id")
        AND NOT EXISTS (
          SELECT 1 FROM "ForestCtpEntry" c
          WHERE c."id" = t."consumidaEnId" AND c."status" = 'registrado' AND c."deletedAt" IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM "ForestCtpEntry" d
          WHERE d."id" = t."despachadaEnId" AND d."status" = 'registrado' AND d."deletedAt" IS NULL
        )
        AND COALESCE(t."fechaRecepcion", e."entryDate") <= NOW() - (${corte} * INTERVAL '1 day')
    `;
    const f = filas[0];
    return { piezas: Number(f?.piezas ?? 0), m3: Number(f?.m3 ?? 0) };
  }

  /**
   * Cuántas piezas tiene el patio DE VERDAD: el tope de arriba no puede mentir.
   * Mismo `where` que `trozasDelPatio` (`wherePatio`): si el conteo y la lista
   * filtraran distinto, «hay N y estás viendo M» mentiría.
   */
  static async contarTrozasDelPatio(tenantId: string, opts: { loteId?: string; contratoId?: string } = {}) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.woodEntryTroza.count({ where: WoodEntriesDB.wherePatio(tenantId, opts) });
  }

  /**
   * El `where` del patio, UNA vez para la lista y el conteo. `tenantId` en la
   * raíz siempre; `loteId` y `contratoId` sólo si vienen (AND entre ellos).
   */
  static wherePatio(
    tenantId: string,
    opts: { loteId?: string; contratoId?: string; ids?: string[] } = {},
  ): Prisma.WoodEntryTrozaWhereInput {
    if (!tenantId) throw new Error("tenantId is required");
    return {
      tenantId,
      ...(opts.loteId ? { loteAserrioId: opts.loteId } : {}),
      /* `ids` acota a piezas puntuales (las etiquetas, ADR-436). Un array VACÍO
         no es «sin filtro»: es «ninguna» — si no, pedir cero piezas devolvería
         el patio entero. */
      ...(opts.ids ? { id: { in: opts.ids } } : {}),
      entry: {
        deletedAt: null,
        status: { notIn: ["anulado", "rechazado"] },
        ...(opts.contratoId ? { contratoId: opts.contratoId } : {}),
      },
    };
  }

  /**
   * El siguiente código de planta libre.
   *
   * El centro numera sus piezas con un correlativo propio (3037752, 11682810…)
   * y al ingresar una guía de treinta trozas nadie va a tipear treinta números.
   * Se mira el MAYOR código numérico ya usado y se sigue de ahí: si alguien
   * numeró a mano, el automático no le pisa nada.
   *
   * Los códigos no numéricos (29/A) se ignoran a propósito: son los del bosque,
   * no los del patio.
   */
  static async siguienteCodigoPlanta(tenantId: string): Promise<number> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await prisma.$queryRaw<{ max: number | null }[]>`
      SELECT MAX(CAST("codigoPlanta" AS BIGINT)) AS max
      FROM "WoodEntryTroza"
      WHERE "tenantId" = ${tenantId} AND "codigoPlanta" ~ '^[0-9]{1,15}$'
    `;
    const max = filas[0]?.max == null ? 0 : Number(filas[0].max);
    return max + 1;
  }

  /**
   * Los códigos de planta que están puestos en MÁS DE UNA pieza (ADR-336).
   *
   * El guard impide fabricar nuevos, pero el libro heredó los de antes de la
   * regla: mientras existan, dos piezas de la pila comparten la marca pintada y
   * el índice único de Postgres no se puede crear. Esto es la lista para
   * resolverlos de a uno, con el dato que hace falta para decidir cuál conserva
   * su número: de qué guía es cada una, qué especie y si ya se consumió.
   */
  static async codigosPlantaDuplicados(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await prisma.$queryRaw<
      {
        id: string;
        codigoPlanta: string;
        codificacion: string | null;
        especieComun: string | null;
        volumenM3: unknown;
        createdAt: Date;
        woodEntryId: string;
        gtfNumber: string;
        entryDate: Date;
        consumida: boolean;
        noRecepcionada: boolean;
        ingresoAnulado: boolean;
      }[]
    >`
      SELECT t."id", t."codigoPlanta", t."codificacion", t."especieComun", t."volumenM3",
             t."createdAt", t."woodEntryId", t."noRecepcionada",
             e."gtfNumber", e."entryDate",
             (t."consumidaEnId" IS NOT NULL) AS consumida,
             (e."deletedAt" IS NOT NULL OR e."status" IN ('anulado', 'rechazado')) AS "ingresoAnulado"
      FROM "WoodEntryTroza" t
      JOIN "WoodEntry" e ON e."id" = t."woodEntryId"
      WHERE t."tenantId" = ${tenantId}
        AND t."codigoPlanta" IS NOT NULL AND BTRIM(t."codigoPlanta") <> ''
        AND UPPER(BTRIM(t."codigoPlanta")) IN (
          SELECT UPPER(BTRIM(t2."codigoPlanta"))
          FROM "WoodEntryTroza" t2
          WHERE t2."tenantId" = ${tenantId}
            AND t2."codigoPlanta" IS NOT NULL AND BTRIM(t2."codigoPlanta") <> ''
          GROUP BY UPPER(BTRIM(t2."codigoPlanta")) HAVING COUNT(*) > 1
        )
      ORDER BY UPPER(BTRIM(t."codigoPlanta")), t."createdAt"
    `;
    /*
     * Las piezas de ingresos ANULADOS entran a la lista aunque no haya madera
     * suya en el patio. Es a propósito: el índice único de Postgres mira la
     * tabla, no el estado del ingreso, así que mientras esa fila conserve la
     * marca repetida el candado no se puede poner. Ocultarlas dejaba la
     * pantalla diciendo «1 grupo» y el candado «61 pendientes» — dos números
     * sobre el mismo hecho que no se pueden explicar. Van marcadas para que se
     * vea que ésas son las que se pueden renumerar sin pensarlo.
     */

    // Agrupado acá y no en SQL: el cliente necesita el grupo entero para dejar
    // elegir cuál conserva el número, y armarlo dos veces sería otra regla más
    // que mantener sincronizada.
    const grupos = new Map<string, typeof filas>();
    for (const f of filas) {
      const k = f.codigoPlanta.trim().toUpperCase();
      const g = grupos.get(k);
      if (g) g.push(f);
      else grupos.set(k, [f]);
    }
    return [...grupos.entries()].map(([codigo, piezas]) => ({
      codigo,
      piezas: piezas.map((p) => ({
        id: p.id,
        codigoPlanta: p.codigoPlanta,
        codificacion: p.codificacion,
        especieComun: p.especieComun,
        volumenM3: p.volumenM3 == null ? null : Number(p.volumenM3),
        woodEntryId: p.woodEntryId,
        gtfNumber: p.gtfNumber,
        entryDate: p.entryDate,
        createdAt: p.createdAt,
        consumida: p.consumida,
        noRecepcionada: p.noRecepcionada,
        ingresoAnulado: p.ingresoAnulado,
      })),
    }));
  }

  /**
   * Le da a cada troza de la lista un correlativo nuevo y libre (ADR-336).
   *
   * Es la salida para los códigos repetidos que quedaron de antes del guard. Se
   * numera desde `MAX + 1` y se saltea lo ocupado, dentro de UNA transacción:
   * dos limpiezas simultáneas no pueden llevarse el mismo número.
   *
   * **Respeta el cierre de período** (ADR-139): una troza de un mes ya
   * presentado no se toca sin reabrir. Las que no se pudieron se devuelven con
   * su motivo en vez de fallar todo — si la mitad del libro está cerrada, esto
   * no puede quedar inutilizable.
   */
  static async renumerarCodigosPlanta(
    tenantId: string,
    trozaIds: string[],
    usuario = "unknown",
  ): Promise<{
    renumeradas: { id: string; antes: string | null; ahora: string }[];
    omitidas: { id: string; motivo: string }[];
  }> {
    if (!tenantId) throw new Error("tenantId is required");
    const ids = [...new Set(trozaIds.filter(Boolean))];
    if (ids.length === 0) return { renumeradas: [], omitidas: [] };

    const omitidas: { id: string; motivo: string }[] = [];
    const piezas = await prisma.woodEntryTroza.findMany({
      where: { id: { in: ids }, tenantId },
      select: {
        id: true,
        codigoPlanta: true,
        codificacion: true,
        entry: {
          select: { id: true, entryDate: true, status: true, deletedAt: true, gtfNumber: true },
        },
      },
    });
    const encontradas = new Set(piezas.map((p) => p.id));
    for (const id of ids)
      if (!encontradas.has(id)) omitidas.push({ id, motivo: "No es una troza de este tenant." });

    // El cierre se consulta UNA vez por período, no una por troza.
    const cerrados = new Map<string, string | null>();
    const elegibles: typeof piezas = [];
    for (const p of piezas) {
      /*
       * Una pieza de un ingreso ANULADO sí se renumera. Su acta ya no vale como
       * declaración viva y no hay madera suya en el patio, pero su fila sigue
       * ocupando la marca en la tabla — y el índice único mira la tabla. Si no
       * se pudiera tocar, un ingreso anulado bloquearía el candado para siempre.
       * La renumeración queda en la auditoría igual que cualquier otra.
       */
      const clave = p.entry.entryDate.toISOString().slice(0, 7);
      if (!cerrados.has(clave)) {
        const cerrado = await ForestCtpCierreDB.closedPeriodOf(tenantId, p.entry.entryDate);
        cerrados.set(clave, cerrado ? cerrado.label : null);
      }
      const label = cerrados.get(clave);
      if (label) {
        omitidas.push({
          id: p.id,
          motivo: `El período ${label} está cerrado: reabrilo para corregir esa pieza.`,
        });
        continue;
      }
      elegibles.push(p);
    }
    if (elegibles.length === 0) return { renumeradas: [], omitidas };

    const renumeradas = await prisma.$transaction(async (tx) => {
      /* El mismo candado que `marcarEtiquetadas` (ADR-436): sin él, renumerar
         mientras otra tablet imprime etiquetas lee el mismo MAX y pinta el
         mismo número en dos palos. */
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ctp-codigo-planta:${tenantId}`}))`;
      const max = await tx.$queryRaw<{ max: number | null }[]>`
        SELECT MAX(CAST("codigoPlanta" AS BIGINT)) AS max
        FROM "WoodEntryTroza"
        WHERE "tenantId" = ${tenantId} AND "codigoPlanta" ~ '^[0-9]{1,15}$'
      `;
      let n = (max[0]?.max == null ? 0 : Number(max[0].max)) + 1;
      const salida = elegibles.map((p) => {
        const ahora = String(n);
        n += 1;
        return { id: p.id, antes: p.codigoPlanta, ahora };
      });

      /*
       * UNA query para las N piezas, no un UPDATE por fila.
       *
       * Con un round-trip por troza —a ~30 ms contra Supabase— la limpieza de 59
       * códigos reventó el timeout de 5 s de la transacción interactiva y volvió
       * un 500 con todo revertido. Es el mismo problema que `actualizarRecepcion`
       * ya había resuelto así, y el tope del endpoint es 500 piezas: con un
       * update por fila era imposible por construcción.
       */
      await tx.$executeRaw`
        UPDATE "WoodEntryTroza" AS t
        SET "codigoPlanta" = v.codigo
        FROM (VALUES ${Prisma.join(salida.map((s) => Prisma.sql`(${s.id}::text, ${s.ahora}::text)`))})
          AS v(id, codigo)
        WHERE t."id" = v.id AND t."tenantId" = ${tenantId}
      `;
      return salida;
    }).catch(traducirChoqueCodigoPlanta);

    auditCtp({
      tenantId,
      action: "ctp_troza_recepcion",
      entity: "WoodEntryTroza",
      entityId: renumeradas[0]?.id ?? "",
      detail:
        `Renumeró ${renumeradas.length} troza(s) con código de planta repetido: ` +
        renumeradas
          .slice(0, 10)
          .map((r) => `${r.antes ?? "—"}→${r.ahora}`)
          .join(", ") +
        (renumeradas.length > 10 ? "…" : ""),
      user: usuario,
    });
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {}
    return { renumeradas, omitidas };
  }

  /**
   * Sella la impresión de etiquetas QR y, si se pide, numera las que no tienen
   * código de planta (ADR-436).
   *
   * Qué hace, en este orden:
   * 1. Lee las piezas pedidas con la MISMA lectura que el patio
   *    (`trozasComoConsumibles`) y las reparte con `planearEtiquetado`: la que
   *    no está en el patio (consumida, despachada, no llegó, descarte, madre
   *    retrozada, sin volumen) se omite con el rótulo de `LABEL_BLOQUEO`.
   * 2. `asignarCodigo`: la elegible sin código recibe `MAX(numérico) + 1` — el
   *    criterio de `renumerarCodigosPlanta`. Un mes CERRADO no se toca: la pieza
   *    se etiqueta igual, con el código del bosque, y vuelve en `sinCodigoNuevo`.
   * 3. Sella `etiquetadaEn = ahora` y `etiquetasImpresas + 1` en UNA query.
   *
   * La numeración va bajo `pg_advisory_xact_lock` por negocio: sin él, dos
   * tablets imprimiendo a la vez leen el mismo MAX y el índice único
   * (`INDICE_CODIGO_PLANTA_UNICO`) tumbaría la segunda tanda entera en vez de
   * darle el número siguiente. Y el UPDATE del código lleva «sigue sin código» en el WHERE: si
   * otra pantalla le puso uno mientras tanto, no se pisa.
   */
  static async marcarEtiquetadas(
    tenantId: string,
    trozaIds: string[],
    opts: { asignarCodigo: boolean; usuario?: string },
  ): Promise<{
    trozas: TrozaConsumible[];
    asignados: { id: string; codigo: string }[];
    omitidas: { id: string; motivo: string }[];
    sinCodigoNuevo: { id: string; motivo: string }[];
    repetidos: { codigo: string; ids: string[] }[];
  }> {
    if (!tenantId) throw new Error("tenantId is required");
    const pedidos = [...new Set(trozaIds.map((i) => i.trim()).filter(Boolean))];
    const vacio = { trozas: [], asignados: [], omitidas: [], sinCodigoNuevo: [], repetidos: [] };
    if (pedidos.length === 0) return vacio;

    const piezas = await WoodEntriesDB.trozasComoConsumibles(tenantId, {
      ids: pedidos,
      limite: pedidos.length,
    });

    /* El cierre se consulta una vez por MES y sólo para las que se van a
       numerar: a las que ya tienen código no se les escribe nada del libro. */
    const cerradoPorId = new Map<string, string | null>();
    if (opts.asignarCodigo) {
      const porMes = new Map<string, string | null>();
      for (const t of piezas) {
        if (tieneCodigoPlanta(t.codigoPlanta) || t.fechaIngreso == null) continue;
        const fecha = new Date(t.fechaIngreso as unknown as string | Date);
        if (Number.isNaN(fecha.getTime())) continue;
        const clave = fecha.toISOString().slice(0, 7);
        if (!porMes.has(clave)) {
          const cerrado = await ForestCtpCierreDB.closedPeriodOf(tenantId, fecha);
          porMes.set(clave, cerrado ? cerrado.label : null);
        }
        cerradoPorId.set(t.id, porMes.get(clave) ?? null);
      }
    }
    const plan = planearEtiquetado(pedidos, piezas, {
      asignarCodigo: opts.asignarCodigo,
      periodoCerrado: (t) => cerradoPorId.get(t.id) ?? null,
    });
    if (plan.etiquetar.length === 0) return { ...vacio, omitidas: plan.omitidas };

    const asignados = await prisma.$transaction(async (tx) => {
      let hechos: { id: string; codigo: string }[] = [];
      if (plan.aNumerar.length > 0) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ctp-codigo-planta:${tenantId}`}))`;
        const max = await tx.$queryRaw<{ max: bigint | number | null }[]>`
          SELECT MAX(CAST("codigoPlanta" AS BIGINT)) AS max
          FROM "WoodEntryTroza"
          WHERE "tenantId" = ${tenantId} AND "codigoPlanta" ~ '^[0-9]{1,15}$'
        `;
        const propuestos = asignarCorrelativos(
          plan.aNumerar,
          (max[0]?.max == null ? 0 : Number(max[0].max)) + 1,
        );
        hechos = await tx.$queryRaw<{ id: string; codigo: string }[]>`
          UPDATE "WoodEntryTroza" AS t
          SET "codigoPlanta" = v.codigo
          FROM (VALUES ${Prisma.join(propuestos.map((p) => Prisma.sql`(${p.id}::text, ${p.codigo}::text)`))})
            AS v(id, codigo)
          WHERE t."id" = v.id AND t."tenantId" = ${tenantId}
            AND (t."codigoPlanta" IS NULL OR btrim(t."codigoPlanta") = '')
          RETURNING t."id" AS id, t."codigoPlanta" AS codigo
        `;
      }
      await tx.woodEntryTroza.updateMany({
        where: { tenantId, id: { in: plan.etiquetar } },
        data: { etiquetadaEn: new Date(), etiquetasImpresas: { increment: 1 } },
      });
      return hechos;
    }).catch(traducirChoqueCodigoPlanta);

    auditCtp({
      tenantId,
      action: "ctp_trozas_etiquetadas",
      entity: "WoodEntryTroza",
      entityId: plan.etiquetar[0] ?? "",
      detail:
        `Imprimió la etiqueta de ${plan.etiquetar.length} troza(s)` +
        (asignados.length > 0
          ? ` · código de planta nuevo: ${asignados
              .slice(0, 10)
              .map((a) => a.codigo)
              .join(", ")}${asignados.length > 10 ? "…" : ""}`
          : "") +
        (plan.omitidas.length > 0 ? ` · omitidas ${plan.omitidas.length}` : ""),
      user: opts.usuario ?? "unknown",
    });
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {}

    /* Se releen para devolver el código nuevo y el sello tal como quedaron. */
    const [trozas, duplicados] = await Promise.all([
      WoodEntriesDB.trozasComoConsumibles(tenantId, {
        ids: plan.etiquetar,
        limite: plan.etiquetar.length,
      }),
      WoodEntriesDB.codigosPlantaDuplicados(tenantId),
    ]);
    const orden = new Map(plan.etiquetar.map((id, i) => [id, i]));
    trozas.sort((a, b) => (orden.get(a.id) ?? 0) - (orden.get(b.id) ?? 0));
    /* Una etiqueta con un código que está en OTRO palo también es una etiqueta
       que miente: se avisa cuál, con todas sus piezas, para resolverlo. */
    const codigosImpresos = new Set(
      trozas.map((t) => t.codigoPlanta?.trim().toUpperCase()).filter((c): c is string => !!c),
    );
    const repetidos = duplicados
      .filter((g) => codigosImpresos.has(g.codigo))
      .map((g) => ({ codigo: g.codigo, ids: g.piezas.map((p) => p.id) }));

    return { trozas, asignados, omitidas: plan.omitidas, sinCodigoNuevo: plan.sinCodigoNuevo, repetidos };
  }

  /**
   * Guarda lo que el aserradero midió en el patio (Brandon 2026-09-26).
   *
   * Dos cosas, con reglas distintas (la decisión por pieza es `planearMedida`,
   * pura y con test):
   * - **Oxapampa** (pulgadas, pies): el pt lo calcula ACÁ el servidor con
   *   `ptOxapampa` y queda congelado en `oxPt`. Es dato comercial: no lo frena
   *   el mes cerrado y se puede corregir (vuelve a calcular y a congelar).
   * - **D1/D2 en cm** cuando la guía no los trajo: sólo sobre NULL —el
   *   `COALESCE` del UPDATE lo garantiza aunque otra tablet escriba en el
   *   medio— y con el período abierto. Marca `d1d2MedidoEnPlanta` y completa
   *   `diametroCm` (el promedio de los dos) SÓLO si también estaba vacío.
   *   `volumenM3` no se toca: el volumen del libro sigue siendo el de la guía.
   *
   * Un UPDATE para las N piezas, bajo lock por pieza con `ORDER BY id` (dos
   * tablets midiendo la misma guía no se abrazan). Devuelve las piezas releídas
   * con la lectura del patio y lo que NO se guardó de cada una.
   */
  static async guardarMedidasTrozas(
    tenantId: string,
    cambios: CambioMedidaTroza[],
    usuario = "unknown",
  ): Promise<{ trozas: TrozaConsumible[]; rechazadas: { id: string; motivo: string }[] }> {
    if (!tenantId) throw new Error("tenantId is required");
    /* La misma pieza dos veces en el pedido: vale la última (la que se tipeó después). */
    const porId = new Map<string, CambioMedidaTroza>();
    for (const c of cambios) {
      const id = c.id.trim();
      if (id) porId.set(id, { ...c, id });
    }
    const ids = [...porId.keys()];
    if (ids.length === 0) return { trozas: [], rechazadas: [] };

    /* Los cierres se leen UNA vez (KV, fuera de la transacción) y cada pieza se
       mira con la función pura. Antes se memorizaba por mes UTC: los cierres se
       guardan en hora de Lima (`from` 05:00Z) y las guías a 00:00Z, así que la
       guía del día 1 y la del 15 caían en la misma «clave» y quedaba lo que
       dijera la primera fila que llegaba (revisión 26-09, reproducido). Sólo
       importa para los centímetros. */
    const [fechas, cierres] = await Promise.all([
      prisma.woodEntryTroza.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true, entry: { select: { entryDate: true } } },
      }),
      ForestCtpCierreDB.list(tenantId),
    ]);
    const cerradoPorId = new Map<string, string | null>();
    for (const f of fechas) {
      cerradoPorId.set(f.id, closedPeriodOf(cierres, f.entry.entryDate)?.label ?? null);
    }

    const num = (v: unknown) => (v == null ? null : Number(v));
    const ahora = new Date().toISOString();

    const { planes, antesPorId } = await prisma.$transaction(async (tx) => {
      const filas = await tx.$queryRaw<
        {
          id: string;
          codificacion: string | null;
          codigoPlanta: string | null;
          oxD1Pulg: unknown;
          oxD2Pulg: unknown;
          oxLargoPies: unknown;
          oxPt: unknown;
          d1Cm: unknown;
          d2Cm: unknown;
          noRecepcionada: boolean;
          guiaViva: boolean;
        }[]
      >`
        SELECT t."id", t."codificacion", t."codigoPlanta",
               t."oxD1Pulg", t."oxD2Pulg", t."oxLargoPies", t."oxPt",
               t."d1Cm", t."d2Cm", t."noRecepcionada",
               (e."deletedAt" IS NULL AND e."status" NOT IN ('anulado', 'rechazado')) AS "guiaViva"
        FROM "WoodEntryTroza" t
        JOIN "WoodEntry" e ON e."id" = t."woodEntryId"
        WHERE t."tenantId" = ${tenantId} AND t."id" = ANY(${ids}::text[])
        ORDER BY t."id"
        FOR UPDATE OF t
      `;
      const estado = new Map(filas.map((f) => [f.id, f]));
      const planes: PlanMedida[] = ids.map((id) => {
        const f = estado.get(id);
        return planearMedida(
          porId.get(id)!,
          f && {
            id: f.id,
            oxD1Pulg: num(f.oxD1Pulg),
            oxD2Pulg: num(f.oxD2Pulg),
            oxLargoPies: num(f.oxLargoPies),
            d1Cm: num(f.d1Cm),
            d2Cm: num(f.d2Cm),
            noRecepcionada: f.noRecepcionada,
            guiaViva: f.guiaViva,
            periodoCerrado: cerradoPorId.get(id) ?? null,
          },
        );
      });

      const aEscribir = planes.filter((p) => p.ox || p.cm);
      if (aEscribir.length > 0) {
        /* Los `::numeric`/`::boolean` NO son decoración: dentro de un VALUES
           Postgres no infiere el tipo de un parámetro (ver `actualizarRecepcion`). */
        const valores = aEscribir.map(
          (p) => Prisma.sql`(
            ${p.id}::text, ${p.ox != null}::boolean,
            ${p.ox?.d1 ?? null}::numeric, ${p.ox?.d2 ?? null}::numeric,
            ${p.ox?.largo ?? null}::numeric, ${p.ox?.pt ?? null}::numeric,
            ${p.cm?.d1 ?? null}::numeric, ${p.cm?.d2 ?? null}::numeric
          )`,
        );
        /* Borrar las tres medidas Oxapampa borra también quién y cuándo: una
           troza sin cubicar no tiene «cubicada por». */
        await tx.$executeRaw`
          UPDATE "WoodEntryTroza" AS t SET
            "oxD1Pulg"    = CASE WHEN v.set_ox THEN v.ox_d1 ELSE t."oxD1Pulg" END,
            "oxD2Pulg"    = CASE WHEN v.set_ox THEN v.ox_d2 ELSE t."oxD2Pulg" END,
            "oxLargoPies" = CASE WHEN v.set_ox THEN v.ox_l  ELSE t."oxLargoPies" END,
            "oxPt"        = CASE WHEN v.set_ox THEN v.ox_pt ELSE t."oxPt" END,
            "oxMedidoEn"  = CASE
              WHEN NOT v.set_ox THEN t."oxMedidoEn"
              WHEN v.ox_d1 IS NULL AND v.ox_d2 IS NULL AND v.ox_l IS NULL THEN NULL
              ELSE ${ahora}::timestamp END,
            "oxMedidoPor" = CASE
              WHEN NOT v.set_ox THEN t."oxMedidoPor"
              WHEN v.ox_d1 IS NULL AND v.ox_d2 IS NULL AND v.ox_l IS NULL THEN NULL
              ELSE ${usuario}::text END,
            -- Sólo sobre vacío: si otra pantalla lo llenó mientras tanto, queda el suyo.
            "d1Cm" = COALESCE(t."d1Cm", v.d1),
            "d2Cm" = COALESCE(t."d2Cm", v.d2),
            "diametroCm" = CASE
              WHEN t."diametroCm" IS NULL AND (v.d1 IS NOT NULL OR v.d2 IS NOT NULL)
                AND COALESCE(t."d1Cm", v.d1) IS NOT NULL AND COALESCE(t."d2Cm", v.d2) IS NOT NULL
              THEN round((COALESCE(t."d1Cm", v.d1) + COALESCE(t."d2Cm", v.d2)) / 2, 2)
              ELSE t."diametroCm" END,
            "d1d2MedidoEnPlanta" = t."d1d2MedidoEnPlanta"
              OR (t."d1Cm" IS NULL AND v.d1 IS NOT NULL)
              OR (t."d2Cm" IS NULL AND v.d2 IS NOT NULL)
          FROM (VALUES ${Prisma.join(valores)})
            AS v(id, set_ox, ox_d1, ox_d2, ox_l, ox_pt, d1, d2)
          WHERE t."id" = v.id AND t."tenantId" = ${tenantId}
        `;
      }
      return { planes, antesPorId: estado };
    });

    /* ── Auditoría: el pt es plata de un tercero, se narra antes → después ── */
    const nombre = (id: string) => {
      const f = antesPorId.get(id);
      return f?.codigoPlanta?.trim() || f?.codificacion?.trim() || id;
    };
    const conOx = planes.filter((p) => p.ox);
    if (conOx.length > 0) {
      const pt = (v: number | null) => (v == null ? "sin pt" : `${fmtPt(v)} pt`);
      const total = conOx.reduce((s, p) => s + (p.ox?.pt ?? 0), 0);
      auditCtp({
        tenantId,
        action: "ctp_troza_cubicacion_oxapampa",
        entity: "WoodEntryTroza",
        entityId: conOx[0].id,
        detail:
          `Cubicó en Oxapampa ${conOx.length} troza(s) · Σ ${fmtPt(total)} pt: ` +
          conOx
            .slice(0, 40)
            .map((p) => {
              const antes = num(antesPorId.get(p.id)?.oxPt);
              return `${nombre(p.id)} ${p.ox?.d1 ?? "—"}"×${p.ox?.d2 ?? "—"}"×${p.ox?.largo ?? "—"}' ${pt(antes)} → ${pt(p.ox?.pt ?? null)}`;
            })
            .join(", ") +
          (conOx.length > 40 ? ` y ${conOx.length - 40} más` : ""),
        user: usuario,
      });
    }
    const conCm = planes.filter((p) => p.cm);
    if (conCm.length > 0) {
      auditCtp({
        tenantId,
        action: "ctp_troza_d1d2_planta",
        entity: "WoodEntryTroza",
        entityId: conCm[0].id,
        detail:
          `Cargó en planta D1/D2 que la guía no traía en ${conCm.length} troza(s): ` +
          conCm
            .slice(0, 40)
            .map((p) => `${nombre(p.id)} ${p.cm?.d1 ?? "—"}×${p.cm?.d2 ?? "—"} cm`)
            .join(", ") +
          (conCm.length > 40 ? ` y ${conCm.length - 40} más` : ""),
        user: usuario,
      });
    }
    if (conOx.length > 0 || conCm.length > 0) {
      try {
        invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
      } catch {}
    }

    const encontradas = ids.filter((id) => antesPorId.has(id));
    const trozas = await WoodEntriesDB.trozasComoConsumibles(tenantId, {
      ids: encontradas,
      limite: Math.max(encontradas.length, 1),
    });
    const orden = new Map(ids.map((id, i) => [id, i]));
    trozas.sort((a, b) => (orden.get(a.id) ?? 0) - (orden.get(b.id) ?? 0));
    return {
      trozas,
      rechazadas: planes.flatMap((p) => p.rechazos.map((motivo) => ({ id: p.id, motivo }))),
    };
  }

  /**
   * ¿Está puesto el candado —el índice único `INDICE_CODIGO_PLANTA_UNICO`— y
   * cuántos códigos repetidos le quedan a ESTE negocio?
   *
   * Sólo LEE. Hasta el 2026-09-26 esto intentaba crear el índice desde el
   * request cada vez que no quedaban repetidos, con otro nombre y sin
   * `upper(btrim())`: nunca llegó a correr (un «118» repetido en `main` lo
   * frenó) y habría creado un índice más flojo que la regla del guard. Ahora el
   * índice vive en `prisma/migrations/adr-436-codigo-planta-unico.sql`, se
   * aplicó con `CONCURRENTLY` por el pooler de sesión, y un GET no hace DDL.
   *
   * `creado` exige `indisvalid`: un `CREATE INDEX CONCURRENTLY` interrumpido
   * deja el índice en el catálogo pero INVÁLIDO, y ése no frena nada.
   */
  static async estadoCandadoCodigoPlanta(tenantId: string): Promise<{
    creado: boolean;
    duplicadosRestantes: number;
  }> {
    if (!tenantId) throw new Error("tenantId is required");
    const [idx, dup] = await Promise.all([
      prisma.$queryRaw<{ valido: boolean }[]>`
        SELECT i.indisvalid AS valido
        FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
        WHERE c.relname = ${INDICE_CODIGO_PLANTA_UNICO}
      `,
      prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*)::bigint AS n FROM (
          SELECT UPPER(BTRIM("codigoPlanta"))
          FROM "WoodEntryTroza"
          WHERE "tenantId" = ${tenantId}
            AND "codigoPlanta" IS NOT NULL AND BTRIM("codigoPlanta") <> ''
          GROUP BY 1 HAVING COUNT(*) > 1
        ) x
      `,
    ]);
    return {
      creado: idx[0]?.valido === true,
      duplicadosRestantes: Number(dup[0]?.n ?? 0),
    };
  }

  /**
   * Cuáles de estos códigos de planta YA están usados en el libro.
   *
   * Es el mismo criterio del guard que rechaza al guardar (`guardCodigoPlantaUnico`),
   * expuesto para poder avisarlo ANTES: descubrir la colisión al apretar
   * "Registrar" —con la lista de sesenta piezas ya llena— es descubrirla tarde.
   * Los ingresos anulados SÍ cuentan: su fila sigue en la tabla y el índice
   * único la mira, así que su código no está libre (ADR-436).
   */
  static async codigosPlantaEnUso(
    tenantId: string,
    codigos: string[],
  ): Promise<{ codigo: string; gtfNumber: string; codificacion: string | null }[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const claves = [...new Set(codigos.map((c) => (c ?? "").trim().toUpperCase()).filter(Boolean))];
    if (claves.length === 0) return [];
    const filas = await prisma.$queryRaw<
      { codigoPlanta: string; codificacion: string | null; gtfNumber: string }[]
    >`
      SELECT t."codigoPlanta", t."codificacion", e."gtfNumber"
      FROM "WoodEntryTroza" t
      JOIN "WoodEntry" e ON e."id" = t."woodEntryId"
      WHERE t."tenantId" = ${tenantId}
        AND UPPER(BTRIM(t."codigoPlanta")) = ANY(${claves})
      LIMIT 200
    `;
    return filas.map((f) => ({
      codigo: f.codigoPlanta,
      gtfNumber: f.gtfNumber,
      codificacion: f.codificacion,
    }));
  }

  /**
   * TODAS las trozas del período, una por una (no sólo las del patio).
   *
   * La tabla de Ingresos lista GUÍAS, y una guía del inventario trae veinte
   * piezas: el operador que subió 60 trozas veía 9 filas y creía que se habían
   * perdido 51. Esto es la misma madera leída por PIEZA — cada registro es una
   * troza, con su código, sus tres dimensiones y su estado.
   *
   * Trae también las consumidas y las que no llegaron: es el registro del libro,
   * no el stock disponible (para eso está `trozasDelPatio`).
   */
  static async trozasDelPeriodo(
    tenantId: string,
    opts: { from?: Date; to?: Date; limite?: number; offset?: number } = {},
  ): Promise<{
    trozas: Awaited<ReturnType<typeof WoodEntriesDB.trozasDelPatio>>;
    total: number;
    volumenM3: number;
  }> {
    if (!tenantId) throw new Error("tenantId is required");
    const where: Prisma.WoodEntryTrozaWhereInput = {
      tenantId,
      entry: {
        deletedAt: null,
        status: { notIn: ["anulado", "rechazado"] },
        ...(opts.from || opts.to
          ? {
              entryDate: {
                ...(opts.from ? { gte: opts.from } : {}),
                ...(opts.to ? { lte: opts.to } : {}),
              },
            }
          : {}),
      },
    };
    const take = Math.min(Math.max(opts.limite ?? 200, 1), 2000);
    const [trozas, total, suma] = await Promise.all([
      prisma.woodEntryTroza.findMany({
        where,
        orderBy: [{ entry: { entryDate: "desc" } }, { woodEntryId: "asc" }, { orden: "asc" }],
        take,
        skip: Math.max(opts.offset ?? 0, 0),
        include: {
          entry: { select: { id: true, gtfNumber: true, providerName: true, entryDate: true } },
          consumidaEn: { select: { id: true, status: true, deletedAt: true } },
          // El despacho que se la llevó SIN ASERRAR (ADR-363). Con su estado, por
          // lo mismo que la corrida: un despacho anulado devuelve la troza al
          // patio, y sin mirarlo la pieza quedaría bloqueada para siempre.
          despachadaEn: { select: { id: true, status: true, deletedAt: true } },
          /* El listado por pieza de Ingresos pasa por el mismo `serializar()`:
             sin esto diría «libre» de una pieza apartada en un mixto (ADR-441). */
          loteMixto: { select: SELECT_LOTE_MIXTO },
          _count: { select: { retrozos: true } },
        },
      }),
      prisma.woodEntryTroza.count({ where }),
      /* El total de m³ es de TODO el período, no de la página: es el número que
         el operador cuadra contra su Excel. */
      prisma.woodEntryTroza.aggregate({ where, _sum: { volumenM3: true } }),
    ]);
    return {
      trozas: trozas as Awaited<ReturnType<typeof WoodEntriesDB.trozasDelPatio>>,
      total,
      volumenM3: suma._sum.volumenM3 == null ? 0 : Number(suma._sum.volumenM3),
    };
  }

  /**
   * Marca qué piezas se comió una corrida (ADR-326).
   *
   * El volumen del consumo NO se toca acá: sigue viviendo en `ForestCtpConsumo`
   * con sus invariantes. Esto registra las piezas, y se valida lo mismo que el
   * cliente muestra —ya consumida, no recepcionada, descarte, madre partida—
   * para que mandar el POST a mano no saltee la regla.
   *
   * `trozaIds` vacío = se sueltan todas las de esa corrida (corregir una
   * atribución equivocada es corregir, no borrar historia: la corrida sigue).
   */
  static async marcarTrozasConsumidas(
    tenantId: string,
    ctpEntryId: string,
    trozaIds: string[],
    opts: { fecha?: Date; usuario: string },
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!ctpEntryId) throw new Error("ctpEntryId is required");

    return prisma.$transaction(async (tx) => {
      const corrida = await tx.forestCtpEntry.findFirst({
        where: { id: ctpEntryId, tenantId, deletedAt: null },
        select: { id: true, lineNo: true, section: true, status: true, entryDate: true },
      });
      if (!corrida) {
        throw new CtpInvariantError("Esa corrida no existe en este tenant.", "TENANT_MISMATCH", {
          ctpEntryId,
        });
      }
      if (corrida.section !== "produccion") {
        throw new CtpInvariantError(
          "Sólo una corrida de producción consume trozas.",
          "ESTADO_NO_EDITABLE",
          { ctpEntryId },
        );
      }
      // Cierre de período (ADR-139): qué piezas se comió una corrida es parte
      // del acta de ese mes. El consumo ES la corrida, así que la fecha que
      // manda es la suya.
      const cerradoCorrida = await ForestCtpCierreDB.closedPeriodOf(tenantId, corrida.entryDate);
      if (cerradoCorrida) {
        throw new CtpInvariantError(
          `El período ${cerradoCorrida.label} está cerrado: no se pueden cambiar las trozas de una corrida de un mes cerrado. Reabre el período para corregir.`,
          "PERIODO_CERRADO",
          { periodKey: cerradoCorrida.periodKey },
        );
      }
      // Costo congelado (ADR-134 D6): la atribución en m³ queda inmutable al
      // congelar, y las piezas son la EVIDENCIA FÍSICA de esa misma atribución.
      // Dejar una congelada y la otra editable permitía reescribir de qué trozas
      // salió un producto ya costeado y certificado (auditoría 2026-08-01).
      const congelados = await tx.forestCtpConsumo.count({
        where: { ctpEntryId, tenantId, congeladoAt: { not: null } },
      });
      if (congelados > 0) {
        throw new CtpInvariantError(
          "Esta corrida ya tiene el costo congelado: no se pueden cambiar sus trozas.",
          "CONGELADO",
          { ctpEntryId },
        );
      }

      const ids = [...new Set(trozaIds)];
      if (ids.length > 0) {
        // LOCK sobre las piezas disputadas, antes de leerlas para validar.
        //
        // Sin esto, dos operadores que tildan la MISMA troza a la vez leen los
        // dos "está libre" y la segunda pisa a la primera: las dos corridas
        // creen que la tienen. Es el mismo TOCTOU que I2 evita en m³ —el lock va
        // sobre el recurso disputado (la troza), no sobre la corrida— y el
        // escenario real de un aserradero con dos tablets en el patio.
        //
        // `ORDER BY id` para que dos transacciones que piden el mismo conjunto
        // lo tomen en el mismo orden: al revés se abrazan en un deadlock.
        await tx.$queryRaw`
          SELECT "id" FROM "WoodEntryTroza"
          WHERE "id" = ANY(${ids}::text[]) AND "tenantId" = ${tenantId}
          ORDER BY "id"
          FOR UPDATE
        `;

        const candidatas = await tx.woodEntryTroza.findMany({
          where: { id: { in: ids }, tenantId },
          select: {
            id: true,
            codificacion: true,
            volumenM3: true,
            consumidaEnId: true,
            noRecepcionada: true,
            descarte: true,
            // El ESTADO de la corrida que la tomó, no sólo su id: una corrida
            // anulada devolvió la madera al patio. Mirar el id pelado rechazaba
            // trozas que la pantalla ya mostraba libres — y esa asimetría es
            // peor que el bug original: el operador la tilda y no puede guardar.
            consumidaEn: { select: { status: true, deletedAt: true } },
            // Espejo de T2 (auditoría 2026-08-25): sin esto, una troza ya
            // despachada en rollo —o cuya guía de ingreso se anuló/rechazó
            // después— podía volver a marcarse "consumida" acá y quedar
            // contada dos veces en el libro oficial.
            despachadaEnId: true,
            despachadaEn: { select: { status: true, deletedAt: true } },
            /* T3 (ADR-433): el ingreso de la pieza — su recepción, la de su guía o el asiento. */
            codigoPlanta: true,
            fechaRecepcion: true,
            entry: {
              select: { status: true, deletedAt: true, gtfNumber: true, fechaRecepcion: true, entryDate: true },
            },
            /* LM4 (ADR-441): apartada en un mixto abierto, va con su pila. */
            loteMixto: { select: SELECT_LOTE_MIXTO },
            _count: { select: { retrozos: true } },
          },
        });
        if (candidatas.length !== ids.length) {
          throw new CtpInvariantError(
            "Alguna de esas trozas no existe en este tenant.",
            "TENANT_MISMATCH",
            {
              pedidas: ids.length,
              encontradas: candidatas.length,
            },
          );
        }
        /* Sólo las que ENTRAN ahora, como T3: la que esta corrida ya tenía no
           se revisa, así la corrida se puede seguir corrigiendo. */
        exigirFueraDelMixto(
          candidatas.filter((t) => t.consumidaEnId !== ctpEntryId),
          "T1_TROZA_NO_CONSUMIBLE",
        );
        /** Tomada por OTRA corrida que sigue viva. Si esa corrida se anuló o se
         *  borró, la pieza está libre aunque la columna todavía la apunte. */
        const tomadaPorOtra = (t: (typeof candidatas)[number]) =>
          Boolean(t.consumidaEnId && t.consumidaEnId !== ctpEntryId && vivaLinea(t.consumidaEn));
        const malas = candidatas.filter(
          (t) =>
            tomadaPorOtra(t) ||
            vivaLinea(t.despachadaEn) ||
            t.noRecepcionada ||
            t.descarte ||
            t._count.retrozos > 0 ||
            !(Number(t.volumenM3 ?? 0) > 0) ||
            Boolean(t.entry.deletedAt) ||
            ["anulado", "rechazado"].includes(t.entry.status),
        );
        if (malas.length > 0) {
          throw new CtpInvariantError(
            `No se pueden consumir estas trozas: ${malas.map((t) => t.codificacion ?? t.id).join(", ")}.`,
            "T1_TROZA_NO_CONSUMIBLE",
            { trozas: malas.map((t) => t.id) },
          );
        }
        /* T3 (ADR-433) sólo sobre las que ENTRAN ahora: las que esta corrida ya
           tenía no se revisan, así una corrida vieja que ya viola la regla
           todavía se puede corregir (soltarle piezas, cambiar la selección). */
        exigirIngresoAntesDeLaCorrida(
          candidatas.filter((t) => t.consumidaEnId !== ctpEntryId),
          { id: corrida.id, lineNo: corrida.lineNo, fecha: corrida.entryDate },
        );
      }

      // Primero se sueltan las que ya no están en la selección, después se toman
      // las nuevas: al revés, una pieza movida de corrida quedaría sin dueño.
      await tx.woodEntryTroza.updateMany({
        where: {
          tenantId,
          consumidaEnId: ctpEntryId,
          ...(ids.length > 0 ? { id: { notIn: ids } } : {}),
        },
        data: { consumidaEnId: null, fechaConsumo: null },
      });
      if (ids.length > 0) {
        await tx.woodEntryTroza.updateMany({
          where: { tenantId, id: { in: ids } },
          data: { consumidaEnId: ctpEntryId, fechaConsumo: opts.fecha ?? new Date() },
        });
      }

      auditCtp({
        tenantId,
        action: "ctp_trozas_consumidas",
        entity: "ForestCtpEntry",
        entityId: ctpEntryId,
        detail: `Corrida #${corrida.lineNo ?? "?"}: ${ids.length} troza(s) declaradas como consumidas`,
        user: opts.usuario,
      });
      try {
        invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
      } catch {}

      return { consumidas: ids.length };
    });
  }

  /**
   * Las trozas que NO pueden salir sin aserrar, con el invariante T2 aplicado
   * (ADR-363). Una sola definición para los dos caminos —el pre-chequeo, que da
   * el error ANTES de crear la línea, y el marcado con lock— porque dos copias
   * de la misma regla terminan divergiendo, y la que divergiría acá deja pasar
   * madera que la otra rechaza.
   */
  static trozasNoDespachables<
    T extends {
      id: string;
      codificacion: string | null;
      volumenM3: unknown;
      consumidaEn: { status: string; deletedAt: Date | null } | null;
      despachadaEnId: string | null;
      despachadaEn: { status: string; deletedAt: Date | null } | null;
      noRecepcionada: boolean;
      descarte: boolean;
      entry: { status: string; deletedAt: Date | null };
      _count: { retrozos: number };
    },
  >(candidatas: readonly T[], despachoEntryId: string | null): T[] {
    return candidatas.filter(
      (t) =>
        vivaLinea(t.consumidaEn) ||
        (t.despachadaEnId !== despachoEntryId && vivaLinea(t.despachadaEn)) ||
        t.noRecepcionada ||
        t.descarte ||
        t._count.retrozos > 0 ||
        !(Number(t.volumenM3 ?? 0) > 0) ||
        Boolean(t.entry.deletedAt) ||
        ["anulado", "rechazado"].includes(t.entry.status),
    );
  }

  /**
   * Pre-chequeo de T2 sin escribir: se corre ANTES de crear la línea para que
   * una troza ya vendida no deje un despacho fantasma en el libro. El marcado
   * vuelve a validar con LOCK — esto no reemplaza al lock, lo adelanta.
   */
  static async assertTrozasDespachables(tenantId: string, trozaIds: string[]) {
    if (!tenantId) throw new Error("tenantId is required");
    const ids = [...new Set(trozaIds)];
    if (ids.length === 0) return;
    const candidatas = await prisma.woodEntryTroza.findMany({
      where: { id: { in: ids }, tenantId },
      select: {
        id: true,
        codificacion: true,
        volumenM3: true,
        consumidaEnId: true,
        despachadaEnId: true,
        noRecepcionada: true,
        descarte: true,
        consumidaEn: { select: { status: true, deletedAt: true } },
        despachadaEn: { select: { status: true, deletedAt: true } },
        entry: { select: { status: true, deletedAt: true } },
        codigoPlanta: true,
        loteMixto: { select: SELECT_LOTE_MIXTO },
        _count: { select: { retrozos: true } },
      },
    });
    if (candidatas.length !== ids.length) {
      throw new CtpInvariantError(
        "Alguna de esas trozas no existe en este tenant.",
        "TENANT_MISMATCH",
        {
          pedidas: ids.length,
          encontradas: candidatas.length,
        },
      );
    }
    /* LM4 antes de crear la línea: un despacho fantasma no debe nacer por una
       pieza que está en una pila por aserrar. */
    exigirFueraDelMixto(candidatas, "T2_TROZA_NO_DESPACHABLE");
    const malas = WoodEntriesDB.trozasNoDespachables(candidatas, null);
    if (malas.length > 0) {
      throw new CtpInvariantError(
        `No se pueden despachar estas trozas: ${malas.map((t) => t.codificacion ?? t.id).join(", ")}.`,
        "T2_TROZA_NO_DESPACHABLE",
        { trozas: malas.map((t) => t.id) },
      );
    }
    const total = candidatas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0);
    return { volumenM3: Math.round(total * 10000) / 10000 };
  }

  /**
   * Declara qué PIEZAS salieron SIN ASERRAR en un despacho (ADR-363, T2).
   *
   * Es el espejo de `marcarConsumo`: la misma pieza, el mismo lock, las mismas
   * reglas — sólo que en vez de entrar a la sierra, sube al camión tal como
   * llegó. Se separan en dos columnas porque son dos hechos distintos y el
   * libro tiene que poder decir cuál de los dos pasó.
   *
   * `trozaIds: []` las suelta (el despacho se corrigió y ya no lleva ninguna).
   */
  static async marcarDespachoTrozas(
    tenantId: string,
    despachoEntryId: string,
    trozaIds: string[],
    opts: { fecha?: Date; usuario: string },
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!despachoEntryId) throw new Error("despachoEntryId is required");

    return prisma.$transaction(async (tx) => {
      const despacho = await tx.forestCtpEntry.findFirst({
        where: { id: despachoEntryId, tenantId, deletedAt: null },
        select: { id: true, lineNo: true, section: true, status: true, entryDate: true },
      });
      if (!despacho) {
        throw new CtpInvariantError("Ese despacho no existe en este tenant.", "TENANT_MISMATCH", {
          despachoEntryId,
        });
      }
      if (despacho.section !== "despacho") {
        throw new CtpInvariantError(
          "Sólo una línea de despacho puede llevarse trozas.",
          "ESTADO_NO_EDITABLE",
          { despachoEntryId },
        );
      }
      if (despacho.status !== "registrado") {
        throw new CtpInvariantError(
          "El despacho está anulado: sus trozas ya volvieron al patio.",
          "ESTADO_NO_EDITABLE",
          { despachoEntryId },
        );
      }
      const cerrado = await ForestCtpCierreDB.closedPeriodOf(tenantId, despacho.entryDate);
      if (cerrado) {
        throw new CtpInvariantError(
          `El período ${cerrado.label} está cerrado: no se pueden cambiar las trozas de un despacho de un mes cerrado. Reabre el período para corregir.`,
          "PERIODO_CERRADO",
          { periodKey: cerrado.periodKey },
        );
      }

      const ids = [...new Set(trozaIds)];
      if (ids.length > 0) {
        /* LOCK sobre las piezas disputadas, con `ORDER BY id`: dos tablets que
           cargan el mismo camión leerían las dos "está libre". Mismo patrón que
           el consumo por pieza (T1) — el recurso disputado es la troza. */
        await tx.$queryRaw`
          SELECT "id" FROM "WoodEntryTroza"
          WHERE "id" = ANY(${ids}::text[]) AND "tenantId" = ${tenantId}
          ORDER BY "id"
          FOR UPDATE
        `;

        const candidatas = await tx.woodEntryTroza.findMany({
          where: { id: { in: ids }, tenantId },
          select: {
            id: true,
            codificacion: true,
            volumenM3: true,
            consumidaEnId: true,
            despachadaEnId: true,
            noRecepcionada: true,
            descarte: true,
            // El ESTADO de la línea que la tomó, no su id pelado: una corrida o
            // un despacho anulados devolvieron la madera al patio.
            consumidaEn: { select: { status: true, deletedAt: true } },
            despachadaEn: { select: { status: true, deletedAt: true } },
            entry: { select: { status: true, deletedAt: true } },
            codigoPlanta: true,
            /* LM4 (ADR-441): apartada en un mixto abierto, va con su pila. */
            loteMixto: { select: SELECT_LOTE_MIXTO },
            _count: { select: { retrozos: true } },
          },
        });
        if (candidatas.length !== ids.length) {
          throw new CtpInvariantError(
            "Alguna de esas trozas no existe en este tenant.",
            "TENANT_MISMATCH",
            {
              pedidas: ids.length,
              encontradas: candidatas.length,
            },
          );
        }

        /* Sólo las que SUBEN ahora al camión: las que este despacho ya llevaba
           no se revisan (mismo criterio que `trozasNoDespachables`). */
        exigirFueraDelMixto(
          candidatas.filter((t) => t.despachadaEnId !== despachoEntryId),
          "T2_TROZA_NO_DESPACHABLE",
        );
        const malas = WoodEntriesDB.trozasNoDespachables(candidatas, despachoEntryId);
        if (malas.length > 0) {
          throw new CtpInvariantError(
            `No se pueden despachar estas trozas: ${malas.map((t) => t.codificacion ?? t.id).join(", ")}.`,
            "T2_TROZA_NO_DESPACHABLE",
            { trozas: malas.map((t) => t.id) },
          );
        }
      }

      // Primero se sueltan las que ya no están en la selección, después se toman
      // las nuevas: al revés, una pieza movida de despacho quedaría sin dueño.
      await tx.woodEntryTroza.updateMany({
        where: {
          tenantId,
          despachadaEnId: despachoEntryId,
          ...(ids.length > 0 ? { id: { notIn: ids } } : {}),
        },
        data: { despachadaEnId: null, fechaDespacho: null },
      });
      if (ids.length > 0) {
        await tx.woodEntryTroza.updateMany({
          where: { tenantId, id: { in: ids } },
          data: { despachadaEnId: despachoEntryId, fechaDespacho: opts.fecha ?? new Date() },
        });
      }

      auditCtp({
        tenantId,
        action: "ctp_trozas_despachadas",
        entity: "ForestCtpEntry",
        entityId: despachoEntryId,
        detail: `Despacho #${despacho.lineNo ?? "?"}: ${ids.length} troza(s) salieron sin aserrar`,
        user: opts.usuario,
      });
      try {
        invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
      } catch {}

      return { despachadas: ids.length };
    });
  }

  /**
   * Corta una troza en pedazos (ADR-313).
   *
   * El LOCK va sobre la troza madre —el recurso disputado—, no sobre la tabla:
   * dos operadores cortando la misma troza a la vez leerían los dos el mismo
   * "ya cortado" y entre los dos pasarían el volumen. Mismo patrón que las
   * invariantes I1-I5.
   */
  static async retrozar(
    tenantId: string,
    trozaId: string,
    pedazos: RetrozoNuevo[],
    opts: { fecha?: Date; usuario: string },
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!trozaId) throw new Error("trozaId is required");

    return prisma.$transaction(async (tx) => {
      // Bloquea la fila de la madre hasta el fin de la tx.
      const bloqueo = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "WoodEntryTroza"
        WHERE "id" = ${trozaId} AND "tenantId" = ${tenantId}
        FOR UPDATE
      `;
      if (bloqueo.length === 0) {
        throw new CtpInvariantError("Esa troza no existe en este tenant.", "TENANT_MISMATCH", {
          trozaId,
        });
      }

      const madre = await tx.woodEntryTroza.findFirst({
        where: { id: trozaId, tenantId },
        include: {
          retrozos: { select: { volumenM3: true, largoM: true, descarte: true } },
          entry: { select: { id: true, gtfNumber: true, status: true, deletedAt: true } },
          /* LM4 (ADR-441): una madre apartada en un mixto abierto va entera a
             la sierra con su pila; cortarla la sacaría de la pila en silencio. */
          loteMixto: { select: SELECT_LOTE_MIXTO },
        },
      });
      if (!madre)
        throw new CtpInvariantError("Esa troza no existe en este tenant.", "TENANT_MISMATCH", {
          trozaId,
        });
      if (madre.entry.deletedAt) {
        throw new CtpInvariantError(
          "El ingreso de esa troza está anulado: no se puede retrozar.",
          "ESTADO_NO_EDITABLE",
          { trozaId },
        );
      }
      // Una troza que ya es pedazo de otra no se vuelve a cortar acá: el árbol
      // de dos niveles alcanza para el libro y uno más profundo haría que el
      // saldo de la madre dependa de una recursión que nadie audita.
      if (madre.trozaOrigenId) {
        throw new CtpInvariantError(
          `La troza ${madre.codificacion ?? ""} ya es un pedazo de otra: no se puede volver a retrozar.`,
          "ESTADO_NO_EDITABLE",
          { trozaId },
        );
      }
      exigirFueraDelMixto([madre], "ESTADO_NO_EDITABLE");
      // Cierre de período (ADR-139): el corte va al Apartado 2 del libro del mes
      // en que se hizo, así que es la fecha del CORTE la que manda — no la de la
      // guía por la que entró la troza.
      const fechaCorte = opts.fecha ?? new Date();
      const cerradoCorte = await ForestCtpCierreDB.closedPeriodOf(tenantId, fechaCorte);
      if (cerradoCorte) {
        throw new CtpInvariantError(
          `El período ${cerradoCorte.label} está cerrado: no se puede registrar un retrozado con fecha de un mes cerrado. Reabre el período para corregir.`,
          "PERIODO_CERRADO",
          { periodKey: cerradoCorte.periodKey },
        );
      }

      const calculo = calcularRetrozado(
        {
          id: madre.id,
          codificacion: madre.codificacion,
          // Los extremos REALES. Con el promedio (65.5) una troza de 73→58
          // rechazaba un corte de 73 cm, que es justamente su propia base.
          d1Cm:
            madre.d1Cm != null
              ? Number(madre.d1Cm)
              : madre.diametroCm != null
                ? Number(madre.diametroCm)
                : null,
          d2Cm:
            madre.d2Cm != null
              ? Number(madre.d2Cm)
              : madre.diametroCm != null
                ? Number(madre.diametroCm)
                : null,
          largoM: madre.largoM != null ? Number(madre.largoM) : null,
          volumenM3: madre.volumenM3 != null ? Number(madre.volumenM3) : null,
          retrozosPrevios: madre.retrozos.map((r) => ({
            volumenM3: r.volumenM3 != null ? Number(r.volumenM3) : null,
            largoM: r.largoM != null ? Number(r.largoM) : null,
          })),
        },
        pedazos,
      );
      if (!calculo.ok) {
        throw new CtpInvariantError(calculo.errores.join(" "), "R1_SOBRE_RETROZADO", {
          trozaId,
          errores: calculo.errores,
        });
      }

      const fecha = fechaCorte;
      await tx.woodEntryTroza.createMany({
        data: calculo.retrozos.map((r) => ({
          tenantId,
          woodEntryId: madre.woodEntryId,
          trozaOrigenId: madre.id,
          orden: r.orden,
          codificacion: r.codificacion,
          especieComun: madre.especieComun,
          especieCientifica: madre.especieCientifica,
          dimensiones: `${r.d1Cm} X ${r.d2Cm} X ${r.largoM}`,
          largoM: new Prisma.Decimal(r.largoM),
          diametroCm: new Prisma.Decimal((r.d1Cm + r.d2Cm) / 2),
          d1Cm: new Prisma.Decimal(r.d1Cm),
          d2Cm: new Prisma.Decimal(r.d2Cm),
          cantidad: 1,
          volumenM3: new Prisma.Decimal(r.volumenM3),
          fechaRetrozo: fecha,
          descarte: r.descarte ?? false,
          observaciones: r.observaciones ?? null,
        })),
      });

      auditCtp({
        tenantId,
        action: "ctp_ingreso_update",
        entity: "WoodEntryTroza",
        entityId: madre.id,
        detail:
          `Retrozó la troza ${madre.codificacion ?? madre.id} (GTF ${madre.entry.gtfNumber}) en ` +
          `${calculo.retrozos.length} pedazo(s): ${calculo.retrozos.map((r) => `${r.codificacion} ${m3(r.volumenM3)}`).join(", ")}` +
          ` · quedan ${m3(calculo.volumenLibre)} sin cortar`,
        user: opts.usuario,
      });
      try {
        invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
      } catch {}

      return {
        madre: { id: madre.id, codificacion: madre.codificacion },
        retrozos: calculo.retrozos,
        volumenRetrozado: calculo.volumenRetrozado,
        volumenLibre: calculo.volumenLibre,
      };
    });
  }

  /**
   * Los retrozos del período — el **Apartado 2 del formato LO-CTP** (ADR-313).
   *
   * Sólo los pedazos (`trozaOrigenId != null`) con su madre: la fila del apartado
   * necesita el volumen inicial y el código de origen, que viven en la madre.
   *
   * El filtro es por `fechaRetrozo` porque el retrozado es una operación del
   * patio con fecha propia: un pedazo cortado en agosto de una troza que entró en
   * julio pertenece al libro de agosto. Los pedazos viejos sin fecha (no debería
   * haberlos) caen al `createdAt` para no desaparecer del libro.
   */
  static async retrozosDelPeriodo(
    tenantId: string,
    opts: { fromDate?: Date; toDate?: Date; limite?: number } = {},
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const rango =
      opts.fromDate || opts.toDate
        ? {
            ...(opts.fromDate ? { gte: opts.fromDate } : {}),
            ...(opts.toDate ? { lte: opts.toDate } : {}),
          }
        : undefined;

    return prisma.woodEntryTroza.findMany({
      where: {
        tenantId,
        trozaOrigenId: { not: null },
        // Un retrozo de un ingreso anulado no es parte del libro (mismo criterio
        // que `buscarTrozas`): hacen falta las DOS condiciones.
        entry: { deletedAt: null, status: { notIn: ["anulado", "rechazado"] } },
        ...(rango
          ? { OR: [{ fechaRetrozo: rango }, { fechaRetrozo: null, createdAt: rango }] }
          : {}),
      },
      orderBy: [{ fechaRetrozo: "asc" }, { orden: "asc" }],
      take: Math.min(Math.max(opts.limite ?? 2000, 1), 5000),
      include: {
        trozaOrigen: {
          select: {
            id: true,
            codificacion: true,
            volumenM3: true,
            especieComun: true,
            especieCientifica: true,
          },
        },
        entry: { select: { gtfNumber: true, originCode: true, ctpProductCode: true } },
      },
    });
  }

  /** Las trozas de un ingreso, en el orden en que las lista la guía. */
  /**
   * Una troza por CUALQUIERA de sus códigos, para el importador del SNIFFS.
   *
   * El reporte del SNIFFS trae el código en una sola columna sin decir cuál de
   * los dos es: puede ser la codificación de la guía o el que este centro marcó
   * sobre la pieza al recibirla. Buscar por uno solo deja la mitad de las filas
   * como «no existe» sobre trozas que sí están en el libro.
   *
   * Devuelve lo que el importador necesita para DECIDIR: si está libre, si ya
   * está retrozada y cuánto volumen tiene.
   */
  static async buscarTrozaPorCodigo(tenantId: string, codigo: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const c = codigo.trim();
    if (!c) return null;
    return prisma.woodEntryTroza.findFirst({
      where: {
        tenantId,
        OR: [{ codificacion: c }, { codigoPlanta: c }],
        entry: { deletedAt: null },
      },
      select: {
        id: true,
        codificacion: true,
        codigoPlanta: true,
        volumenM3: true,
        consumidaEnId: true,
        trozaOrigenId: true,
        noRecepcionada: true,
        retrozos: { select: { id: true, codificacion: true } },
      },
    });
  }

  /**
   * La historia entera de UNA pieza: de qué guía vino hasta dónde terminó.
   *
   * El libro ya sabía contar la cadena por ingreso (`trazaForwardIngreso`), por
   * lote (`cadenaDeLote`) y por despacho (`trazabilidadCompleta`), pero no por
   * TROZA — que es la unidad con la que pregunta el que está parado frente al
   * tronco: «este palo, ¿de dónde salió y adónde fue?».
   *
   * Trae la madre y los pedazos porque una pieza retrozada no termina en sí
   * misma: su madera siguió viaje en otras filas, y sin verlas la ficha diría
   * que la troza «no se usó» cuando en realidad se cortó en tres (ADR-313).
   *
   * Los estados de corrida y despacho viajan enteros por el mismo motivo que en
   * las otras tres lecturas: una anulada devolvió la madera al patio, y con el
   * id pelado la ficha declararía consumida una pieza que está libre.
   */
  static async fichaDeTroza(tenantId: string, trozaId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const id = trozaId.trim();
    if (!id) return null;
    return prisma.woodEntryTroza.findFirst({
      where: { tenantId, id, entry: { deletedAt: null } },
      include: {
        entry: {
          select: {
            id: true,
            libroNro: true,
            gtfNumber: true,
            providerName: true,
            entryDate: true,
            fechaRecepcion: true,
            status: true,
            originCode: true,
            originSourceNumber: true,
            /* La constancia del SNIFFS: la ficha del patio la muestra junto al
               N° de registro del libro, como la ficha que lleva el QR. */
            serforNumeroRegistro: true,
            volumeM3: true,
            /* Las fotos de la carga (ADR-434, iguales en todas las filas de la
               guía): la tarjeta del QR (`/admin/q/<id>`) muestra la primera. */
            photos: true,
          },
        },
        trozaOrigen: {
          select: { id: true, codificacion: true, codigoPlanta: true, volumenM3: true },
        },
        retrozos: {
          orderBy: { orden: "asc" },
          select: {
            id: true,
            codificacion: true,
            codigoPlanta: true,
            volumenM3: true,
            largoM: true,
            d1Cm: true,
            d2Cm: true,
            descarte: true,
            consumidaEnId: true,
            despachadaEnId: true,
          },
        },
        loteAserrio: { select: { id: true, code: true, status: true, speciesCommon: true } },
        /* El lote MIXTO (ADR-441): la ficha es lo que lee el escáner, y ahí se
           decide «ya está en OTRO mixto» antes de mandar nada al servidor. */
        loteMixto: { select: SELECT_LOTE_MIXTO },
        consumidaEn: {
          select: {
            id: true,
            lineNo: true,
            entryDate: true,
            status: true,
            deletedAt: true,
            productType: true,
            presentacion: true,
            quantity: true,
            unit: true,
            rendimientoPct: true,
            lineaProduccion: true,
            volumeInputM3: true,
          },
        },
        despachadaEn: {
          select: {
            id: true,
            lineNo: true,
            entryDate: true,
            status: true,
            deletedAt: true,
            docType: true,
            gtfNumber: true,
            quantity: true,
            unit: true,
          },
        },
      },
    });
  }

  static async trozasDe(tenantId: string, woodEntryId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    // Sólo las trozas de la guía: los pedazos cuelgan de ellas (`retrozos`) para
    // que la vista los muestre debajo de su madre y no como filas sueltas que
    // parecerían madera de más.
    return prisma.woodEntryTroza.findMany({
      where: { tenantId, woodEntryId, trozaOrigenId: null },
      orderBy: { orden: "asc" },
      include: {
        /* Un pedazo también se aparta en un mixto (ADR-441): su fila lo dice. */
        retrozos: { orderBy: { orden: "asc" }, include: { loteMixto: { select: SELECT_LOTE_MIXTO } } },
        // Igual que `trozasDelPatio` y `buscarTrozas`: quien lee una troza tiene
        // que poder saber si ya se aserró, y con el ESTADO de la corrida, no con
        // el id pelado. Las tres lecturas de la misma pieza dicen lo mismo.
        consumidaEn: { select: { id: true, status: true, deletedAt: true } },
        // El despacho que se la llevó SIN ASERRAR (ADR-363). Con su estado, por
        // lo mismo que la corrida: un despacho anulado devuelve la troza al
        // patio, y sin mirarlo la pieza quedaría bloqueada para siempre.
        despachadaEn: { select: { id: true, status: true, deletedAt: true } },
        loteAserrio: { select: { id: true, code: true, status: true } },
        loteMixto: { select: SELECT_LOTE_MIXTO },
      },
    });
  }

  /**
   * Lista entries con filtros. Excluye soft-deleted por default.
   */
  /**
   * Las PIEZAS que se comió una corrida (ADR-326).
   *
   * La ficha de una corrida sabía decir de qué guías salió y cuánto costó, pero
   * no qué trozas entraron: un fiscalizador no cuenta metros cúbicos abstractos,
   * cuenta piezas en la pila. Es la misma pregunta que responde el panel de las
   * corridas sin declarar, y por eso se lee una sola vez, acá.
   *
   * Se filtra por el ESTADO de la corrida como el resto del módulo: una anulada
   * ya devolvió su madera al patio y no tiene piezas que mostrar. El campo
   * `fechaConsumo` viaja: es cuándo entró ESA pieza, que puede no ser el día del
   * asiento.
   */
  static async trozasDeCorrida(tenantId: string, ctpEntryId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const viva = await prisma.forestCtpEntry.count({
      where: { id: ctpEntryId, tenantId, deletedAt: null, status: { not: "anulado" } },
    });
    if (viva === 0) return [];
    return prisma.woodEntryTroza.findMany({
      where: { tenantId, consumidaEnId: ctpEntryId },
      orderBy: [{ woodEntryId: "asc" }, { orden: "asc" }],
      select: {
        id: true,
        woodEntryId: true,
        codificacion: true,
        codigoPlanta: true,
        especieComun: true,
        especieCientifica: true,
        d1Cm: true,
        d2Cm: true,
        largoM: true,
        volumenM3: true,
        fechaConsumo: true,
        entry: { select: { gtfNumber: true, originCode: true } },
      },
    });
  }

  static async list(tenantId: string, filters: WoodEntryListFilters = {}) {
    if (!tenantId) throw new Error("tenantId is required");

    const where = await whereDelListado(tenantId, filters);

    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 500);
    const offset = Math.max(filters.offset ?? 0, 0);

    // Orden pedido + desempate por `createdAt`: con dos ingresos del mismo día
    // (o el mismo volumen) Postgres no garantiza orden estable, y una lista
    // inestable duplica/saltea filas al pasar de página.
    const sortBy = filters.sortBy ?? "entryDate";
    const sortDir = filters.sortDir ?? "desc";
    const orderBy: Prisma.WoodEntryOrderByWithRelationInput[] = [{ [sortBy]: sortDir }];
    if (sortBy !== "createdAt") orderBy.push({ createdAt: "desc" });

    const [entries, total] = await Promise.all([
      prisma.woodEntry.findMany({
        where,
        orderBy,
        take: limit,
        skip: offset,
      }),
      prisma.woodEntry.count({ where }),
    ]);

    const trozas = await WoodEntriesDB.resumenTrozasDe(entries.map((e) => e.id));

    return {
      entries: entries.map((e) => ({
        ...e,
        ...(trozas.get(e.id) ?? { trozasCount: 0, trozasM3: null, trozasDecididas: 0 }),
      })),
      total,
    };
  }

  /**
   * Los proveedores tal como quedaron tipeados en las guías de ingreso: sólo
   * los cuatro campos que el descubrimiento del directorio necesita (ADR-357),
   * NADA de `gtfDatos` — ese blob es lo que pesa de una guía y acá no hace
   * falta (el descubrimiento de destinatario/transportista/conductor sigue
   * yendo por `list()`, que sí lo trae, desde la tarjeta general).
   *
   * Sin filtro de `status`: un ingreso rechazado igual lo tipeó un proveedor
   * real, y es el mismo criterio que ya usa `list()` sin filtros (regla
   * "verificar por el camino del usuario": dos lecturas del mismo dato no
   * pueden discrepar en qué cuentan).
   */
  static async proveedoresParaDirectorio(
    tenantId: string,
  ): Promise<
    Array<{
      gtfNumber: string;
      providerName: string;
      providerDocument: string | null;
      providerDocumentType: DocumentType | null;
    }>
  > {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.woodEntry.findMany({
      where: { tenantId, deletedAt: null },
      select: { gtfNumber: true, providerName: true, providerDocument: true, providerDocumentType: true },
      // `id` desempata las guías del mismo día: sin él Postgres no garantiza el
      // orden y el nombre que gana un empate cambiaba entre lecturas.
      orderBy: [{ entryDate: "desc" }, { id: "desc" }],
      // Tope: el descubrimiento propone, no lista el libro entero — un patio
      // real no tiene más ingresos que esto entre altas de directorio.
      take: 5000,
    });
  }

  /**
   * El mismo listado, pero la unidad es la GUÍA (ADR-346).
   *
   * Una GTF con dos especies son dos asientos —el formato oficial pide una línea
   * por especie (ADR-312)— y la bandeja los mostraba como dos guías iguales, con
   * el mismo papel, el mismo proveedor y la misma fecha, para recepcionar dos
   * veces. Acá se pagina y se ordena por **documento**, y cada fila trae sus
   * asientos adentro.
   *
   * Se pagina sobre los GRUPOS y no sobre una página de asientos: cortar a los
   * 50 partiría una guía justo en el borde y la misma guía saldría en dos
   * páginas. Los grupos se traen enteros (un `groupBy` devuelve una fila por
   * guía, no por asiento) y se ordenan acá; los asientos que viajan son sólo
   * los de la página.
   */
  /**
   * Los ingresos VIGENTES del período contados por guía (reporte diario,
   * ADR-439): mismos filtros que `stats`/`listPorGuia` (`whereDelListado`) y
   * el MISMO predicado de recepción que la bandeja (`idsRecepcionados`). El
   * conteo lo hace `resumirIngresosPorGuia`, puro y probado.
   */
  static async resumenPorGuia(tenantId: string, filters: WoodEntryListFilters = {}): Promise<IngresosPorGuia> {
    if (!tenantId) throw new Error("tenantId is required");
    const { status: _s, limit: _l, offset: _o, ...periodo } = filters;
    const where = await whereDelListado(tenantId, periodo);
    const [filas, recibidos] = await Promise.all([
      prisma.woodEntry.findMany({
        where: { ...where, status: { notIn: ["rechazado", "anulado"] } },
        select: {
          id: true,
          gtfSeries: true,
          gtfNumber: true,
          maderaDeTercero: true,
          speciesCommonName: true,
          providerName: true,
          volumeM3: true,
        },
        /* Un período de días, no el libro entero: el tope es una red. */
        take: 5000,
      }),
      idsRecepcionados(tenantId),
    ]);
    return resumirIngresosPorGuia(
      filas.map((f) => ({ ...f, volumeM3: f.volumeM3 == null ? null : Number(f.volumeM3) })),
      new Set(recibidos),
    );
  }

  static async listPorGuia(
    tenantId: string,
    filters: WoodEntryListFilters = {},
  ): Promise<{ guias: GuiaIngreso<WoodEntryConTrozas>[]; total: number; lineas: number }> {
    if (!tenantId) throw new Error("tenantId is required");

    const where = await whereDelListado(tenantId, filters);

    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 500);
    const offset = Math.max(filters.offset ?? 0, 0);
    const sortBy = filters.sortBy ?? "entryDate";
    const sortDir = filters.sortDir ?? "desc";

    const grupos = await prisma.woodEntry.groupBy({
      by: ["gtfSeries", "gtfNumber"],
      where,
      _count: { _all: true },
      _sum: { volumeM3: true, pieces: true },
      _min: { entryDate: true, createdAt: true, providerName: true, speciesCommonName: true },
      /* La recepción de la GUÍA es la del último asiento recibido: se recibe de
         una, y el `_max` es lo que la pone arriba del archivo. */
      _max: { fechaRecepcion: true },
    });

    const lineas = grupos.reduce((a, g) => a + g._count._all, 0);
    if (grupos.length === 0) return { guias: [], total: 0, lineas: 0 };

    /* El orden de una guía sale de sus asientos: por fecha manda el más viejo
       —la guía entró una vez— y por cantidad manda la suma, que es lo que trajo
       el camión. En texto, el primero alfabético del grupo. */
    const clave = (g: (typeof grupos)[number]): number | string => {
      switch (sortBy) {
        case "volumeM3":
          return Number(g._sum.volumeM3 ?? 0);
        case "pieces":
          return g._sum.pieces ?? 0;
        case "providerName":
          return (g._min.providerName ?? "").toLowerCase();
        case "speciesCommonName":
          return (g._min.speciesCommonName ?? "").toLowerCase();
        case "createdAt":
          return g._min.createdAt?.getTime() ?? 0;
        case "fechaRecepcion":
          return g._max.fechaRecepcion?.getTime() ?? 0;
        default:
          return g._min.entryDate?.getTime() ?? 0;
      }
    };
    const signo = sortDir === "asc" ? 1 : -1;
    const ordenados = [...grupos].sort((a, b) => {
      const ka = clave(a);
      const kb = clave(b);
      if (ka < kb) return -1 * signo;
      if (ka > kb) return 1 * signo;
      /* Desempate estable: sin él, dos guías del mismo día se pisan entre
         páginas y una fila aparece dos veces o ninguna. */
      const ca = (a._min.createdAt?.getTime() ?? 0) - (b._min.createdAt?.getTime() ?? 0);
      if (ca !== 0) return -ca;
      return `${a.gtfSeries ?? ""}|${a.gtfNumber}`.localeCompare(
        `${b.gtfSeries ?? ""}|${b.gtfNumber}`,
      );
    });

    const pagina = ordenados.slice(offset, offset + limit);
    if (pagina.length === 0) return { guias: [], total: grupos.length, lineas };

    /* Los asientos de esas guías, con el MISMO `where`: si un filtro dejó fuera
       una línea, la guía no puede recuperarla por la puerta de atrás. */
    const entries = await prisma.woodEntry.findMany({
      where: {
        AND: [
          where,
          { OR: pagina.map((g) => ({ gtfSeries: g.gtfSeries, gtfNumber: g.gtfNumber })) },
        ],
      },
      orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
    });

    const trozas = await WoodEntriesDB.resumenTrozasDe(entries.map((e) => e.id));
    const conTrozas: WoodEntryConTrozas[] = entries.map((e) => ({
      ...e,
      ...(trozas.get(e.id) ?? { trozasCount: 0, trozasM3: null, trozasDecididas: 0 }),
    }));

    /* El orden lo pone la página de grupos: el `findMany` sólo sabe de fechas. */
    const porClave = new Map<string, WoodEntryConTrozas[]>();
    for (const e of conTrozas) {
      const k = claveDeGuia(e);
      const previo = porClave.get(k);
      if (previo) previo.push(e);
      else porClave.set(k, [e]);
    }
    const guias = pagina
      .map((g) => porClave.get(claveDeGuia({ gtfNumber: g.gtfNumber, gtfSeries: g.gtfSeries })))
      .filter((ls): ls is WoodEntryConTrozas[] => Boolean(ls && ls.length))
      .map((ls) => resumirGuia(ls));

    return { guias, total: grupos.length, lineas };
  }

  /**
   * Cuántas piezas tiene cada ingreso y cuántos m³ suman.
   *
   * Existe para que la TABLA pueda avisar del descuadre: hasta ahora la única
   * forma de ver que un ingreso declara 10 m³ y sus piezas suman 5 era abrir el
   * ingreso, uno por uno. Una fila que no cuadra con su propio detalle es
   * exactamente lo que un fiscalizador cruza.
   *
   * Un `groupBy` por página (≤500 ingresos), no una consulta por fila.
   *
   * ⚠️ Sólo las MADRES (`trozaOrigenId: null`). Un retrozo es un pedazo de una
   * troza que ya está contada: sumar los dos es la misma madera dos veces, el
   * mismo error que el consumo por pieza evita (ADR-313/326). Es también lo que
   * hace la pantalla, que anida los retrozos dentro de su madre.
   */
  private static async resumenTrozasDe(
    ids: string[],
  ): Promise<
    Map<string, { trozasCount: number; trozasM3: number | null; trozasDecididas: number }>
  > {
    const mapa = new Map<
      string,
      { trozasCount: number; trozasM3: number | null; trozasDecididas: number }
    >();
    if (ids.length === 0) return mapa;

    /* Dos cuentas: cuántas piezas declara la guía y cuántas ya tienen DECISIÓN
       de recepción —fechada o marcada como no llegada (ADR-325/336)—. La
       segunda es la que dice si la guía puede salir de la bandeja de
       «por recepcionar» (ADR-339); sin ella, el estado había que adivinarlo
       abriendo el ingreso pieza por pieza. */
    const [filas, decididas] = await Promise.all([
      prisma.woodEntryTroza.groupBy({
        by: ["woodEntryId"],
        where: { woodEntryId: { in: ids }, trozaOrigenId: null },
        _count: { _all: true },
        _sum: { volumenM3: true },
      }),
      prisma.woodEntryTroza.groupBy({
        by: ["woodEntryId"],
        where: {
          woodEntryId: { in: ids },
          trozaOrigenId: null,
          OR: [{ fechaRecepcion: { not: null } }, { noRecepcionada: true }],
        },
        _count: { _all: true },
      }),
    ]);
    const porId = new Map(decididas.map((d) => [d.woodEntryId, d._count._all]));

    for (const f of filas) {
      mapa.set(f.woodEntryId, {
        trozasCount: f._count._all,
        // Sin volumen cargado el total es `null`, no 0: "no sé" y "cero" son
        // distintos, y un 0 haría que la tabla gritara descuadre en todas.
        trozasM3: f._sum.volumenM3 == null ? null : Number(f._sum.volumenM3),
        trozasDecididas: porId.get(f.woodEntryId) ?? 0,
      });
    }
    return mapa;
  }

  /**
   * Qué GTF de la lista YA existen (vivas) para el tenant. Para la importación
   * idempotente del LO-CTP (ADR-138): un ingreso se identifica por su `gtfNumber`;
   * re-importar el mismo archivo salta los que ya están, no duplica.
   */
  static async existingGtfNumbers(tenantId: string, gtfs: string[]): Promise<Set<string>> {
    if (!tenantId) throw new Error("tenantId is required");
    const clean = [...new Set(gtfs.map((g) => g.trim()).filter(Boolean))];
    if (clean.length === 0) return new Set();
    const rows = await prisma.woodEntry.findMany({
      where: { tenantId, deletedAt: null, gtfNumber: { in: clean } },
      select: { gtfNumber: true },
    });
    return new Set(rows.map((r) => r.gtfNumber));
  }

  /**
   * Mapa `gtfNumber → woodEntry.id` (vivos) para el tenant. Para resolver los
   * consumos importados (que referencian el ingreso por su GTF) al id real que
   * necesita `setConsumos` (ADR-138 etapa 2). Ante GTF duplicado gana el más
   * reciente por `entryDate` (raro; un libro sano no repite GTF de ingreso).
   */
  static async idByGtf(tenantId: string, gtfs: string[]): Promise<Map<string, string>> {
    if (!tenantId) throw new Error("tenantId is required");
    const clean = [...new Set(gtfs.map((g) => g.trim()).filter(Boolean))];
    if (clean.length === 0) return new Map();
    const rows = await prisma.woodEntry.findMany({
      where: { tenantId, deletedAt: null, gtfNumber: { in: clean } },
      orderBy: { entryDate: "asc" },
      select: { id: true, gtfNumber: true },
    });
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.gtfNumber, r.id); // asc → el último (más reciente) gana
    return map;
  }

  /**
   * Mapa `gtfNumber → campos comparables` (vivos) para la vista de reconciliación
   * del importador (ADR-138): al re-importar el libro, una fila cuyo GTF ya existe
   * pero con valores distintos se marca «difiere» (no se sobrescribe — el importador
   * es insert-only). Solo los campos que un libro corregido cambiaría de verdad.
   */
  static async comparableByGtf(
    tenantId: string,
    gtfs: string[],
  ): Promise<
    Map<
      string,
      { volumeM3: number; speciesCommonName: string; productType: string; providerName: string }
    >
  > {
    if (!tenantId) throw new Error("tenantId is required");
    const clean = [...new Set(gtfs.map((g) => g.trim()).filter(Boolean))];
    if (clean.length === 0) return new Map();
    const rows = await prisma.woodEntry.findMany({
      where: { tenantId, deletedAt: null, gtfNumber: { in: clean } },
      orderBy: { entryDate: "asc" },
      select: {
        gtfNumber: true,
        volumeM3: true,
        speciesCommonName: true,
        productType: true,
        providerName: true,
      },
    });
    const map = new Map<
      string,
      { volumeM3: number; speciesCommonName: string; productType: string; providerName: string }
    >();
    for (const r of rows) {
      map.set(r.gtfNumber, {
        volumeM3: Number(r.volumeM3),
        speciesCommonName: r.speciesCommonName ?? "",
        productType: r.productType ?? "",
        providerName: r.providerName ?? "",
      });
    }
    return map;
  }

  /**
   * Agregados del período, calculados en DB sobre TODO el conjunto filtrado
   * (no sobre la página cargada — sumar en el cliente miente en cuanto hay más
   * registros que `limit`).
   *
   * Ignora `filters.status` a propósito: los KPIs describen el período completo
   * y no deben saltar al cambiar el filtro de estado; el desglose va en
   * `byStatus`, que además alimenta los contadores del selector.
   */
  static async stats(
    tenantId: string,
    filters: WoodEntryListFilters = {},
  ): Promise<WoodEntryStats> {
    if (!tenantId) throw new Error("tenantId is required");

    const { status: _ignored, limit: _l, offset: _o, ...periodFilters } = filters;
    // El filtro "fuera de plazo" también aplica acá: si la tabla muestra sólo
    // los tarde, los KPIs que la encabezan tienen que hablar de ESE conjunto.
    /**
     * Y el de RECEPCIÓN también (ADR-400): `list()` lo aplicaba y `stats()` no,
     * así que en «GTF ingresadas» —el archivo— las tarjetas y los desplegables
     * describían el período ENTERO (bandeja incluida) mientras la tabla mostraba
     * sólo lo recepcionado. Es exactamente lo que `buildListWhere` promete en su
     * comentario: `list` y `stats` filtran igual, o los KPIs encabezan una tabla
     * que habla de otra cosa. Medido: la opción decía 55.78 m³ y la tarjeta 49.
     */
    const where = await whereDelListado(tenantId, periodFilters);
    // Las cifras OFICIALES (total, volumen, CITES, especies, fuera de plazo) NO
    // deben contar ingresos RECHAZADOS ni ANULADOS: no forman parte del libro y
    // no pueden aparecer en lo que se declara a SERFOR (QA 2026-07-17). El
    // desglose `byStatus` sí usa `where` completo para poder mostrar cuántos
    // fueron rechazados. `pendiente` sí cuenta: es material registrado real.
    const whereVigente: Prisma.WoodEntryWhereInput = {
      ...where,
      status: { notIn: ["rechazado", "anulado"] },
    };

    /**
     * ⭐ Cada faceta se calcula SIN su propio filtro.
     *
     * Desde que una columna admite varios valores (2026-09-10), calcular las
     * opciones sobre lo ya filtrado deja el desplegable con una sola: elegida
     * «Tornillo», «Cachimbo» desaparecía de la lista y no había forma de
     * agregarlo. Es la misma lección que Capacidad aprendió con sus filtros
     * cruzados — la faceta se excluye a sí misma.
     *
     * Las otras columnas SÍ acotan: elegido un proveedor, las especies que se
     * ofrecen son las de ese proveedor. Eso es lo que hace que elegir no lleve
     * nunca a una tabla vacía.
     */
    /* Fuera de plazo y recepción NO los pone `buildListWhere`: los agregan
       `withLateFilter` (por `id`) y `withRecepcionFilter` (un `AND` al final).
       Se conservan tal cual — son del período, no de la columna. */
    const comoLista = (v: Prisma.WoodEntryWhereInput["AND"]): Prisma.WoodEntryWhereInput[] =>
      Array.isArray(v) ? v : v ? [v] : [];
    const andDelPeriodo = comoLista(where.AND).slice(
      comoLista(buildListWhere(tenantId, periodFilters).AND).length,
    );
    /* «Fuera de plazo» y los topes por guía se resuelven a una lista de ids
       calculada CON todos los filtros, especie incluida: conservarla en la
       faceta de especie dejaba el desplegable con sólo lo ya elegido
       («m³ ≥ 10» + Tornillo → sólo Tornillo). Con cualquiera de los dos activo,
       la faceta rearma la cadena entera sin su columna. */
    const recalcula = Boolean(periodFilters.late) || tieneTopesDeGuia(periodFilters.cabecera);
    type CampoFaceta = "speciesCommonName" | "providerName" | "productType" | "originCode";
    const whereSin = async (campo: CampoFaceta): Promise<Prisma.WoodEntryWhereInput> => {
      if (recalcula) {
        const w = await whereDelListado(tenantId, { ...periodFilters, [campo]: undefined });
        return { ...w, status: { notIn: ["rechazado", "anulado"] as WoodEntryStatus[] } };
      }
      /* Se rearma con `buildListWhere` sin ese campo, para no tener que
         deshacer a mano el `AND`/`OR` que dejó cuando trae varios valores. */
      const base = buildListWhere(tenantId, { ...periodFilters, [campo]: undefined });
      const and = [...comoLista(base.AND), ...andDelPeriodo];
      return {
        ...base,
        ...(where.id ? { id: where.id } : {}),
        ...(and.length > 0 ? { AND: and } : {}),
        status: { notIn: ["rechazado", "anulado"] as WoodEntryStatus[] },
      };
    };

    const [whereSinEspecie, whereSinProveedor, whereSinProducto, whereSinPermiso] = await Promise.all([
      whereSin("speciesCommonName"),
      whereSin("providerName"),
      whereSin("productType"),
      whereSin("originCode"),
    ]);

    // Fuera de plazo = días HÁBILES(operación → registro) > PLAZO (2, RDE
    // D000025-2023). Se cuenta con el MISMO filtro de la tabla
    // (`withLateFilter`): el KPI no puede contar 3 y la tabla listar 2.

    const [
      agg,
      byStatusRows,
      speciesRows,
      citesAgg,
      lateCount,
      providerRows,
      productRows,
      permisoRows,
      sinOrigenCount,
      sinCostoAgg,
      conPiezasCount,
      sinRecepcionCount,
      sinConstanciaCount,
      valorizadoAgg,
      trozasAgg,
      serieRows,
      registroRows,
    ] = await Promise.all([
      prisma.woodEntry.aggregate({
        where: whereVigente,
        _sum: { volumeM3: true, pieces: true },
        _count: { _all: true },
      }),
      // byStatus usa `where` completo (incluye rechazado/anulado): es el desglose.
      /* También es la faceta de la cabecera «Estado» (`statuses`): `stats()`
         ignora `filters.status`, así que ya se calcula SIN su propio filtro. */
      prisma.woodEntry.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
        _sum: { volumeM3: true },
      }),
      prisma.woodEntry.groupBy({
        by: ["speciesCommonName"],
        where: whereSinEspecie,
        _count: { _all: true },
        _sum: { volumeM3: true },
      }),
      prisma.woodEntry.aggregate({
        where: { ...whereVigente, speciesCites: true },
        _sum: { volumeM3: true },
        _count: { _all: true },
      }),
      /* Mismo predicado SQL que el filtro «fuera de plazo» (`withLateFilter`),
         contado sobre el `where` de la tabla: así respeta también recepción y
         los topes por guía de la cabecera, que no son SQL. Clic en el KPI =
         esa misma cantidad de filas. */
      withLateFilter(tenantId, { ...periodFilters, late: true }, whereVigente).then((w) =>
        prisma.woodEntry.count({ where: w }),
      ),
      // Facetas del período: alimentan los selectores de filtro con lo que
      // REALMENTE hay (un desplegable con las 9 especies del catálogo cuando
      // el mes tuvo 2 obliga a adivinar cuál trae resultados).
      prisma.woodEntry.groupBy({
        by: ["providerName"],
        where: whereSinProveedor,
        _count: { _all: true },
        _sum: { volumeM3: true },
      }),
      prisma.woodEntry.groupBy({
        by: ["productType"],
        where: whereSinProducto,
        _count: { _all: true },
      }),
      /* Los permisos del período, con su proveedor y su resolución (ADR-400).
         Se agrupa por los tres para poder decir de QUIÉN es cada permiso en el
         desplegable: un código suelto («CONC-25-001») no le dice nada a quien
         tiene que elegir, y el mismo contrato puede llegar por dos proveedores. */
      prisma.woodEntry.groupBy({
        by: ["originCode", "providerName", "originSourceNumber"],
        where: whereSinPermiso,
        _count: { _all: true },
        _sum: { volumeM3: true },
      }),
      // Ingresos sin código de origen: el gap que deja la pestaña EUDR inerte.
      // Se cuenta sobre los VIGENTES (un rechazado sin código no bloquea nada).
      prisma.woodEntry.count({
        where: { ...whereVigente, OR: [{ originCode: null }, { originCode: "" }] },
      }),
      // Ingresos sin valorizar: lo que deja al P&L sin COGS. Vigentes también —
      // el costo de un rechazado no le importa a nadie.
      /* `aggregate` y no `count`: hace falta el VOLUMEN además de la cantidad,
         y son la misma pasada. Ver `sinCostoM3`. */
      prisma.woodEntry.aggregate({
        /* Sin la madera de servicio: no se compró, no le falta costo (ADR-437 §1). */
        where: { ...whereVigente, costoTotal: null, ...FILTRO_REQUIERE_COSTO },
        _count: { _all: true },
        _sum: { volumeM3: true },
      }),
      // Con su lista de piezas: el patio contable vs. el patio contable palo a palo.
      prisma.woodEntry.count({ where: { ...whereVigente, trozas: { some: {} } } }),
      /* Sin recepcionar (ADR-339): pasa por el MISMO predicado que la bandeja y
         el archivo (`withRecepcionFilter`), para que el contador no pueda decir
         una cosa y la lista otra. */
      withRecepcionFilter(tenantId, { ...filters, recepcion: "pendiente" }, whereVigente).then((w) =>
        prisma.woodEntry.count({ where: w }),
      ),
      /* Sin constancia del SNIFFS: `null` Y `""`, como `sinOrigenCount`. Un
         string vacío es un campo que alguien abrió y dejó igual — contarlo
         como verificado sería el falso verde más caro del libro. */
      prisma.woodEntry.count({
        where: {
          ...whereVigente,
          OR: [{ serforNumeroRegistro: null }, { serforNumeroRegistro: "" }],
        },
      }),
      /* Lo valorizado: la otra mitad de `sinCosto`. Con los dos se dice «S/ por
         m³» sobre lo que TIENE precio, sin mezclar el volumen que no lo tiene. */
      prisma.woodEntry.aggregate({
        where: { ...whereVigente, costoTotal: { not: null } },
        _count: { _all: true },
        _sum: { volumeM3: true, costoTotal: true },
      }),
      /* Las trozas de verdad, sin los pedazos de un retrozado: la madre y sus
         hijas son la misma madera dos veces (T1). El tamaño de la pieza sale de
         SU volumen medido, no del de la guía dividido por un conteo. */
      prisma.woodEntryTroza.aggregate({
        where: { trozaOrigenId: null, entry: whereVigente },
        _count: { _all: true, volumenM3: true },
        _sum: { volumenM3: true },
      }),
      /* El ritmo: m³ por día de asiento. Una fila por día CON ingresos; los días
         vacíos los completa la pantalla, que es la que conoce el período. */
      prisma.woodEntry.groupBy({
        by: ["entryDate"],
        where: whereVigente,
        _count: { _all: true },
        _sum: { volumeM3: true },
        orderBy: { entryDate: "asc" },
      }),
      /* Cuánto tarda una guía en llegar al libro, en días HÁBILES — la misma
         expresión que decide «fuera de plazo». Tabla derivada y no la expresión
         dentro del AVG: lleva una subconsulta correlacionada. */
      prisma.$queryRaw<{ prom: number | null; max: number | null }[]>`
        SELECT AVG(d)::float AS prom, MAX(d)::int AS max
        FROM (
          SELECT ${DIAS_HABILES_REGISTRO_SQL} AS d
          FROM "WoodEntry"
          WHERE ${Prisma.join(
            [
              ...buildLateConditions(tenantId, periodFilters),
              Prisma.sql`"status" NOT IN (${Prisma.join(["rechazado", "anulado"])})`,
            ],
            " AND ",
          )}
        ) AS registro
      `,
    ]);

    const byStatus: Record<WoodEntryStatus, number> = {
      pendiente: 0,
      validado: 0,
      rechazado: 0,
      procesado: 0,
      anulado: 0,
    };
    for (const row of byStatusRows) byStatus[row.status] = row._count._all;
    const statuses: WoodEntryFacet[] = byStatusRows
      .map((r) => ({
        value: r.status,
        count: r._count._all,
        volumeM3: Math.round((r._sum.volumeM3?.toNumber() ?? 0) * 10000) / 10000,
      }))
      .sort((a, b) => b.count - a.count);

    const r4 = (n: number) => Math.round(n * 10000) / 10000;
    // Facetas ordenadas por volumen (lo que más pesa primero) y acotadas: el
    // selector es para elegir, no para leer el padrón entero.
    const faceta = <
      T extends { _count: { _all: number }; _sum?: { volumeM3: Prisma.Decimal | null } },
    >(
      rows: T[],
      key: (r: T) => string,
    ): WoodEntryFacet[] =>
      rows
        .map((r) => ({
          value: key(r),
          count: r._count._all,
          volumeM3: r4(r._sum?.volumeM3?.toNumber() ?? 0),
        }))
        .filter((f) => f.value)
        .sort((a, b) => b.volumeM3 - a.volumeM3 || b.count - a.count)
        .slice(0, 30);

    /**
     * Un permiso por fila, juntando lo que aportó cada proveedor.
     *
     * `faceta()` no sirve acá: agrupa por UNA clave y esto viene agrupado por
     * tres. Se pliega a mano para que el desplegable diga «CONC-25-001 · Res.
     * 123 · Maderera X» con el volumen de TODO ese permiso, no el de una de sus
     * combinaciones.
     */
    const porPermiso = new Map<string, WoodEntryPermisoFacet>();
    for (const row of permisoRows) {
      const value = (row.originCode ?? "").trim();
      if (!value) continue;
      const acc = porPermiso.get(value) ?? {
        value,
        count: 0,
        volumeM3: 0,
        proveedores: [] as string[],
        resoluciones: [] as string[],
      };
      acc.count += row._count._all;
      acc.volumeM3 = r4(acc.volumeM3 + (row._sum.volumeM3?.toNumber() ?? 0));
      const prov = (row.providerName ?? "").trim();
      if (prov && !acc.proveedores.includes(prov)) acc.proveedores.push(prov);
      const res = (row.originSourceNumber ?? "").trim();
      if (res && !acc.resoluciones.includes(res)) acc.resoluciones.push(res);
      porPermiso.set(value, acc);
    }
    const permisos = [...porPermiso.values()]
      .sort((a, b) => b.volumeM3 - a.volumeM3 || b.count - a.count)
      .slice(0, 30);

    return {
      totalCount: agg._count._all,
      totalVolumeM3: r4(agg._sum.volumeM3?.toNumber() ?? 0),
      totalPieces: agg._sum.pieces ?? 0,
      speciesCount: speciesRows.length,
      citesCount: citesAgg._count._all,
      citesVolumeM3: r4(citesAgg._sum.volumeM3?.toNumber() ?? 0),
      lateCount,
      sinOrigenCount,
      sinCostoCount: sinCostoAgg._count._all,
      sinCostoM3: Number(sinCostoAgg._sum.volumeM3 ?? 0),
      conPiezasCount,
      sinRecepcionCount,
      sinConstanciaCount,
      valorizadoCount: valorizadoAgg._count._all,
      valorizadoM3: r4(valorizadoAgg._sum.volumeM3?.toNumber() ?? 0),
      costoTotal: Math.round((valorizadoAgg._sum.costoTotal?.toNumber() ?? 0) * 100) / 100,
      trozasCount: trozasAgg._count._all,
      trozasConVolumen: trozasAgg._count.volumenM3,
      trozasVolumeM3: r4(trozasAgg._sum.volumenM3?.toNumber() ?? 0),
      serieDiaria: serieRows.map((r) => ({
        fecha: r.entryDate.toISOString().slice(0, 10),
        volumeM3: r4(r._sum.volumeM3?.toNumber() ?? 0),
        count: r._count._all,
      })),
      registroDiasHabilesProm:
        registroRows[0]?.prom == null ? null : Math.round(Number(registroRows[0].prom) * 10) / 10,
      registroDiasHabilesMax: registroRows[0]?.max == null ? null : Number(registroRows[0].max),
      byStatus,
      statuses,
      species: faceta(speciesRows, (r) => r.speciesCommonName),
      providers: faceta(providerRows, (r) => r.providerName),
      products: faceta(productRows, (r) => r.productType),
      permisos,
    };
  }

  static async getById(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id) throw new Error("id is required");
    return prisma.woodEntry.findFirst({
      where: { tenantId, id, deletedAt: null },
    });
  }

  /**
   * Guard de cierre de período (ADR-139): tira si el ingreso `id` cae en un mes
   * cerrado. Carga solo la fecha. No-op si no hay períodos cerrados.
   */
  private static async assertPeriodoAbierto(
    tenantId: string,
    id: string,
    accion: string,
  ): Promise<void> {
    const cur = await prisma.woodEntry.findFirst({
      where: { id, tenantId },
      select: { entryDate: true },
    });
    const cerrado = cur ? await ForestCtpCierreDB.closedPeriodOf(tenantId, cur.entryDate) : null;
    if (cerrado) {
      throw new CtpInvariantError(
        `El período ${cerrado.label} está cerrado: no se puede ${accion} un ingreso de un mes cerrado. Reabre el período para corregir.`,
        "PERIODO_CERRADO",
        { periodKey: cerrado.periodKey },
      );
    }
  }

  /**
   * Corregir un ingreso YA registrado.
   *
   * Reglas del libro (no son opcionales):
   * 1. Sólo mientras está `pendiente`. Un ingreso validado ya entró al balance
   *    y puede tener consumos colgando: el camino de corrección ahí es ANULAR
   *    (con motivo, queda el rastro) y registrar de nuevo.
   * 2. El mes no puede estar cerrado (mismo guard que validar/anular).
   * 3. Queda auditado campo por campo — un libro fiscalizable tiene que poder
   *    responder "¿esto siempre dijo 5.20 m³?".
   */
  /**
   * Completar los campos VACÍOS de una GUÍA entera (ADR-401 §1.2, hermano de
   * `ForestCtpDB.completarLinea`).
   *
   * Nace de un hueco de compliance concreto: el **N° de permiso** vive en el
   * ingreso (`originCode`) y las corridas lo HEREDAN de la madera que
   * consumieron —una corrida no tiene permiso propio—. Con el ingreso sin
   * permiso, todas sus corridas muestran «—» y no hay dónde escribirlo: el
   * único lugar correcto es la guía.
   *
   * Por qué es una puerta aparte de `update()`, que sólo corrige `pendiente`:
   * completar un hueco no es corregir. Un `originCode` que pasa de vacío al
   * permiso real no contradice nada de lo que el ingreso declaró — **agrega el
   * dato de origen legal que faltaba**, que es justo lo que un fiscalizador
   * echa de menos. Por eso se admite también sobre ingresos ya validados.
   * Sobrescribir un permiso ya cargado es otra cosa y tiene su propia puerta:
   * `corregirGuia`, que narra el antes y el después.
   *
   * Va por GUÍA y no por asiento porque **el permiso es de la guía**: una GTF
   * con tres especies son tres asientos que comparten origen, y completar uno
   * solo dejaría la misma guía diciendo dos cosas.
   */
  static async completarGuia(
    tenantId: string,
    gtfNumber: string,
    campos: { originCode?: string; speciesScientificName?: string },
    user = "unknown",
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const gtf = (gtfNumber ?? "").trim();
    if (!gtf) throw new Error("gtfNumber is required");

    const asientos = await prisma.woodEntry.findMany({
      where: { tenantId, gtfNumber: gtf, deletedAt: null },
      select: {
        id: true, gtfNumber: true, status: true, entryDate: true,
        originCode: true, speciesScientificName: true, speciesCommonName: true,
      },
    });
    if (asientos.length === 0) {
      throw new CtpInvariantError(`No hay ingresos con la guía ${gtf}.`, "VALIDACION");
    }

    const aplicados: string[] = [];
    const omitidos: { gtf: string; campo: string; motivo: string }[] = [];

    for (const a of asientos) {
      /* Un asiento anulado o rechazado ya no declara nada: completarlo sería
         darle datos a un registro muerto. */
      if (a.status === "anulado" || a.status === "rechazado") {
        omitidos.push({ gtf: a.gtfNumber, campo: "todos", motivo: `el asiento está ${a.status}` });
        continue;
      }
      await WoodEntriesDB.assertPeriodoAbierto(tenantId, a.id, "completar");

      const data: Record<string, string> = {};
      const narra: string[] = [];
      for (const [campo, bruto] of Object.entries(campos) as ["originCode" | "speciesScientificName", string][]) {
        const valor = (bruto ?? "").trim();
        if (!valor) continue;
        const previo = a[campo];
        if (!esCampoSinDato(previo)) {
          omitidos.push({ gtf: a.gtfNumber, campo, motivo: `ya dice «${previo}»` });
          continue;
        }
        data[campo] = valor;
        const marcador = marcadorDeAusencia(previo);
        narra.push(
          `${campo === "originCode" ? "N° de permiso" : "especie científica"} ${marcador ? `«${marcador}» ` : ""}→ ${valor}`,
        );
      }
      if (Object.keys(data).length === 0) continue;

      await prisma.woodEntry.update({ where: { id: a.id, tenantId }, data });
      auditCtp({
        tenantId,
        action: "ctp_ingreso_update",
        entity: "WoodEntry",
        entityId: a.id,
        detail: `Completó campos vacíos del ingreso ${a.gtfNumber} (${a.speciesCommonName ?? "sin especie"}) · ${narra.join(" · ")}`,
        user,
      });
      aplicados.push(`${a.gtfNumber} · ${a.speciesCommonName ?? "sin especie"}: ${narra.join(" · ")}`);
    }

    if (aplicados.length > 0) {
      try {
        invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
      } catch {}
    }
    return { ok: aplicados.length > 0, asientos: asientos.length, aplicados, omitidos };
  }

  /**
   * Corregir los campos de origen de una GUÍA entera — sobrescribiendo lo que
   * ya decía (ADR-401 §1, hermano de `ForestCtpDB.corregirLinea`).
   *
   * Es la puerta que faltaba al lado de `completarGuia`: un permiso **mal
   * tipeado** no es un hueco, y hasta ahora la única salida era anular los
   * ingresos y registrarlos de nuevo — con eso se perdían los consumos ya
   * atribuidos. Acá el dato se corrige y el rastro dice qué decía antes.
   *
   * Los candados son los de completar, porque el riesgo es el mismo dato:
   * asiento vivo (ni anulado ni rechazado) y **período abierto** —un mes
   * cerrado es un acta firmada—. Lo que cambia es la auditoría: `«X» → Y` en
   * vez de `→ Y`, porque un fiscalizador tiene que poder distinguir «acá
   * faltaba» de «acá decía otra cosa».
   *
   * ⚠️ Escribe en **todos los asientos de la guía**: el permiso es de la guía,
   * y todas las corridas que consumieron esa madera lo heredan. Quien lo toca
   * tiene que saber que no está corrigiendo una fila.
   */
  static async corregirGuia(
    tenantId: string,
    gtfNumber: string,
    campos: { originCode?: string; speciesScientificName?: string },
    user = "unknown",
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const gtf = (gtfNumber ?? "").trim();
    if (!gtf) throw new Error("gtfNumber is required");

    const asientos = await prisma.woodEntry.findMany({
      where: { tenantId, gtfNumber: gtf, deletedAt: null },
      select: {
        id: true, gtfNumber: true, status: true, entryDate: true,
        originCode: true, speciesScientificName: true, speciesCommonName: true,
      },
    });
    if (asientos.length === 0) {
      throw new CtpInvariantError(`No hay ingresos con la guía ${gtf}.`, "VALIDACION");
    }

    const aplicados: string[] = [];
    const omitidos: { gtf: string; campo: string; motivo: string }[] = [];

    for (const a of asientos) {
      if (a.status === "anulado" || a.status === "rechazado") {
        omitidos.push({ gtf: a.gtfNumber, campo: "todos", motivo: `el asiento está ${a.status}` });
        continue;
      }
      await WoodEntriesDB.assertPeriodoAbierto(tenantId, a.id, "corregir");

      const data: Record<string, string> = {};
      const narra: string[] = [];
      for (const [campo, bruto] of Object.entries(campos) as ["originCode" | "speciesScientificName", string][]) {
        const valor = (bruto ?? "").trim();
        if (!valor) continue;
        const previo = a[campo];
        const previoTexto = esCampoSinDato(previo) ? "—" : String(previo);
        /* Escribir lo mismo que ya decía no es una corrección: no se toca y no
           se audita, o el rastro se llena de cambios que no cambiaron nada. */
        if (previoTexto === valor) continue;
        data[campo] = valor;
        narra.push(
          `${campo === "originCode" ? "N° de permiso" : "especie científica"} «${previoTexto}» → ${valor}`,
        );
      }
      if (Object.keys(data).length === 0) continue;

      await prisma.woodEntry.update({ where: { id: a.id, tenantId }, data });
      auditCtp({
        tenantId,
        action: "ctp_ingreso_update",
        entity: "WoodEntry",
        entityId: a.id,
        detail: `Corrigió el ingreso ${a.gtfNumber} (${a.speciesCommonName ?? "sin especie"}) · ${narra.join(" · ")}`,
        user,
      });
      aplicados.push(`${a.gtfNumber} · ${a.speciesCommonName ?? "sin especie"}: ${narra.join(" · ")}`);
    }

    if (aplicados.length > 0) {
      try {
        invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
      } catch {}
    }
    return { ok: aplicados.length > 0, asientos: asientos.length, aplicados, omitidos };
  }

  /**
   * Las fotos de una GUÍA completa (la pila que bajó del camión).
   *
   * Hasta esto, `CtpFotosDelIngreso` sólo se llenaba al CREAR el ingreso — las
   * 24 guías del tenant real quedaban sin una sola foto porque nadie recibe una
   * guía sacando fotos EN el formulario de alta, las saca al pie de la pila.
   *
   * Va por `gtfNumber`, no por asiento, y escribe en **todas** las filas de esa
   * GTF (mismo criterio que `completarGuia`/`corregirGuia`): una guía con tres
   * especies son tres asientos del MISMO documento, y la foto de la pila es de
   * la guía entera, no de una especie — cualquier fila que se abra después
   * tiene que poder mostrarla.
   *
   * A propósito SIN el guard de período cerrado ni de asiento vivo que sí
   * exigen completar/corregir: una foto no reescribe un dato oficial del
   * formato, es evidencia que se puede agregar en cualquier momento — incluso
   * a un ingreso ya anulado, para documentar qué pasó con esa madera.
   *
   * Dos candados de la auditoría de seguridad (2026-09-25):
   *  1. `exigirFotosPropias` — defensa en profundidad además del Zod de la
   *     ruta: nunca confiar en que el único llamador de hoy sea esa ruta.
   *  2. **Sólo agregar no reescribe la lista entera sin rastro**: un
   *     `almacenero` puede agregar fotos, pero no QUITAR una que otro puso —
   *     eso es evidencia (lo que sostiene el papel ante SERFOR), no una nota
   *     que cualquiera borra. `admin`/`owner` sí pueden sacar una foto mala
   *     (borrosa, repetida). El rastro narra lo agregado Y lo quitado — antes
   *     esto decía sólo «Guardó 0 fotos» aunque borrara las 10 que había.
   */
  static async fotosGuia(
    tenantId: string,
    gtfNumber: string,
    fotos: readonly (FotoCarga | string)[],
    user = "unknown",
    role?: string,
  ): Promise<{ ok: true; asientos: number; fotos: FotoCarga[] }> {
    if (!tenantId) throw new Error("tenantId is required");
    const gtf = (gtfNumber ?? "").trim();
    if (!gtf) throw new Error("gtfNumber is required");
    try {
      exigirFotosPropias(tenantId, fotos);
    } catch (e) {
      throw new CtpInvariantError(e instanceof Error ? e.message : String(e), "VALIDACION");
    }

    const asientos = await prisma.woodEntry.findMany({
      where: { tenantId, gtfNumber: gtf, deletedAt: null },
      select: { id: true, photos: true },
    });
    if (asientos.length === 0) {
      throw new CtpInvariantError(`No hay ingresos con la guía ${gtf}.`, "VALIDACION");
    }

    /* Las filas de una misma GTF SIEMPRE deberían tener las mismas fotos (se
       escriben todas juntas): la primera manda para calcular el «antes». */
    const previas = normalizarFotos(asientos[0]!.photos);
    /* Lo ya guardado se conserva como está en la base; lo nuevo tiene que
       traer la firma del servidor (hora, lugar, sello y autor intactos desde
       que se subió) y no ser evidencia de otra guía. */
    const nuevas = await WoodEntriesDB.resolverFotosDeGuia(tenantId, gtf, normalizarFotos(fotos).slice(0, 10));
    const diff = diffFotosGuia(urlsDeFotos(previas), urlsDeFotos(nuevas));

    const motivoDenegado = motivoSiNoPuedeGuardar(diff.quitadas, role);
    if (motivoDenegado) throw new CtpInvariantError(motivoDenegado, "VALIDACION");
    if (diff.agregadas.length === 0 && diff.quitadas.length === 0) {
      // Sin cambio real: no se escribe ni se audita (mismo criterio que
      // `corregirGuia` con un valor idéntico al que ya tenía).
      return { ok: true, asientos: asientos.length, fotos: previas };
    }

    await prisma.woodEntry.updateMany({
      where: { tenantId, gtfNumber: gtf, deletedAt: null },
      data: { photos: nuevas as unknown as Prisma.InputJsonValue },
    });
    auditCtp({
      tenantId,
      action: "ctp_ingreso_update",
      entity: "WoodEntry",
      entityId: asientos[0]!.id,
      detail: detalleDeFotosGuia(gtf, asientos.length, urlsDeFotos(previas), urlsDeFotos(nuevas), diff),
      user,
    });
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {}
    return { ok: true, asientos: asientos.length, fotos: nuevas };
  }

  /**
   * Las fotos que se guardan en la guía `gtf` a partir de las que mandó el
   * cliente (2026-09-26, `resolverFotosEntrantes`):
   *  - «ya guardadas» = las de CUALQUIER fila de esta guía (también de una
   *    anulada o borrada: la foto sigue siendo de esa carga) → la versión de la base;
   *  - nuevas → firma válida, privada del tenant y no presente en OTRA guía
   *    (incluso anulada: una foto es evidencia de una sola carga).
   * Tira `CtpInvariantError("FOTO_NO_VALIDA")`, que la ruta vuelve 400.
   */
  private static async resolverFotosDeGuia(
    tenantId: string,
    gtf: string,
    entrantes: FotoCarga[],
  ): Promise<FotoCarga[]> {
    if (entrantes.length === 0) return [];
    const filas = await prisma.woodEntry.findMany({
      where: { tenantId, gtfNumber: gtf },
      select: { photos: true },
    });
    const previas = filas.flatMap((f) => normalizarFotos(f.photos));
    const urls = entrantes.map((f) => f.url);
    const otras = await prisma.$queryRaw<{ url: string; gtfNumber: string }[]>`
      SELECT DISTINCT f->>'url' AS url, e."gtfNumber"
      FROM "WoodEntry" e
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(e."photos") = 'array' THEN e."photos" ELSE '[]'::jsonb END
      ) AS f
      WHERE e."tenantId" = ${tenantId}
        AND e."gtfNumber" <> ${gtf}
        AND jsonb_typeof(f) = 'object'
        AND f->>'url' = ANY(${urls})
    `;
    try {
      return resolverFotosEntrantes(tenantId, entrantes, previas, new Map(otras.map((o) => [o.url, o.gtfNumber])));
    } catch (e) {
      if (e instanceof FotoNoValidaError) throw new CtpInvariantError(e.message, "FOTO_NO_VALIDA");
      throw e;
    }
  }

  /**
   * Guías RECIBIDAS sin una sola foto de la carga — el pendiente «pedila al
   * recibir» (2026-09-26). Recibida = recepción cerrada (el MISMO predicado que
   * «GTF ingresadas», `recepcion: "cerrada"`), vigente (ni rechazada ni
   * anulada ni borrada) y dentro del período/permiso pedido, igual que el resto
   * de la tira. Se cuenta por GUÍA, no por asiento: una GTF multi-especie son
   * varias filas con las MISMAS fotos, y con que una tenga foto la guía la tiene.
   *
   * Medido al escribirlo: Blas 0 de 12 guías con foto — el pendiente nace lleno.
   */
  static async guiasRecibidasSinFoto(
    tenantId: string,
    filtros: Pick<WoodEntryListFilters, "fromDate" | "toDate" | "contratoId"> = {},
  ): Promise<{ guias: number; m3: number; detalle: { gtf: string; fecha: string; m3: number }[] }> {
    if (!tenantId) throw new Error("tenantId is required");
    const where = await whereDelListado(tenantId, { ...filtros, recepcion: "cerrada" });
    const filas = await prisma.woodEntry.findMany({
      where: { ...where, status: { notIn: ["rechazado", "anulado"] } },
      select: { gtfNumber: true, photos: true, volumeM3: true, entryDate: true, fechaRecepcion: true },
      take: 5000,
    });
    const porGuia = new Map<string, { conFoto: boolean; m3: number; fecha: Date }>();
    for (const f of filas) {
      const g = porGuia.get(f.gtfNumber) ?? { conFoto: false, m3: 0, fecha: f.fechaRecepcion ?? f.entryDate };
      g.conFoto ||= tieneFotos(f.photos);
      g.m3 += Number(f.volumeM3 ?? 0);
      porGuia.set(f.gtfNumber, g);
    }
    const sin = [...porGuia.entries()]
      .filter(([, g]) => !g.conFoto)
      .map(([gtf, g]) => ({ gtf, fecha: g.fecha.toISOString(), m3: Math.round(g.m3 * 1000) / 1000 }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    return {
      guias: sin.length,
      m3: Math.round(sin.reduce((a, g) => a + g.m3, 0) * 1000) / 1000,
      detalle: sin.slice(0, 20),
    };
  }

  static async update(tenantId: string, id: string, input: WoodEntryUpdateInput, user: string) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id) throw new Error("id is required");

    const actual = await prisma.woodEntry.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!actual) throw new Error("Ingreso no encontrado");
    if (actual.status !== "pendiente") {
      throw new CtpInvariantError(
        `Sólo se corrige un ingreso pendiente. Este está ${actual.status}: anúlalo con motivo y regístralo de nuevo.`,
        "ESTADO_NO_EDITABLE",
        { status: actual.status },
      );
    }
    await WoodEntriesDB.assertPeriodoAbierto(tenantId, id, "corregir");

    // Si se mueve la fecha, el mes DESTINO tampoco puede estar cerrado (si no,
    // se colaría un movimiento dentro de un acta ya firmada).
    if (input.entryDate) {
      const cerradoDestino = await ForestCtpCierreDB.closedPeriodOf(tenantId, input.entryDate);
      if (cerradoDestino) {
        throw new CtpInvariantError(
          `El período ${cerradoDestino.label} está cerrado: no se puede mover el ingreso a un mes cerrado.`,
          "PERIODO_CERRADO",
          { periodKey: cerradoDestino.periodKey },
        );
      }
    }

    const volumeDecimal = input.volumeM3 != null ? new Prisma.Decimal(input.volumeM3) : null;
    if (volumeDecimal && volumeDecimal.lte(0)) throw new Error("volumeM3 must be > 0");

    const data: Prisma.WoodEntryUpdateInput = {
      ...(input.entryDate ? { entryDate: input.entryDate } : {}),
      ...(input.gtfNumber !== undefined ? { gtfNumber: input.gtfNumber.trim() } : {}),
      ...(input.gtfDate !== undefined ? { gtfDate: input.gtfDate } : {}),
      ...(input.fechaRecepcion !== undefined ? { fechaRecepcion: input.fechaRecepcion } : {}),
      ...(input.gtfSeries !== undefined ? { gtfSeries: input.gtfSeries } : {}),
      ...(input.serforNumeroRegistro !== undefined
        ? { serforNumeroRegistro: input.serforNumeroRegistro?.trim() || null }
        : {}),
      ...(input.docType !== undefined ? { docType: input.docType?.trim() || null } : {}),
      ...(input.providerName !== undefined ? { providerName: input.providerName.trim() } : {}),
      ...(input.providerDocument !== undefined ? { providerDocument: input.providerDocument } : {}),
      ...(input.providerDocumentType !== undefined
        ? { providerDocumentType: input.providerDocumentType }
        : {}),
      ...(input.originType !== undefined ? { originType: input.originType } : {}),
      ...(input.originCode !== undefined ? { originCode: input.originCode } : {}),
      ...(input.originSourceNumber !== undefined
        ? { originSourceNumber: input.originSourceNumber?.trim() || null }
        : {}),
      ...(input.ctpProductCode !== undefined
        ? { ctpProductCode: input.ctpProductCode?.trim() || null }
        : {}),
      ...(input.originRegion !== undefined ? { originRegion: input.originRegion } : {}),
      ...(input.originDistrict !== undefined ? { originDistrict: input.originDistrict } : {}),
      ...(input.speciesCommonName !== undefined
        ? { speciesCommonName: input.speciesCommonName.trim() }
        : {}),
      ...(input.speciesScientificName !== undefined
        ? { speciesScientificName: input.speciesScientificName }
        : {}),
      ...(input.speciesCites !== undefined ? { speciesCites: input.speciesCites } : {}),
      ...(input.productType !== undefined ? { productType: input.productType } : {}),
      ...(input.unit !== undefined ? { unit: input.unit?.trim() || null } : {}),
      ...(volumeDecimal ? { volumeM3: volumeDecimal } : {}),
      ...(input.pieces !== undefined ? { pieces: input.pieces } : {}),
      ...(input.avgLengthM !== undefined
        ? { avgLengthM: input.avgLengthM != null ? new Prisma.Decimal(input.avgLengthM) : null }
        : {}),
      ...(input.avgDiameterCm !== undefined
        ? {
            avgDiameterCm:
              input.avgDiameterCm != null ? new Prisma.Decimal(input.avgDiameterCm) : null,
          }
        : {}),
      ...(input.humidityPct !== undefined
        ? { humidityPct: input.humidityPct != null ? new Prisma.Decimal(input.humidityPct) : null }
        : {}),
      ...(input.defectsNotes !== undefined ? { defectsNotes: input.defectsNotes } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      /* El cuerpo del documento (casilleros 13–34). Se reemplaza entero: el
         formulario manda el objeto completo, validado por `gtfDatosSchema`. */
      ...(input.gtfDatos !== undefined
        ? { gtfDatos: input.gtfDatos ? (input.gtfDatos as Prisma.InputJsonValue) : Prisma.DbNull }
        : {}),
    };

    /*
     * De dónde salió cada casillero (ADR-392).
     *
     * Todo lo que se escribe por acá lo escribió una PERSONA: `update()` es la
     * corrección manual del libro —la importación y la carga desde SERFOR van
     * por otros caminos—. Así que cada campo que viaja en `input` queda con su
     * autor y su fecha, y la ficha puede mostrar distinto lo que dice el papel
     * y lo que transcribió alguien.
     *
     * Se ACUMULA sobre lo que ya había: corregir la serie hoy no borra que el
     * mes pasado alguien completó la procedencia. Y sólo se anotan los campos
     * que realmente vinieron: un `update` de un solo campo no declara autoría
     * sobre los otros 26.
     */
    const previa =
      actual.camposManuales &&
      typeof actual.camposManuales === "object" &&
      !Array.isArray(actual.camposManuales)
        ? (actual.camposManuales as Record<string, unknown>)
        : {};
    const ahora = new Date().toISOString();
    const procedencia: Record<string, unknown> = { ...previa };
    for (const campo of Object.keys(input)) {
      if ((input as Record<string, unknown>)[campo] === undefined) continue;
      if (campo === "gtfDatos") continue; // abajo, casillero por casillero
      procedencia[campo] = { por: user, el: ahora };
    }
    /* `gtfDatos` es un objeto con ~40 casilleros y viaja entero: marcar «a
       mano» todo el bloque por corregir un DNI diría que el almacenero
       transcribió también el nombre que ya traía el papel. Se anota sólo lo que
       CAMBIÓ, con su ruta (`gtfDatos.propietario.nombre`), que es lo que la
       ficha lee para pintar cada casillero. */
    if (input.gtfDatos !== undefined) {
      /* Se comparan las dos versiones NORMALIZADAS (`leerGtfDatos` aplica los
         defaults del schema): contra un `null` crudo, «docTipo: RUC» o «modo:
         terrestre» contaban como escritos a mano por sólo haber tipeado un
         nombre — y la ficha pintaba «a mano» casilleros que nadie tocó. */
      for (const ruta of casillerosCambiados(
        leerGtfDatos(actual.gtfDatos),
        leerGtfDatos(input.gtfDatos),
      )) {
        procedencia[`gtfDatos.${ruta}`] = { por: user, el: ahora };
      }
    }
    if (Object.keys(procedencia).length > 0) {
      data.camposManuales = procedencia as Prisma.InputJsonValue;
    }

    /*
     * Mudar el asiento a OTRA guía (ADR-437, revisión 2026-09-26): la plata va
     * por guía. Con las dos guías bloqueadas (en orden, el mismo lock que el
     * modal de la plata y la liquidación): el asiento hereda la marca de
     * servicio / dueño / a quién se le paga de la guía destino, y el abono
     * `madera` de la vieja y de la nueva pasan a valer lo que queda vivo en
     * cada una. Antes el abono de la vieja seguía cobrando la especie que se fue.
     */
    const gtfViejo = actual.gtfNumber.trim();
    const gtfNuevo = input.gtfNumber !== undefined ? input.gtfNumber.trim() : gtfViejo;
    let cuentas: { gtfNumber: string; cuenta: "actualizada" | "baja" }[] = [];
    const entry =
      gtfNuevo === gtfViejo
        ? await prisma.woodEntry.update({ where: { id }, data })
        : await prisma.$transaction(async (tx) => {
            await ForestCuentaDB.bloquearGuiasEnTx(tx, tenantId, [gtfViejo, gtfNuevo]);
            const destino = await plataDeLaGuiaEnTx(tx, tenantId, gtfNuevo, id);
            if (destino?.maderaDeTercero && actual.costoTotal != null) throw costoEnGuiaDeServicio(gtfNuevo, destino.duenoNombre);
            const e = await tx.woodEntry.update({ where: { id }, data: { ...data, ...(destino ?? {}) } });
            for (const gtf of [gtfViejo, gtfNuevo].sort()) {
              const cuenta = await ForestCuentaDB.resincronizarMaderaDeGuiaEnTx(tx, tenantId, gtf);
              if (cuenta !== "sin_cuenta") cuentas = [...cuentas, { gtfNumber: gtf, cuenta }];
            }
            return e;
          });
    for (const c of cuentas) {
      WoodEntriesDB.auditarCuentaDeGuia(
        tenantId,
        c.gtfNumber,
        c.cuenta,
        c.gtfNumber === gtfViejo ? `movió un asiento a la guía ${gtfNuevo}` : `trajo un asiento de la guía ${gtfViejo}`,
        user,
      );
    }

    // Qué cambió, en el idioma del libro: "volumen 5.2000 → 5.4000".
    const cambios = describirCambios(actual, entry);
    auditCtp({
      tenantId,
      action: "ctp_ingreso_update",
      entity: "WoodEntry",
      entityId: entry.id,
      detail: `Corrigió el ingreso ${actual.gtfNumber}${cambios ? ` · ${cambios}` : " · sin cambios"}`,
      user,
    });
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {}
    return entry;
  }

  /**
   * Cuánto se pagó por esta madera.
   *
   * EL HUECO QUE TAPA. `costoTotal` existía en la tabla y en `create()`, pero
   * ningún endpoint lo aceptaba: en la práctica sólo entraba por importación.
   * Resultado medido en el tenant real: 78 de 83 ingresos sin costo, o sea el
   * 91% del patio sin valorizar y un P&L que no podía calcular el COGS de casi
   * nada. El libro sabía cuánta madera entró; nunca cuánto costó.
   *
   * Por qué es una acción aparte y no un campo más de `update()`:
   * la corrección sólo se permite mientras el ingreso está `pendiente`, y con
   * razón —un ingreso validado ya entró al balance—. Pero la factura del
   * proveedor llega DESPUÉS del camión, casi siempre con el ingreso ya
   * validado. Meter el costo en `update()` lo haría incargable justo en el
   * momento en que se conoce.
   *
   * Lo que sí se respeta:
   * · el mes cerrado manda (ADR-135: los costos se congelan al cierre),
   * · un ingreso anulado o rechazado no recibe costo: no es del balance,
   * · `null` es un valor legítimo —"me equivoqué de factura"— y NUNCA 0, que
   *   fingiría madera regalada y un margen del 100%.
   */
  static async setCosto(
    tenantId: string,
    id: string,
    input: { costoTotal: number | null; moneda?: string | null },
    user: string,
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id) throw new Error("id is required");
    if (input.costoTotal != null && !(input.costoTotal >= 0)) {
      throw new Error("costoTotal no puede ser negativo");
    }

    const actual = await prisma.woodEntry.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!actual) throw new Error("Ingreso no encontrado");
    /* Mismo criterio que `ForestContratoDB.balance()`: rechazado y anulado no
       cuentan. `procesado` SÍ — es madera ya aserrada, justo la que más
       necesita costo para el margen; antes se rechazaba y quedaba contada
       como «sin precio» en la ficha del permiso sin forma de cargarlo. */
    if (actual.status === "rechazado" || actual.status === "anulado") {
      throw new CtpInvariantError(
        `Un ingreso ${actual.status} no lleva costo: no cuenta en el balance.`,
        "ESTADO_NO_EDITABLE",
        { status: actual.status },
      );
    }
    /* Madera de servicio (ADR-437 §1): no se compró, no lleva costo — ni 0.
       Por esta puerta sale 422 (`ctpErrorResponse`); la ruta de la plata de la
       guía responde 409 `ES_MADERA_DE_SERVICIO`. */
    if (actual.maderaDeTercero) {
      throw new CtpInvariantError(
        `La guía ${actual.gtfNumber} es madera de servicio${actual.duenoNombre ? ` de ${actual.duenoNombre}` : ""}: no lleva costo. Quítale la marca de servicio si en realidad la compraste.`,
        "ESTADO_NO_EDITABLE",
        { motivo: "ES_MADERA_DE_SERVICIO", gtfNumber: actual.gtfNumber },
      );
    }
    await WoodEntriesDB.assertPeriodoAbierto(tenantId, id, "valorizar");
    /* Reabrir el mes no descongela: si una corrida ya copió el costo de esta
       guía a su acta, cambiarlo acá la contradice. Mismo freno que la tanda. */
    await exigirCostoNoCongelado(prisma, tenantId, id, actual.gtfNumber);

    /* En una tx: la marca de servicio va en el WHERE (si otro la marcó en el
       medio, no se escribe costo), y si la guía ya estaba anotada en la cuenta
       del proveedor (ADR-437 §4) el abono `madera` pasa a valer la suma nueva. */
    const { entry, cuenta } = await prisma.$transaction(async (tx) => {
      const res = await tx.woodEntry.updateMany({
        where: { id, tenantId, deletedAt: null, ...FILTRO_REQUIERE_COSTO },
        data: {
          costoTotal: input.costoTotal != null ? new Prisma.Decimal(input.costoTotal) : null,
          ...(input.moneda !== undefined ? { moneda: input.moneda ?? "PEN" } : {}),
          /* El acta (ADR-437 §3) describe cómo se llegó al costo ANTERIOR: si
             queda, el modal la precarga y un «Guardar» devuelve el valor viejo. */
          costoDetalle: Prisma.DbNull,
        },
      });
      if (res.count !== 1) {
        throw new CtpInvariantError(
          `La guía ${actual.gtfNumber} cambió mientras la valorizabas (pasó a madera de servicio o se dio de baja).`,
          "ESTADO_NO_EDITABLE",
          { motivo: "ES_MADERA_DE_SERVICIO", gtfNumber: actual.gtfNumber },
        );
      }
      const entry = await tx.woodEntry.findFirstOrThrow({ where: { id, tenantId } });
      /* La cuenta del proveedor es en soles y no hay tipo de cambio guardado:
         un costo en otra moneda en una guía ya anotada quedaría fuera del abono
         sin que nadie lo vea. Se frena acá, con el camino (revisión 2026-09-26). */
      if (entry.costoTotal != null && (entry.moneda ?? "PEN") !== "PEN") {
        const anotada = await tx.forestCuentaMov.findFirst({
          where: { tenantId, gtfNumber: actual.gtfNumber.trim(), concepto: "madera", deletedAt: null },
          select: { parteNombre: true },
        });
        if (anotada) {
          throw new CtpInvariantError(
            `La guía ${actual.gtfNumber} está anotada en soles en la cuenta de ${anotada.parteNombre}: su costo tiene que ir en soles (PEN). Conviértelo con el tipo de cambio de la factura.`,
            "VALIDACION",
            { motivo: "MONEDA_DE_LA_CUENTA", moneda: entry.moneda, gtfNumber: actual.gtfNumber },
          );
        }
      }
      const cuenta = await ForestCuentaDB.resincronizarMaderaDeGuiaEnTx(tx, tenantId, actual.gtfNumber);
      return { entry, cuenta };
    });

    const antes = actual.costoTotal != null ? `S/ ${actual.costoTotal.toString()}` : "sin costo";
    const despues = entry.costoTotal != null ? `S/ ${entry.costoTotal.toString()}` : "sin costo";
    auditCtp({
      tenantId,
      action: "ctp_ingreso_costo",
      entity: "WoodEntry",
      entityId: entry.id,
      detail: `Valorizó el ingreso ${actual.gtfNumber} · ${antes} → ${despues}${
        cuenta === "actualizada"
          ? " · se actualizó la madera de la guía en la cuenta del proveedor"
          : cuenta === "baja"
            ? " · la guía quedó sin costo: se quitó de la cuenta del proveedor"
            : ""
      }`,
      user,
    });
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {}
    if (cuenta !== "sin_cuenta") ForestCuentaDB.invalidar(tenantId);
    return entry;
  }

  /**
   * Agregar piezas a un ingreso YA registrado (ADR-320).
   *
   * EL HUECO QUE TAPA. La lista de trozas sólo se podía cargar en el ALTA. Si
   * la guía se registró a mano —porque SERFOR no respondía, que es la mitad de
   * las veces— el ingreso quedaba para siempre sin detalle de piezas, y un
   * ingreso sin piezas es el que después no se puede cruzar contra el POA ni
   * consumir por pieza. La única salida era anular y volver a cargar todo.
   *
   * AGREGA, NUNCA REEMPLAZA. Pisar la lista destruiría trazabilidad viva: una
   * troza puede estar ya recibida en patio, consumida en una corrida o
   * retrozada. Las piezas cuya codificación ya existe en el ingreso se saltan y
   * se informan, así re-subir el mismo Excel no duplica nada.
   *
   * Mismos guards que corregir: sólo `pendiente` y con el período abierto.
   *
   * ⭐ EXCEPCIÓN `desdeImportacion` (2026-08-05): el inventario de rolliza en
   * patio se importa contra guías que el mismo libro oficial ya dejó VALIDADAS,
   * y sin esto sus trozas no entraban nunca — el patio quedaba con la guía y
   * cero piezas. Se admite completar un ingreso validado **sólo si no tiene
   * ninguna pieza**: es agregar el detalle que trae su propio documento, no
   * editar lo declarado (volumen, especie y GTF no se tocan) y queda auditado
   * como `ctp_ingreso_trozas_add`. Un ingreso que YA tiene piezas no se toca:
   * ahí sí habría que decidir cuál lista vale, y eso no lo decide un importador.
   */
  static async agregarTrozas(
    tenantId: string,
    id: string,
    trozas: WoodEntryTrozaInput[],
    user: string,
    opts: { desdeImportacion?: boolean } = {},
  ): Promise<{
    agregadas: number;
    repetidas: string[];
    m3Agregados: number;
    bloqueado?: "ya-tiene-lista";
    /** Cuántas fueron a cada fila de la guía (ADR-435): cada troza a la de su especie. */
    porFila?: { woodEntryId: string; especie: string; agregadas: number; m3: number }[];
    /** Las que quedaron en esta fila sin ser de su especie, con el porqué. */
    fueraDeSuFila?: { codigo: string | null; especie: string | null; nota: NotaDeColocacion }[];
  }> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id) throw new Error("id is required");
    if (trozas.length === 0) return { agregadas: 0, repetidas: [], m3Agregados: 0 };

    const actual = await prisma.woodEntry.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!actual) throw new Error("Ingreso no encontrado");
    /* Las filas vivas de la MISMA guía (ADR-435). Una GTF de varias especies
       son varias filas, y la importación llega por UNA (`idByGtf`): colgarle
       todo a ésa dejó 29 de 46 trozas de Blas en la fila de otra especie. La
       lista de la guía, y su deduplicación, son de la guía entera. */
    const hermanas = (
      await prisma.woodEntry.findMany({
        where: { tenantId, deletedAt: null, gtfNumber: actual.gtfNumber, status: { notIn: ["rechazado", "anulado"] } },
        select: { id: true, gtfSeries: true, speciesCommonName: true, speciesScientificName: true, status: true, entryDate: true },
      })
    ).filter((h) => h.id === id || (h.gtfSeries ?? "").trim() === (actual.gtfSeries ?? "").trim());
    const idsGuia = [...new Set([id, ...hermanas.map((h) => h.id)])];
    const guiaSinLista =
      opts.desdeImportacion === true &&
      (await prisma.woodEntryTroza.count({ where: { tenantId, woodEntryId: { in: idsGuia } } })) === 0;
    if (actual.status !== "pendiente") {
      /* «Ya tiene su lista» es de la GUÍA: con la lista en otra fila, completar
         ésta por su cuenta la duplicaba (la dedup era por fila). */
      const yaTiene = opts.desdeImportacion && actual.status === "validado" ? !guiaSinLista : null;
      /* Validado y CON lista: no es un error, no hay nada que completar. Re-subir
         el mismo archivo tiene que decir «ya está», no gritar un invariante.
         Cuál de las dos listas vale no lo decide un importador. */
      if (yaTiene === true)
        return { agregadas: 0, repetidas: [], m3Agregados: 0, bloqueado: "ya-tiene-lista" };
      if (yaTiene !== false) {
        throw new CtpInvariantError(
          `Sólo se le agregan piezas a un ingreso pendiente. Este está ${actual.status}.`,
          "ESTADO_NO_EDITABLE",
          { status: actual.status },
        );
      }
    }
    await WoodEntriesDB.assertPeriodoAbierto(tenantId, id, "agregarle piezas");

    /* Qué hermana RECIBIRÍA piezas por sí sola — la misma regla de arriba, por
       fila: pendiente, o validada completando una guía sin lista desde la
       importación; y nunca de un mes cerrado. Repartir por especie no abre una
       puerta que estaba cerrada: lo que su fila no aceptaría se queda en ésta
       (como antes) y se dice. */
    const filasQueReciben: FilaQueRecibe[] = await Promise.all(
      hermanas.map(async (h) => ({
        id: h.id,
        especie: h.speciesCommonName,
        cientifico: h.speciesScientificName,
        puedeRecibir:
          h.id === id ||
          ((h.status === "pendiente" || (h.status === "validado" && guiaSinLista)) &&
            !(await ForestCtpCierreDB.closedPeriodOf(tenantId, h.entryDate))),
      })),
    );
    const especieDeFila = new Map(hermanas.map((h) => [h.id, h.speciesCommonName]));

    const resultado = await prisma.$transaction(async (tx) => {
      // Dentro de la tx: entre el chequeo y el insert, otra tablet puede haber
      // cargado las mismas piezas.
      const existentes = await tx.woodEntryTroza.findMany({
        where: { tenantId, woodEntryId: { in: idsGuia } },
        select: { codificacion: true, orden: true, woodEntryId: true },
      });

      const clave = (c: string | null | undefined) => (c ?? "").trim().toUpperCase();
      const yaEstan = new Set(existentes.map((t) => clave(t.codificacion)).filter(Boolean));

      const repetidas: string[] = [];
      const nuevas: WoodEntryTrozaInput[] = [];
      for (const t of trozas) {
        const k = clave(t.codificacion);
        // Sin codificación no hay con qué deduplicar: entra (es una pieza más),
        // porque descartarla perdería madera declarada de verdad.
        if (k && yaEstan.has(k)) {
          repetidas.push(t.codificacion as string);
          continue;
        }
        if (k) yaEstan.add(k);
        nuevas.push(t);
      }

      if (nuevas.length === 0) return { agregadas: 0, repetidas, m3Agregados: 0, porFila: [], fueraDeSuFila: [] };

      /* Cada troza a la fila de SU especie dentro de la guía (ADR-435). */
      const colocadas = colocarAlCargar(nuevas, filasQueReciben, id);
      const porFila = new Map<string, WoodEntryTrozaInput[]>();
      for (const c of colocadas) porFila.set(c.filaId, [...(porFila.get(c.filaId) ?? []), c.troza]);

      /* Tope y numeración, POR FILA: el tope es de un ingreso, y `orden` es la
         columna del papel — reiniciarla en 1 dejaría dos piezas «número 1». */
      const desdePorFila = new Map<string, number>();
      for (const [filaId, suyas] of porFila) {
        const previas = existentes.filter((t) => t.woodEntryId === filaId);
        if (previas.length + suyas.length > TOPE_TROZAS_POR_INGRESO) {
          throw new CtpInvariantError(
            `Un ingreso admite hasta ${TOPE_TROZAS_POR_INGRESO} piezas y esto lo llevaría a ${previas.length + suyas.length}.`,
            "TOPE_TROZAS",
            { actuales: previas.length, nuevas: suyas.length },
          );
        }
        desdePorFila.set(filaId, previas.reduce((max, t) => Math.max(max, t.orden ?? 0), 0));
      }

      /* Completar la lista de una guía también pinta códigos: era la única de
         las cuatro altas que no pasaba por el guard (ADR-436). */
      await guardCodigoPlantaUnico(tx, tenantId, nuevas.map((t) => t.codigoPlanta));

      await tx.woodEntryTroza.createMany({
        data: [...porFila].flatMap(([filaId, suyas]) => suyas.map((t, i) => ({
          tenantId,
          woodEntryId: filaId,
          orden: (desdePorFila.get(filaId) ?? 0) + i + 1,
          codificacion: t.codificacion,
          especieComun: t.especieComun,
          especieCientifica: t.especieCientifica,
          dimensiones: t.dimensiones,
          largoM: t.largoM != null ? new Prisma.Decimal(t.largoM) : null,
          diametroCm: t.diametroCm != null ? new Prisma.Decimal(t.diametroCm) : null,
          d1Cm: t.d1Cm != null ? new Prisma.Decimal(t.d1Cm) : null,
          d2Cm: t.d2Cm != null ? new Prisma.Decimal(t.d2Cm) : null,
          cantidad: t.cantidad,
          volumenM3: t.volumenM3 != null ? new Prisma.Decimal(t.volumenM3) : null,
          codigoPlanta: t.codigoPlanta ?? null,
          parcela: t.parcela ?? null,
          noRecepcionada: t.noRecepcionada ?? false,
        }))),
      });

      return {
        agregadas: nuevas.length,
        repetidas,
        // Los m³ que de verdad entraron, no los del archivo: si la mitad eran
        // repetidas, auditar el total del Excel diría que entró el doble.
        m3Agregados: nuevas.reduce((a, t) => a + (t.volumenM3 ?? 0), 0),
        porFila: [...porFila].map(([filaId, suyas]) => ({
          woodEntryId: filaId,
          especie: especieDeFila.get(filaId) ?? actual.speciesCommonName,
          agregadas: suyas.length,
          m3: suyas.reduce((a, t) => a + (t.volumenM3 ?? 0), 0),
        })),
        fueraDeSuFila: colocadas.flatMap((c) =>
          c.nota ? [{ codigo: c.troza.codificacion, especie: c.troza.especieComun, nota: c.nota }] : [],
        ),
      };
    }).catch(traducirChoqueCodigoPlanta);

    if (resultado.agregadas > 0) {
      /* Un renglón por fila que recibió piezas: el historial de cada ingreso
         tiene que decir cuándo apareció cada una de SUS piezas. */
      for (const f of resultado.porFila ?? []) {
        auditCtp({
          tenantId,
          action: "ctp_ingreso_trozas_add",
          entity: "WoodEntry",
          entityId: f.woodEntryId,
          detail:
            `Agregó ${f.agregadas} pieza${f.agregadas === 1 ? "" : "s"} a la lista del ingreso ${actual.gtfNumber} · ${f.especie}` +
            (f.m3 > 0 ? ` · ${m3(f.m3)}` : "") +
            (f.woodEntryId !== id ? " · a la fila de su especie" : "") +
            (resultado.repetidas.length > 0 && f.woodEntryId === id ? ` · ${resultado.repetidas.length} ya estaban` : ""),
          user,
        });
      }
      try {
        invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
      } catch {}
    }

    return resultado;
  }

  /**
   * Validar un ingreso (status pendiente → validado).
   * Solo admin con permisos. validatorId queda en validatedBy.
   */
  static async validate(tenantId: string, id: string, validatorId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    await WoodEntriesDB.assertPeriodoAbierto(tenantId, id, "validar");
    const entry = await prisma.woodEntry.update({
      where: { id, tenantId } satisfies Prisma.WoodEntryWhereUniqueInput,
      data: {
        status: "validado",
        validatedBy: validatorId,
        validatedAt: new Date(),
        rejectionReason: null,
      },
    });
    // El evento con más peso del módulo: validar convierte madera declarada en
    // materia prima computable (entra al saldo y se puede transformar).
    auditCtp({
      tenantId,
      action: "ctp_ingreso_validate",
      entity: "WoodEntry",
      entityId: id,
      detail: `Validó el ingreso ${entry.gtfNumber} · ${entry.speciesCommonName} · ${m3(Number(entry.volumeM3))}${entry.speciesCites ? " · CITES" : ""}`,
      user: validatorId,
    });
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {}
    return entry;
  }

  /**
   * RECEPCIONAR la guía: el acto del patio en un solo paso (ADR-339).
   *
   * Hasta ahora «recepcionar» eran tres cosas sueltas —fechar el ingreso, fechar
   * cada pieza y validar— y el operador tenía que acordarse de las tres para que
   * la guía saliera de la bandeja. Acá se hacen juntas porque son el mismo hecho:
   * el camión bajó la madera este día.
   *
   * - Las piezas **sin decisión** quedan fechadas. Las marcadas como no llegadas
   *   (ADR-325) se dejan como están: el documento sigue declarándolas y el patio
   *   ya dijo que no bajaron.
   * - La fecha del ingreso sólo se escribe si estaba vacía — una fecha puesta a
   *   mano manda sobre la de hoy.
   * - Validar es lo último y sólo si estaba pendiente: es lo que la convierte en
   *   materia prima computable.
   */
  static async recepcionar(
    tenantId: string,
    id: string,
    fecha: string | undefined,
    user: string,
    /**
     * Qué se vio al recibir, cuando lo que bajó no es lo que dice el papel
     * (2026-09-15). No hay columna para esto y no se inventa una: va al rastro
     * de auditoría, que es el registro oficial de quién hizo qué en el libro.
     */
    observacion?: string,
    /**
     * La llegada cae después del vencimiento de la guía y quien recibe lo
     * confirma con motivo (ADR-434 §Vencimiento). Sin eso, esa fecha se
     * rechaza con `GUIA_VENCIDA`: vale para las tres puertas que reciben.
     */
    confirmacion?: ConfirmacionDeVencida,
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const actual = await prisma.woodEntry.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true, status: true, fechaRecepcion: true, gtfNumber: true, gtfDate: true },
    });
    if (!actual) return null;
    if (actual.status === "anulado" || actual.status === "rechazado") {
      throw new Error(`Una guía ${actual.status} no se recepciona.`);
    }
    await WoodEntriesDB.assertPeriodoAbierto(tenantId, id, "recepcionar");

    /* La fecha viaja como texto hasta el `::date` de Postgres: convertirla a
       `Date` acá la interpretaría en la zona del servidor y correría un día en
       Lima (el mismo off-by-one de `entryDate`). Sin fecha, HOY de Lima: el
       `toISOString()` de las 19:00 ya es mañana (ADR-434). */
    const dia = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : limaDateKey();
    /* ADR-434: ni futura ni anterior a la guía — la misma regla que la fila del modal. */
    const fechaImposible = problemaDeLlegada(dia, actual.gtfDate, limaDateKey());
    if (fechaImposible) {
      throw new CtpInvariantError(`Guía ${actual.gtfNumber}: ${fechaImposible}`, "VALIDACION", { fecha: dia });
    }
    /* ADR-434 §Vencimiento: después del vencimiento de la guía, sólo confirmado con motivo. */
    const vencida = await ForestRecepcionDB.exigirGuiaVigente(tenantId, actual.gtfNumber, dia, confirmacion);

    const { piezas } = await prisma.$transaction(async (tx) => {
      /* T3 al revés (ADR-434): una troza sin fecha que ya se aserró no queda fechada después de su corrida. */
      await ForestRecepcionDB.exigirLlegadaCompatible(tx, tenantId, [id], dia, actual.gtfNumber);
      const marcadas = await tx.$executeRaw`
        UPDATE "WoodEntryTroza"
        SET "fechaRecepcion" = ${dia}::timestamp
        WHERE "woodEntryId" = ${id} AND "tenantId" = ${tenantId}
          AND "fechaRecepcion" IS NULL AND "noRecepcionada" = false
      `;
      if (!actual.fechaRecepcion) {
        await tx.$executeRaw`
          UPDATE "WoodEntry" SET "fechaRecepcion" = ${dia}::timestamp
          WHERE "id" = ${id} AND "tenantId" = ${tenantId}
        `;
      }
      return { piezas: marcadas };
    });

    const entry =
      actual.status === "pendiente"
        ? await WoodEntriesDB.validate(tenantId, id, user)
        : await prisma.woodEntry.findFirst({ where: { id, tenantId } });

    auditCtp({
      tenantId,
      action: "ctp_ingreso_recepcion",
      entity: "WoodEntry",
      entityId: id,
      detail:
        `Recepcionó la guía ${actual.gtfNumber} el ${dia}` +
        (piezas > 0
          ? ` · ${piezas} pieza${piezas === 1 ? "" : "s"} fechada${piezas === 1 ? "" : "s"}`
          : "") +
        (observacion?.trim() ? ` · observación: ${observacion.trim()}` : "") +
        (vencida ? ` · después del vencimiento de la guía (${vencida.vencimiento}), confirmado` : ""),
      user,
    });
    /* La vencida confirmada va en su propio renglón, esperado: es lo que se
       filtra cuando alguien pregunta qué madera viajó con la guía vencida. */
    if (vencida) {
      await ForestRecepcionDB.auditarRecepcionVencida(
        tenantId,
        id,
        actual.gtfNumber,
        dia,
        vencida,
        confirmacion?.motivoVencida ?? "",
        user,
      );
    }
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {
      /* cache best-effort */
    }
    return { entry, piezas, fecha: dia, ...(vencida ? { vencida: vencida.vencimiento } : {}) };
  }

  /**
   * Recepciona una GUÍA entera, en un solo acto (ADR-351).
   *
   * Antes la pantalla mandaba un PATCH por asiento y en paralelo: si uno fallaba
   * —red, lock, un período que se cerró en el medio— la guía quedaba **partida**,
   * con unos asientos en la bandeja y otros en el archivo. El operador la buscaba
   * en «GTF ingresadas» y la veía incompleta o no la veía.
   *
   * Acá los asientos se recorren **en orden y en serie**, y el resultado dice
   * exactamente cuáles entraron y cuál falló. Si el primero rompe, no se sigue:
   * media guía recibida es peor que ninguna, porque nadie sabe qué falta.
   */
  static async recepcionarGuia(
    tenantId: string,
    ids: string[],
    fecha: string | undefined,
    user: string,
    /** Lo que se vio al recibir; queda en el rastro de CADA asiento de la guía. */
    observacion?: string,
    /** Llegada después del vencimiento, confirmada con motivo (ADR-434 §Vencimiento). */
    confirmacion?: ConfirmacionDeVencida,
  ): Promise<{
    recepcionados: number;
    piezas: number;
    fecha: string;
    fallo: { id: string; motivo: string } | null;
  }> {
    if (!tenantId) throw new Error("tenantId is required");
    const dia = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : limaDateKey();
    let recepcionados = 0;
    let piezas = 0;
    /* ADR-434: la guía entera se revisa ANTES del primer asiento (fecha posible,
       mes abierto, trozas ya aserradas): frenar en el segundo la dejaría a medias. */
    await ForestRecepcionDB.revisarAntesDeRecibir(tenantId, ids, dia, confirmacion);

    /* En serie y ordenado: los asientos de una guía tocan las mismas filas de
       `WoodEntryTroza` y en paralelo se pisan los locks. Son dos o cinco, no
       quinientos: la latencia no es el problema, la consistencia sí. */
    for (const id of [...ids].sort()) {
      try {
        const r = await WoodEntriesDB.recepcionar(tenantId, id, dia, user, observacion, confirmacion);
        if (r) {
          recepcionados += 1;
          piezas += r.piezas;
        }
      } catch (e) {
        return {
          recepcionados,
          piezas,
          fecha: dia,
          fallo: { id, motivo: e instanceof Error ? e.message : String(e) },
        };
      }
    }
    return { recepcionados, piezas, fecha: dia, fallo: null };
  }

  static async reject(tenantId: string, id: string, validatorId: string, reason: string) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!reason?.trim()) throw new Error("rejection reason is required");
    const { entry, soltados, cuenta, reservas } = await prisma.$transaction(async (tx) => {
      const entry = await tx.woodEntry.update({
        where: { id, tenantId } satisfies Prisma.WoodEntryWhereUniqueInput,
        data: {
          status: "rechazado",
          validatedBy: validatorId,
          validatedAt: new Date(),
          rejectionReason: reason.trim(),
        },
      });
      const reservas = await soltarReservasMixto(tx, tenantId, [id]);
      const soltados = await soltarCodigosPlanta(tx, tenantId, [id]);
      /* La madera de la guía en la cuenta del proveedor (ADR-437 §4) pasa a
         valer lo que queda vivo; si no queda nada, baja lógica. */
      const cuenta = await ForestCuentaDB.resincronizarMaderaDeGuiaEnTx(tx, tenantId, entry.gtfNumber);
      return { entry, soltados, cuenta, reservas };
    });
    WoodEntriesDB.auditarCuentaDeGuia(tenantId, entry.gtfNumber, cuenta, "rechazó un asiento", validatorId);
    auditCtp({
      tenantId,
      action: "ctp_ingreso_reject",
      entity: "WoodEntry",
      entityId: id,
      detail: `Rechazó el ingreso ${entry.gtfNumber} · ${entry.speciesCommonName} · motivo: ${reason.trim()}`,
      user: validatorId,
    });
    WoodEntriesDB.auditarCodigosSoltados(tenantId, id, entry.gtfNumber, "ingreso rechazado", soltados, validatorId);
    WoodEntriesDB.auditarReservasSoltadas(tenantId, id, entry.gtfNumber, "ingreso rechazado", reservas, validatorId);
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {}
    return entry;
  }

  /**
   * Anular un ingreso YA VALIDADO (validado → anulado) con motivo obligatorio.
   * A diferencia de `reject` (que se usa ANTES de validar), esto corrige un
   * ingreso que ya entró al saldo: al pasar a "anulado" sale de los saldos y de
   * las cifras oficiales, dejando motivo y autor para la fiscalización.
   *
   * BLOQUEA si el ingreso ya se consumió en una corrida viva: anularlo dejaría
   * consumos apuntando a materia prima que desapareció del saldo (rompe I2). El
   * operador debe corregir/anular esas corridas primero (QA 2026-07-17).
   */
  /**
   * Renglón de auditoría + invalidación cuando dar de baja un asiento movió el
   * abono `madera` de su guía en la cuenta del proveedor (ADR-437 §4).
   */
  private static auditarCuentaDeGuia(
    tenantId: string,
    gtfNumber: string,
    cuenta: "sin_cuenta" | "actualizada" | "baja",
    accion: string,
    user: string,
  ): void {
    if (cuenta === "sin_cuenta") return;
    auditCtp({
      tenantId,
      action: cuenta === "baja" ? "ctp_cuenta_delete" : "ctp_cuenta_update",
      entity: "ForestCuentaMov",
      entityId: gtfNumber,
      detail:
        cuenta === "baja"
          ? `Se ${accion} de la guía ${gtfNumber} y no le queda costo vivo: su madera salió de la cuenta del proveedor`
          : `Se ${accion} de la guía ${gtfNumber}: la madera en la cuenta del proveedor pasa a valer lo que queda vivo`,
      user: user || "unknown",
    });
    ForestCuentaDB.invalidar(tenantId);
  }

  static async annul(tenantId: string, id: string, user: string, reason: string) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!reason?.trim()) throw new Error("annul reason is required");
    await WoodEntriesDB.assertPeriodoAbierto(tenantId, id, "anular");
    const consumido = await prisma.forestCtpConsumo.count({
      where: { tenantId, woodEntryId: id, ctpEntry: { deletedAt: null, status: "registrado" } },
    });
    if (consumido > 0) {
      throw new Error(
        "Este ingreso ya se consumió en una corrida de producción. Corrige o anula esas corridas antes de anular el ingreso.",
      );
    }
    const { entry, soltados, cuenta, reservas } = await prisma.$transaction(async (tx) => {
      const entry = await tx.woodEntry.update({
        where: { id, tenantId } satisfies Prisma.WoodEntryWhereUniqueInput,
        data: { status: "anulado", rejectionReason: reason.trim() },
      });
      const reservas = await soltarReservasMixto(tx, tenantId, [id]);
      const soltados = await soltarCodigosPlanta(tx, tenantId, [id]);
      /* ADR-437 §4: la madera anotada en la cuenta sigue a lo que queda vivo. */
      const cuenta = await ForestCuentaDB.resincronizarMaderaDeGuiaEnTx(tx, tenantId, entry.gtfNumber);
      return { entry, soltados, cuenta, reservas };
    });
    WoodEntriesDB.auditarCuentaDeGuia(tenantId, entry.gtfNumber, cuenta, "anuló un asiento", user);
    auditCtp({
      tenantId,
      action: "ctp_ingreso_annul",
      entity: "WoodEntry",
      entityId: id,
      detail: `Anuló el ingreso ${entry.gtfNumber} · ${entry.speciesCommonName} · ${m3(Number(entry.volumeM3))} · motivo: ${reason.trim()}`,
      user,
    });
    WoodEntriesDB.auditarCodigosSoltados(tenantId, id, entry.gtfNumber, "ingreso anulado", soltados, user);
    WoodEntriesDB.auditarReservasSoltadas(tenantId, id, entry.gtfNumber, "ingreso anulado", reservas, user);
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {}
    return entry;
  }

  /**
   * CUADRAR un ingreso cuya guía se contradice a sí misma (ADR-353).
   *
   * Una GTF declara el mismo volumen dos veces —cabecera por especie (37) y
   * lista de trozas (35)— y a veces no coinciden. Verificado contra la consulta
   * pública de SERFOR el 2026-08-06: la guía `019-0000016` publica la pieza
   * `20/A` con **cantidad 3** y 6.129 m³, mientras su cabecera declara 4.161 m³
   * para esa especie; el propio «TOTAL VOLUMEN» del documento sólo cierra si esa
   * fila cuenta como UNA troza.
   *
   * Sin salida, ese ingreso queda muerto: no se puede consumir (choca con I2) y
   * tampoco corregir (validado ⇒ `update` lo rechaza). Anular y volver a cargar
   * pierde el folio y no arregla nada, porque el documento seguirá igual.
   *
   * Reglas:
   * 1. **Se corrige UN lado, el que elige el operador.** El sistema propone los
   *    números (`propuestasDeCuadre`) pero no decide cuál testigo del papel vale.
   * 2. **Motivo obligatorio y auditado.** Un libro fiscalizable tiene que poder
   *    contestar "¿esto siempre dijo 4.1610?" y "¿por qué cambió?".
   * 3. Período abierto, y nada que ya se haya consumido: bajar el volumen de una
   *    pieza que ya entró a la sierra reescribiría una corrida cerrada.
   * 4. `lado: "lista"` nunca puede dejar el ingreso por debajo de lo ya
   *    consumido (sería I2 al revés).
   */
  static async cuadrarIngreso(
    tenantId: string,
    id: string,
    input:
      | { lado: "lista"; motivo: string }
      | { lado: "cabecera"; motivo: string; trozaId: string; cantidad: number; volumenM3: number },
    user: string,
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id) throw new Error("id is required");
    const motivo = input.motivo?.trim() ?? "";
    if (motivo.length < 3) throw new Error("El motivo del cuadre es obligatorio.");

    const actual = await prisma.woodEntry.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!actual) throw new Error("Ingreso no encontrado");
    if (actual.status === "anulado" || actual.status === "rechazado") {
      throw new CtpInvariantError(
        `Este ingreso está ${actual.status}: no se cuadra, se vuelve a registrar.`,
        "ESTADO_NO_EDITABLE",
        { status: actual.status },
      );
    }
    await WoodEntriesDB.assertPeriodoAbierto(tenantId, id, "cuadrar");

    if (input.lado === "cabecera") {
      // Corregir la fila de la lista que el documento contradice.
      const troza = await prisma.woodEntryTroza.findFirst({
        where: { id: input.trozaId, tenantId, woodEntryId: id },
      });
      if (!troza) {
        throw new CtpInvariantError("Esa pieza no pertenece a este ingreso.", "TROZA_AJENA", {
          trozaId: input.trozaId,
        });
      }
      if (troza.consumidaEnId) {
        throw new CtpInvariantError(
          `La pieza ${troza.codificacion ?? "—"} ya entró a la sierra: no se le puede cambiar el volumen. Corrige o anula esa corrida primero.`,
          "TROZA_CONSUMIDA",
          { trozaId: troza.id },
        );
      }
      if (
        troza.trozaOrigenId ||
        (await prisma.woodEntryTroza.count({ where: { tenantId, trozaOrigenId: troza.id } })) > 0
      ) {
        throw new CtpInvariantError(
          `La pieza ${troza.codificacion ?? "—"} está retrozada: cuadra el retrozado antes de tocar su volumen.`,
          "TROZA_RETROZADA",
          { trozaId: troza.id },
        );
      }
      if (!(input.volumenM3 > 0)) throw new Error("El volumen de la pieza debe ser > 0");

      const antesVol = Number(troza.volumenM3 ?? 0);
      const antesCant = troza.cantidad ?? 1;
      const nueva = await prisma.woodEntryTroza.update({
        where: { id: troza.id },
        data: {
          cantidad: Math.max(1, Math.round(input.cantidad)),
          volumenM3: new Prisma.Decimal(input.volumenM3),
        },
      });
      auditCtp({
        tenantId,
        action: "ctp_ingreso_cuadre",
        entity: "WoodEntry",
        entityId: id,
        detail:
          `Cuadró la guía ${actual.gtfNumber} por la CABECERA · pieza ${troza.codificacion ?? "—"}: ` +
          `${antesCant} → ${nueva.cantidad} troza(s), ${m3(antesVol)} → ${m3(Number(nueva.volumenM3 ?? 0))} · motivo: ${motivo}`,
        user,
      });
      try {
        invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
      } catch {}
      return { entry: actual, troza: nueva };
    }

    // lado === "lista": el ingreso pasa a declarar lo que suman sus piezas.
    const piezas = await prisma.woodEntryTroza.findMany({
      where: { tenantId, woodEntryId: id },
      select: { cantidad: true, volumenM3: true },
    });
    if (piezas.length === 0) {
      throw new CtpInvariantError(
        "Este ingreso no tiene lista de piezas con la que cuadrar.",
        "CUADRE_SIN_LISTA",
      );
    }
    const suma = Number(piezas.reduce((a, p) => a + Number(p.volumenM3 ?? 0), 0).toFixed(4));
    if (!(suma > 0)) {
      throw new CtpInvariantError(
        "Las piezas de este ingreso no declaran volumen: no hay con qué cuadrar.",
        "CUADRE_SIN_LISTA",
      );
    }

    const consumido = (await WoodEntriesDB.consumidoPorIngreso(tenantId, [id])).get(id) ?? 0;
    if (suma + 0.001 < consumido) {
      throw new CtpInvariantError(
        `No se puede dejar el ingreso en ${m3(suma)}: ya tiene ${m3(consumido)} consumidos.`,
        "I2_SOBRE_CONSUMO",
        { suma, consumido },
      );
    }

    const antes = Number(actual.volumeM3);
    const entry = await prisma.woodEntry.update({
      where: { id, tenantId } satisfies Prisma.WoodEntryWhereUniqueInput,
      data: {
        volumeM3: new Prisma.Decimal(suma),
        pieces: piezas.reduce((a, p) => a + Math.max(1, Math.round(p.cantidad ?? 1)), 0),
      },
    });
    auditCtp({
      tenantId,
      action: "ctp_ingreso_cuadre",
      entity: "WoodEntry",
      entityId: id,
      detail:
        `Cuadró la guía ${actual.gtfNumber} por la LISTA · ${actual.speciesCommonName}: ` +
        `${m3(antes)} → ${m3(suma)} · motivo: ${motivo}`,
      user,
    });
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {}
    return { entry, troza: null };
  }

  /** El renglón «Código de planta liberado» (antes → después), si hubo alguno. */
  private static auditarCodigosSoltados(
    tenantId: string,
    woodEntryId: string,
    gtf: string,
    motivo: string,
    soltados: readonly CodigoSoltado[],
    user: string,
  ): void {
    if (soltados.length === 0) return;
    auditCtp({
      tenantId,
      action: "ctp_troza_codigo_soltado",
      entity: "WoodEntry",
      entityId: woodEntryId,
      detail: detalleCodigosSoltados(gtf, motivo, soltados),
      user,
    });
  }

  /** El renglón «soltó N trozas del lote mixto» (ADR-441), si hubo alguna. */
  private static auditarReservasSoltadas(
    tenantId: string,
    woodEntryId: string,
    gtf: string,
    motivo: string,
    soltadas: readonly ReservaSoltada[],
    user: string,
  ): void {
    if (soltadas.length === 0) return;
    const mixtos = [...new Set(soltadas.map((t) => t.mixto))].join(", ");
    const piezas = soltadas.slice(0, MAX_CODIGOS_EN_DETALLE).map((t) => t.codigo ?? t.id);
    const resto = soltadas.length - piezas.length;
    auditCtp({
      tenantId,
      action: "ctp_lote_mixto_soltado",
      entity: "WoodEntry",
      entityId: woodEntryId,
      detail:
        `Soltó ${soltadas.length} troza(s) de la GTF ${gtf} apartadas en el lote mixto ${mixtos} (${motivo}): ` +
        piezas.join(", ") +
        (resto > 0 ? ` y ${resto} más` : ""),
      user,
    });
    try {
      invalidateByPrefix(`forestal:lote-mixto:${tenantId}`);
    } catch (err) {
      logger.warn("[wood-entries] no se pudo invalidar el caché del lote mixto", { error: String(err) });
    }
  }

  /**
   * Soft delete. No borra físicamente; el registro sigue en la DB y el evento
   * queda en el ActivityLog (un ingreso que "desaparece" de un libro fiscalizado
   * sin dejar autor es exactamente lo que no puede pasar).
   */
  static async softDelete(tenantId: string, id: string, user = "unknown") {
    if (!tenantId) throw new Error("tenantId is required");
    await WoodEntriesDB.assertPeriodoAbierto(tenantId, id, "eliminar");
    const { entry, soltados, cuenta, reservas } = await prisma.$transaction(async (tx) => {
      const entry = await tx.woodEntry.update({
        where: { id, tenantId } satisfies Prisma.WoodEntryWhereUniqueInput,
        data: { deletedAt: new Date() },
      });
      const reservas = await soltarReservasMixto(tx, tenantId, [id]);
      const soltados = await soltarCodigosPlanta(tx, tenantId, [id]);
      /* ADR-437 §4: la madera anotada en la cuenta sigue a lo que queda vivo. */
      const cuenta = await ForestCuentaDB.resincronizarMaderaDeGuiaEnTx(tx, tenantId, entry.gtfNumber);
      return { entry, soltados, cuenta, reservas };
    });
    WoodEntriesDB.auditarCuentaDeGuia(tenantId, entry.gtfNumber, cuenta, "eliminó un asiento", user);
    auditCtp({
      tenantId,
      action: "ctp_ingreso_delete",
      entity: "WoodEntry",
      entityId: id,
      detail: `Eliminó (soft) el ingreso ${entry.gtfNumber} · ${entry.speciesCommonName} · ${m3(Number(entry.volumeM3))}`,
      user,
    });
    WoodEntriesDB.auditarCodigosSoltados(tenantId, id, entry.gtfNumber, "ingreso eliminado", soltados, user);
    WoodEntriesDB.auditarReservasSoltadas(tenantId, id, entry.gtfNumber, "ingreso eliminado", reservas, user);
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {}
    return entry;
  }

  /**
   * Agregados por especie — para dashboards futuros.
   */
  static async aggregateBySpecies(tenantId: string, opts: { fromDate?: Date; toDate?: Date } = {}) {
    const where: Prisma.WoodEntryWhereInput = {
      tenantId,
      deletedAt: null,
      status: { in: ["validado", "procesado"] },
    };
    if (opts.fromDate || opts.toDate) {
      where.entryDate = {};
      if (opts.fromDate) where.entryDate.gte = opts.fromDate;
      if (opts.toDate) where.entryDate.lte = opts.toDate;
    }
    const result = await prisma.woodEntry.groupBy({
      by: ["speciesCommonName"],
      where,
      _sum: { volumeM3: true, pieces: true },
      _count: { _all: true },
      orderBy: { _sum: { volumeM3: "desc" } },
    });
    return result.map((r) => ({
      species: r.speciesCommonName,
      totalVolumeM3: r._sum.volumeM3?.toNumber() ?? 0,
      totalPieces: r._sum.pieces ?? 0,
      entryCount: r._count._all,
    }));
  }
}

export type { WoodEntryStatus, WoodOriginType, WoodProductType, DocumentType };

/**
 * Las rutas (`propietario.nombre`, `vehiculo.placa`…) cuyo valor cambió entre
 * dos cuerpos de guía. Compara hoja por hoja: dos objetos con las mismas claves
 * en otro orden no son un cambio.
 */
export function casillerosCambiados(antes: unknown, despues: unknown, prefijo = ""): string[] {
  const esObj = (v: unknown): v is Record<string, unknown> =>
    Boolean(v) && typeof v === "object" && !Array.isArray(v);
  const a = esObj(antes) ? antes : {};
  const d = esObj(despues) ? despues : {};
  const claves = new Set([...Object.keys(a), ...Object.keys(d)]);
  const out: string[] = [];
  for (const k of claves) {
    const va = a[k];
    const vd = d[k];
    const ruta = prefijo ? `${prefijo}.${k}` : k;
    if (esObj(va) || esObj(vd)) {
      out.push(...casillerosCambiados(va, vd, ruta));
      continue;
    }
    const norm = (v: unknown) =>
      v == null ? "" : Array.isArray(v) ? JSON.stringify(v) : String(v).trim();
    if (norm(va) !== norm(vd)) out.push(ruta);
  }
  return out;
}
