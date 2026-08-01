import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { ForestEspeciesFotosDB } from "@/lib/db/forest-especies-fotos.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/especies-fotos — biblioteca de fotos de referencia.
 *
 * GET     — todas las fotos del tenant.
 * POST    — carga o reemplaza la de una especie.
 * DELETE  — la saca por `?especie=`.
 *
 * La imagen NO se sube acá: se sube por `/api/upload` (que valida tipo, tamaño y
 * la redimensiona) y acá se guarda su URL. Un endpoint más que reciba archivos
 * es una superficie más que auditar, y ya hay uno bueno.
 *
 * Guard: requireAdmin → CSRF → rate limit → `spec:forestal:ctp-libro`, la misma
 * que gatea el Libro. Si exigiera otra, la biblioteca se vería y respondería 403.
 */

const saveSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  cientifico: z.string().trim().max(160).nullish(),
  url: z.string().trim().min(1).max(600),
  nota: z.string().trim().max(300).nullish(),
});

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok
    ? null
    : NextResponse.json(
        { error: "specialization_disabled", message: "El Libro CTP no está habilitado para esta tienda." },
        { status: 403 },
      );
}

export const GET = withApiHandler("forestal-especies-fotos-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  try {
    return NextResponse.json({ fotos: await ForestEspeciesFotosDB.list(auth.tenantId) });
  } catch (err) {
    logger.error("[especies-fotos.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-especies-fotos-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }

  try {
    const foto = await ForestEspeciesFotosDB.save(
      auth.tenantId,
      {
        nombre: parsed.data.nombre,
        cientifico: parsed.data.cientifico ?? undefined,
        url: parsed.data.url,
        nota: parsed.data.nota ?? undefined,
      },
      auth.username ?? "unknown",
    );
    // `null` = la URL no es del storage propio. Se rechaza acá y no en la DB
    // class para que el cliente reciba el porqué y no un 500 mudo.
    if (!foto) {
      return NextResponse.json(
        {
          error: "url_no_permitida",
          message: "La imagen tiene que estar subida en el propio sistema (usá el botón de subir).",
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ foto });
  } catch (err) {
    logger.error("[especies-fotos.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("forestal-especies-fotos-delete", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const especie = req.nextUrl.searchParams.get("especie") ?? "";
  if (!especie.trim()) {
    return NextResponse.json({ error: "especie_requerida" }, { status: 400 });
  }

  try {
    const quitada = await ForestEspeciesFotosDB.remove(auth.tenantId, especie, auth.username ?? "unknown");
    return NextResponse.json({ ok: quitada });
  } catch (err) {
    logger.error("[especies-fotos.DELETE] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
