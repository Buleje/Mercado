import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * DiscountRulesDB
 *
 * Audit project-wide 2026-05-19 — migracion de /api/discount-rules.
 * Reglas de descuento (porcentaje, 2x1, 3x2, combo, monto_fijo) con
 * tenantId obligatorio (CLAUDE.md #3).
 *
 * Audit (Ley 29733): se registra a nivel ROUTE vía logAudit (necesita `req`
 * para IP/user-agent) en POST /api/discount-rules y PATCH/DELETE
 * /api/discount-rules/[id] con entity "Promotion" — mismo patrón que
 * cotizaciones/sales/purchases. No se audita desde la DB class porque no
 * tiene acceso a `req`.
 *
 * Caché: tabla chica, admin-only y read-on-demand (igual que CouponsDB) →
 * sin getOrSet a propósito; no hay tráfico de storefront que justifique TTL
 * ni invalidación tras cada write.
 */

interface CreateData {
  nombre: string;
  tipo: string;
  valor: number;
  categorias: string;
  condicion: string | null | undefined;
  fechaInicio: Date;
  fechaFin: Date;
  activa: boolean;
}

export const DiscountRulesDB = {
  async list(tenantId: string) {
    return prisma.discountRule.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
  },

  async create(tenantId: string, data: CreateData) {
    return prisma.discountRule.create({
      data: {
        nombre: data.nombre,
        tipo: data.tipo,
        valor: data.valor,
        categorias: data.categorias,
        condicion: data.condicion ?? null,
        fechaInicio: data.fechaInicio,
        fechaFin: data.fechaFin,
        activa: data.activa,
        tenantId,
      },
    });
  },
};
