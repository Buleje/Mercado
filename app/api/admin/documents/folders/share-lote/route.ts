import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { DocumentsDB } from "@/lib/db/documents.db";
import { isPrivilegedRole } from "@/lib/documents/doc-access";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/documents/folders/share-lote — los enlaces de VARIAS carpetas
 * de una vez, con los mismos días y la misma clave (Documentos › Esenciales ›
 * «Compartir con un enlace», Brandon 23-10). Es el mismo enlace de siempre por
 * carpeta (`/c/{token}`), creado en una sola llamada: una por carpeta gastaba el
 * tope de 10 cada 15 minutos con un solo envío de 10 carpetas.
 *
 * Mismos permisos que compartir una carpeta: dueño/admin/encargado; un rol
 * restringido recibe 404 si no ve alguna (no se confirma que exista) y 403 si
 * las ve. Si algo falla a mitad, se cortan los que ya se crearon.
 */
const Body = z.object({
  folderIds: z.array(z.string().min(1).max(64)).min(1).max(10),
  expiresInDays: z.number().int().min(1).max(90).optional(),
  password: z.string().min(4).max(120).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const rl = applyRateLimit(req, "STRICT", "documents:folder:share-lote");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const body: unknown = await req.json().catch((err: unknown) => {
      logger.warn("[folder.share-lote] cuerpo sin JSON", { err: String(err) });
      return {};
    });
    const parsed = Body.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    const ids = [...new Set(parsed.data.folderIds)];

    if (!isPrivilegedRole(auth.role)) {
      for (const id of ids) {
        const acceso = await DocumentsDB.accesoACarpeta(auth.tenantId, id, auth.role);
        if (!acceso.ve) return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const existen = await DocumentsDB.carpetasExistentes(auth.tenantId, ids);
    if (ids.some((id) => !existen.has(id))) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const enlaces: { folderId: string; token: string; expiresAt: string }[] = [];
    try {
      for (const folderId of ids) {
        const s = await DocumentsDB.createFolderShare(auth.tenantId, folderId, {
          createdById: auth.username,
          expiresInDays: parsed.data.expiresInDays,
          password: parsed.data.password,
        });
        if (!s) throw new Error(`carpeta ${folderId} no encontrada`);
        enlaces.push({ folderId, token: s.token, expiresAt: s.expiresAt });
      }
    } catch (err) {
      // Un lote a medias no se entrega: los que ya se crearon se cortan.
      for (const e of enlaces) {
        await DocumentsDB.revokeFolderShareByToken(auth.tenantId, e.token).catch((errRev: unknown) =>
          logger.error("[folder.share-lote] no se pudo cortar un enlace del lote", { err: String(errRev) }),
        );
      }
      logger.error("[folder.share-lote] lote a medias", { err: err instanceof Error ? err.message : String(err) });
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }

    const expiresAt = enlaces.map((e) => e.expiresAt).sort()[0];
    return NextResponse.json({ enlaces, expiresAt, hasPassword: !!parsed.data.password });
  } catch (e) {
    logger.error("[folder.share-lote] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
