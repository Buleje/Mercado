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
import type {
  WoodEntryStatus,
  WoodOriginType,
  WoodProductType,
  DocumentType,
} from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { PLAZO_REGISTRO_DIAS, estaFueraDePlazo } from "@/lib/forestal/ctp-compliance";
import { auditCtp, m3 } from "@/lib/forestal/ctp-audit";
import { ForestCtpCierreDB } from "./forest-ctp-cierre.db";
import { CtpInvariantError } from "./forest-ctp-consumo.db";

export interface WoodEntryCreateInput {
  // Fecha + GTF
  entryDate?: Date; // default now
  gtfNumber: string;
  gtfDate?: Date | null;
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
  originCode?: string | null;
  originRegion?: string | null;
  originDistrict?: string | null;

  // Especie
  speciesCommonName: string;
  speciesScientificName?: string | null;
  speciesCites?: boolean;

  // Producto
  productType?: WoodProductType;
  volumeM3: number | string; // Decimal-friendly
  pieces?: number;
  avgLengthM?: number | string | null;
  avgDiameterCm?: number | string | null;
  humidityPct?: number | string | null;
  defectsNotes?: string | null;

  // Trazabilidad
  notes?: string | null;
  photos?: string[] | null;
  createdBy: string;
}

/** Columnas por las que se puede ordenar el listado (whitelist: el `sort` llega
 *  del cliente y jamás se interpola — se mapea contra esta tabla o se ignora). */
export const WOOD_ENTRY_SORT_FIELDS = [
  "entryDate",
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
  sortBy?: WoodEntrySortField;
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

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

/** Campos corregibles de un ingreso pendiente. Fuera quedan `status`,
 *  `validatedBy/At` y los costos: eso lo mueven acciones propias, no un form. */
export type WoodEntryUpdateInput = Partial<
  Pick<
    WoodEntryCreateInput,
    | "entryDate"
    | "gtfNumber"
    | "gtfDate"
    | "gtfSeries"
    | "providerName"
    | "providerDocument"
    | "providerDocumentType"
    | "originType"
    | "originCode"
    | "originRegion"
    | "originDistrict"
    | "speciesCommonName"
    | "speciesScientificName"
    | "speciesCites"
    | "productType"
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
  byStatus: Record<WoodEntryStatus, number>;
  /** Especies / proveedores / productos presentes en el período (top 30 por volumen). */
  species: WoodEntryFacet[];
  providers: WoodEntryFacet[];
  products: WoodEntryFacet[];
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

    const entry = await prisma.woodEntry.create({
      data: {
        tenantId,
        entryDate: input.entryDate ?? new Date(),
        supplierId: input.supplierId ?? null,
        costoTotal: input.costoTotal != null ? new Prisma.Decimal(input.costoTotal) : null,
        moneda: input.moneda ?? "PEN",
        gtfNumber: input.gtfNumber.trim(),
        gtfDate: input.gtfDate ?? null,
        gtfSeries: input.gtfSeries ?? null,
        providerName: input.providerName.trim(),
        providerDocument: input.providerDocument ?? null,
        providerDocumentType: input.providerDocumentType ?? null,
        originType: input.originType ?? "otro",
        originCode: input.originCode ?? null,
        originRegion: input.originRegion ?? null,
        originDistrict: input.originDistrict ?? null,
        speciesCommonName: input.speciesCommonName.trim(),
        speciesScientificName: input.speciesScientificName ?? null,
        speciesCites: input.speciesCites ?? false,
        productType: input.productType ?? "rolliza",
        volumeM3: volumeDecimal,
        pieces: input.pieces ?? 0,
        avgLengthM: input.avgLengthM != null ? new Prisma.Decimal(input.avgLengthM) : null,
        avgDiameterCm: input.avgDiameterCm != null ? new Prisma.Decimal(input.avgDiameterCm) : null,
        humidityPct: input.humidityPct != null ? new Prisma.Decimal(input.humidityPct) : null,
        defectsNotes: input.defectsNotes ?? null,
        notes: input.notes ?? null,
        photos: input.photos ? (input.photos as Prisma.InputJsonValue) : Prisma.DbNull,
        status: "pendiente",
        createdBy: input.createdBy,
      },
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
   * Lista entries con filtros. Excluye soft-deleted por default.
   */
  static async list(
    tenantId: string,
    filters: WoodEntryListFilters = {},
  ) {
    if (!tenantId) throw new Error("tenantId is required");

    const where = await withLateFilter(tenantId, filters, buildListWhere(tenantId, filters));

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

    return { entries, total };
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

    const [agg, byStatusRows, speciesRows, citesAgg, lateRows, providerRows, productRows, sinOrigenCount] = await Promise.all([
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
      ...(input.gtfSeries !== undefined ? { gtfSeries: input.gtfSeries } : {}),
      ...(input.providerName !== undefined ? { providerName: input.providerName.trim() } : {}),
      ...(input.providerDocument !== undefined ? { providerDocument: input.providerDocument } : {}),
      ...(input.providerDocumentType !== undefined ? { providerDocumentType: input.providerDocumentType } : {}),
      ...(input.originType !== undefined ? { originType: input.originType } : {}),
      ...(input.originCode !== undefined ? { originCode: input.originCode } : {}),
      ...(input.originRegion !== undefined ? { originRegion: input.originRegion } : {}),
      ...(input.originDistrict !== undefined ? { originDistrict: input.originDistrict } : {}),
      ...(input.speciesCommonName !== undefined ? { speciesCommonName: input.speciesCommonName.trim() } : {}),
      ...(input.speciesScientificName !== undefined ? { speciesScientificName: input.speciesScientificName } : {}),
      ...(input.speciesCites !== undefined ? { speciesCites: input.speciesCites } : {}),
      ...(input.productType !== undefined ? { productType: input.productType } : {}),
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
