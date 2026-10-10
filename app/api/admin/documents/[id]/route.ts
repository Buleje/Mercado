import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import { getSignedUrl, deleteFromStorage } from "@/lib/documents/storage";
import { assertCsrf } from "@/lib/auth/csrf";
import { ESTADOS_DOC } from "@/lib/documents/estados-doc";
import { conDescripcionPropia } from "@/lib/documents/texto-buscable";
import { isPrivilegedRole } from "@/lib/documents/doc-access";
import { ROLES_PAPELES_GUIA } from "@/lib/forestal/documentos-guia";

const ROLES_ETIQUETAS_DE_GUIA = new Set<string>(ROLES_PAPELES_GUIA);
const esEtiquetaDeGuia = (t: string) => /^(gtf|casillero):/i.test(t);


const PatchBody = z.object({
  name: z.string().min(1).max(255).optional(),
  folderId: z.string().nullable().optional(),
  category: z.string().max(40).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  favorite: z.boolean().optional(),
  status: z.enum(ESTADOS_DOC).optional(),
  expiresAt: z.string().nullable().optional(),
  // Permisos por documento (roles admin que pueden verlo; vacío = todos).
  allowedRoles: z.array(z.string().max(30)).max(10).optional(),
  // ADR-119 — vincular el documento a una entidad del negocio.
  customerId: z.string().nullable().optional(),
  orderId: z.string().nullable().optional(),
  supplierId: z.string().nullable().optional(),
  // Descripción escrita por una persona: corrige o refuerza a la de la IA y
  // entra al texto buscable, así el archivo aparece por lo que vos dijiste
  // que es. Vacío = borrarla.
  descripcion: z.string().max(2000).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "DRIVE_READ", "documents:get");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const doc = await DocumentsDB.getById(auth.tenantId, id, auth.role);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const signedUrl = await getSignedUrl(doc.storagePath);

    DocumentsDB.log(auth.tenantId, {
      documentId: id,
      actorId: auth.username,
      action: "view",
    }).catch((err) => logger.warn("documents.audit.view_fail", { err: String(err) }));

    return NextResponse.json({ document: doc, signedUrl });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "documents:patch");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const body = await req.json().catch((err) => {
      logger.warn("documents.patch.body_parse_fail", { err: String(err) });
      return {};
    });
    const parsed = PatchBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
    }

    const before = await DocumentsDB.getById(auth.tenantId, id, auth.role);
    if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

    /* Permisos y movimientos (revisión de seguridad 04-10). Un rol no
       privilegiado que VE el papel no puede abrírselo a otros: ni cambiarle los
       roles, ni sacarlo de una carpeta con roles (lo dejaría a la vista de
       quien hoy no lo ve), ni meterlo en una carpeta que no ve (404 igual que
       una que no existe). */
    if (!isPrivilegedRole(auth.role)) {
      const cambiaRoles =
        parsed.data.allowedRoles !== undefined &&
        [...parsed.data.allowedRoles].sort().join("|") !== [...(before.allowedRoles ?? [])].sort().join("|");
      const mueve = parsed.data.folderId !== undefined && parsed.data.folderId !== before.folderId;
      if (cambiaRoles || (mueve && (await DocumentsDB.tieneRoles(auth.tenantId, id)))) {
        return NextResponse.json(
          { error: "forbidden", message: "Solo el dueño, un admin o el encargado cambian quién ve un documento con permisos." },
          { status: 403 },
        );
      }
      if (mueve && parsed.data.folderId && !(await DocumentsDB.accesoACarpeta(auth.tenantId, parsed.data.folderId, auth.role)).ve) {
        return NextResponse.json({ error: "folder_not_found" }, { status: 404 });
      }
    }

    /* Las etiquetas `gtf:`/`casillero:` meten o sacan un papel del casillero de
       una guía (ADR-438): sólo los roles que manejan esos documentos pueden
       tocarlas desde el Drive general. */
    if (parsed.data.tags) {
      const antes = (before.tags ?? []).filter(esEtiquetaDeGuia).sort().join("|");
      const despues = parsed.data.tags.filter(esEtiquetaDeGuia).sort().join("|");
      if (antes !== despues && !ROLES_ETIQUETAS_DE_GUIA.has(auth.role)) {
        return NextResponse.json(
          { error: "forbidden", message: "Solo admin, dueño o almacenero cambian a qué guía pertenece un documento." },
          { status: 403 },
        );
      }
    }

    /* Un papel que queda en el casillero de una guía (factura, GTF, lista…) se
       ve sólo con los roles de la ruta de papeles, venga del modal, del visor
       del Libro TH, del envío por WhatsApp o del CTP: todos suben por POST y
       etiquetan acá. Sin esto, cada GTF archivada quedaba a la vista del cajero
       en el Drive (security 08-10, ADR-482). */
    const tagsFinales = parsed.data.tags ?? before.tags ?? [];
    const rolesFinales = parsed.data.allowedRoles ?? before.allowedRoles ?? [];
    const allowedRoles =
      tagsFinales.some(esEtiquetaDeGuia) && rolesFinales.length === 0
        ? [...ROLES_PAPELES_GUIA]
        : parsed.data.allowedRoles;

    const expiresAtDate =
      parsed.data.expiresAt === undefined
        ? undefined
        : parsed.data.expiresAt === null
        ? null
        : new Date(parsed.data.expiresAt);

    // La descripción propia toca DOS campos: queda guardada aparte (para poder
    // mostrarla y editarla) y se agrega al final del texto buscable, que es
    // contra lo que busca el listado.
    const descripcion = parsed.data.descripcion;
    const metaDesc =
      descripcion === undefined
        ? {}
        : {
            ocrMetadata: {
              ...((before.ocrMetadata ?? {}) as Record<string, unknown>),
              descripcionUsuario: descripcion.trim(),
              descripcionUsuarioAt: new Date().toISOString(),
            },
            ocrText: conDescripcionPropia(before.ocrText, descripcion),
          };

    const updated = await DocumentsDB.update(auth.tenantId, id, {
      ...metaDesc,
      name: parsed.data.name,
      folderId: parsed.data.folderId,
      category: parsed.data.category,
      tags: parsed.data.tags,
      favorite: parsed.data.favorite,
      status: parsed.data.status,
      expiresAt: expiresAtDate,
      allowedRoles,
      customerId: parsed.data.customerId,
      orderId: parsed.data.orderId,
      supplierId: parsed.data.supplierId,
    });

    if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // Audit log selectivo
    const changes: string[] = [];
    if (parsed.data.name && parsed.data.name !== before.name) changes.push("rename");
    if (parsed.data.folderId !== undefined && parsed.data.folderId !== before.folderId) changes.push("move");
    if (parsed.data.tags) changes.push("tag");
    if (descripcion !== undefined) changes.push("tag");
    if (parsed.data.expiresAt !== undefined && parsed.data.expiresAt !== before.expiresAt) changes.push("tag");
    if (
      (parsed.data.customerId !== undefined && parsed.data.customerId !== before.customerId) ||
      (parsed.data.orderId !== undefined && parsed.data.orderId !== before.orderId) ||
      (parsed.data.supplierId !== undefined && parsed.data.supplierId !== before.supplierId)
    ) changes.push("tag");
    for (const action of changes) {
      DocumentsDB.log(auth.tenantId, {
        documentId: id,
        actorId: auth.username,
        action: action as "rename" | "move" | "tag",
        metadata: { from: before, to: updated },
      }).catch((err) => logger.warn("documents.audit.patch_fail", { err: String(err) }));
    }

    return NextResponse.json({ document: updated });

  } catch (e) {
    logger.error("[patch] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "documents:delete");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const purge = req.nextUrl.searchParams.get("purge") === "1";
    // Borrar de verdad es lo único sin vuelta atrás: los mismos roles que
    // vaciar la papelera (`trash/route.ts`). Antes cualquier admin lo hacía.
    if (purge && !isPrivilegedRole(auth.role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const doc = await DocumentsDB.getByIdIncludingDeleted(auth.tenantId, id);
    // Un papel que el rol no ve (también en la papelera) no se puede borrar: 404.
    if (!doc || !(await DocumentsDB.puedeVer(auth.tenantId, id, auth.role, { incluirBorrados: true }))) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (purge) {
      // Hard delete + remove storage objects (incluyendo versiones históricas)
      const paths = [doc.storagePath, ...(await DocumentsDB.listVersionPaths(auth.tenantId, id))];
      await deleteFromStorage(paths).catch((e) => logger.warn("storage_cleanup_fail", { e: String(e) }));
      await DocumentsDB.hardDelete(auth.tenantId, id);
      return NextResponse.json({ ok: true, purged: true });
    }

    const ok = await DocumentsDB.softDelete(auth.tenantId, id);
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });

    DocumentsDB.log(auth.tenantId, {
      documentId: id,
      actorId: auth.username,
      action: "delete",
    }).catch((err) => logger.warn("documents.audit.delete_fail", { err: String(err) }));

    return NextResponse.json({ ok: true });

  } catch (e) {
    logger.error("[delete] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
