import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { DocumentsDB } from "@/lib/db/documents.db";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/documents/folders/bulk — acciones sobre VARIAS carpetas.
 *
 * Antes había que abrir cada carpeta y repetir la misma acción: ponerle el emoji
 * a ocho carpetas eran ocho modales. Un endpoint y no N requests desde el
 * cliente porque el borrado cascada a subcarpetas: mejor una transacción del
 * lado del servidor que ocho carreras entre sí.
 *
 * `emoji: null` y `color: null` LIMPIAN el valor (volver al ícono por defecto).
 * Las etiquetas se SUMAN o se QUITAN, nunca se reemplaza el array: con varias
 * carpetas marcadas, reemplazar borraría las etiquetas propias de cada una.
 */

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("emoji"),
    ids: z.array(z.string().min(1)).min(1).max(200),
    // Un emoji puede ser varios code points (👨‍👩‍👧 = 8): el tope es generoso a
    // propósito, y el `trim()` vacío se traduce a null (limpiar).
    emoji: z.string().max(24).nullable(),
  }),
  z.object({
    action: z.literal("color"),
    ids: z.array(z.string().min(1)).min(1).max(200),
    color: z.string().max(20).nullable(),
  }),
  z.object({
    action: z.literal("addTags"),
    ids: z.array(z.string().min(1)).min(1).max(200),
    tags: z.array(z.string().trim().min(1).max(40)).min(1).max(10),
  }),
  z.object({
    action: z.literal("removeTags"),
    ids: z.array(z.string().min(1)).min(1).max(200),
    tags: z.array(z.string().trim().min(1).max(40)).min(1).max(10),
  }),
  z.object({
    action: z.literal("delete"),
    ids: z.array(z.string().min(1)).min(1).max(200),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "documents:folders:bulk");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    // Borrar carpetas en lote arrastra subcarpetas: no es una acción de operario.
    const auth = await requireAdmin(req, ["admin", "owner"]);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json().catch(() => ({}));
    const parsed = Body.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_body", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
        { status: 400 },
      );
    }
    const d = parsed.data;

    const count = await DocumentsDB.bulkFolders(
      auth.tenantId,
      d.ids,
      d.action === "emoji"
        ? { tipo: "emoji", emoji: d.emoji?.trim() ? d.emoji.trim() : null }
        : d.action === "color"
          ? { tipo: "color", color: d.color?.trim() ? d.color.trim() : null }
          : d.action === "addTags"
            ? { tipo: "addTags", tags: d.tags }
            : d.action === "removeTags"
              ? { tipo: "removeTags", tags: d.tags }
              : { tipo: "delete" },
    );

    logger.info("[documents.folders.bulk] ok", {
      tenantId: auth.tenantId,
      action: d.action,
      pedidas: d.ids.length,
      afectadas: count,
      actor: auth.username,
    });
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    logger.error("[documents.folders.bulk] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
