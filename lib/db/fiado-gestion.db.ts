import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * La bitácora de cobranza de Fiados — port de `AdelantosDB.listGestiones` /
 * `createGestion` (ver lib/db/adelantos.db.ts), indexada por `customerId` en
 * vez de `beneficiarioId`. Se lee entera de una vez —la pantalla la indexa
 * por cliente— porque una consulta por fila sería N+1 sobre una lista que se
 * abre todos los días.
 */

export type DbFiadoGestion = {
  id: string;
  customerId: string;
  customerName?: string | null;
  fecha: string;
  tipo: string;
  nota: string | null;
  fechaPrometida: string | null;
  montoPrometido: number | null;
  usuario: string | null;
};

export type FiadoGestionInput = {
  customerId: string;
  tipo: string;
  nota?: string;
  fechaPrometida?: string | null;
  montoPrometido?: number | null;
  usuario?: string;
};

const toNum = (d: unknown): number | null => (d == null ? null : Number(d));
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export const FiadoGestionDB = {
  async listGestiones(tenantId: string, opts?: { desde?: Date; limite?: number }): Promise<DbFiadoGestion[]> {
    const rows = await prisma.fiadoGestion.findMany({
      where: { tenantId, ...(opts?.desde ? { fecha: { gte: opts.desde } } : {}) },
      orderBy: { fecha: "desc" },
      take: opts?.limite ?? 500,
    });
    return rows.map((g) => ({
      id: g.id,
      customerId: g.customerId,
      fecha: g.fecha.toISOString(),
      tipo: g.tipo,
      nota: g.nota,
      fechaPrometida: iso(g.fechaPrometida),
      montoPrometido: toNum(g.montoPrometido),
      usuario: g.usuario,
    }));
  },

  /**
   * Anota una gestión. Valida que el cliente exista en el tenant — mismo
   * guard que `createGestion` de Adelantos hace contra `beneficiario`.
   */
  async createGestion(tenantId: string, data: FiadoGestionInput): Promise<DbFiadoGestion | null> {
    const customer = await prisma.customer.findFirst({
      where: { tenantId, phone: data.customerId },
      select: { phone: true, name: true },
    });
    if (!customer) return null;

    const g = await prisma.fiadoGestion.create({
      data: {
        tenantId,
        customerId: data.customerId,
        tipo: data.tipo,
        nota: data.nota?.trim() || null,
        fechaPrometida: data.fechaPrometida ? new Date(data.fechaPrometida) : null,
        montoPrometido: data.montoPrometido != null && data.montoPrometido > 0 ? data.montoPrometido : null,
        usuario: data.usuario?.trim() || null,
      },
    });

    return {
      id: g.id,
      customerId: g.customerId,
      customerName: customer.name,
      fecha: g.fecha.toISOString(),
      tipo: g.tipo,
      nota: g.nota,
      fechaPrometida: iso(g.fechaPrometida),
      montoPrometido: toNum(g.montoPrometido),
      usuario: g.usuario,
    };
  },
};
