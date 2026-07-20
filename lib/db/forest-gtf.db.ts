/**
 * ForestGtfDB — Guía de Transporte Forestal (GTF), ADR-126 Fase 4. Interna, no oficial.
 * Patrón Buleje: tenantId 1er param · cache invalidate.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { auditLoth } from "@/lib/forestal/loth-audit";

const CACHE_PREFIX = "forest-gtf";

/**
 * Se intentó registrar una GTF con un número que ya existe. Es dato del operador
 * (una GTF no se anota dos veces), no un fallo del server → el route lo mapea a 409.
 */
export class GtfDuplicateError extends Error {
  constructor(readonly gtfNumber: string) {
    super(`Ya existe una GTF registrada con el número ${gtfNumber}. Una guía no se anota dos veces.`);
    this.name = "GtfDuplicateError";
  }
}

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
  /**
   * Emite (registra) una GTF. Guard de UNICIDAD: no se puede anotar dos veces la
   * misma GTF (integridad de la cadena de custodia — un fiscalizador que ve el
   * mismo N° dos veces no puede cruzar el documento). Se serializa con un
   * `pg_advisory_xact_lock` sobre (tenant, número): a diferencia de un `FOR
   * UPDATE`, el advisory lock protege también contra dos INSERT concurrentes del
   * MISMO número nuevo (no hay fila que lockear todavía) sin necesidad de una
   * constraint única en la tabla (aislamiento app-level).
   */
  static async create(tenantId: string, input: GtfInput) {
    if (!tenantId) throw new Error("tenantId is required");
    const num = input.gtfNumber?.trim();
    if (!num) throw new Error("gtfNumber is required");
    const items = input.items ?? [];
    const volumenTotal = items.reduce(
      (a, it) => a + Number(it.volumeM3 ?? it.quantity ?? 0),
      0,
    );
    const piezas = items.reduce((a, it) => a + Number(it.pieces ?? 0), 0);

    const gtf = await prisma.$transaction(async (tx) => {
      // Serializa por (tenant, número) — cubre el INSERT de un número que aún no
      // existe. `$executeRaw` (no `$queryRaw`): pg_advisory_xact_lock devuelve
      // `void` y $queryRaw no sabe deserializar esa columna.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`gtf:${tenantId}:${num}`}))`;
      const dup = await tx.forestGtf.findFirst({
        where: { tenantId, gtfNumber: num, deletedAt: null },
        select: { id: true },
      });
      if (dup) throw new GtfDuplicateError(num);

      return tx.forestGtf.create({
        data: {
          tenantId,
          planId: input.planId ?? null,
          gtfNumber: num,
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
    }, { timeout: 15_000 });

    auditLoth({
      tenantId,
      action: "loth_gtf_create",
      entity: "ForestGtf",
      entityId: gtf.id,
      detail: `Emitió la GTF ${gtf.gtfNumber} (${gtf.tipo}${gtf.destino ? ` → ${gtf.destino}` : ""})`,
      user: input.createdBy,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
    return gtf;
  }

  /**
   * Sugiere el siguiente número correlativo a partir del MÁXIMO ya registrado que
   * calce con `<serie>-<NNN...>` (parseo del máximo, sin columna/migración nueva —
   * mismo criterio que `emitirGtf` del CTP). El operador puede aceptarlo o pisarlo
   * con el número oficial del SNIFFS. Si no hay serie o ninguna GTF previa con ese
   * patrón, devuelve `<serie>-000001`.
   */
  static async sugerirNumero(tenantId: string, serie: string): Promise<string | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const s = serie.trim();
    if (!s) return null;
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^${escaped}-(\\d+)$`);
    const rows = await prisma.forestGtf.findMany({
      where: { tenantId, deletedAt: null, gtfNumber: { startsWith: `${s}-` } },
      select: { gtfNumber: true },
    });
    let maxN = 0;
    let width = 6;
    for (const r of rows) {
      const m = r.gtfNumber.match(re);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxN) maxN = n;
        width = Math.max(width, m[1].length);
      }
    }
    return `${s}-${String(maxN + 1).padStart(width, "0")}`;
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

  /**
   * Guías de trozas EMITIDAS en el Libro de Títulos Habilitantes que todavía no
   * tienen ingreso VIGENTE en el CTP — la bandeja "monte → planta" (rec #9 del
   * QA 2026-07-17: cerrar la trazabilidad sin doble digitación).
   *
   * Un ingreso rechazado o anulado NO cuenta como ingresada: esa madera sigue
   * fuera del libro, así que la guía vuelve a la bandeja hasta registrarse bien.
   */
  static async sinIngresarAlCtp(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const [gtfs, entries] = await Promise.all([
      prisma.forestGtf.findMany({
        where: { tenantId, deletedAt: null, status: "emitida", tipo: "trozas" },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true, gtfNumber: true, gtfDate: true, titularName: true,
          tituloHabilitante: true, volumenTotalM3: true, piezasTotal: true, origen: true,
        },
      }),
      prisma.woodEntry.findMany({
        where: { tenantId, deletedAt: null, status: { notIn: ["rechazado", "anulado"] } },
        select: { gtfNumber: true },
      }),
    ]);
    const ingresadas = new Set(entries.map((e) => e.gtfNumber.trim()));
    return gtfs.filter((g) => !ingresadas.has(g.gtfNumber.trim()));
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

  static async annul(tenantId: string, id: string, reason: string, user = "unknown") {
    if (!tenantId) throw new Error("tenantId is required");
    if (!reason?.trim()) throw new Error("reason is required");
    const gtf = await prisma.forestGtf.update({
      where: { id, tenantId } satisfies Prisma.ForestGtfWhereUniqueInput,
      data: { status: "anulada", annulledReason: reason.trim() },
    });
    auditLoth({
      tenantId,
      action: "loth_gtf_annul",
      entity: "ForestGtf",
      entityId: id,
      detail: `Anuló la GTF ${gtf.gtfNumber}. Motivo: ${reason.trim()}`,
      user,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
    return gtf;
  }
}
