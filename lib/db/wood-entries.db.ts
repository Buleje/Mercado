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
import { calcularRetrozado, type RetrozoNuevo } from "@/lib/forestal/ctp-retrozado";
import type { CambioRecepcion } from "@/lib/forestal/recepcion-trozas";
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
    trozas: Array<{
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
    }>;
  }>;

  createdBy: string;
}

export interface WoodEntryCreateInput {
  /**
   * Lista de trozas de la guía, cuando se carga a mano o desde un Excel
   * (ADR-320). Se crean en la MISMA transacción que el ingreso: media guía
   * registrada deja un saldo que no corresponde a ningún documento.
   */
  trozas?: Array<{
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
  }>;
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
    | "docType"
    | "gtfNumber"
    | "gtfDate"
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
          status: "pendiente",
          createdBy: input.createdBy,
        },
        });

      // La lista de trozas viaja con su guía y en la misma tx (ADR-312/320): si
      // falla, no queda un ingreso al que después haya que pegarle las piezas.
      if (input.trozas?.length) {
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
        select: { id: true, codificacion: true, noRecepcionada: true },
      });
      if (propias.length !== ids.length) {
        throw new CtpInvariantError(
          "Alguna de esas trozas no pertenece a este ingreso.",
          "TENANT_MISMATCH",
          { woodEntryId, pedidas: ids.length, encontradas: propias.length },
        );
      }
      const previaPorId = new Map(propias.map((t) => [t.id, t]));

      const limpiar = (v: string | null | undefined) => (v ?? "").trim() || null;
      for (const c of cambios) {
        await tx.woodEntryTroza.update({
          where: { id: c.id },
          data: {
            ...(c.codigoPlanta !== undefined ? { codigoPlanta: limpiar(c.codigoPlanta) } : {}),
            ...(c.parcela !== undefined ? { parcela: limpiar(c.parcela) } : {}),
            ...(c.noRecepcionada !== undefined ? { noRecepcionada: Boolean(c.noRecepcionada) } : {}),
            ...(c.recepcionObs !== undefined ? { recepcionObs: limpiar(c.recepcionObs) } : {}),
          },
        });
      }

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
  static async trozasDelPatio(tenantId: string, opts: { limite?: number } = {}) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.woodEntryTroza.findMany({
      where: {
        tenantId,
        entry: { deletedAt: null, status: { notIn: ["anulado", "rechazado"] } },
      },
      orderBy: [{ createdAt: "desc" }, { orden: "asc" }],
      take: Math.min(Math.max(opts.limite ?? 1000, 1), 5000),
      include: {
        entry: { select: { id: true, gtfNumber: true, providerName: true, entryDate: true } },
        // La corrida que se la comió: hace falta su ESTADO, no sólo el id. Una
        // corrida anulada devuelve la madera al patio, y sin mirarlo la pieza
        // quedaría bloqueada para siempre con "ya entró a otra corrida".
        consumidaEn: { select: { id: true, status: true, deletedAt: true } },
        _count: { select: { retrozos: true } },
      },
    });
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

      const ids = [...new Set(trozaIds)];
      if (ids.length > 0) {
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
            _count: { select: { retrozos: true } },
          },
        });
        if (candidatas.length !== ids.length) {
          throw new CtpInvariantError("Alguna de esas trozas no existe en este tenant.", "TENANT_MISMATCH", {
            pedidas: ids.length, encontradas: candidatas.length,
          });
        }
        // Las MISMAS reglas que `motivoBloqueo()` del cliente. Si divergieran, lo
        // que la pantalla deja elegir la base lo rechazaría (o peor: al revés).
        /** Tomada por OTRA corrida que sigue viva. Si esa corrida se anuló o se
         *  borró, la pieza está libre aunque la columna todavía la apunte. */
        const tomadaPorOtra = (t: (typeof candidatas)[number]) =>
          Boolean(
            t.consumidaEnId &&
              t.consumidaEnId !== ctpEntryId &&
              t.consumidaEn &&
              t.consumidaEn.status === "registrado" &&
              !t.consumidaEn.deletedAt,
          );
        const malas = candidatas.filter(
          (t) =>
            tomadaPorOtra(t) ||
            t.noRecepcionada ||
            t.descarte ||
            t._count.retrozos > 0 ||
            !(Number(t.volumenM3 ?? 0) > 0),
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
  static async trozasDe(tenantId: string, woodEntryId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    // Sólo las trozas de la guía: los pedazos cuelgan de ellas (`retrozos`) para
    // que la vista los muestre debajo de su madre y no como filas sueltas que
    // parecerían madera de más.
    return prisma.woodEntryTroza.findMany({
      where: { tenantId, woodEntryId, trozaOrigenId: null },
      orderBy: { orden: "asc" },
      include: { retrozos: { orderBy: { orden: "asc" } } },
    });
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
