import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { generateStatementToken } from "@/lib/fiado/statement-token";

const Schema = z.object({ customerId: z.string().min(1).max(100) });

/**
 * POST /api/fiados/statement-link
 *
 * Genera un link PÚBLICO firmado del estado de cuenta de un cliente, para que el
 * dueño lo comparta por WhatsApp. Solo admin autenticado puede generarlo. El link
 * no requiere login del cliente pero va firmado (HMAC) → no enumerable.
 * Brandon 2026-06-17 (cierra el gap "estado de cuenta compartible").
 */
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "fiado-statement-link");
  if (_rl) return _rl;

  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "customerId requerido" }, { status: 400 });
  }

  const token = generateStatementToken(auth.tenantId, parsed.data.customerId);
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  return NextResponse.json({ url: `${base}/estado-cuenta/${token}`, token });
}
