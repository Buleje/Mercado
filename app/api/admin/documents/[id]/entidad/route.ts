import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import { CustomersDB } from "@/lib/db/customers.db";
import { SuppliersDB } from "@/lib/db/purchases.db";
import { invalidateAdminCache } from "@/lib/admin-cache";
import { etiquetaDeEntidad, leerCartero, type CarteroDocumento } from "@/lib/documentos/cartero";
import type { AdminRole } from "@/lib/session";

/**
 * POST /api/admin/documents/[id]/entidad — la respuesta de una persona al
 * cartero de papeles («¿Es de Ronal?» → Sí / es de otro / de nadie).
 *
 * Body `{ tipo: "cliente"|"proveedor"|"ninguno", id? }` (cliente: `id` = su
 * teléfono, lo que guarda `customerId`). Ata el papel a esa entidad del negocio
 * (y suelta la otra), pone la etiqueta «👤 Nombre» y deja
 * `ocrMetadata.cartero.decidido.por = "usuario"`: el cartero automático no lo
 * vuelve a tocar. `ninguno` suelta los dos y quita las etiquetas «👤 …».
 */

type Ctx = { params: Promise<{ id: string }> };

/** Los mismos que pueden editar un papel (`PATCH /api/admin/documents/[id]`), escritos a la vista. */
const ROLES: readonly AdminRole[] = ["admin", "owner", "manager", "tienda_owner", "cajero", "almacenero", "analista"];

const Body = z.object({
  tipo: z.enum(["cliente", "proveedor", "ninguno"]),
  id: z.string().trim().min(1).max(90).optional(),
});

async function entidadDelNegocio(tenantId: string, tipo: "cliente" | "proveedor", id: string): Promise<{ id: string; nombre: string } | null> {
  if (tipo === "cliente") {
    const c = await CustomersDB.getByPhone(id, tenantId);
    return c ? { id: c.phone, nombre: (c.name || c.phone).trim() } : null;
  }
  const s = await SuppliersDB.getById(tenantId, id);
  return s ? { id: s.id, nombre: (s.name || s.razonSocial || s.id).trim() } : null;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "documents:entidad");
    if (rl) return rl;
    const auth = await requireAdmin(req, ROLES);
    if (auth instanceof NextResponse) return auth;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;

    const { id } = await ctx.params;
    const body = await req.json().catch((err) => {
      logger.warn("documents.entidad.body_parse_fail", { err: String(err) });
      return null;
    });
    const parsed = Body.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
    }
    const { tipo } = parsed.data;
    if (tipo !== "ninguno" && !parsed.data.id) {
      return NextResponse.json({ error: "falta_id", message: "Falta a quién pertenece el papel." }, { status: 400 });
    }

    // Un papel que este rol no ve (o de otro negocio) = no existe.
    const doc = await DocumentsDB.getById(auth.tenantId, id, auth.role);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const previo = leerCartero(doc.ocrMetadata);
    const at = new Date().toISOString();
    let cartero: CarteroDocumento;
    let customerId: string | null = null;
    let supplierId: string | null = null;
    let etiqueta: string | null = null;
    let entidad: { id: string; nombre: string } | null = null;

    if (tipo === "ninguno") {
      cartero = {
        estado: "nadie",
        candidatos: [],
        motivo: "Marcado a mano: no es de ningún cliente ni proveedor.",
        decidido: { tipo: "ninguno", por: "usuario", at },
      };
    } else {
      entidad = await entidadDelNegocio(auth.tenantId, tipo, parsed.data.id as string);
      if (!entidad) {
        return NextResponse.json({ error: "entidad_no_encontrada", message: "Ese cliente o proveedor no es de este negocio." }, { status: 404 });
      }
      if (tipo === "cliente") customerId = entidad.id;
      else supplierId = entidad.id;
      etiqueta = etiquetaDeEntidad(entidad.nombre);
      cartero = {
        estado: "seguro",
        candidatos: previo?.candidatos ?? [],
        motivo: "Elegido a mano.",
        decidido: { tipo, id: entidad.id, nombre: entidad.nombre, por: "usuario", at },
      };
    }

    const documento = await DocumentsDB.guardarCartero(auth.tenantId, id, {
      cartero,
      customerId,
      supplierId,
      etiqueta,
      quitarEtiquetas: true,
    });
    if (!documento) return NextResponse.json({ error: "not_found" }, { status: 404 });
    invalidateAdminCache.afterDocument(auth.tenantId);

    DocumentsDB.log(auth.tenantId, {
      documentId: id,
      actorId: auth.username,
      action: "link",
      metadata: { cartero: true, tipo, entidadId: entidad?.id ?? null, nombre: entidad?.nombre ?? null, antes: previo?.estado ?? null },
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    }).catch((err) => logger.error("[cartero] auditoría de la entidad falló", { error: String(err) }));

    return NextResponse.json({ ok: true, documento });
  } catch (err) {
    logger.error("documents.entidad.fail", { error: String(err) });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
