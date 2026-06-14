import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { sendPushToPhone } from "@/lib/push-sender";
import { logger } from "@/lib/logger";

/**
 * Avisos de seguridad al dueño del negocio (ADR-133 — "como Google").
 *
 * Dos disparadores:
 *  1. Ingreso desde un dispositivo/IP nuevo (solo roles de gestión, para no
 *     spamear con cajeros en POS compartidos).
 *  2. Acciones sensibles de soporte (superadmin): reset de clave, reset 2FA,
 *     cierre de todas las sesiones.
 *
 * Todo es fire-and-forget: nunca debe romper el login ni la acción de soporte.
 * Contacto = Tenant.ownerPhone / ownerEmail (AdminUser no tiene contacto propio).
 * Raw SQL: tabla/campo nuevos sin depender del cliente Prisma regenerado.
 */

const MGMT_ROLES = new Set(["owner", "admin"]);

/** Familia legible del User-Agent: "Chrome · Windows". Estable ante bumps menores. */
export function parseDevice(ua: string | null | undefined): string {
  if (!ua) return "Dispositivo desconocido";
  const browser =
    /Edg\//.test(ua) ? "Edge"
      : /OPR\/|Opera/.test(ua) ? "Opera"
      : /Chrome\//.test(ua) ? "Chrome"
      : /Firefox\//.test(ua) ? "Firefox"
      : /Safari\//.test(ua) ? "Safari"
      : "Navegador";
  const os =
    /Windows/.test(ua) ? "Windows"
      : /Android/.test(ua) ? "Android"
      : /(iPhone|iPad|iOS)/.test(ua) ? "iOS"
      : /Mac OS X|Macintosh/.test(ua) ? "macOS"
      : /Linux/.test(ua) ? "Linux"
      : "otro sistema";
  return `${browser} · ${os}`;
}

function fingerprint(ip: string | null, device: string): string {
  return createHash("sha256").update(`${ip ?? "?"}|${device}`).digest("hex").slice(0, 32);
}

/** Envía el aviso al dueño por WhatsApp + push. Nunca lanza. */
export async function notifyTenantOwnerSecurity(
  tenantId: string,
  opts: { title: string; body: string; url?: string },
): Promise<void> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ ownerPhone: string | null }[]>(
      `SELECT "ownerPhone" FROM "Tenant" WHERE id = $1 LIMIT 1`,
      tenantId,
    );
    const phone = rows[0]?.ownerPhone;
    if (!phone) return;
    const tasks: Promise<unknown>[] = [
      sendWhatsAppText(phone, `${opts.title}\n\n${opts.body}`).catch((err) => {
        logger.warn("[security-alerts] whatsapp send failed", { tenantId, err: String(err) });
        return false;
      }),
      sendPushToPhone(phone, { title: opts.title, body: opts.body, url: opts.url }, tenantId).catch((err) => {
        logger.warn("[security-alerts] push send failed", { tenantId, err: String(err) });
      }),
    ];
    await Promise.allSettled(tasks);
  } catch (e) {
    logger.warn("[security-alerts] notifyTenantOwnerSecurity failed", { tenantId, err: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Registra el dispositivo del login y, si es nuevo Y el admin ya tenía al menos
 * un dispositivo conocido (no es el alta inicial), avisa al dueño. Solo para
 * roles de gestión. Fire-and-forget.
 */
export async function alertNewDeviceLogin(args: {
  tenantId: string;
  username: string;
  role: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<void> {
  const { tenantId, username, role, ip, userAgent } = args;
  try {
    const device = parseDevice(userAgent);
    const fp = fingerprint(ip, device);

    const counts = await prisma.$queryRawUnsafe<{ total: number; matched: number }[]>(
      `SELECT
         (SELECT COUNT(*)::int FROM "AdminLoginDevice" WHERE "tenantId"=$1 AND username=$2) AS total,
         (SELECT COUNT(*)::int FROM "AdminLoginDevice" WHERE "tenantId"=$1 AND username=$2 AND fingerprint=$3) AS matched`,
      tenantId, username, fp,
    );
    const total = counts[0]?.total ?? 0;
    const matched = counts[0]?.matched ?? 0;

    // Upsert: marca visto (o lo crea). El id lo damos nosotros (raw SQL no aplica @default).
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AdminLoginDevice" (id, "tenantId", username, fingerprint, ip, "userAgent", "firstSeenAt", "lastSeenAt")
       VALUES ($1,$2,$3,$4,$5,$6, NOW(), NOW())
       ON CONFLICT ("tenantId", username, fingerprint) DO UPDATE SET "lastSeenAt" = NOW()`,
      randomUUID(), tenantId, username, fp, ip, userAgent ? userAgent.slice(0, 400) : null,
    );

    const isNew = matched === 0;
    const hadPrior = total > 0;
    // Solo alertar: dispositivo nuevo + no es el alta inicial + rol de gestión.
    if (!isNew || !hadPrior || !MGMT_ROLES.has(role)) return;

    await notifyTenantOwnerSecurity(tenantId, {
      title: "🔔 Buleje: ingreso desde un dispositivo nuevo",
      body:
        `Cuenta: ${username}\nDispositivo: ${device}\nIP: ${ip ?? "desconocida"}\n\n` +
        `Si fuiste tú, ignora este mensaje. Si no reconoces este ingreso, cambia tu contraseña ahora en el panel y contáctanos.`,
      url: "/admin",
    });
  } catch (e) {
    logger.warn("[security-alerts] alertNewDeviceLogin failed", { tenantId, username, err: e instanceof Error ? e.message : String(e) });
  }
}
