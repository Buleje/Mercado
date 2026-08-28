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
import { Prisma } from "@/lib/generated/prisma/client";
import {
  claveDeGuia,
  resumirGuia,
  type GuiaIngreso,
} from "@/lib/forestal/ingresos-por-guia";
import type {
  WoodEntryStatus,
  WoodOriginType,
  WoodProductType,
  DocumentType,
} from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { PLAZO_REGISTRO_DIAS, estaFueraDePlazo } from "@/lib/forestal/ctp-compliance";
import { auditCtp, m3 } from "@/lib/forestal/ctp-audit";
import { calcularRetrozado, type RetrozoNuevo } from "@/lib/forestal/ctp-retrozado";
import type { CambioRecepcion } from "@/lib/forestal/recepcion-trozas";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { ForestCtpCierreDB } from "./forest-ctp-cierre.db";
import { CtpInvariantError } from "./forest-ctp-consumo.db";

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
  photos?: string[] | null;
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

export interface WoodEntryListFilters {
  status?: WoodEntryStatus;
  speciesCommonName?: string;
  gtfNumber?: string;
  fromDate?: Date;
  toDate?: Date;
  search?: string; // matches provider/gtf/species
  /** Proveedor (contains, insensitive) — el chip "solo este proveedor". */
  providerName?: string;
  /** Tipo de producto (rolliza/aserrada/…) — igualdad exacta. */
  productType?: WoodProductType;
  /** true = solo CITES · false = solo NO-CITES · undefined = ambos. */
  cites?: boolean;
  /** true = solo los registrados fuera del plazo SERFOR (días hábiles op→registro). */
  late?: boolean;
  /** true = solo ingresos SIN código de origen. Son los que dejan el EUDR
   *  incompleto: sin código no hay parcela que geolocalizar (Reg. 2023/1115). */
  sinOrigenCode?: boolean;
  /**
   * Estado de recepción (ADR-339): `pendiente` es la bandeja del patio y
   * `cerrada` el archivo de «GTF ingresadas». Sin valor = las dos.
   */
  recepcion?: "pendiente" | "cerrada";
  sortBy?: WoodEntrySortField;
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

/** Un asiento con el resumen de sus piezas — lo que devuelven `list` y `listPorGuia`. */
type WoodEntryConTrozas = Prisma.WoodEntryGetPayload<object> & {
  trozasCount: number;
  trozasM3: number | null;
  trozasDecididas: number;
};

const CACHE_PREFIX = "wood-entries";

/**
 * Single source del `where` de listado: `list` y `stats` deben filtrar
 * exactamente igual, si no los KPIs describen un conjunto distinto al de la
 * tabla que están encabezando.
 */
function buildListWhere(
  tenantId: string,
  filters: WoodEntryListFilters,
): Prisma.WoodEntryWhereInput {
  const where: Prisma.WoodEntryWhereInput = { tenantId, deletedAt: null };

  if (filters.status) where.status = filters.status;
  if (filters.speciesCommonName) {
    where.speciesCommonName = { contains: filters.speciesCommonName, mode: "insensitive" };
  }
  if (filters.gtfNumber) where.gtfNumber = filters.gtfNumber;
  if (filters.providerName) {
    where.providerName = { contains: filters.providerName, mode: "insensitive" };
  }
  if (filters.productType) where.productType = filters.productType;
  if (filters.cites !== undefined) where.speciesCites = filters.cites;
  if (filters.sinOrigenCode) {
    // Va por AND y no por OR: `where.OR` ya lo usa la búsqueda libre, y
    // pisarlo haría que buscar + este filtro devolviera cualquier cosa.
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      { OR: [{ originCode: null }, { originCode: "" }] },
    ];
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
    ];
  }

  return where;
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
  if (filters.speciesCommonName) {
    conditions.push(Prisma.sql`"speciesCommonName" ILIKE ${`%${filters.speciesCommonName}%`}`);
  }
  if (filters.gtfNumber) conditions.push(Prisma.sql`"gtfNumber" = ${filters.gtfNumber}`);
  if (filters.providerName) {
    conditions.push(Prisma.sql`"providerName" ILIKE ${`%${filters.providerName}%`}`);
  }
  if (filters.productType) conditions.push(Prisma.sql`"productType" = ${filters.productType}`);
  if (filters.cites !== undefined) conditions.push(Prisma.sql`"speciesCites" = ${filters.cites}`);
  if (filters.sinOrigenCode) {
    conditions.push(Prisma.sql`("originCode" IS NULL OR "originCode" = '')`);
  }
  if (filters.fromDate) conditions.push(Prisma.sql`"entryDate" >= ${filters.fromDate}`);
  if (filters.toDate) conditions.push(Prisma.sql`"entryDate" <= ${filters.toDate}`);
  if (filters.search) {
    const like = `%${filters.search}%`;
    conditions.push(
      Prisma.sql`("gtfNumber" ILIKE ${like} OR "providerName" ILIKE ${like} OR "speciesCommonName" ILIKE ${like})`,
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
const FUERA_DE_PLAZO_SQL = Prisma.sql`(
        (GREATEST(0, floor(extract(epoch from ("createdAt" - "entryDate")) / 86400)::int) / 7) * 5
        + (
          SELECT count(*)::int
          FROM generate_series(1, GREATEST(0, floor(extract(epoch from ("createdAt" - "entryDate")) / 86400)::int) % 7) AS gi
          WHERE ((extract(isodow from "entryDate")::int - 1 + gi) % 7) + 1 <= 5
        )
      ) > ${PLAZO_REGISTRO_DIAS}`;

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
async function withRecepcionFilter(
  tenantId: string,
  filters: WoodEntryListFilters,
  where: Prisma.WoodEntryWhereInput,
): Promise<Prisma.WoodEntryWhereInput> {
  if (!filters.recepcion) return where;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "WoodEntry"
    WHERE "tenantId" = ${tenantId} AND "deletedAt" IS NULL AND ${RECEPCION_CERRADA_SQL}
  `;
  const ids = rows.map((r) => r.id);
  /* Va por `AND` y no sobre `where.id`: el filtro de fuera de plazo ya usa `id`
     y pisarlo dejaría activo sólo uno de los dos — la tabla mostraría un
     conjunto que ningún filtro pidió. */
  const previas = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
  return {
    ...where,
    AND: [...previas, { id: filters.recepcion === "cerrada" ? { in: ids } : { notIn: ids } }],
  };
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
   * Ingresos vigentes sin costo cargado. No traba nada del libro —el
   * compliance no pide precios— pero es lo que deja al COGS sin base: lo que
   * salga de esa madera no puede mostrar margen.
   */
  sinCostoCount: number;
  byStatus: Record<WoodEntryStatus, number>;
  /** Especies / proveedores / productos presentes en el período (top 30 por volumen). */
  species: WoodEntryFacet[];
  providers: WoodEntryFacet[];
  products: WoodEntryFacet[];
}

/**
 * El código de planta es la marca FÍSICA que alguien pinta sobre la troza: dos
 * piezas con el mismo número son dos piezas que el patio no puede distinguir, y
 * un inventario que no distingue sus piezas no prueba nada ante OSINFOR.
 *
 * El guard vive acá —en la capa DB— y no sólo en el índice de Postgres porque
 * la base heredó códigos repetidos de antes de esta regla (migración 336: el
 * índice único se crea recién cuando esos duplicados se limpien). Hasta
 * entonces esto es lo único que impide fabricar uno nuevo.
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
        "Cada pieza lleva su propio número: usá «Generar códigos» para renumerar.",
      "CODIGO_PLANTA_DUPLICADO",
      { codigos: [...repetidos] },
    );
  }

  // 2 · Repetidos contra lo que YA está en el libro. Va en SQL y no por Prisma
  //     porque la comparación tiene que ser insensible a mayúsculas ("13/a" y
  //     "13/A" son la misma marca sobre la misma madera) y `in` + `mode` no lo
  //     garantiza. Parametrizado: el código llega del cliente.
  const enUso = await tx.$queryRaw<
    { codigoPlanta: string; codificacion: string | null; gtfNumber: string }[]
  >`
    SELECT t."codigoPlanta", t."codificacion", e."gtfNumber"
    FROM "WoodEntryTroza" t
    JOIN "WoodEntry" e ON e."id" = t."woodEntryId"
    WHERE t."tenantId" = ${tenantId}
      AND UPPER(t."codigoPlanta") = ANY(${[...vistos]})
      AND NOT (t."id" = ANY(${excluirIds.length > 0 ? excluirIds : [""]}))
      AND e."deletedAt" IS NULL
      AND e."status" NOT IN ('anulado', 'rechazado')
    LIMIT 20
  `;
  if (enUso.length > 0) {
    const detalle = enUso
      .map((t) => `${t.codigoPlanta} (GTF ${t.gtfNumber}${t.codificacion ? `, troza ${t.codificacion}` : ""})`)
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

export class WoodEntriesDB {
  /**
   * Crea un nuevo ingreso de madera al CTP.
   * Status default = `pendiente` (validación posterior).
   */
  static async create(
    tenantId: string,
    input: WoodEntryCreateInput,
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!input.gtfNumber?.trim()) throw new Error("gtfNumber is required");
    if (!input.providerName?.trim()) throw new Error("providerName is required");
    if (!input.speciesCommonName?.trim()) throw new Error("speciesCommonName is required");
    if (!input.createdBy?.trim()) throw new Error("createdBy is required");

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
    const cerradoWe = await ForestCtpCierreDB.closedPeriodOf(tenantId, input.entryDate ?? new Date());
    if (cerradoWe) {
      throw new CtpInvariantError(
        `El período ${cerradoWe.label} está cerrado: no se puede ingresar madera con fecha de un mes cerrado.`,
        "PERIODO_CERRADO",
        { periodKey: cerradoWe.periodKey },
      );
    }

    // El folio del libro (columna 1 del formato oficial) y el INSERT van en la
    // MISMA transacción: si se calcula fuera, dos ingresos simultáneos se llevan
    // el mismo número y el libro queda con folios repetidos — lo primero que
    // mira un fiscalizador. Mismo patrón que `lineNo` de ForestCtpEntry.
    const entry = await prisma.$transaction(async (tx) => {
      const max = await tx.woodEntry.aggregate({
        where: { tenantId },
        _max: { libroNro: true },
      });
      const libroNro = (max._max.libroNro ?? 0) + 1;
      const creado = await tx.woodEntry.create({
        data: {
          tenantId,
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
          originSourceNumber: input.originSourceNumber?.trim() || null,
          ctpProductCode: input.ctpProductCode?.trim() || null,
          originRegion: input.originRegion ?? null,
          originDistrict: input.originDistrict ?? null,
          speciesCommonName: input.speciesCommonName.trim(),
          speciesScientificName: input.speciesScientificName ?? null,
          speciesCites: input.speciesCites ?? false,
          productType: input.productType ?? "rolliza",
          unit: input.unit?.trim() || "m3",
          presentacion: input.presentacion?.trim().toUpperCase() || null,
          volumeM3: volumeDecimal,
          pieces: input.pieces ?? 0,
          avgLengthM: input.avgLengthM != null ? new Prisma.Decimal(input.avgLengthM) : null,
          avgDiameterCm: input.avgDiameterCm != null ? new Prisma.Decimal(input.avgDiameterCm) : null,
          humidityPct: input.humidityPct != null ? new Prisma.Decimal(input.humidityPct) : null,
          defectsNotes: input.defectsNotes ?? null,
          notes: input.notes ?? null,
          photos: input.photos ? (input.photos as Prisma.InputJsonValue) : Prisma.DbNull,
          gtfDatos: input.gtfDatos ? (input.gtfDatos as Prisma.InputJsonValue) : Prisma.DbNull,
          status: "pendiente",
          createdBy: input.createdBy,
        },
        });

      // La lista de trozas viaja con su guía y en la misma tx (ADR-312/320): si
      // falla, no queda un ingreso al que después haya que pegarle las piezas.
      if (input.trozas?.length) {
        // El código de planta es único en el centro (ADR-336). Se valida DENTRO
        // de la tx: fuera, dos tablets numerando a la vez pasan las dos.
        await guardCodigoPlantaUnico(tx, tenantId, input.trozas.map((t) => t.codigoPlanta));
        await tx.woodEntryTroza.createMany({
          data: input.trozas.map((t) => ({
            tenantId,
            woodEntryId: creado.id,
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
            codigoPlanta: t.codigoPlanta ?? null,
            parcela: t.parcela ?? null,
            // Una pieza que no llegó no puede tener el día en que llegó.
            fechaRecepcion: t.noRecepcionada ? null : (t.fechaRecepcion ?? input.fechaRecepcion ?? null),
            noRecepcionada: t.noRecepcionada ?? false,
          })),
        });
      }
      return creado;
    });

    auditCtp({
      tenantId,
      action: "ctp_ingreso_create",
      entity: "WoodEntry",
      entityId: entry.id,
      detail:
        `Registró el ingreso ${entry.gtfNumber} · ${entry.speciesCommonName} · ${m3(Number(entry.volumeM3))} · ${entry.providerName}` +
        (estaFueraDePlazo(entry) ? ` · FUERA DE PLAZO (${PLAZO_REGISTRO_DIAS} días)` : ""),
      user: input.createdBy,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return entry;
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
  static async createDesdeGtfSerfor(
    tenantId: string,
    input: WoodEntryDesdeGtfInput,
  ) {
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
        `La guía ${input.gtfNumber.trim()} ya está registrada en el libro (${yaEsta} ingreso(s)). Si hay que corregirla, anulá los ingresos y volvé a cargarla.`,
        "GTF_DUPLICADA",
        { gtfNumber: input.gtfNumber.trim() },
      );
    }

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
        (creados[0] && estaFueraDePlazo(creados[0].entry) ? ` · FUERA DE PLAZO (${PLAZO_REGISTRO_DIAS} días)` : ""),
      user: input.createdBy,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return creados.map((c) => c.entry);
  }

  /**
   * Busca trozas por su codificación (ADR-312). Es lo que cruza un fiscalizador
   * de OSINFOR contra el POA del título habilitante: dado un código de troza,
   * de qué GTF entró y a qué ingreso pertenece.
   */
  static async buscarTrozas(
    tenantId: string,
    codificacion: string,
    limite = 50,
  ) {
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
            id: true, libroNro: true, gtfNumber: true, serforNumeroRegistro: true,
            entryDate: true, providerName: true, speciesCommonName: true,
            status: true, originCode: true, originRegion: true, originDistrict: true,
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
        throw new CtpInvariantError("Ese ingreso no existe en este tenant.", "TENANT_MISMATCH", { woodEntryId });
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
          `El período ${cerrado.label} está cerrado: no se puede cambiar la recepción de una guía de un mes cerrado. Reabrí el período para corregir.`,
          "PERIODO_CERRADO",
          { periodKey: cerrado.periodKey },
        );
      }

      const ids = [...new Set(cambios.map((c) => c.id))];
      const propias = await tx.woodEntryTroza.findMany({
        where: { id: { in: ids }, tenantId, woodEntryId },
        select: {
          id: true, codificacion: true, noRecepcionada: true, consumidaEnId: true,
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
          Boolean(t?.consumidaEnId && t.consumidaEn && t.consumidaEn.status === "registrado" && !t.consumidaEn.deletedAt),
        );
      if (contradicen.length > 0) {
        throw new CtpInvariantError(
          `No se puede marcar como no recibida${contradicen.length === 1 ? "" : "s"} ` +
            `${contradicen.map((t) => t.codificacion ?? t.id).join(", ")}: ya entró a una corrida de producción. ` +
            "Sacala primero del consumo de esa corrida.",
          "ESTADO_NO_EDITABLE",
          { trozas: contradicen.map((t) => t.id) },
        );
      }

      // El código de planta sigue siendo único después de editar (ADR-336). Se
      // excluyen las trozas que se están tocando: si la pieza guarda el mismo
      // código que ya tenía, chocaría consigo misma.
      await guardCodigoPlantaUnico(
        tx,
        tenantId,
        cambios.filter((c) => c.codigoPlanta !== undefined && !c.noRecepcionada).map((c) => c.codigoPlanta),
        ids,
      );

      const limpiar = (v: string | null | undefined) => (v ?? "").trim() || null;

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
          (faltantes.length > 0 ? ` · marcó como NO recibidas: ${faltantes.join(", ")}` : ""),
        user: usuario,
      });
      try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}

      return { actualizadas: cambios.length };
    });
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
   */
  static async trozasDelPatio(tenantId: string, opts: { limite?: number; loteId?: string } = {}) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.woodEntryTroza.findMany({
      where: {
        tenantId,
        ...(opts.loteId ? { loteAserrioId: opts.loteId } : {}),
        entry: { deletedAt: null, status: { notIn: ["anulado", "rechazado"] } },
      },
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
            id: true, gtfNumber: true, providerName: true, entryDate: true,
            status: true, fechaRecepcion: true,
            // Título habilitante (6) y resolución (8): por ahí agrupa el patio
            // cuando entra la carga de un permiso entero (ADR-342).
            originCode: true, originSourceNumber: true,
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
    opts: { limite?: number; loteId?: string } = {},
  ): Promise<TrozaConsumible[]> {
    const filas = await WoodEntriesDB.trozasDelPatio(tenantId, opts);
    const consumido = await WoodEntriesDB.consumidoPorIngreso(tenantId, filas.map((t) => t.woodEntryId));
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
      largoM: num(t.largoM),
      volumenM3: num(t.volumenM3),
      gtfNumber: t.entry.gtfNumber,
      proveedor: t.entry.providerName,
      fechaIngreso: t.entry.entryDate as unknown as string,
      fechaRecepcion: t.fechaRecepcion as unknown as string | null,
      guiaRecepcionada: t.entry.status === "validado" || Boolean(t.entry.fechaRecepcion) || Boolean(t.fechaRecepcion),
      permiso: t.entry.originCode,
      resolucion: t.entry.originSourceNumber,
      guiaVolumenM3: num(t.entry.volumeM3),
      guiaConsumidoM3: consumido.get(t.woodEntryId) ?? 0,
      consumidaEnId:
        t.consumidaEn && t.consumidaEn.status === "registrado" && !t.consumidaEn.deletedAt ? t.consumidaEnId : null,
      despachadaEnId:
        t.despachadaEn && t.despachadaEn.status === "registrado" && !t.despachadaEn.deletedAt ? t.despachadaEnId : null,
      noRecepcionada: t.noRecepcionada,
      trozaOrigenId: t.trozaOrigenId,
      descarte: t.descarte,
      retrozos: t._count.retrozos,
      loteAserrioId: t.loteAserrioId,
      loteAserrioCode: t.loteAserrio?.code ?? null,
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

  /** Cuántas piezas tiene el patio DE VERDAD: el tope de arriba no puede mentir. */
  static async contarTrozasDelPatio(tenantId: string, opts: { loteId?: string } = {}) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.woodEntryTroza.count({
      where: {
        tenantId,
        ...(opts.loteId ? { loteAserrioId: opts.loteId } : {}),
        entry: { deletedAt: null, status: { notIn: ["anulado", "rechazado"] } },
      },
    });
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
      WHERE "tenantId" = ${tenantId} AND "codigoPlanta" ~ '^[0-9]+$'
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
        id: string; codigoPlanta: string; codificacion: string | null; especieComun: string | null;
        volumenM3: unknown; createdAt: Date; woodEntryId: string; gtfNumber: string;
        entryDate: Date; consumida: boolean; noRecepcionada: boolean; ingresoAnulado: boolean;
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
        AND t."codigoPlanta" IS NOT NULL AND t."codigoPlanta" <> ''
        AND UPPER(t."codigoPlanta") IN (
          SELECT UPPER(t2."codigoPlanta")
          FROM "WoodEntryTroza" t2
          WHERE t2."tenantId" = ${tenantId}
            AND t2."codigoPlanta" IS NOT NULL AND t2."codigoPlanta" <> ''
          GROUP BY UPPER(t2."codigoPlanta") HAVING COUNT(*) > 1
        )
      ORDER BY UPPER(t."codigoPlanta"), t."createdAt"
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
      const k = f.codigoPlanta.toUpperCase();
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
  ): Promise<{ renumeradas: { id: string; antes: string | null; ahora: string }[]; omitidas: { id: string; motivo: string }[] }> {
    if (!tenantId) throw new Error("tenantId is required");
    const ids = [...new Set(trozaIds.filter(Boolean))];
    if (ids.length === 0) return { renumeradas: [], omitidas: [] };

    const omitidas: { id: string; motivo: string }[] = [];
    const piezas = await prisma.woodEntryTroza.findMany({
      where: { id: { in: ids }, tenantId },
      select: {
        id: true, codigoPlanta: true, codificacion: true,
        entry: { select: { id: true, entryDate: true, status: true, deletedAt: true, gtfNumber: true } },
      },
    });
    const encontradas = new Set(piezas.map((p) => p.id));
    for (const id of ids) if (!encontradas.has(id)) omitidas.push({ id, motivo: "No es una troza de este tenant." });

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
        omitidas.push({ id: p.id, motivo: `El período ${label} está cerrado: reabrilo para corregir esa pieza.` });
        continue;
      }
      elegibles.push(p);
    }
    if (elegibles.length === 0) return { renumeradas: [], omitidas };

    const renumeradas = await prisma.$transaction(async (tx) => {
      const max = await tx.$queryRaw<{ max: number | null }[]>`
        SELECT MAX(CAST("codigoPlanta" AS BIGINT)) AS max
        FROM "WoodEntryTroza"
        WHERE "tenantId" = ${tenantId} AND "codigoPlanta" ~ '^[0-9]+$'
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
    });

    auditCtp({
      tenantId,
      action: "ctp_troza_recepcion",
      entity: "WoodEntryTroza",
      entityId: renumeradas[0]?.id ?? "",
      detail:
        `Renumeró ${renumeradas.length} troza(s) con código de planta repetido: ` +
        renumeradas.slice(0, 10).map((r) => `${r.antes ?? "—"}→${r.ahora}`).join(", ") +
        (renumeradas.length > 10 ? "…" : ""),
      user: usuario,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return { renumeradas, omitidas };
  }

  /**
   * Pone el candado definitivo: el índice único de Postgres sobre
   * (`tenantId`, `codigoPlanta`).
   *
   * Se intenta después de cada limpieza. Falla en silencio —devuelve `false`—
   * mientras quede un duplicado, incluso de OTRO tenant: el índice es de la
   * tabla entera. Con el índice puesto, ni un bug futuro ni una importación
   * pueden volver a duplicar una marca.
   */
  static async intentarCandadoCodigoPlanta(): Promise<{ creado: boolean; duplicadosRestantes: number }> {
    const dup = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM (
        SELECT "tenantId", UPPER("codigoPlanta")
        FROM "WoodEntryTroza"
        WHERE "codigoPlanta" IS NOT NULL AND "codigoPlanta" <> ''
        GROUP BY 1, 2 HAVING COUNT(*) > 1
      ) x
    `;
    const restantes = Number(dup[0]?.n ?? 0);
    if (restantes > 0) return { creado: false, duplicadosRestantes: restantes };
    // 248 filas: el lock de la tabla dura milisegundos, no hace falta CONCURRENTLY
    // (que además no puede correr dentro de una transacción).
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "WoodEntryTroza_tenant_codigoPlanta_key"
         ON "WoodEntryTroza" ("tenantId", "codigoPlanta")
         WHERE "codigoPlanta" IS NOT NULL AND "codigoPlanta" <> ''`,
    );
    return { creado: true, duplicadosRestantes: 0 };
  }

  /**
   * Cuáles de estos códigos de planta YA están usados en el libro.
   *
   * Es el mismo criterio del guard que rechaza al guardar (`guardCodigoPlantaUnico`),
   * expuesto para poder avisarlo ANTES: descubrir la colisión al apretar
   * "Registrar" —con la lista de sesenta piezas ya llena— es descubrirla tarde.
   * Los ingresos anulados no cuentan: su código volvió a estar libre.
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
        AND UPPER(t."codigoPlanta") = ANY(${claves})
        AND e."deletedAt" IS NULL
        AND e."status" NOT IN ('anulado', 'rechazado')
      LIMIT 200
    `;
    return filas.map((f) => ({ codigo: f.codigoPlanta, gtfNumber: f.gtfNumber, codificacion: f.codificacion }));
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
  ): Promise<{ trozas: Awaited<ReturnType<typeof WoodEntriesDB.trozasDelPatio>>; total: number; volumenM3: number }> {
    if (!tenantId) throw new Error("tenantId is required");
    const where: Prisma.WoodEntryTrozaWhereInput = {
      tenantId,
      entry: {
        deletedAt: null,
        status: { notIn: ["anulado", "rechazado"] },
        ...(opts.from || opts.to
          ? { entryDate: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } }
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
        throw new CtpInvariantError("Esa corrida no existe en este tenant.", "TENANT_MISMATCH", { ctpEntryId });
      }
      if (corrida.section !== "produccion") {
        throw new CtpInvariantError("Sólo una corrida de producción consume trozas.", "ESTADO_NO_EDITABLE", { ctpEntryId });
      }
      // Cierre de período (ADR-139): qué piezas se comió una corrida es parte
      // del acta de ese mes. El consumo ES la corrida, así que la fecha que
      // manda es la suya.
      const cerradoCorrida = await ForestCtpCierreDB.closedPeriodOf(tenantId, corrida.entryDate);
      if (cerradoCorrida) {
        throw new CtpInvariantError(
          `El período ${cerradoCorrida.label} está cerrado: no se pueden cambiar las trozas de una corrida de un mes cerrado. Reabrí el período para corregir.`,
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
            id: true, codificacion: true, volumenM3: true, consumidaEnId: true,
            noRecepcionada: true, descarte: true,
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
            entry: { select: { status: true, deletedAt: true } },
            _count: { select: { retrozos: true } },
          },
        });
        if (candidatas.length !== ids.length) {
          throw new CtpInvariantError("Alguna de esas trozas no existe en este tenant.", "TENANT_MISMATCH", {
            pedidas: ids.length, encontradas: candidatas.length,
          });
        }
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
      }

      // Primero se sueltan las que ya no están en la selección, después se toman
      // las nuevas: al revés, una pieza movida de corrida quedaría sin dueño.
      await tx.woodEntryTroza.updateMany({
        where: { tenantId, consumidaEnId: ctpEntryId, ...(ids.length > 0 ? { id: { notIn: ids } } : {}) },
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
      try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}

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
        id: true, codificacion: true, volumenM3: true,
        consumidaEnId: true, despachadaEnId: true, noRecepcionada: true, descarte: true,
        consumidaEn: { select: { status: true, deletedAt: true } },
        despachadaEn: { select: { status: true, deletedAt: true } },
        entry: { select: { status: true, deletedAt: true } },
        _count: { select: { retrozos: true } },
      },
    });
    if (candidatas.length !== ids.length) {
      throw new CtpInvariantError("Alguna de esas trozas no existe en este tenant.", "TENANT_MISMATCH", {
        pedidas: ids.length, encontradas: candidatas.length,
      });
    }
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
        throw new CtpInvariantError("Ese despacho no existe en este tenant.", "TENANT_MISMATCH", { despachoEntryId });
      }
      if (despacho.section !== "despacho") {
        throw new CtpInvariantError("Sólo una línea de despacho puede llevarse trozas.", "ESTADO_NO_EDITABLE", { despachoEntryId });
      }
      if (despacho.status !== "registrado") {
        throw new CtpInvariantError("El despacho está anulado: sus trozas ya volvieron al patio.", "ESTADO_NO_EDITABLE", { despachoEntryId });
      }
      const cerrado = await ForestCtpCierreDB.closedPeriodOf(tenantId, despacho.entryDate);
      if (cerrado) {
        throw new CtpInvariantError(
          `El período ${cerrado.label} está cerrado: no se pueden cambiar las trozas de un despacho de un mes cerrado. Reabrí el período para corregir.`,
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
            id: true, codificacion: true, volumenM3: true,
            consumidaEnId: true, despachadaEnId: true,
            noRecepcionada: true, descarte: true,
            // El ESTADO de la línea que la tomó, no su id pelado: una corrida o
            // un despacho anulados devolvieron la madera al patio.
            consumidaEn: { select: { status: true, deletedAt: true } },
            despachadaEn: { select: { status: true, deletedAt: true } },
            entry: { select: { status: true, deletedAt: true } },
            _count: { select: { retrozos: true } },
          },
        });
        if (candidatas.length !== ids.length) {
          throw new CtpInvariantError("Alguna de esas trozas no existe en este tenant.", "TENANT_MISMATCH", {
            pedidas: ids.length, encontradas: candidatas.length,
          });
        }

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
        where: { tenantId, despachadaEnId: despachoEntryId, ...(ids.length > 0 ? { id: { notIn: ids } } : {}) },
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
      try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}

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
        throw new CtpInvariantError("Esa troza no existe en este tenant.", "TENANT_MISMATCH", { trozaId });
      }

      const madre = await tx.woodEntryTroza.findFirst({
        where: { id: trozaId, tenantId },
        include: {
          retrozos: { select: { volumenM3: true, largoM: true, descarte: true } },
          entry: { select: { id: true, gtfNumber: true, status: true, deletedAt: true } },
        },
      });
      if (!madre) throw new CtpInvariantError("Esa troza no existe en este tenant.", "TENANT_MISMATCH", { trozaId });
      if (madre.entry.deletedAt) {
        throw new CtpInvariantError("El ingreso de esa troza está anulado: no se puede retrozar.", "ESTADO_NO_EDITABLE", { trozaId });
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
      // Cierre de período (ADR-139): el corte va al Apartado 2 del libro del mes
      // en que se hizo, así que es la fecha del CORTE la que manda — no la de la
      // guía por la que entró la troza.
      const fechaCorte = opts.fecha ?? new Date();
      const cerradoCorte = await ForestCtpCierreDB.closedPeriodOf(tenantId, fechaCorte);
      if (cerradoCorte) {
        throw new CtpInvariantError(
          `El período ${cerradoCorte.label} está cerrado: no se puede registrar un retrozado con fecha de un mes cerrado. Reabrí el período para corregir.`,
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
          d1Cm: madre.d1Cm != null ? Number(madre.d1Cm) : madre.diametroCm != null ? Number(madre.diametroCm) : null,
          d2Cm: madre.d2Cm != null ? Number(madre.d2Cm) : madre.diametroCm != null ? Number(madre.diametroCm) : null,
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
        throw new CtpInvariantError(calculo.errores.join(" "), "R1_SOBRE_RETROZADO", { trozaId, errores: calculo.errores });
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
      try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}

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
    const rango = opts.fromDate || opts.toDate
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
        ...(rango ? { OR: [{ fechaRetrozo: rango }, { fechaRetrozo: null, createdAt: rango }] } : {}),
      },
      orderBy: [{ fechaRetrozo: "asc" }, { orden: "asc" }],
      take: Math.min(Math.max(opts.limite ?? 2000, 1), 5000),
      include: {
        trozaOrigen: {
          select: {
            id: true, codificacion: true, volumenM3: true,
            especieComun: true, especieCientifica: true,
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
            id: true, libroNro: true, gtfNumber: true, providerName: true,
            entryDate: true, fechaRecepcion: true, status: true,
            originCode: true, originSourceNumber: true, volumeM3: true,
          },
        },
        trozaOrigen: { select: { id: true, codificacion: true, codigoPlanta: true, volumenM3: true } },
        retrozos: {
          orderBy: { orden: "asc" },
          select: {
            id: true, codificacion: true, codigoPlanta: true, volumenM3: true,
            largoM: true, d1Cm: true, d2Cm: true, descarte: true,
            consumidaEnId: true, despachadaEnId: true,
          },
        },
        loteAserrio: { select: { id: true, code: true, status: true, speciesCommon: true } },
        consumidaEn: {
          select: {
            id: true, lineNo: true, entryDate: true, status: true, deletedAt: true,
            productType: true, presentacion: true, quantity: true, unit: true,
            rendimientoPct: true, lineaProduccion: true, volumeInputM3: true,
          },
        },
        despachadaEn: {
          select: {
            id: true, lineNo: true, entryDate: true, status: true, deletedAt: true,
            docType: true, gtfNumber: true, quantity: true, unit: true,
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
        retrozos: { orderBy: { orden: "asc" } },
        // Igual que `trozasDelPatio` y `buscarTrozas`: quien lee una troza tiene
        // que poder saber si ya se aserró, y con el ESTADO de la corrida, no con
        // el id pelado. Las tres lecturas de la misma pieza dicen lo mismo.
        consumidaEn: { select: { id: true, status: true, deletedAt: true } },
        // El despacho que se la llevó SIN ASERRAR (ADR-363). Con su estado, por
        // lo mismo que la corrida: un despacho anulado devuelve la troza al
        // patio, y sin mirarlo la pieza quedaría bloqueada para siempre.
        despachadaEn: { select: { id: true, status: true, deletedAt: true } },
        loteAserrio: { select: { id: true, code: true, status: true } },
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

  static async list(
    tenantId: string,
    filters: WoodEntryListFilters = {},
  ) {
    if (!tenantId) throw new Error("tenantId is required");

    const where = await withRecepcionFilter(
      tenantId,
      filters,
      await withLateFilter(tenantId, filters, buildListWhere(tenantId, filters)),
    );

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
  static async listPorGuia(
    tenantId: string,
    filters: WoodEntryListFilters = {},
  ): Promise<{ guias: GuiaIngreso<WoodEntryConTrozas>[]; total: number; lineas: number }> {
    if (!tenantId) throw new Error("tenantId is required");

    const where = await withRecepcionFilter(
      tenantId,
      filters,
      await withLateFilter(tenantId, filters, buildListWhere(tenantId, filters)),
    );

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
        case "volumeM3": return Number(g._sum.volumeM3 ?? 0);
        case "pieces": return g._sum.pieces ?? 0;
        case "providerName": return (g._min.providerName ?? "").toLowerCase();
        case "speciesCommonName": return (g._min.speciesCommonName ?? "").toLowerCase();
        case "createdAt": return g._min.createdAt?.getTime() ?? 0;
        case "fechaRecepcion": return g._max.fechaRecepcion?.getTime() ?? 0;
        default: return g._min.entryDate?.getTime() ?? 0;
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
      return `${a.gtfSeries ?? ""}|${a.gtfNumber}`.localeCompare(`${b.gtfSeries ?? ""}|${b.gtfNumber}`);
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
  ): Promise<Map<string, { trozasCount: number; trozasM3: number | null; trozasDecididas: number }>> {
    const mapa = new Map<string, { trozasCount: number; trozasM3: number | null; trozasDecididas: number }>();
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
  ): Promise<Map<string, { volumeM3: number; speciesCommonName: string; productType: string; providerName: string }>> {
    if (!tenantId) throw new Error("tenantId is required");
    const clean = [...new Set(gtfs.map((g) => g.trim()).filter(Boolean))];
    if (clean.length === 0) return new Map();
    const rows = await prisma.woodEntry.findMany({
      where: { tenantId, deletedAt: null, gtfNumber: { in: clean } },
      orderBy: { entryDate: "asc" },
      select: { gtfNumber: true, volumeM3: true, speciesCommonName: true, productType: true, providerName: true },
    });
    const map = new Map<string, { volumeM3: number; speciesCommonName: string; productType: string; providerName: string }>();
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
    const where = await withLateFilter(tenantId, periodFilters, buildListWhere(tenantId, periodFilters));
    // Las cifras OFICIALES (total, volumen, CITES, especies, fuera de plazo) NO
    // deben contar ingresos RECHAZADOS ni ANULADOS: no forman parte del libro y
    // no pueden aparecer en lo que se declara a SERFOR (QA 2026-07-17). El
    // desglose `byStatus` sí usa `where` completo para poder mostrar cuántos
    // fueron rechazados. `pendiente` sí cuenta: es material registrado real.
    const whereVigente: Prisma.WoodEntryWhereInput = { ...where, status: { notIn: ["rechazado", "anulado"] } };

    // Fuera de plazo = días HÁBILES(operación → registro) > PLAZO (2, RDE
    // D000025-2023), con los mismos filtros del período. Mismo predicado que
    // usa el FILTRO de la tabla (`withLateFilter`): el KPI no puede contar 3 y
    // la tabla listar 2.
    const condFueraDePlazo = lateConditions(tenantId, periodFilters);

    const [agg, byStatusRows, speciesRows, citesAgg, lateRows, providerRows, productRows, sinOrigenCount, sinCostoCount] = await Promise.all([
      prisma.woodEntry.aggregate({
        where: whereVigente,
        _sum: { volumeM3: true, pieces: true },
        _count: { _all: true },
      }),
      // byStatus usa `where` completo (incluye rechazado/anulado): es el desglose.
      prisma.woodEntry.groupBy({ by: ["status"], where, _count: { _all: true } }),
      prisma.woodEntry.groupBy({
        by: ["speciesCommonName"],
        where: whereVigente,
        _count: { _all: true },
        _sum: { volumeM3: true },
      }),
      prisma.woodEntry.aggregate({
        where: { ...whereVigente, speciesCites: true },
        _sum: { volumeM3: true },
        _count: { _all: true },
      }),
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count
        FROM "WoodEntry"
        WHERE ${Prisma.join(condFueraDePlazo, " AND ")}
      `,
      // Facetas del período: alimentan los selectores de filtro con lo que
      // REALMENTE hay (un desplegable con las 9 especies del catálogo cuando
      // el mes tuvo 2 obliga a adivinar cuál trae resultados).
      prisma.woodEntry.groupBy({
        by: ["providerName"],
        where: whereVigente,
        _count: { _all: true },
        _sum: { volumeM3: true },
      }),
      prisma.woodEntry.groupBy({ by: ["productType"], where: whereVigente, _count: { _all: true } }),
      // Ingresos sin código de origen: el gap que deja la pestaña EUDR inerte.
      // Se cuenta sobre los VIGENTES (un rechazado sin código no bloquea nada).
      prisma.woodEntry.count({
        where: { ...whereVigente, OR: [{ originCode: null }, { originCode: "" }] },
      }),
      // Ingresos sin valorizar: lo que deja al P&L sin COGS. Vigentes también —
      // el costo de un rechazado no le importa a nadie.
      prisma.woodEntry.count({ where: { ...whereVigente, costoTotal: null } }),
    ]);

    const byStatus: Record<WoodEntryStatus, number> = {
      pendiente: 0,
      validado: 0,
      rechazado: 0,
      procesado: 0,
      anulado: 0,
    };
    for (const row of byStatusRows) byStatus[row.status] = row._count._all;

    const r4 = (n: number) => Math.round(n * 10000) / 10000;
    // Facetas ordenadas por volumen (lo que más pesa primero) y acotadas: el
    // selector es para elegir, no para leer el padrón entero.
    const faceta = <T extends { _count: { _all: number }; _sum?: { volumeM3: Prisma.Decimal | null } }>(
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

    return {
      totalCount: agg._count._all,
      totalVolumeM3: r4(agg._sum.volumeM3?.toNumber() ?? 0),
      totalPieces: agg._sum.pieces ?? 0,
      speciesCount: speciesRows.length,
      citesCount: citesAgg._count._all,
      citesVolumeM3: r4(citesAgg._sum.volumeM3?.toNumber() ?? 0),
      lateCount: Number(lateRows[0]?.count ?? 0),
      sinOrigenCount,
      sinCostoCount,
      byStatus,
      species: faceta(speciesRows, (r) => r.speciesCommonName),
      providers: faceta(providerRows, (r) => r.providerName),
      products: faceta(productRows, (r) => r.productType),
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
  private static async assertPeriodoAbierto(tenantId: string, id: string, accion: string): Promise<void> {
    const cur = await prisma.woodEntry.findFirst({ where: { id, tenantId }, select: { entryDate: true } });
    const cerrado = cur ? await ForestCtpCierreDB.closedPeriodOf(tenantId, cur.entryDate) : null;
    if (cerrado) {
      throw new CtpInvariantError(
        `El período ${cerrado.label} está cerrado: no se puede ${accion} un ingreso de un mes cerrado. Reabrí el período para corregir.`,
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
  static async update(
    tenantId: string,
    id: string,
    input: WoodEntryUpdateInput,
    user: string,
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id) throw new Error("id is required");

    const actual = await prisma.woodEntry.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!actual) throw new Error("Ingreso no encontrado");
    if (actual.status !== "pendiente") {
      throw new CtpInvariantError(
        `Sólo se corrige un ingreso pendiente. Este está ${actual.status}: anulalo con motivo y registralo de nuevo.`,
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
      ...(input.docType !== undefined ? { docType: input.docType?.trim() || null } : {}),
      ...(input.providerName !== undefined ? { providerName: input.providerName.trim() } : {}),
      ...(input.providerDocument !== undefined ? { providerDocument: input.providerDocument } : {}),
      ...(input.providerDocumentType !== undefined ? { providerDocumentType: input.providerDocumentType } : {}),
      ...(input.originType !== undefined ? { originType: input.originType } : {}),
      ...(input.originCode !== undefined ? { originCode: input.originCode } : {}),
      ...(input.originSourceNumber !== undefined ? { originSourceNumber: input.originSourceNumber?.trim() || null } : {}),
      ...(input.ctpProductCode !== undefined ? { ctpProductCode: input.ctpProductCode?.trim() || null } : {}),
      ...(input.originRegion !== undefined ? { originRegion: input.originRegion } : {}),
      ...(input.originDistrict !== undefined ? { originDistrict: input.originDistrict } : {}),
      ...(input.speciesCommonName !== undefined ? { speciesCommonName: input.speciesCommonName.trim() } : {}),
      ...(input.speciesScientificName !== undefined ? { speciesScientificName: input.speciesScientificName } : {}),
      ...(input.speciesCites !== undefined ? { speciesCites: input.speciesCites } : {}),
      ...(input.productType !== undefined ? { productType: input.productType } : {}),
      ...(input.unit !== undefined ? { unit: input.unit?.trim() || null } : {}),
      ...(volumeDecimal ? { volumeM3: volumeDecimal } : {}),
      ...(input.pieces !== undefined ? { pieces: input.pieces } : {}),
      ...(input.avgLengthM !== undefined ? { avgLengthM: input.avgLengthM != null ? new Prisma.Decimal(input.avgLengthM) : null } : {}),
      ...(input.avgDiameterCm !== undefined ? { avgDiameterCm: input.avgDiameterCm != null ? new Prisma.Decimal(input.avgDiameterCm) : null } : {}),
      ...(input.humidityPct !== undefined ? { humidityPct: input.humidityPct != null ? new Prisma.Decimal(input.humidityPct) : null } : {}),
      ...(input.defectsNotes !== undefined ? { defectsNotes: input.defectsNotes } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    };

    const entry = await prisma.woodEntry.update({ where: { id }, data });

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
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
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
    if (actual.status !== "pendiente" && actual.status !== "validado") {
      throw new CtpInvariantError(
        `Un ingreso ${actual.status} no lleva costo: no cuenta en el balance.`,
        "ESTADO_NO_EDITABLE",
        { status: actual.status },
      );
    }
    await WoodEntriesDB.assertPeriodoAbierto(tenantId, id, "valorizar");

    const entry = await prisma.woodEntry.update({
      where: { id },
      data: {
        costoTotal: input.costoTotal != null ? new Prisma.Decimal(input.costoTotal) : null,
        ...(input.moneda !== undefined ? { moneda: input.moneda ?? "PEN" } : {}),
      },
    });

    const antes = actual.costoTotal != null ? `S/ ${actual.costoTotal.toString()}` : "sin costo";
    const despues = entry.costoTotal != null ? `S/ ${entry.costoTotal.toString()}` : "sin costo";
    auditCtp({
      tenantId,
      action: "ctp_ingreso_costo",
      entity: "WoodEntry",
      entityId: entry.id,
      detail: `Valorizó el ingreso ${actual.gtfNumber} · ${antes} → ${despues}`,
      user,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
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
  ): Promise<{ agregadas: number; repetidas: string[]; m3Agregados: number; bloqueado?: "ya-tiene-lista" }> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id) throw new Error("id is required");
    if (trozas.length === 0) return { agregadas: 0, repetidas: [], m3Agregados: 0 };

    const actual = await prisma.woodEntry.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!actual) throw new Error("Ingreso no encontrado");
    if (actual.status !== "pendiente") {
      const yaTiene =
        opts.desdeImportacion && actual.status === "validado"
          ? (await prisma.woodEntryTroza.count({ where: { tenantId, woodEntryId: id } })) > 0
          : null;
      /* Validado y CON lista: no es un error, no hay nada que completar. Re-subir
         el mismo archivo tiene que decir «ya está», no gritar un invariante.
         Cuál de las dos listas vale no lo decide un importador. */
      if (yaTiene === true) return { agregadas: 0, repetidas: [], m3Agregados: 0, bloqueado: "ya-tiene-lista" };
      if (yaTiene !== false) {
        throw new CtpInvariantError(
          `Sólo se le agregan piezas a un ingreso pendiente. Este está ${actual.status}.`,
          "ESTADO_NO_EDITABLE",
          { status: actual.status },
        );
      }
    }
    await WoodEntriesDB.assertPeriodoAbierto(tenantId, id, "agregarle piezas");

    const resultado = await prisma.$transaction(async (tx) => {
      // Dentro de la tx: entre el chequeo y el insert, otra tablet puede haber
      // cargado las mismas piezas.
      const existentes = await tx.woodEntryTroza.findMany({
        where: { tenantId, woodEntryId: id },
        select: { codificacion: true, orden: true },
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

      if (nuevas.length === 0) return { agregadas: 0, repetidas, m3Agregados: 0 };

      if (existentes.length + nuevas.length > TOPE_TROZAS_POR_INGRESO) {
        throw new CtpInvariantError(
          `Un ingreso admite hasta ${TOPE_TROZAS_POR_INGRESO} piezas y esto lo llevaría a ${existentes.length + nuevas.length}.`,
          "TOPE_TROZAS",
          { actuales: existentes.length, nuevas: nuevas.length },
        );
      }

      // La numeración sigue donde quedó: `orden` es la columna del papel y
      // reiniciarla en 1 dejaría dos piezas "número 1" en la misma lista.
      const desde = existentes.reduce((max, t) => Math.max(max, t.orden ?? 0), 0);

      await tx.woodEntryTroza.createMany({
        data: nuevas.map((t, i) => ({
          tenantId,
          woodEntryId: id,
          orden: desde + i + 1,
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
        })),
      });

      return {
        agregadas: nuevas.length,
        repetidas,
        // Los m³ que de verdad entraron, no los del archivo: si la mitad eran
        // repetidas, auditar el total del Excel diría que entró el doble.
        m3Agregados: nuevas.reduce((a, t) => a + (t.volumenM3 ?? 0), 0),
      };
    });

    if (resultado.agregadas > 0) {
      const m3Agregados = resultado.m3Agregados;
      auditCtp({
        tenantId,
        action: "ctp_ingreso_trozas_add",
        entity: "WoodEntry",
        entityId: id,
        detail:
          `Agregó ${resultado.agregadas} pieza${resultado.agregadas === 1 ? "" : "s"} a la lista del ingreso ${actual.gtfNumber}` +
          (m3Agregados > 0 ? ` · ${m3(m3Agregados)}` : "") +
          (resultado.repetidas.length > 0 ? ` · ${resultado.repetidas.length} ya estaban` : ""),
        user,
      });
      try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
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
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
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
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const actual = await prisma.woodEntry.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true, status: true, fechaRecepcion: true, gtfNumber: true },
    });
    if (!actual) return null;
    if (actual.status === "anulado" || actual.status === "rechazado") {
      throw new Error(`Una guía ${actual.status} no se recepciona.`);
    }
    await WoodEntriesDB.assertPeriodoAbierto(tenantId, id, "recepcionar");

    /* La fecha viaja como texto hasta el `::date` de Postgres: convertirla a
       `Date` acá la interpretaría en la zona del servidor y correría un día en
       Lima (el mismo off-by-one de `entryDate`). */
    const dia = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : new Date().toISOString().slice(0, 10);

    const { piezas } = await prisma.$transaction(async (tx) => {
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
        (piezas > 0 ? ` · ${piezas} pieza${piezas === 1 ? "" : "s"} fechada${piezas === 1 ? "" : "s"}` : ""),
      user,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
    return { entry, piezas, fecha: dia };
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
  ): Promise<{
    recepcionados: number;
    piezas: number;
    fecha: string;
    fallo: { id: string; motivo: string } | null;
  }> {
    if (!tenantId) throw new Error("tenantId is required");
    const dia = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : new Date().toISOString().slice(0, 10);
    let recepcionados = 0;
    let piezas = 0;

    /* En serie y ordenado: los asientos de una guía tocan las mismas filas de
       `WoodEntryTroza` y en paralelo se pisan los locks. Son dos o cinco, no
       quinientos: la latencia no es el problema, la consistencia sí. */
    for (const id of [...ids].sort()) {
      try {
        const r = await WoodEntriesDB.recepcionar(tenantId, id, dia, user);
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

  static async reject(
    tenantId: string,
    id: string,
    validatorId: string,
    reason: string,
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!reason?.trim()) throw new Error("rejection reason is required");
    const entry = await prisma.woodEntry.update({
      where: { id, tenantId } satisfies Prisma.WoodEntryWhereUniqueInput,
      data: {
        status: "rechazado",
        validatedBy: validatorId,
        validatedAt: new Date(),
        rejectionReason: reason.trim(),
      },
    });
    auditCtp({
      tenantId,
      action: "ctp_ingreso_reject",
      entity: "WoodEntry",
      entityId: id,
      detail: `Rechazó el ingreso ${entry.gtfNumber} · ${entry.speciesCommonName} · motivo: ${reason.trim()}`,
      user: validatorId,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
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
  static async annul(tenantId: string, id: string, user: string, reason: string) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!reason?.trim()) throw new Error("annul reason is required");
    await WoodEntriesDB.assertPeriodoAbierto(tenantId, id, "anular");
    const consumido = await prisma.forestCtpConsumo.count({
      where: { tenantId, woodEntryId: id, ctpEntry: { deletedAt: null, status: "registrado" } },
    });
    if (consumido > 0) {
      throw new Error("Este ingreso ya se consumió en una corrida de producción. Corregí o anulá esas corridas antes de anular el ingreso.");
    }
    const entry = await prisma.woodEntry.update({
      where: { id, tenantId } satisfies Prisma.WoodEntryWhereUniqueInput,
      data: { status: "anulado", rejectionReason: reason.trim() },
    });
    auditCtp({
      tenantId,
      action: "ctp_ingreso_annul",
      entity: "WoodEntry",
      entityId: id,
      detail: `Anuló el ingreso ${entry.gtfNumber} · ${entry.speciesCommonName} · ${m3(Number(entry.volumeM3))} · motivo: ${reason.trim()}`,
      user,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
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
        throw new CtpInvariantError(
          "Esa pieza no pertenece a este ingreso.",
          "TROZA_AJENA",
          { trozaId: input.trozaId },
        );
      }
      if (troza.consumidaEnId) {
        throw new CtpInvariantError(
          `La pieza ${troza.codificacion ?? "—"} ya entró a la sierra: no se le puede cambiar el volumen. Corregí o anulá esa corrida primero.`,
          "TROZA_CONSUMIDA",
          { trozaId: troza.id },
        );
      }
      if (troza.trozaOrigenId || (await prisma.woodEntryTroza.count({ where: { tenantId, trozaOrigenId: troza.id } })) > 0) {
        throw new CtpInvariantError(
          `La pieza ${troza.codificacion ?? "—"} está retrozada: cuadrá el retrozado antes de tocar su volumen.`,
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
      try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
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
    const suma = Number(
      piezas.reduce((a, p) => a + Number(p.volumenM3 ?? 0), 0).toFixed(4),
    );
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
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return { entry, troza: null };
  }

  /**
   * Soft delete. No borra físicamente; el registro sigue en la DB y el evento
   * queda en el ActivityLog (un ingreso que "desaparece" de un libro fiscalizado
   * sin dejar autor es exactamente lo que no puede pasar).
   */
  static async softDelete(tenantId: string, id: string, user = "unknown") {
    if (!tenantId) throw new Error("tenantId is required");
    await WoodEntriesDB.assertPeriodoAbierto(tenantId, id, "eliminar");
    const entry = await prisma.woodEntry.update({
      where: { id, tenantId } satisfies Prisma.WoodEntryWhereUniqueInput,
      data: { deletedAt: new Date() },
    });
    auditCtp({
      tenantId,
      action: "ctp_ingreso_delete",
      entity: "WoodEntry",
      entityId: id,
      detail: `Eliminó (soft) el ingreso ${entry.gtfNumber} · ${entry.speciesCommonName} · ${m3(Number(entry.volumeM3))}`,
      user,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
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
