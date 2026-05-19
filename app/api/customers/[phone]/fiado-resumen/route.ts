import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { FiadosDB } from "@/lib/db/fiados.db";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { enqueueActivityLog } from "@/lib/queue";

const PhoneSchema = z.string().min(7).max(20).regex(/^\+?[0-9\- ]+$/, "Teléfono inválido");

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const rl = applyRateLimit(req, "MODERATE", "customers-phone-fiado-resumen");
  if (rl) return rl;

  const { phone } = await params;

  const phoneParsed = PhoneSchema.safeParse(phone);
  if (!phoneParsed.success) {
    return NextResponse.json({ error: "Teléfono inválido" }, { status: 400 });
  }
  const safePhone = phoneParsed.data;

  // SECURITY 2026-05-17 (audit C1): nunca fallback a "main".
  // Lecturas de PII de cliente deben fallar 401 si el JWT no trae tenantId.
  if (!auth.tenantId) {
    return NextResponse.json({ error: "Sesión sin tenant válido" }, { status: 401 });
  }
  const tenantId = auth.tenantId;

  try {
    // Audit 2026-05-17 P1-4: migración a FiadosDB.resumenByCustomer (regla #1).
    const resumen = await FiadosDB.resumenByCustomer(tenantId, safePhone);

    enqueueActivityLog({
      action: "leer",
      resource: "cliente_pii",
      resourceId: safePhone,
      userId: auth.username,
      tenantId,
      details: { description: `Lectura PII cliente ${safePhone.slice(-4)} desde /api/customers/${safePhone}/fiado-resumen` },
      timestamp: new Date().toISOString(),
    }).catch(() => { /* fire-and-forget */ });

    return NextResponse.json(resumen);
  } catch (e) {
    logger.error("[Fiado Resumen]", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json(
      { error: "Error al obtener resumen de fiado" },
      { status: 500 }
    );
  }
}
