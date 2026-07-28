import { NextResponse } from "next/server";
import { withCronAuth } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { ContractsDB } from "@/lib/db/contracts.db";
import { NotificationCenterDB } from "@/lib/db/notification-center.db";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";

/**
 * ADR-307 — Aviso de vencimiento de contratos.
 *
 * Dos trabajos, uno detrás del otro:
 *  1. Los contratos vigentes cuya fecha ya pasó pasan a VENCIDO. Antes el
 *     estado se adivinaba en cada render del panel, así que fuera de la
 *     pantalla el contrato seguía figurando como vigente para siempre.
 *  2. Los que vencen dentro de la ventana generan una notificación y un
 *     WhatsApp al dueño, con el mismo sello anti-spam que usa el drive:
 *     cambiar la fecha de vencimiento re-arma el ciclo.
 *
 * Un contrato laboral que se pasa de fecha no es un papel más: se convierte en
 * indeterminado por ley (D.S. 003-97-TR), y un alquiler vencido se renueva
 * solo. Por eso el aviso sale con 30 días, no con 7 como los documentos.
 */
const VENTANA_DIAS = 30;

function diasHasta(fecha: Date): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - hoy.getTime()) / 86_400_000);
}

function textoCorto(dias: number): string {
  if (dias < 0) return `vencido hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"}`;
  if (dias === 0) return "vence hoy";
  if (dias === 1) return "vence mañana";
  return `vence en ${dias} días`;
}

export const GET = withCronAuth("contratos-vencimiento", async () => {
  const vencidos = await ContractsDB.expireOverdue();
  const pendientes = await ContractsDB.listPendingExpiryReminders(VENTANA_DIAS);

  const porTenant = new Map<string, typeof pendientes>();
  for (const c of pendientes) {
    const arr = porTenant.get(c.tenantId) ?? [];
    arr.push(c);
    porTenant.set(c.tenantId, arr);
  }

  let tenantsNotificados = 0;
  let whatsappEnviados = 0;
  let sinTelefono = 0;
  let whatsappFallidos = 0;

  for (const [tenantId, contratos] of porTenant) {
    contratos.sort((a, b) => a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime());
    const n = contratos.length;
    const masUrgente = contratos[0];
    const dias = diasHasta(masUrgente.fechaVencimiento);
    const titulo = n === 1 ? "Tenés 1 contrato por vencer" : `Tenés ${n} contratos por vencer`;

    try {
      await NotificationCenterDB.createOrReuse({
        tenantId,
        type: "DOCUMENTO_VENCIMIENTO",
        severity: dias <= 7 ? "HIGH" : "MEDIUM",
        title: titulo,
        body:
          n === 1
            ? `${masUrgente.numero} con ${masUrgente.clienteNombre} ${textoCorto(dias)}.`
            : `${masUrgente.numero} con ${masUrgente.clienteNombre} ${textoCorto(dias)}, y ${n - 1} más.`,
        actionUrl: "/admin?tab=documentos#contratos",
        actionLabel: "Ver contratos",
        dedupWindowHours: 20,
      });

      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { ownerPhone: true, name: true },
      });
      const phone = tenant?.ownerPhone?.replace(/\D/g, "");
      if (!phone || phone.length < 9) {
        sinTelefono += 1;
        logger.warn("[cron/contratos-vencimiento] tenant sin ownerPhone", { tenantId, contratos: n });
      } else {
        const lista = contratos
          .slice(0, 5)
          .map((c) => `• ${c.numero} — ${c.clienteNombre} — ${textoCorto(diasHasta(c.fechaVencimiento))}`)
          .join("\n");
        const msg = [
          `📝 *${titulo}* — ${tenant?.name ?? "tu negocio"}`,
          "",
          lista,
          n > 5 ? `…y ${n - 5} más.` : "",
          "",
          "Renovalos antes de que se venzan desde tu panel → Documentos → Contratos.",
        ]
          .filter(Boolean)
          .join("\n");
        const ok = await sendWhatsAppText(phone, msg).catch((err) => {
          logger.error("[cron/contratos-vencimiento] whatsapp falló", {
            tenantId,
            err: String(err).slice(0, 200),
          });
          return false;
        });
        if (ok) whatsappEnviados += 1;
        else {
          whatsappFallidos += 1;
          logger.error("[cron/contratos-vencimiento] whatsapp NO enviado", { tenantId, contratos: n });
        }
      }

      for (const c of contratos) {
        await ContractsDB.markReminderSent(tenantId, c.id);
        await ContractsDB.addEvent(
          tenantId,
          c.id,
          "VENCIMIENTO_AVISADO",
          `Aviso enviado: ${textoCorto(diasHasta(c.fechaVencimiento))}`,
          "cron",
        );
      }
      tenantsNotificados += 1;
    } catch (err) {
      logger.error("[cron/contratos-vencimiento] tenant failed", { tenantId, err: String(err) });
    }
  }

  return NextResponse.json({
    ok: true,
    marcadosVencidos: vencidos,
    contratosPorVencer: pendientes.length,
    tenantsNotificados,
    whatsappEnviados,
    sinTelefono,
    whatsappFallidos,
  });
});
