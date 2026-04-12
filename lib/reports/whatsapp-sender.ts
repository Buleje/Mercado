import "server-only";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { NotificationLogsDB } from "@/lib/db/notifications.db";
import { logger } from "@/lib/logger";

/**
 * Sends a weekly WhatsApp report to the store owner.
 * Fire-and-forget: caller should NOT await this if non-critical.
 *
 * Logs each attempt (success/failure) into NotificationLog for auditing.
 */
export async function sendWeeklyReportTo(
  tenantId: string,
  phone: string,
  message: string
): Promise<void> {
  try {
    const sent = await sendWhatsAppText(phone, message);

    if (sent) {
      await NotificationLogsDB.add(
        {
          type: "whatsapp_weekly_report",
          recipient: phone,
          message: message.slice(0, 500), // truncate for log column limit
          status: "sent",
        },
        tenantId
      );

      logger.info(
        `[weekly-report] WhatsApp enviado a ${phone} (tenant ${tenantId})`
      );
    } else {
      // sendWhatsAppText returns false when WHATSAPP_API_URL / WHATSAPP_API_TOKEN are missing
      logger.warn(
        `[weekly-report] WhatsApp no configurado — saltando tenant ${tenantId}`
      );

      await NotificationLogsDB.add(
        {
          type: "whatsapp_weekly_report",
          recipient: phone,
          message: "SKIPPED: WhatsApp API not configured",
          status: "skipped",
        },
        tenantId
      ).catch(() => {});
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);

    logger.error(
      `[weekly-report] Error enviando WhatsApp a ${phone} (tenant ${tenantId}): ${errMsg}`
    );

    // Best-effort log — don't let a log failure mask the original error
    await NotificationLogsDB.add(
      {
        type: "whatsapp_weekly_report",
        recipient: phone,
        message: `ERROR: ${errMsg}`.slice(0, 500),
        status: "failed",
      },
      tenantId
    ).catch(() => {});

    // Re-throw so the cron handler can count failures
    throw err;
  }
}
