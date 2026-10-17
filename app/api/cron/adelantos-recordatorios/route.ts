import { NextResponse } from "next/server";
import { withCronAuth } from "@/lib/cron-auth";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { NotificationCenterDB } from "@/lib/db/notification-center.db";
import { logger } from "@/lib/logger";

/**
 * ADR-118 — Recordatorios automáticos de cobranza de adelantos.
 * Diario: detecta adelantos ABIERTOS con saldo pendiente y antigüedad > 30 días,
 * agrupa por tenant, crea una notificación admin (dedup 20h) y sella
 * ultimoRecordatorio en los beneficiarios afectados.
 *
 * ADR-448: sólo lo que el negocio DIO, y por `AdelantosDB` (antes leía la tabla
 * directo desde la ruta). Lo recibido es «por pagar»: sin el filtro, el aviso le
 * recordaba cobrar a quien el negocio le debe.
 */
const DIAS_UMBRAL = 30;

export const GET = withCronAuth("adelantos-recordatorios", async () => {
  const umbral = new Date(Date.now() - DIAS_UMBRAL * 86_400_000);
  const vencidos = await AdelantosDB.vencidosParaRecordatorio(umbral);

  // Agrupar por tenant
  const porTenant = new Map<string, { saldos: Record<string, number>; benIds: Set<string> }>();
  for (const a of vencidos) {
    let t = porTenant.get(a.tenantId);
    if (!t) { t = { saldos: {}, benIds: new Set() }; porTenant.set(a.tenantId, t); }
    const cur = a.moneda || "PEN";
    t.saldos[cur] = (t.saldos[cur] ?? 0) + a.saldoPendiente;
    t.benIds.add(a.beneficiarioId);
  }

  let notificados = 0;
  for (const [tenantId, t] of porTenant) {
    const totalTxt = Object.entries(t.saldos)
      .map(([m, v]) => (m === "USD" ? `$ ${v.toFixed(2)}` : `S/ ${v.toFixed(2)}`))
      .join(" · ");
    const n = t.benIds.size;
    try {
      await NotificationCenterDB.createOrReuse({
        tenantId,
        type: "ADELANTO_VENCIDO",
        severity: "MEDIUM",
        title: "Adelantos vencidos por cobrar",
        body: `${n} persona${n === 1 ? "" : "s"} con saldo vencido (+${DIAS_UMBRAL} días): ${totalTxt}.`,
        // `tab=cobranza` no existe: el panel caía en Inicio. Adelantos vive en Mi Plata.
        actionUrl: "/admin?tab=plata&vista=adelantos",
        actionLabel: "Ver adelantos",
        dedupWindowHours: 20,
      });
      // Sellar último recordatorio en los beneficiarios afectados
      await AdelantosDB.sellarRecordatorios(tenantId, [...t.benIds]);
      notificados += 1;
    } catch (err) {
      logger.error("[cron/adelantos-recordatorios] tenant failed", { tenantId, err: String(err) });
    }
  }

  return NextResponse.json({ ok: true, tenantsConVencidos: porTenant.size, notificados, adelantosVencidos: vencidos.length });
});
