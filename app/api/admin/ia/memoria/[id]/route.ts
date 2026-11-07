import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logAudit } from "@/lib/audit-logger";
import { logger } from "@/lib/logger";
import { AsistenteMemoriaDB, MemoriaDuplicadaError } from "@/lib/db/asistente-memoria.db";
import { TIPOS_MEMORIA } from "@/lib/ia-proveedores/tipos";

/**
 * PATCH / DELETE /api/admin/ia/memoria/[id] (ADR-528). Ownership por tenantId
 * en el WHERE de la DB class: una memoria de otro negocio = 404.
 */

const ROLES = ["admin", "owner"] as const;

const Cambios = z
  .object({
    tipo: z.enum(TIPOS_MEMORIA).optional(),
    titulo: z.string().trim().min(1).max(120).optional(),
    texto: z.string().trim().min(1).max(1000).optional(),
  })
  .refine((c) => c.tipo !== undefined || c.titulo !== undefined || c.texto !== undefined, { message: "sin cambios" });

type Ctx = { params: Promise<{ id: string }> };

const noExiste = () =>
  NextResponse.json({ error: "not_found", message: "Esa memoria ya no existe." }, { status: 404 });

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const rl = applyRateLimit(req, "MODERATE", "ia:memoria:cambio");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const soloDueno = soloAdminODueno(auth.role, "enseñarle datos del negocio al asistente");
  if (soloDueno) return soloDueno;

  const { id } = await params;
  if (!id || id.length > 100) return noExiste();
  const parsed = Cambios.safeParse(await req.json().catch((err) => {
    logger.warn("[ia/memoria] cuerpo no es JSON", { error: String(err) });
    return null;
  }));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", message: "No hay nada que cambiar." }, { status: 400 });
  }
  try {
    const item = await AsistenteMemoriaDB.actualizar(auth.tenantId, id, parsed.data);
    if (!item) return noExiste();
    logAudit({
      req,
      action: "UPDATE",
      entity: "Agent",
      entityId: id,
      detail: `Memoria del asistente «${item.titulo}»`,
      user: auth.username,
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ item });
  } catch (err) {
    if (err instanceof MemoriaDuplicadaError) {
      return NextResponse.json(
        { error: "duplicada", message: `Ya hay otra memoria titulada «${err.titulo}».` },
        { status: 409 },
      );
    }
    logger.error("[ia/memoria] editar falló", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "internal_error", message: "No se pudo guardar ahora." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const rl = applyRateLimit(req, "MODERATE", "ia:memoria:olvidar");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const soloDueno = soloAdminODueno(auth.role, "enseñarle datos del negocio al asistente");
  if (soloDueno) return soloDueno;

  const { id } = await params;
  if (!id || id.length > 100) return noExiste();
  try {
    const antes = await AsistenteMemoriaDB.obtener(auth.tenantId, id);
    if (!antes) return noExiste();
    const ok = await AsistenteMemoriaDB.olvidar(auth.tenantId, id);
    if (!ok) return noExiste();
    logAudit({
      req,
      action: "DELETE",
      entity: "Agent",
      entityId: id,
      detail: `Memoria del asistente olvidada «${antes.titulo}»: ${antes.texto.slice(0, 200)}`,
      user: auth.username,
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[ia/memoria] olvidar falló", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "internal_error", message: "No se pudo olvidar ahora." }, { status: 500 });
  }
}
