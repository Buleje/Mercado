import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * DailySummaryDB
 *
 * Audit project-wide 2026-05-19 — migracion de /api/cierre-diario.
 * Snapshot diario de KPIs de caja (ventas, fiados, mejor hora, etc.).
 */

interface CreateData {
  fecha: string;
  totalVentas: number;
  cantidadVentas: number;
  ticketPromedio: number;
  efectivoContado?: number | null;
  efectivoEsperado: number;
  diferenciaCaja: number;
  fiadosCobrados: number;
  fiadosNuevos: number;
  fiadosVencidos: number;
  mejorHora?: string | null;
  productoTop?: string | null;
  stockAlertas?: string | null;
  notas?: string | null;
  creadoPor: string;
}

export const DailySummaryDB = {
  /**
   * Lista los ultimos N cierres del tenant ordenados por fecha desc.
   */
  async listRecent(tenantId: string, opts: { take?: number } = {}) {
    return prisma.dailySummary.findMany({
      where: { tenantId },
      orderBy: { fecha: "desc" },
      take: Math.min(365, Math.max(1, opts.take ?? 30)),
    });
  },

  async create(tenantId: string, data: CreateData) {
    return prisma.dailySummary.create({
      data: {
        tenantId,
        fecha: new Date(data.fecha),
        totalVentas: data.totalVentas,
        cantidadVentas: data.cantidadVentas,
        ticketPromedio: data.ticketPromedio,
        efectivoContado: data.efectivoContado ?? null,
        efectivoEsperado: data.efectivoEsperado,
        diferenciaCaja: data.diferenciaCaja,
        fiadosCobrados: data.fiadosCobrados,
        fiadosNuevos: data.fiadosNuevos,
        fiadosVencidos: data.fiadosVencidos,
        mejorHora: data.mejorHora ?? null,
        productoTop: data.productoTop ?? null,
        stockAlertas: data.stockAlertas ?? null,
        notas: data.notas ?? null,
        creadoPor: data.creadoPor,
      },
    });
  },
};
