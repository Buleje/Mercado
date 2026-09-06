import { NextResponse } from "next/server";
import { withCronAuth } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { NotificationCenterDB } from "@/lib/db/notification-center.db";
import { CacaoDB } from "@/lib/db/cacao.db";
import { getCacaoMarket } from "@/lib/cacao/cacao-market";
import { cacaoBeneficioAlerta } from "@/lib/cacao/cacao-quality";
import { logger } from "@/lib/logger";

/**
 * ADR-128 — Recordatorios y alertas del módulo Cacao.
 * Diario: (1) beneficios EN PROCESO demorados en su etapa (sobre-fermentación /
 * secado estancado); (2) por tenant con CacaoConfig: stock seco bajo el mínimo
 * y precio de mercado favorable sobre el objetivo. Agrupa por tenant y crea
 * notificaciones admin (dedup ~20h). Cross-tenant como el resto de crons.
 */
const days = (from: Date) => Math.max(0, Math.floor((Date.now() - from.getTime()) / 86_400_000));

export const GET = withCronAuth("cacao-beneficio-recordatorios", async () => {
  const enProceso = await prisma.cacaoBeneficio.findMany({
    where: { deletedAt: null, status: "registrado", estado: { in: ["fermentando", "secando"] } },
    select: {
      tenantId: true,
      loteCode: true,
      estado: true,
      fermInicio: true,
      secInicio: true,
      createdAt: true,
    },
  });

  // Agrupar por tenant las que están en atención/urgente
  const porTenant = new Map<string, { atencion: number; urgente: number; lotes: string[] }>();
  for (const b of enProceso) {
    const ref =
      b.estado === "secando" ? (b.secInicio ?? b.createdAt) : (b.fermInicio ?? b.createdAt);
    const { nivel } = cacaoBeneficioAlerta(b.estado, days(new Date(ref)));
    if (nivel === "ok") continue;
    let t = porTenant.get(b.tenantId);
    if (!t) {
      t = { atencion: 0, urgente: 0, lotes: [] };
      porTenant.set(b.tenantId, t);
    }
    if (nivel === "urgente") t.urgente += 1;
    else t.atencion += 1;
    if (b.loteCode && t.lotes.length < 5) t.lotes.push(b.loteCode);
  }

  let notificados = 0;
  for (const [tenantId, t] of porTenant) {
    const n = t.atencion + t.urgente;
    const muestra = t.lotes.join(", ") + (n > t.lotes.length ? "…" : "");
    try {
      await NotificationCenterDB.createOrReuse({
        tenantId,
        type: "CACAO_BENEFICIO_ATENCION",
        severity: t.urgente > 0 ? "HIGH" : "MEDIUM",
        title: "Lotes de cacao requieren atención",
        body: `${n} lote${n === 1 ? "" : "s"} llevan demasiados días en proceso${t.urgente > 0 ? ` (${t.urgente} urgente${t.urgente === 1 ? "" : "s"})` : ""}: ${muestra}. Revisá fermentación/secado.`,
        actionUrl: "/admin?tab=cacao-acopio",
        actionLabel: "Ver beneficio",
        dedupWindowHours: 20,
      });
      notificados += 1;
    } catch (err) {
      logger.error("[cron/cacao-beneficio-recordatorios] tenant failed", {
        tenantId,
        err: String(err),
      });
    }
  }

  // ── Alertas por configuración de tenant: stock mínimo + precio favorable ──
  let stockAlertas = 0,
    precioAlertas = 0;
  const configs = await prisma.cacaoConfig.findMany({
    where: { OR: [{ stockMinimoKg: { not: null } }, { precioAlertaPenKg: { not: null } }] },
    select: { tenantId: true, stockMinimoKg: true, precioAlertaPenKg: true },
  });
  if (configs.length) {
    // Precio de mercado se resuelve una sola vez (fetch cacheado).
    const precioMercadoKg = configs.some((c) => c.precioAlertaPenKg != null)
      ? await getCacaoMarket()
          .then((m) => m.pricePenPerKg)
          .catch(() => null)
      : null;

    for (const c of configs) {
      // Stock bajo el mínimo
      if (c.stockMinimoKg != null) {
        try {
          const inv = await CacaoDB.inventory(c.tenantId);
          const minimo = Number(c.stockMinimoKg);
          if (inv.kgSecoDisponible < minimo) {
            await NotificationCenterDB.createOrReuse({
              tenantId: c.tenantId,
              type: "CACAO_STOCK_BAJO",
              severity: "MEDIUM",
              title: "Stock de cacao bajo el mínimo",
              body: `Disponible ${inv.kgSecoDisponible} kg < mínimo ${minimo} kg. Considerá acopiar o terminar beneficios en proceso.`,
              actionUrl: "/admin?tab=cacao-acopio&cacaoView=inventario",
              actionLabel: "Ver inventario",
              dedupWindowHours: 20,
            });
            stockAlertas += 1;
          }
        } catch (err) {
          logger.error("[cron/cacao] stock alert failed", {
            tenantId: c.tenantId,
            err: String(err),
          });
        }
      }
      // Precio de mercado favorable sobre el objetivo
      if (
        c.precioAlertaPenKg != null &&
        precioMercadoKg != null &&
        precioMercadoKg >= Number(c.precioAlertaPenKg)
      ) {
        try {
          await NotificationCenterDB.createOrReuse({
            tenantId: c.tenantId,
            type: "CACAO_PRECIO_OBJETIVO",
            severity: "LOW",
            title: "Precio de venta favorable",
            body: `La referencia de mercado (S/ ${precioMercadoKg.toFixed(2)}/kg) superó tu objetivo de S/ ${Number(c.precioAlertaPenKg).toFixed(2)}/kg. Buen momento para vender.`,
            actionUrl: "/admin?tab=cacao-acopio&cacaoView=mercado",
            actionLabel: "Ver mercado",
            dedupWindowHours: 20,
          });
          precioAlertas += 1;
        } catch (err) {
          logger.error("[cron/cacao] precio alert failed", {
            tenantId: c.tenantId,
            err: String(err),
          });
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    beneficiosEnProceso: enProceso.length,
    tenantsConAlerta: porTenant.size,
    notificados,
    stockAlertas,
    precioAlertas,
  });
});
