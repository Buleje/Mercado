export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

/** GET /api/billing/webhook-queue — return all queue items for the admin UI */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const items = await prisma.stripeWebhookQueue.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        stripeId: true,
        eventType: true,
        attempts: true,
        lastError: true,
        nextRetryAt: true,
        processedAt: true,
        createdAt: true,
      },
    });
    return NextResponse.json(items);
  } catch (e) {
    return NextResponse.json(
      { error: "Error al obtener la cola", detail: e instanceof Error ? e.message : String(e) },
      { status: 503 }
    );
  }
}

/** DELETE /api/billing/webhook-queue?id=<id> — dismiss a stuck event */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  try {
    await prisma.stripeWebhookQueue.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: "No se pudo eliminar", detail: e instanceof Error ? e.message : String(e) },
      { status: 503 }
    );
  }
}
