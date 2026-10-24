import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { TerceroEnElSistemaDB } from "@/lib/db/tercero-en-el-sistema.db";
import { leerVinculo } from "@/lib/documentos/terceros-vinculo";
import { logger } from "@/lib/logger";

const Query = z.object({
  /** La etiqueta de vínculo de la carpeta (`parte:<id>`, `proveedor:<id>`…). */
  clave: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(80)
    .refine((c) => leerVinculo(c) !== null, "no es un vínculo"),
  /** La carpeta desde la que se pregunta: tiene que estar ligada a esa clave. */
  carpeta: z.string().min(1).max(64),
  /** `nombre` = sólo el nombre (título del plegable cerrado); por defecto, todo. */
  nivel: z.enum(["nombre", "todo"]).default("todo"),
});

/**
 * GET /api/admin/documents/terceros/resumen?clave=&carpeta=[&nivel=nombre] — «De <tercero> en
 * el sistema» del panel de Esenciales: lo que el tercero ligado a la carpeta ya
 * tiene en otros módulos (cuenta, permisos, guías, compras, fiado, papeles), en
 * cifras y con el enlace.
 *
 * Sólo lectura. Tenant del JWT. Sólo responde por un tercero ligado a una
 * carpeta que el rol ve (si no, 404: no sirve para consultar a cualquiera);
 * cada bloque pide el permiso de su módulo (la cuenta = `adelantos`), y DNI/RUC
 * sólo para dueño, admin y encargado (`TerceroEnElSistemaDB`).
 */
export async function GET(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "documents:terceros-resumen");
    if (rl) return rl;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const sp = req.nextUrl.searchParams;
    const parsed = Query.safeParse({ clave: sp.get("clave") ?? "", carpeta: sp.get("carpeta") ?? "", nivel: sp.get("nivel") ?? undefined });
    if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });
    const { clave, carpeta, nivel } = parsed.data;

    if (!(await TerceroEnElSistemaDB.carpetaLigada(auth.tenantId, carpeta, clave, auth.role))) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const resumen =
      nivel === "nombre"
        ? await TerceroEnElSistemaDB.nombre(auth.tenantId, clave, auth.role)
        : await TerceroEnElSistemaDB.resumen(auth.tenantId, auth.role, clave);
    if (!resumen) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(resumen);
  } catch (e) {
    logger.error("[documents.terceros-resumen] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
