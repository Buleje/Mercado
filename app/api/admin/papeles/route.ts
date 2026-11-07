import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import type { AdminRole } from "@/lib/session";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { PapelesEmitidosDB } from "@/lib/db/papeles-emitidos.db";
import { FiltroPapelesSchema, RegistroPapelSchema } from "@/lib/papeles/registro";

/**
 * /api/admin/papeles — registro de los papeles que emite el programa `papel`
 * (ADR-534): proforma, liquidación, estado de cuenta… con su código del pie y
 * la clave del QR. Sin datos personales. Admin/owner (manager pasa por tier).
 *
 * GET  ?numero=PRO-0002&limite=50 → { papeles }  (sin la clave del QR)
 * POST RegistroPapel → { ok, papel: { numero, codigo, estado }, reemplazados }
 */

const ROLES_PAPELES: readonly AdminRole[] = ["admin", "owner"];

const STATUS: Record<string, number> = { codigo_en_uso: 409, papel_distinto: 409, prefijo_de_otro_negocio: 422, documento_no_existe: 422 };

function invalido(error: z.ZodError): NextResponse {
  const issue = error.issues[0];
  return NextResponse.json(
    {
      error: "invalid_body",
      message: issue?.message ?? "Datos inválidos.",
      campo: issue?.path.join(".") || undefined,
    },
    { status: 400 },
  );
}

export const GET = withApiHandler("admin-papeles-get", async (req: NextRequest) => {
  const rl = await applyRateLimit(req, "GENEROUS", "admin-papeles");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES_PAPELES);
  if (auth instanceof NextResponse) return auth;
  const sp = req.nextUrl.searchParams;
  const parsed = FiltroPapelesSchema.safeParse({
    numero: sp.get("numero") || undefined,
    limite: sp.get("limite") || undefined,
  });
  if (!parsed.success) return invalido(parsed.error);
  try {
    const papeles = await PapelesEmitidosDB.listar(auth.tenantId, parsed.data);
    return NextResponse.json({ papeles });
  } catch (err) {
    logger.error("[papeles.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("admin-papeles-post", async (req: NextRequest) => {
  const rl = await applyRateLimit(req, "GENEROUS", "admin-papeles");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ROLES_PAPELES);
  if (auth instanceof NextResponse) return auth;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body", message: "El cuerpo no es JSON." }, { status: 400 });
  }
  const parsed = RegistroPapelSchema.safeParse(body);
  if (!parsed.success) return invalido(parsed.error);
  try {
    const r = await PapelesEmitidosDB.registrar(auth.tenantId, parsed.data, auth.username ?? "unknown");
    if (!r.ok) return NextResponse.json({ error: r.error, message: r.message }, { status: STATUS[r.error] ?? 400 });
    return NextResponse.json({ ok: true, papel: r.papel, reemplazados: r.reemplazados });
  } catch (err) {
    logger.error("[papeles.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
