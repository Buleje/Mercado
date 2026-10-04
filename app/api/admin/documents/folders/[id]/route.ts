import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { CarpetaAjenaError, CicloDeCarpetasError, DocumentsDB } from "@/lib/db/documents.db";
import { assertCsrf } from "@/lib/auth/csrf";
import { isPrivilegedRole } from "@/lib/documents/doc-access";
import { logger } from "@/lib/logger";


const PatchBody = z.object({
  name: z.string().min(1).max(80).optional(),
  parentId: z.string().nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  icon: z.string().max(40).nullable().optional(),
  allowedRoles: z.array(z.string().max(30)).max(10).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

const NO_EXISTE = { error: "not_found" } as const;
const PROHIBIDO = { error: "forbidden", message: "Solo el dueño, un admin o el encargado cambian una carpeta con permisos." } as const;

/**
 * Qué puede hacer un rol NO privilegiado con una carpeta (revisión de
 * seguridad 04-10: antes cualquier admin le cambiaba los roles a cualquiera):
 *  · una que no ve → 404, el mismo cuerpo que una que no existe;
 *  · sus permisos (`allowedRoles`) → nunca (403);
 *  · renombrarla, moverla o borrarla si ella o alguna madre tiene roles → 403
 *    (moverla a la raíz, o borrarla, soltaría lo restringido);
 *  · moverla adentro de una carpeta que no ve → 404 `folder_not_found`.
 */
async function guardaDeRol(
  tenantId: string,
  id: string,
  role: string,
  cambio: { permisos?: boolean; estructura?: boolean; nuevoPadre?: string | null },
): Promise<NextResponse | null> {
  if (isPrivilegedRole(role)) return null;
  const acceso = await DocumentsDB.accesoACarpeta(tenantId, id, role);
  if (!acceso.ve) return NextResponse.json(NO_EXISTE, { status: 404 });
  if (cambio.permisos || (cambio.estructura && acceso.restringida)) {
    return NextResponse.json(PROHIBIDO, { status: 403 });
  }
  if (typeof cambio.nuevoPadre === "string" && !(await DocumentsDB.accesoACarpeta(tenantId, cambio.nuevoPadre, role)).ve) {
    return NextResponse.json({ error: "folder_not_found" }, { status: 404 });
  }
  return null;
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "documents:folders:patch");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const parsed = PatchBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
    }

    // Prevenir loops: no permitir parentId === id. Que el padre nuevo no sea una
    // subcarpeta (ciclo) y que sea de ESTE negocio lo decide `updateFolder` en la
    // base, bajo candado: acá antes se leía el árbol entero y un `parentId` de
    // otro tenant pasaba, porque no estaba en el árbol de éste.
    if (parsed.data.parentId === id) {
      return NextResponse.json({ error: "folder_cannot_parent_itself" }, { status: 400 });
    }
    const corte = await guardaDeRol(auth.tenantId, id, auth.role, {
      permisos: parsed.data.allowedRoles !== undefined,
      estructura: parsed.data.name !== undefined || parsed.data.parentId !== undefined,
      nuevoPadre: parsed.data.parentId,
    });
    if (corte) return corte;

    const f = await DocumentsDB.updateFolder(auth.tenantId, id, parsed.data);
    if (!f) return NextResponse.json(NO_EXISTE, { status: 404 });
    return NextResponse.json({ folder: f });

  } catch (e) {
    if (e instanceof CarpetaAjenaError) {
      return NextResponse.json({ error: "folder_not_found" }, { status: 404 });
    }
    if (e instanceof CicloDeCarpetasError) {
      return NextResponse.json({ error: "folder_cannot_be_moved_into_descendant" }, { status: 400 });
    }
    logger.error("[patch] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "documents:folders:delete");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    // `?conDocumentos=1` manda lo que hay adentro a la papelera en vez de
    // soltarlo a la raíz del drive (ver DocumentsDB.eliminarCarpetas).
    const conDocumentos = req.nextUrl.searchParams.get("conDocumentos") === "1";
    const corte = await guardaDeRol(auth.tenantId, id, auth.role, { estructura: true });
    if (corte) return corte;
    const { carpetas, documentos } = await DocumentsDB.eliminarCarpetas(auth.tenantId, [id], {
      conDocumentos,
      viewerRole: auth.role,
    });
    if (carpetas === 0) return NextResponse.json(NO_EXISTE, { status: 404 });
    return NextResponse.json({ ok: true, documentos });

  } catch (e) {
    logger.error("[delete] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
