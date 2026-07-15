/**
 * ForestGtfDB — Guía de Transporte Forestal (GTF), ADR-126 Fase 4. Interna, no oficial.
 * Patrón Buleje: tenantId 1er param · cache invalidate.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";

const CACHE_PREFIX = "forest-gtf";

export interface GtfItem {
  code?: string | null;
  species?: string | null;
  scientific?: string | null;
  cites?: boolean;
  diamMayorM?: number | null;
  diamMenorM?: number | null;
  lengthM?: number | null;
  volumeM3?: number | null;
  productType?: string | null;
  pieces?: number | null;
  quantity?: number | null;
  unit?: string | null;
}

export interface GtfInput {
  planId?: string | null;
  gtfNumber: string;
  gtfDate?: Date | null;
  tipo?: string;
  titularName?: string | null;
  tituloHabilitante?: string | null;
  parcelaCorta?: string | null;
  transportista?: string | null;
  transportistaDoc?: string | null;
  conductor?: string | null;
  conductorLicencia?: string | null;
  placaVehiculo?: string | null;
  origen?: string | null;
  destino?: string | null;
  items: GtfItem[];
  observations?: string | null;
  createdBy: string;
}

export class ForestGtfDB {
  static async create(tenantId: string, input: GtfInput) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!input.gtfNumber?.trim()) throw new Error("gtfNumber is required");
    const items = input.items ?? [];
    const volumenTotal = items.reduce(
      (a, it) => a + Number(it.volumeM3 ?? it.quantity ?? 0),
      0,
    );
    const piezas = items.reduce((a, it) => a + Number(it.pieces ?? 0), 0);

    const gtf = await prisma.forestGtf.create({
      data: {
        tenantId,
        planId: input.planId ?? null,
        gtfNumber: input.gtfNumber.trim(),
        gtfDate: input.gtfDate ?? new Date(),
        tipo: input.tipo ?? "trozas",
        titularName: input.titularName?.trim() || null,
        tituloHabilitante: input.tituloHabilitante?.trim() || null,
        parcelaCorta: input.parcelaCorta?.trim() || null,
        transportista: input.transportista?.trim() || null,
        transportistaDoc: input.transportistaDoc?.trim() || null,
        conductor: input.conductor?.trim() || null,
        conductorLicencia: input.conductorLicencia?.trim() || null,
        placaVehiculo: input.placaVehiculo?.trim() || null,
        origen: input.origen?.trim() || null,
        destino: input.destino?.trim() || null,
        items: items as unknown as Prisma.InputJsonValue,
        volumenTotalM3: volumenTotal > 0 ? new Prisma.Decimal(Math.round(volumenTotal * 10000) / 10000) : null,
        piezasTotal: piezas > 0 ? piezas : null,
        observations: input.observations?.trim() || null,
        createdBy: input.createdBy,
      },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return gtf;
  }

  static async list(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestGtf.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  static async getById(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestGtf.findFirst({ where: { tenantId, id, deletedAt: null } });
  }

  /** Busca una guía por su número (para importar sus datos al ingreso CTP). */
  static async findByNumber(tenantId: string, gtfNumber: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const n = gtfNumber.trim();
    if (!n) return null;
    return prisma.forestGtf.findFirst({
      where: { tenantId, gtfNumber: n, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  static async annul(tenantId: string, id: string, reason: string) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!reason?.trim()) throw new Error("reason is required");
    const gtf = await prisma.forestGtf.update({
      where: { id, tenantId } satisfies Prisma.ForestGtfWhereUniqueInput,
      data: { status: "anulada", annulledReason: reason.trim() },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return gtf;
  }
}
