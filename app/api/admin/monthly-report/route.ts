/**
 * GET /api/admin/monthly-report?year=YYYY&month=M[&download=1]
 *
 * Proxy server-side para que admins (UI ReporteMensualTab) generen el reporte
 * mensual SIN exponer CRON_SECRET al cliente.
 *
 * SECURITY 2026-05-09 (round 8 cleanup): antes el cliente leía
 * `process.env.NEXT_PUBLIC_CRON_SECRET_PREVIEW` que (a) terminaba en bundle
 * público si se definiera, (b) nunca se definió → la feature estaba broken.
 * Patrón idéntico a /api/admin/webhook-replay.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

const QuerySchema = z.object({
  year:     z.coerce.number().int().min(2020).max(2100),
  month:    z.coerce.number().int().min(1).max(12),
  download: z.coerce.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "STRICT", "admin-monthly-report");
  if (rl) return rl;

  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = req.nextUrl;
  const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parámetros inválidos", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { year, month, download } = parsed.data;

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error("[admin/monthly-report] CRON_SECRET no configurado");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://${req.headers.get("host") ?? "localhost:3000"}`;
  const qs = new URLSearchParams({ year: String(year), month: String(month) });
  if (download) qs.set("download", "1");

  try {
    const upstream = await fetch(`${baseUrl}/api/cron/monthly-report?${qs.toString()}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });

    logger.info("[admin/monthly-report] generated", {
      tenantId: auth.tenantId,
      username: auth.username,
      year, month, download: !!download,
      status: upstream.status,
    });

    // Pasar cuerpo + content-type tal cual (PDF o JSON).
    const contentType = upstream.headers.get("content-type") ?? "application/json";
    const buf = await upstream.arrayBuffer();
    return new NextResponse(buf, {
      status: upstream.status,
      headers: { "Content-Type": contentType },
    });
  } catch (err) {
    logger.error("[admin/monthly-report] proxy error", {
      error: String(err),
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
