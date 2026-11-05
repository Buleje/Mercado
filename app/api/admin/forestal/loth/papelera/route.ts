import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { MAX_LINEAS_POR_RECUPERO } from "@/lib/forestal/loth-papelera";
import { lothErrorResponse, lothValidationResponse } from "@/lib/forestal/loth-api-errors";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/loth/papelera — lo borrado del Libro TH y su regreso
 * (04-11-2026; `lib/forestal/loth-papelera.ts`).
 *
 *   GET                 → { borrados, total }: agrupados por momento, con quién borró.
 *   POST ?vista=1 {ids} → qué vuelve y qué no, con el texto de la regla (no
 *                         escribe: la misma tx, deshecha).
 *   POST          {ids} → lo devuelve al libro en UNA tx, de la fuente a la salida.
 *
 * Sólo admin/dueño (los mismos que borran). El negocio sale del JWT: un id de
 * otro negocio no se encuentra y se cuenta en `ignoradas`.
 */

const bodySchema = z.object({
  ids: z
    .array(z.string().trim().min(1).max(64))
    .min(1, "Elige al menos una línea.")
    .max(MAX_LINEAS_POR_RECUPERO, `Son más de ${MAX_LINEAS_POR_RECUPERO} líneas: recupera por partes (un momento a la vez).`),
});

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export const GET = withApiHandler("forestal-loth-papelera-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const prohibido = soloAdminODueno(auth.role, "ver la papelera del libro");
  if (prohibido) return prohibido;
  const rl = applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  try {
    return NextResponse.json(await ForestLothDB.listarBorradas(auth.tenantId));
  } catch (err) {
    return lothErrorResponse(err, "loth.papelera.GET", auth.tenantId);
  }
});

export const POST = withApiHandler("forestal-loth-papelera-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const prohibido = soloAdminODueno(auth.role, "recuperar líneas del libro");
  if (prohibido) return prohibido;
  const vista = new URL(req.url).searchParams.get("vista") === "1";
  const rl = vista ? applyRateLimit(req, "GENEROUS", "loth") : applyRateLimit(req, "STRICT", "loth-papelera");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return lothValidationResponse(parsed.error);
  try {
    const r = await ForestLothDB.recuperarLineas(auth.tenantId, parsed.data.ids, auth.username ?? "unknown", {
      simular: vista,
      // Admin/dueño (la ruta ya lo exige): una tala sobre el cupo vuelve sólo con SU motivo de entonces.
      puedeExcederCupo: true,
    });
    if (r.ignoradas === r.pedidas) {
      return NextResponse.json(
        { error: "not_found", message: "Esas líneas no están en la papelera de este negocio (o ya se recuperaron)." },
        { status: 404 },
      );
    }
    return NextResponse.json(r);
  } catch (err) {
    return lothErrorResponse(err, vista ? "loth.papelera.vista" : "loth.papelera.POST", auth.tenantId);
  }
});
