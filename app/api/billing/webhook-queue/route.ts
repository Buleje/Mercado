import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { BillingWebhookQueueDB } from "@/lib/db/billing-webhook-queue.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";

/**
 * GET /api/billing/webhook-queue — return all queue items for the admin UI
 * Audit project-wide 2026-05-19: migrado a BillingWebhookQueueDB.
 */
export const GET = withApiHandler("billing-webhook-queue-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const items = await BillingWebhookQueueDB.list();
    return NextResponse.json(items);
  } catch (e) {
    return NextResponse.json(
      { error: "Error al obtener la cola", detail: e instanceof Error ? e.message : String(e) },
      { status: 503 }
    );
  }
});

/** DELETE /api/billing/webhook-queue?id=<id> — dismiss a stuck event.
 * SECURITY 2026-05-06 (pentest billing #4): superadmin-only. Antes admin
 * de tenant A podía borrar evento de pago de tenant B (cola compartida)
 * y bloquear su activación de plan ya pagado.
 */
export const DELETE = withApiHandler("billing-webhook-queue-delete", async (req: NextRequest) => {
  const _rl = await applyRateLimit(req, "MODERATE", "billing-webhook-queue"); if (_rl) return _rl;
  const { requirePlatformAPI } = await import("@/lib/superadmin-auth");
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  try {
    await BillingWebhookQueueDB.deleteById(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "No se pudo eliminar" },
      { status: 503 }
    );
  }
});
