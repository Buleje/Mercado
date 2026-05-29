import { NextResponse } from "next/server";
import { withCronAuth } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { NotificationCenterDB } from "@/lib/db/notification-center.db";
import { cacaoBeneficioAlerta } from "@/lib/cacao/cacao-quality";
import { logger } from "@/lib/logger";

/**
 * ADR-128 — Recordatorios de beneficio de cacao.
 * Diario: detecta beneficios EN PROCESO (fermentando/secando) que llevan
 * demasiados días en su etapa (sobre-fermentación o secado estancado), agrupa
 * por tenant y crea una notificación admin (dedup 20h). Cross-tenant como el
 * resto de crons (excepción a la regla "solo lib/db"). Reusa la lógica pura
 * `cacaoBeneficioAlerta` (misma que la vista Beneficio).
 */
const days = (from: Date) => Math.max(0, Math.floor((Date.now() - from.getTime()) / 86_400_000));

export const GET = withCronAuth("cacao-beneficio-recordatorios", async () => {
  const enProceso = await prisma.cacaoBeneficio.findMany({
    where: { deletedAt: null, status: "registrado", estado: { in: ["fermentando", "secando"] } },
    select: { tenantId: true, loteCode: true, estado: true, fermInicio: true, secInicio: true, createdAt: true },
  });

  // Agrupar por tenant las que están en atención/urgente
  const porTenant = new Map<string, { atencion: number; urgente: number; lotes: string[] }>();
  for (const b of enProceso) {
    const ref = b.estado === "secando" ? (b.secInicio ?? b.createdAt) : (b.fermInicio ?? b.createdAt);
    const { nivel } = cacaoBeneficioAlerta(b.estado, days(new Date(ref)));
    if (nivel === "ok") continue;
    let t = porTenant.get(b.tenantId);
    if (!t) { t = { atencion: 0, urgente: 0, lotes: [] }; porTenant.set(b.tenantId, t); }
    if (nivel === "urgente") t.urgente += 1; else t.atencion += 1;
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
      logger.error("[cron/cacao-beneficio-recordatorios] tenant failed", { tenantId, err: String(err) });
    }
  }

  return NextResponse.json({ ok: true, beneficiosEnProceso: enProceso.length, tenantsConAlerta: porTenant.size, notificados });
});
