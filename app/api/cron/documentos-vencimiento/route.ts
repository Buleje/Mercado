import { NextResponse } from "next/server";
import { withCronAuth } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { DocumentsDB } from "@/lib/db/documents.db";
import { NotificationCenterDB } from "@/lib/db/notification-center.db";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { sendSuperAdminAlert } from "@/lib/mailer-superadmin";
import { SUPERADMIN_DOCS_TENANT } from "@/lib/documents/superadmin-vault";
import { logger } from "@/lib/logger";
import { diasHasta, textoCorto, textoCuando, tituloAviso } from "@/lib/documentos/aviso-vencimiento";

/**
 * ADR-119 — Recordatorios de vencimiento de documentos.
 *
 * Diario: detecta documentos que vencen dentro de la ventana y aún no avisaron
 * (expiryReminderSentAt = null). Agrupa por tenant, crea una notificación admin
 * persistente, manda un WhatsApp al ownerPhone, y sella el flag anti-spam.
 *
 * El flag se re-arma solo cuando el usuario cambia expiresAt (ver
 * DocumentsDB.update) — así un documento renovado vuelve a entrar al ciclo.
 */
const VENTANA_DIAS = 7;

const diasRestantes = (iso: string | null): number => diasHasta(iso) ?? 999;

export const GET = withCronAuth("documentos-vencimiento", async () => {
  const pendientes = await DocumentsDB.listPendingExpiryReminders(VENTANA_DIAS);

  // Agrupar por tenant
  const porTenant = new Map<string, typeof pendientes>();
  for (const d of pendientes) {
    const arr = porTenant.get(d.tenantId) ?? [];
    arr.push(d);
    porTenant.set(d.tenantId, arr);
  }

  let tenantsNotificados = 0;
  let whatsappEnviados = 0;
  /** Por qué NO salió el WhatsApp. Sin esto, el aviso más importante del drive
   *  puede estar fallando hace meses y nadie se entera: el panel muestra la
   *  notificación igual y el envío se caía con un `.catch` mudo. */
  let sinTelefono = 0;
  let whatsappFallidos = 0;

  for (const [tenantId, docs] of porTenant) {
    const n = docs.length;
    const masUrgente = docs[0]; // ya viene ordenado por expiresAt asc
    const dias = diasRestantes(masUrgente.expiresAt);
    // "ya vencido" no dice si fue ayer o hace dos meses, y eso cambia lo que
    // hacés al leerlo.
    const cuando = textoCuando(dias);
    const titulo = tituloAviso(docs.map((d) => ({ dias: diasRestantes(d.expiresAt) })));

    // Vault del superadmin: no es un Tenant real (sin ownerPhone) → email directo
    // al superadmin con la URL correcta, en vez de WhatsApp + notificación de tenant.
    if (tenantId === SUPERADMIN_DOCS_TENANT) {
      try {
        await sendSuperAdminAlert({
          subject: titulo,
          title: `Tenés ${titulo.toLowerCase()}`,
          items: docs.slice(0, 8).map((d) => ({
            label: d.name,
            value: textoCorto(diasRestantes(d.expiresAt)),
          })),
          actionUrl: "/superadmin/documentos",
          actionLabel: "Ver documentos",
        });
        await DocumentsDB.markExpiryReminderSent(tenantId, docs.map((d) => d.id));
        tenantsNotificados += 1;
      } catch (err) {
        logger.error("[cron/documentos-vencimiento] superadmin failed", { err: String(err) });
      }
      continue;
    }

    try {
      // 1) Notificación admin persistente (reaparece vía dedup window)
      await NotificationCenterDB.createOrReuse({
        tenantId,
        type: "DOCUMENTO_VENCIMIENTO",
        // Un papel ya vencido es urgente aunque falten días para los demás.
        severity: dias <= 1 ? "HIGH" : "MEDIUM",
        title: titulo,
        body:
          n === 1
            ? `"${masUrgente.name}" ${cuando}.`
            : `"${masUrgente.name}" ${cuando}, y ${n - 1} más.`,
        actionUrl: "/admin?tab=documentos",
        actionLabel: "Ver documentos",
        dedupWindowHours: 20,
      });

      // 2) WhatsApp al dueño (best-effort)
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { ownerPhone: true, name: true },
      });
      const phone = tenant?.ownerPhone?.replace(/\D/g, "");
      if (!phone || phone.length < 9) {
        sinTelefono += 1;
        logger.warn("[cron/documentos-vencimiento] tenant sin ownerPhone", { tenantId, docs: n });
      } else {
        const lista = docs
          .slice(0, 5)
          .map((d) => `• ${d.name} — ${textoCorto(diasRestantes(d.expiresAt))}`)
          .join("\n");
        const msg = [
          `📄 *${titulo}* — ${tenant?.name ?? "tu negocio"}`,
          "",
          lista,
          n > 5 ? `…y ${n - 5} más.` : "",
          "",
          "Renueva a tiempo para evitar multas. Míralo en tu panel → Documentos.",
        ]
          .filter(Boolean)
          .join("\n");
        const ok = await sendWhatsAppText(phone, msg).catch((err) => {
          logger.error("[cron/documentos-vencimiento] whatsapp falló", { tenantId, err: String(err).slice(0, 200) });
          return false;
        });
        if (ok) whatsappEnviados += 1;
        else {
          whatsappFallidos += 1;
          logger.error("[cron/documentos-vencimiento] whatsapp NO enviado", { tenantId, docs: n });
        }
      }

      // 3) Sellar anti-spam scopeado al tenant (CRIT-1)
      await DocumentsDB.markExpiryReminderSent(tenantId, docs.map((d) => d.id));
      tenantsNotificados += 1;
    } catch (err) {
      logger.error("[cron/documentos-vencimiento] tenant failed", { tenantId, err: String(err) });
    }
  }

  return NextResponse.json({
    ok: true,
    documentosPorVencer: pendientes.length,
    tenantsNotificados,
    whatsappEnviados,
    // Se reportan para que el tablero de crons muestre el aviso que NO llegó,
    // en vez de un "ok: true" que tapa el problema.
    whatsappFallidos,
    sinTelefono,
  });
});
