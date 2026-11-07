import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit, applyRateLimitWithTenant } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";
import { esEsperaDeLockVencida } from "@/lib/errores/codigo-pg";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { lothErrorResponse, lothValidationResponse } from "@/lib/forestal/loth-api-errors";
import { pedidoDeshacerSchema } from "@/lib/forestal/loth-importar-guia-esquemas";
import { ImportacionEnCursoError } from "@/lib/db/forest-loth-importar.db";
import { DeshacerRechazadoError, ForestLothDeshacerImportacionDB } from "@/lib/db/forest-loth-importar-deshacer.db";
import type { RespuestaDeshacer } from "@/lib/forestal/loth-importar-guia-tipos";

/**
 * «Deshacer la importación» de una guía del Libro TH (ADR-461 §12).
 *
 *   GET  ?gtfId=…  — qué se deshace (guía, despachos, trozados, talas, permiso)
 *                    y, si no se puede, por qué (`bloqueo`). No escribe.
 *   POST { gtfId, motivo } — lo deshace en UNA transacción (`RespuestaDeshacer`).
 *
 * Sólo para guías que asentó el importador: una guía emitida por el TH se
 * anula con «Anular» y su 409 del Libro CTP sigue igual.
 *
 * Guard: requireAdmin → sólo admin o dueño (`soloAdminODueno`: el encargado
 * pasa `requireAdmin` igual) → rate limit (POST: también por negocio) →
 * spec:forestal:loth-libro. Una guía de otro negocio → 404 (el tenant va en el WHERE).
 */

const querySchema = z.object({ gtfId: z.string().trim().min(1).max(64) });

async function guardia(req: NextRequest, escribe: boolean) {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const prohibido = soloAdminODueno(auth.role, "deshacer la importación de una guía");
  if (prohibido) return prohibido;
  const rl = escribe
    ? applyRateLimitWithTenant(req, "MODERATE", auth.tenantId, "loth-importar-deshacer", { maxReqs: 60, windowSec: 60 * 60 })
    : applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"))) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "El Libro de Títulos Habilitantes no está habilitado para este negocio." },
      { status: 403 },
    );
  }
  return auth;
}

/** Otra escritura tiene el N° de la guía más de 15 s (`lock_timeout` LOCAL): 409, no un 500. */
const libroOcupado = (queNo: string) =>
  NextResponse.json(
    { error: "libro_ocupado", message: `El Libro TH está ocupado con otra escritura de esta guía: vuelve a intentar en un momento. ${queNo}.` },
    { status: 409 },
  );

const noEsta = () =>
  NextResponse.json({ error: "not_found", message: "Esa guía no está en el Libro TH de este negocio." }, { status: 404 });

export const GET = withApiHandler("forestal-loth-importar-guia-deshacer-get", async (req: NextRequest) => {
  const auth = await guardia(req, false);
  if (auth instanceof Response) return auth;
  const q = querySchema.safeParse({ gtfId: req.nextUrl.searchParams.get("gtfId") ?? "" });
  if (!q.success) return lothValidationResponse(q.error);
  try {
    const deshacer = await ForestLothDeshacerImportacionDB.deshacer(auth.tenantId, q.data.gtfId, null);
    if (!deshacer) return noEsta();
    return NextResponse.json({ deshacer } satisfies RespuestaDeshacer);
  } catch (err) {
    if (esEsperaDeLockVencida(err)) return libroOcupado("No se pudo revisar");
    return lothErrorResponse(err, "loth-importar-guia.deshacer.GET", auth.tenantId);
  }
});

export const POST = withApiHandler("forestal-loth-importar-guia-deshacer-post", async (req: NextRequest) => {
  const auth = await guardia(req, true);
  if (auth instanceof Response) return auth;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "El pedido no es un JSON válido." }, { status: 400 });
  }
  const parsed = pedidoDeshacerSchema.safeParse(body);
  if (!parsed.success) return lothValidationResponse(parsed.error);
  try {
    const deshacer = await ForestLothDeshacerImportacionDB.deshacer(auth.tenantId, parsed.data.gtfId, {
      motivo: parsed.data.motivo,
      user: auth.username ?? "unknown",
    });
    if (!deshacer) return noEsta();
    return NextResponse.json({ deshacer } satisfies RespuestaDeshacer);
  } catch (err) {
    if (err instanceof ImportacionEnCursoError) {
      return NextResponse.json({ error: "importacion_en_curso", message: err.message }, { status: 409 });
    }
    if (err instanceof DeshacerRechazadoError) {
      return NextResponse.json({ error: err.codigo, message: err.message, libroNros: err.libroNros }, { status: 409 });
    }
    if (esEsperaDeLockVencida(err)) return libroOcupado("No se deshizo nada");
    return lothErrorResponse(err, "loth-importar-guia.deshacer.POST", auth.tenantId);
  }
});
