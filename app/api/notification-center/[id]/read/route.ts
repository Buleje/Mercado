export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/notification-center/[id]/read
 *
 * Marca una notificación específica como leída.
 */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const notification = await prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ ok: true, notification });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // If the record doesn't exist, Prisma throws P2025
    const status = message.includes("Record to update not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
