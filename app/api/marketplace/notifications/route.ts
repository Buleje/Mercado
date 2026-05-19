import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantIdFromRequest } from "@/lib/tenant";
import { getCustomerPayload, CUSTOMER_SESSION } from "@/lib/auth/customer-session";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/jsondb";
import { logger } from "@/lib/logger";
import { CustomerNotificationsDB } from "@/lib/db/customer-notifications.db";


/**
 * GET /api/marketplace/notifications?customerId=<phone>
 *
 * Devuelve las notificaciones del cliente identificado por `customerId`
 * (phone). Lee de `CustomerNotification` con scope `tenantId + customerPhone`.
 *
 * SECURITY (P2 Bug Hunter Report 2026-04-30):
 *   - Antes el endpoint era stub `return []` — la UI nunca mostró nada.
 *   - Ahora hace query real, pero verifica que el `customerId` del path
 *     coincida con el `customerId` del session-cookie firmada (HMAC). Si
 *     no hay session o no coincide → retorna `[]` (no leak por enumeration).
 *   - Rate-limit 30/min por IP (más permisivo que customers/orders porque
 *     este endpoint se polleá del menú de notificaciones).
 *
 * Tenant-scope: vía `x-tenant-id` del proxy (white-label seguro).
 */
const QuerySchema = z.object({
  customerId: z.string().min(1).max(20),
});

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const { allowed } = rateLimit(`marketplace-notifs:${ip}`, 30, 60);
  if (!allowed) {
    return NextResponse.json({ data: [], error: "rate_limited" }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    customerId: searchParams.get("customerId"),
  });
  if (!parsed.success) {
    return NextResponse.json({ data: [], error: "invalid_params" }, { status: 400 });
  }

  const tenantId = getTenantIdFromRequest(req);
  const requestedPhone = normalizePhone(parsed.data.customerId);

  // Verificar session: solo el dueño del phone puede ver sus notifs.
  const sessionToken = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  if (!sessionToken) {
    return NextResponse.json({ data: [] });
  }
  const payload = await getCustomerPayload(sessionToken);
  if (!payload?.customerId) {
    return NextResponse.json({ data: [] });
  }
  if (normalizePhone(payload.customerId) !== requestedPhone) {
    logger.info("[marketplace/notifications] customerId mismatch — empty", {
      ip,
      requestedPhone: requestedPhone.slice(0, 4) + "***",
    });
    return NextResponse.json({ data: [] });
  }

  // Audit project-wide 2026-05-19: migrado a CustomerNotificationsDB
  // (canonical DB class con tenantId obligatorio + Promise.all paralelo).
  const { data, unreadCount } = await CustomerNotificationsDB.listByPhone(
    tenantId,
    requestedPhone,
    30,
  );

  return NextResponse.json({
    data: data.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount,
  });
}
