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
import { invalidate, invalidateByPrefix } from "@/lib/cache";

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

export interface WoodEntryListFilters {
  status?: WoodEntryStatus;
  speciesCommonName?: string;
  gtfNumber?: string;
  fromDate?: Date;
  toDate?: Date;
  search?: string; // matches provider/gtf/species
  limit?: number;
  offset?: number;
}

const CACHE_PREFIX = "wood-entries";

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

    const entry = await prisma.woodEntry.create({
      data: {
        tenantId,
        entryDate: input.entryDate ?? new Date(),
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

    const where: Prisma.WoodEntryWhereInput = {
      tenantId,
      deletedAt: null,
    };

    if (filters.status) where.status = filters.status;
    if (filters.speciesCommonName) {
      where.speciesCommonName = { contains: filters.speciesCommonName, mode: "insensitive" };
    }
    if (filters.gtfNumber) where.gtfNumber = filters.gtfNumber;
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

    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 500);
    const offset = Math.max(filters.offset ?? 0, 0);

    const [entries, total] = await Promise.all([
      prisma.woodEntry.findMany({
        where,
        orderBy: { entryDate: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.woodEntry.count({ where }),
    ]);

    return { entries, total };
  }

  static async getById(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id) throw new Error("id is required");
    return prisma.woodEntry.findFirst({
      where: { tenantId, id, deletedAt: null },
    });
  }

  /**
   * Validar un ingreso (status pendiente → validado).
   * Solo admin con permisos. validatorId queda en validatedBy.
   */
  static async validate(tenantId: string, id: string, validatorId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const entry = await prisma.woodEntry.update({
      where: { id, tenantId } satisfies Prisma.WoodEntryWhereUniqueInput,
      data: {
        status: "validado",
        validatedBy: validatorId,
        validatedAt: new Date(),
        rejectionReason: null,
      },
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
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return entry;
  }

  /**
   * Soft delete. No borra fisicamente; preserva audit trail.
   */
  static async softDelete(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const entry = await prisma.woodEntry.update({
      where: { id, tenantId } satisfies Prisma.WoodEntryWhereUniqueInput,
      data: { deletedAt: new Date() },
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
