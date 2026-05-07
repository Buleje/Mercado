import "server-only";
import { prisma } from "@/lib/prisma";
import { GuiaStatus } from "@/lib/generated/prisma/enums";
import { Prisma } from "@/lib/generated/prisma/client";
import type {
  GuiaRemision as PGuiaRemision,
  GuiaRemisionItem as PGuiaRemisionItem,
} from "@/lib/generated/prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbGuiaRemisionItem = {
  id: string;
  productoId?: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  pesoUnitario?: number;
};

export type DbGuiaRemision = {
  id: string;
  tenantId: string;
  numero: string;
  orderId?: string;
  motivoTraslado: string;
  fechaTraslado: string;
  destinatarioNombre: string;
  destinatarioRuc?: string;
  destinatarioDireccion: string;
  transportistaRuc?: string;
  transportistaNombre?: string;
  vehiculoPlaca?: string;
  conductorNombre?: string;
  conductorDni?: string;
  bultos?: number;
  documentoRef?: string;
  puntoPartida: string;
  puntoLlegada: string;
  status: string;
  pesoTotal?: number;
  pesoBruto?: number;
  notas?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  items: DbGuiaRemisionItem[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

function dec(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapItem(i: PGuiaRemisionItem): DbGuiaRemisionItem {
  return {
    id: i.id,
    ...(i.productoId != null && { productoId: i.productoId }),
    descripcion: i.descripcion,
    cantidad: dec(i.cantidad),
    unidad: i.unidad,
    ...(i.pesoUnitario != null && { pesoUnitario: dec(i.pesoUnitario) }),
  };
}

function mapGuia(
  g: PGuiaRemision & { items: PGuiaRemisionItem[] }
): DbGuiaRemision {
  return {
    id: g.id,
    tenantId: g.tenantId,
    numero: g.numero,
    ...(g.orderId != null && { orderId: g.orderId }),
    motivoTraslado: g.motivoTraslado,
    fechaTraslado: toISO(g.fechaTraslado),
    destinatarioNombre: g.destinatarioNombre,
    ...(g.destinatarioRuc != null && { destinatarioRuc: g.destinatarioRuc }),
    destinatarioDireccion: g.destinatarioDireccion,
    ...(g.transportistaRuc != null && { transportistaRuc: g.transportistaRuc }),
    ...(g.transportistaNombre != null && { transportistaNombre: g.transportistaNombre }),
    ...(g.vehiculoPlaca != null && { vehiculoPlaca: g.vehiculoPlaca }),
    ...(g.conductorNombre != null && { conductorNombre: g.conductorNombre }),
    ...(g.conductorDni != null && { conductorDni: g.conductorDni }),
    ...(g.bultos != null && { bultos: g.bultos }),
    ...(g.documentoRef != null && { documentoRef: g.documentoRef }),
    puntoPartida: g.puntoPartida,
    puntoLlegada: g.puntoLlegada,
    status: g.status,
    ...(g.pesoTotal != null && { pesoTotal: dec(g.pesoTotal) }),
    ...(g.pesoBruto != null && { pesoBruto: dec(g.pesoBruto) }),
    ...(g.notas != null && { notas: g.notas }),
    createdBy: g.createdBy,
    createdAt: toISO(g.createdAt),
    updatedAt: toISO(g.updatedAt),
    items: g.items.map(mapItem),
  };
}

// ── Guías de Remisión DB ──────────────────────────────────────────────────────

// ── Mejora 18: Prefijo configurable ─────────────────────────────────────────

async function getDocPrefix(tenantId: string): Promise<string> {
  try {
    const settings = await prisma.settings.findFirst({
      where: { tenantId },
      select: { businessName: true },
    });
    if (settings?.businessName) {
      const prefix = settings.businessName
        .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, "")
        .trim()
        .slice(0, 3)
        .toUpperCase();
      if (prefix.length >= 2) return prefix;
    }
  } catch {
    // Settings table may not exist; fallback silently
  }
  return "Buleje";
}

export const GuiasRemisionDB = {
  async siguienteNumero(tenantId: string): Promise<string> {
    const prefix = await getDocPrefix(tenantId);
    const last = await prisma.guiaRemision.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { numero: true },
    });
    const numMatch = last?.numero?.match(/(\d+)$/);
    const seq = numMatch ? parseInt(numMatch[1], 10) + 1 : 1;
    return `${prefix}-GRR-${String(seq).padStart(4, "0")}`;
  },

  async getAll(
    tenantId: string,
    opts?: {
      status?: string;
      orderId?: string;
      from?: string;
      to?: string;
      transportistaRuc?: string;
      puntoLlegada?: string;
      vehiculoPlaca?: string;
      search?: string;
    }
  ): Promise<DbGuiaRemision[]> {
    const where: Record<string, unknown> = { tenantId };
    if (opts?.status) where.status = opts.status;
    if (opts?.orderId) where.orderId = opts.orderId;
    if (opts?.transportistaRuc) where.transportistaRuc = opts.transportistaRuc;
    if (opts?.puntoLlegada) where.puntoLlegada = opts.puntoLlegada;
    if (opts?.vehiculoPlaca) where.vehiculoPlaca = opts.vehiculoPlaca;
    if (opts?.from || opts?.to) {
      const createdAt: Record<string, Date> = {};
      if (opts.from) createdAt.gte = new Date(opts.from);
      if (opts.to) createdAt.lte = new Date(opts.to);
      where.createdAt = createdAt;
    }
    if (opts?.search) {
      where.OR = [
        { destinatarioNombre: { contains: opts.search, mode: "insensitive" } },
        { numero: { contains: opts.search, mode: "insensitive" } },
        { transportistaNombre: { contains: opts.search, mode: "insensitive" } },
      ];
    }
    return (
      await prisma.guiaRemision.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: "desc" },
      })
    ).map(mapGuia);
  },

  async getById(
    id: string,
    tenantId: string
  ): Promise<DbGuiaRemision | null> {
    const row = await prisma.guiaRemision.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
    return row ? mapGuia(row) : null;
  },

  async create(
    tenantId: string,
    data: {
      numero: string;
      orderId?: string;
      motivoTraslado: string;
      fechaTraslado: Date;
      destinatarioNombre: string;
      destinatarioRuc?: string;
      destinatarioDireccion: string;
      transportistaRuc?: string;
      transportistaNombre?: string;
      vehiculoPlaca?: string;
      conductorNombre?: string;
      conductorDni?: string;
      bultos?: number;
      documentoRef?: string;
      puntoPartida: string;
      puntoLlegada: string;
      pesoTotal?: number;
      pesoBruto?: number;
      notas?: string;
      createdBy: string;
      items: {
        descripcion: string;
        cantidad: number;
        unidad?: string;
        productoId?: string;
        pesoUnitario?: number;
      }[];
    }
  ): Promise<DbGuiaRemision> {
    const createData = {
      tenantId,
      numero: data.numero,
      orderId: data.orderId,
      motivoTraslado: data.motivoTraslado,
      fechaTraslado: data.fechaTraslado,
      destinatarioNombre: data.destinatarioNombre,
      destinatarioRuc: data.destinatarioRuc,
      destinatarioDireccion: data.destinatarioDireccion,
      transportistaRuc: data.transportistaRuc,
      transportistaNombre: data.transportistaNombre,
      vehiculoPlaca: data.vehiculoPlaca,
      conductorNombre: data.conductorNombre,
      conductorDni: data.conductorDni,
      bultos: data.bultos,
      documentoRef: data.documentoRef,
      puntoPartida: data.puntoPartida,
      puntoLlegada: data.puntoLlegada,
      pesoTotal: data.pesoTotal,
      pesoBruto: data.pesoBruto,
      notas: data.notas,
      createdBy: data.createdBy,
      items: {
        create: data.items.map((i) => ({
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          unidad: i.unidad ?? "NIU",
          productoId: i.productoId,
          pesoUnitario: i.pesoUnitario,
        })),
      },
    };
    const row = await prisma.guiaRemision.create({
      data: createData,
      include: { items: true },
    });
    return mapGuia(row);
  },

  async updateStatus(
    id: string,
    tenantId: string,
    status: string
  ): Promise<DbGuiaRemision | null> {
    const existing = await prisma.guiaRemision.findFirst({
      where: { id, tenantId },
    });
    if (!existing) return null;
    const row = await prisma.guiaRemision.update({
      where: { id },
      data: { status: status as never },
      include: { items: true },
    });
    return mapGuia(row);
  },

  async getResumen(tenantId: string): Promise<{
    totalMes: number;
    enTransito: number;
    entregadas: number;
    anuladas: number;
    transportistasFrecuentes: Array<{ nombre: string; ruc: string; count: number }>;
  }> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalMes, enTransito, entregadas, anuladas, transportistas] =
      await Promise.all([
        prisma.guiaRemision.count({
          where: { tenantId, createdAt: { gte: startOfMonth } },
        }),
        prisma.guiaRemision.count({ where: { tenantId, status: "EN_TRANSITO" } }),
        prisma.guiaRemision.count({ where: { tenantId, status: "ENTREGADA" } }),
        prisma.guiaRemision.count({ where: { tenantId, status: "ANULADA" } }),
        prisma.guiaRemision.groupBy({
          by: ["transportistaNombre", "transportistaRuc"],
          where: { tenantId, transportistaNombre: { not: null } },
          _count: { id: true },
          orderBy: { _count: { id: "desc" } },
          take: 5,
        }),
      ]);

    return {
      totalMes,
      enTransito,
      entregadas,
      anuladas,
      transportistasFrecuentes: transportistas.map((t) => ({
        nombre: t.transportistaNombre ?? "",
        ruc: t.transportistaRuc ?? "",
        count: t._count.id,
      })),
    };
  },

  async update(
    id: string,
    tenantId: string,
    data: {
      motivoTraslado?: string;
      fechaTraslado?: Date;
      destinatarioNombre?: string;
      destinatarioRuc?: string;
      destinatarioDireccion?: string;
      transportistaRuc?: string;
      transportistaNombre?: string;
      vehiculoPlaca?: string;
      conductorNombre?: string;
      conductorDni?: string;
      bultos?: number;
      documentoRef?: string;
      puntoPartida?: string;
      puntoLlegada?: string;
      pesoTotal?: number;
      pesoBruto?: number;
      notas?: string;
      items?: {
        descripcion: string;
        cantidad: number;
        unidad?: string;
        productoId?: string;
        pesoUnitario?: number;
      }[];
    }
  ): Promise<DbGuiaRemision | null> {
    const existing = await prisma.guiaRemision.findFirst({
      where: { id, tenantId, status: "BORRADOR" },
    });
    if (!existing) return null;

    const row = await prisma.$transaction(async (tx) => {
      if (data.items !== undefined) {
        await tx.guiaRemisionItem.deleteMany({ where: { guiaId: id } });
      }
      const updateData = {
        ...(data.motivoTraslado !== undefined && { motivoTraslado: data.motivoTraslado }),
        ...(data.fechaTraslado !== undefined && { fechaTraslado: data.fechaTraslado }),
        ...(data.destinatarioNombre !== undefined && { destinatarioNombre: data.destinatarioNombre }),
        ...(data.destinatarioRuc !== undefined && { destinatarioRuc: data.destinatarioRuc }),
        ...(data.destinatarioDireccion !== undefined && { destinatarioDireccion: data.destinatarioDireccion }),
        ...(data.transportistaRuc !== undefined && { transportistaRuc: data.transportistaRuc }),
        ...(data.transportistaNombre !== undefined && { transportistaNombre: data.transportistaNombre }),
        ...(data.vehiculoPlaca !== undefined && { vehiculoPlaca: data.vehiculoPlaca }),
        ...(data.conductorNombre !== undefined && { conductorNombre: data.conductorNombre }),
        ...(data.conductorDni !== undefined && { conductorDni: data.conductorDni }),
        ...(data.bultos !== undefined && { bultos: data.bultos }),
        ...(data.documentoRef !== undefined && { documentoRef: data.documentoRef }),
        ...(data.puntoPartida !== undefined && { puntoPartida: data.puntoPartida }),
        ...(data.puntoLlegada !== undefined && { puntoLlegada: data.puntoLlegada }),
        ...(data.pesoTotal !== undefined && { pesoTotal: data.pesoTotal }),
        ...(data.pesoBruto !== undefined && { pesoBruto: data.pesoBruto }),
        ...(data.notas !== undefined && { notas: data.notas }),
        ...(data.items !== undefined && {
          items: {
            create: data.items.map((i) => ({
              descripcion: i.descripcion,
              cantidad: i.cantidad,
              unidad: i.unidad ?? "NIU",
              productoId: i.productoId,
              pesoUnitario: i.pesoUnitario,
            })),
          },
        }),
      };
      // SECURITY 2026-05-05 (audit SUNAT #8): TOCTOU guard — el where interno
      // repite status:BORRADOR para que un update concurrente de estado (p.ej.
      // EMITIDA entre el findFirst y aqui) aborte la transaccion en lugar de
      // mutar items ya emitidos. Prisma lanza P2025 si no coincide.
      return tx.guiaRemision.update({
        where: { id, status: "BORRADOR" },
        data: updateData,
        include: { items: true },
      });
    });
    return mapGuia(row);
  },

  async anular(
    id: string,
    tenantId: string,
    motivo: string,
    _username: string
  ): Promise<DbGuiaRemision | null> {
    // SECURITY 2026-05-05 (audit SUNAT #3): doble-anulación. Antes
    // findFirst + update separado permitía duplicar el prefijo
    // [ANULADA: ...] en notas. Ahora updateMany con guard atómico.
    const existing = await prisma.guiaRemision.findFirst({
      where: { id, tenantId, status: { not: "ANULADA" } as never },
    });
    if (!existing) return null;

    const notasPrefix = `[ANULADA: ${motivo}] `;
    const newNotas = existing.notas
      ? `${notasPrefix}${existing.notas}`
      : notasPrefix.trim();

    const updated = await prisma.guiaRemision.updateMany({
      where: { id, tenantId, status: { not: "ANULADA" } as never },
      data: { status: "ANULADA", notas: newNotas },
    });
    if (updated.count === 0) return null;
    const row = await prisma.guiaRemision.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
    return row ? mapGuia(row) : null;
  },

  async duplicate(
    id: string,
    tenantId: string,
    username: string
  ): Promise<DbGuiaRemision | null> {
    const original = await prisma.guiaRemision.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
    if (!original) return null;

    const numero = await this.siguienteNumero(tenantId);
    const dupData = {
      tenantId,
      numero,
      orderId: original.orderId,
      motivoTraslado: original.motivoTraslado,
      fechaTraslado: original.fechaTraslado,
      destinatarioNombre: original.destinatarioNombre,
      destinatarioRuc: original.destinatarioRuc,
      destinatarioDireccion: original.destinatarioDireccion,
      transportistaRuc: original.transportistaRuc,
      transportistaNombre: original.transportistaNombre,
      vehiculoPlaca: original.vehiculoPlaca,
      conductorNombre: original.conductorNombre,
      conductorDni: original.conductorDni,
      bultos: original.bultos,
      documentoRef: original.documentoRef,
      puntoPartida: original.puntoPartida,
      puntoLlegada: original.puntoLlegada,
      pesoTotal: original.pesoTotal,
      pesoBruto: original.pesoBruto,
      notas: original.notas,
      createdBy: username,
      status: GuiaStatus.BORRADOR,
      items: {
        create: original.items.map((i) => ({
          productoId: i.productoId,
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          unidad: i.unidad,
          pesoUnitario: i.pesoUnitario,
        })),
      },
    };
    const row = await prisma.guiaRemision.create({
      data: dupData as Prisma.GuiaRemisionUncheckedCreateInput,
      include: { items: true },
    });
    return mapGuia(row as unknown as PGuiaRemision & { items: PGuiaRemisionItem[] });
  },

  async exportCSV(
    tenantId: string,
    opts?: {
      status?: string;
      from?: string;
      to?: string;
    }
  ): Promise<string> {
    const guias = await this.getAll(tenantId, opts);

    const header = [
      "numero",
      "fecha",
      "destinatario",
      "ruc_destinatario",
      "motivo",
      "estado",
      "transportista",
      "placa",
      "punto_partida",
      "punto_llegada",
      "cant_items",
      "peso_total",
    ].join(",");

    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;

    const rows = guias.map((g) =>
      [
        g.numero,
        g.fechaTraslado.slice(0, 10),
        esc(g.destinatarioNombre),
        g.destinatarioRuc ?? "",
        esc(g.motivoTraslado),
        g.status,
        g.transportistaNombre ? esc(g.transportistaNombre) : "",
        g.vehiculoPlaca ?? "",
        esc(g.puntoPartida),
        esc(g.puntoLlegada),
        g.items.length,
        g.pesoTotal ?? "",
      ].join(",")
    );

    return [header, ...rows].join("\r\n");
  },
};
