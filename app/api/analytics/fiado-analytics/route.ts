import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { AnalyticsFiadoDB } from "@/lib/db/analytics-fiado.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/analytics/fiado-analytics
 * Complete fiado (informal credit) analytics: totals, aging, 12-month trend, top debtors.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    // Audit project-wide 2026-05-19: migrado a AnalyticsFiadoDB.
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const [activeFiados, cobradoEsteMes, allFiadosForTrend] = await Promise.allSettled([
      AnalyticsFiadoDB.getActiveFiadosWithCustomer(auth.tenantId),
      AnalyticsFiadoDB.aggregateCuotasPaidSince(auth.tenantId, thisMonthStart),
      (async () => {
        const [newFiados, paidCuotas] = await Promise.all([
          AnalyticsFiadoDB.getNewFiadosInRange(auth.tenantId, twelveMonthsAgo),
          AnalyticsFiadoDB.getPaidCuotasInRange(auth.tenantId, twelveMonthsAgo),
        ]);
        return { newFiados, paidCuotas };
      })(),
    ]);

    // --- Totales ---
    let pendiente = 0;
    let vencidoHoy = 0;
    let cobradoEsteMesValor = 0;
    let totalPendienteHistorico = 0;

    const activeList = activeFiados.status === "fulfilled" ? activeFiados.value : [];

    for (const fiado of activeList) {
      const saldo = Number(fiado.saldo);
      pendiente += saldo;
      if (fiado.fechaVence && new Date(fiado.fechaVence) < now) {
        vencidoHoy += saldo;
      }
    }

    if (cobradoEsteMes.status === "fulfilled") {
      cobradoEsteMesValor = cobradoEsteMes.value._sum.monto ? Number(cobradoEsteMes.value._sum.monto) : 0;
    }

    totalPendienteHistorico = pendiente + cobradoEsteMesValor;
    const tasaRecuperacion = totalPendienteHistorico > 0
      ? Math.round((cobradoEsteMesValor / totalPendienteHistorico) * 10000) / 100
      : 0;

    // --- Distribución por antigüedad ---
    const distribucion = [
      { rango: "Al día (0-7 días)", monto: 0, count: 0, color: "var(--accent)" },
      { rango: "Por vencer (8-30 días)", monto: 0, count: 0, color: "#ff6b5b" },
      { rango: "Vencido 31-60 días", monto: 0, count: 0, color: "#e76f51" },
      { rango: "Crítico +60 días", monto: 0, count: 0, color: "#d00000" },
    ];

    for (const fiado of activeList) {
      const saldo = Number(fiado.saldo);
      const diasDesdeCreacion = Math.floor((now.getTime() - new Date(fiado.createdAt).getTime()) / (1000 * 60 * 60 * 24));

      if (diasDesdeCreacion <= 7) {
        distribucion[0].monto += saldo;
        distribucion[0].count++;
      } else if (diasDesdeCreacion <= 30) {
        distribucion[1].monto += saldo;
        distribucion[1].count++;
      } else if (diasDesdeCreacion <= 60) {
        distribucion[2].monto += saldo;
        distribucion[2].count++;
      } else {
        distribucion[3].monto += saldo;
        distribucion[3].count++;
      }
    }

    // Round montos
    for (const d of distribucion) {
      d.monto = Math.round(d.monto * 100) / 100;
    }

    // --- Tendencia 12 meses ---
    const tendencia12m: { mes: string; cobrados: number; nuevos: number }[] = [];

    for (let i = 11; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = monthDate.toISOString().slice(0, 7); // YYYY-MM
      tendencia12m.push({ mes: monthKey, cobrados: 0, nuevos: 0 });
    }

    if (allFiadosForTrend.status === "fulfilled") {
      const { newFiados, paidCuotas } = allFiadosForTrend.value;

      for (const fiado of newFiados) {
        const monthKey = fiado.createdAt.toISOString().slice(0, 7);
        const entry = tendencia12m.find((t) => t.mes === monthKey);
        if (entry) entry.nuevos += Number(fiado.total);
      }

      for (const cuota of paidCuotas) {
        if (!cuota.pagadoEn) continue;
        const monthKey = cuota.pagadoEn.toISOString().slice(0, 7);
        const entry = tendencia12m.find((t) => t.mes === monthKey);
        if (entry) entry.cobrados += Number(cuota.monto);
      }
    }

    // Round trend values
    for (const t of tendencia12m) {
      t.cobrados = Math.round(t.cobrados * 100) / 100;
      t.nuevos = Math.round(t.nuevos * 100) / 100;
    }

    // --- Top 10 deudores ---
    const topDeudores = activeList
      .map((fiado) => {
        const saldo = Number(fiado.saldo);
        const diasDesdeCreacion = Math.floor(
          (now.getTime() - new Date(fiado.createdAt).getTime()) / (1000 * 60 * 60 * 24)
        );
        const vencido = fiado.fechaVence ? new Date(fiado.fechaVence) < now : false;
        return {
          nombre: fiado.customer.name,
          phone: fiado.customer.phone,
          monto: Math.round(saldo * 100) / 100,
          dias: diasDesdeCreacion,
          status: vencido ? "vencido" : diasDesdeCreacion > 30 ? "riesgo" : "al_dia",
        };
      })
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 10);

    return NextResponse.json({
      totales: {
        pendiente: Math.round(pendiente * 100) / 100,
        vencidoHoy: Math.round(vencidoHoy * 100) / 100,
        cobradoEsteMes: Math.round(cobradoEsteMesValor * 100) / 100,
        tasaRecuperacion,
      },
      distribucion,
      tendencia12m,
      topDeudores,
    });
  } catch (e) {
    logger.error("[analytics/fiado-analytics] GET error", { error: (e as Error).message, tenantId: auth.tenantId });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
