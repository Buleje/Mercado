import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { DocumentosMovimientosDB } from "@/lib/db/documentos-movimientos.db";
import { logger } from "@/lib/logger";

type Ctx = { params: Promise<{ id: string }> };

const Query = z.object({
  id: z.string().min(1).max(64),
  /** Cursor de «Ver más»: lo de antes de esta fecha. */
  antes: z.string().datetime().optional(),
  limite: z.coerce.number().int().min(1).max(50).optional(),
});

/**
 * GET /api/admin/documents/folders/[id]/movimientos — «Movimientos» del panel
 * de Esenciales: lo que pasó con los papeles de la carpeta y sus subcarpetas
 * (subir, abrir, mover, renombrar, papelera…), de lo más nuevo a lo más viejo.
 *
 * Sólo lectura. Tenant del JWT; una carpeta que el rol no ve da 404 (no se
 * distingue de una que no existe); sólo papeles que el rol puede abrir; sin
 * usuario, IP ni metadata cruda (Ley 29733, `DocumentosMovimientosDB`).
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "DRIVE_READ", "documents:folder-movimientos");
    if (rl) return rl;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const sp = req.nextUrl.searchParams;
    const parsed = Query.safeParse({
      id: (await ctx.params).id,
      antes: sp.get("antes") ?? undefined,
      limite: sp.get("limite") ?? undefined,
    });
    if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });

    const { id, antes, limite } = parsed.data;
    const r = await DocumentosMovimientosDB.deCarpeta(
      auth.tenantId,
      id,
      { role: auth.role, username: auth.username },
      { antes: antes ? new Date(antes) : undefined, limite },
    );
    if (!r.existe) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ movimientos: r.movimientos, siguiente: r.siguiente });
  } catch (e) {
    logger.error("[documents.folder-movimientos] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
