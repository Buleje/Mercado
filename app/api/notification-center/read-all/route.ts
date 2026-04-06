export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/notification-center/read-all
 *
 * Marca todas las notificaciones del tenant como leídas.
 */
export async function PATCH() {
  const tenantId = "main";

  try {
    const result = await prisma.notification.updateMany({
      where: { tenantId, readAt: null },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ ok: true, updated: result.count });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
