import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { TenantPiezaDB } from "@/lib/db/tenant-pieza.db";
import { TenantsDB } from "@/lib/db/tenants.db";
import { validarApagado, validarAsignacion } from "@/lib/extensiones/resolver";
import { ENCHUFES } from "@/extensiones/_contrato";

/**
 * PUT /api/superadmin/piezas/asignacion — prende, apaga o reconfigura una
 * pieza para un negocio (ADR-457). ÚNICA vía de escritura de `TenantPieza`.
 *
 * Guardas, en orden: CSRF → sesión de PLATAFORMA → rate STRICT → Zod del
 * cuerpo → pieza que existe en el código + enchufe que llena + opciones que
 * pasan su Zod `.strict()` → negocio que existe.
 *
 * Body: { tenantId, piezaId, enchufe, prendida, opciones?, orden? }
 * 200:  { ok: true, fila: { id, tenantId, piezaId, enchufe, prendida, opciones,
 *                          version, orden, actualizadoPor, createdAt, updatedAt } }
 * 400:  { error: "validation_error" | "pieza_desconocida" | "enchufe_no_soportado"
 *               | "opciones_invalidas", mensaje?, issues? }
 * 404:  { error: "tenant_not_found" }
 *
 * El cliente que llama, tras un 200, debería `broadcastSpecsChanged()` para que
 * los paneles abiertos en el mismo navegador relean sus piezas.
 */
const cuerpoSchema = z
  .object({
    tenantId: z.string().trim().min(1).max(50),
    piezaId: z.string().trim().min(1).max(80),
    enchufe: z.enum(ENCHUFES),
    prendida: z.boolean(),
    opciones: z.record(z.string(), z.unknown()).default({}),
    orden: z.number().int().min(0).max(999).optional(),
  })
  .strict();

export async function PUT(req: NextRequest) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const rl = applyRateLimit(req, "MODERATE", "superadmin-piezas");
  if (rl) return rl;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = cuerpoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
  }
  const { tenantId, piezaId, enchufe, prendida, opciones, orden } = parsed.data;

  /* Apagar sin opciones válidas deja las guardadas como están: una pieza
     apagada no las usa, y exigirlas dejaba la fila sin poder apagarse. */
  const completa = validarAsignacion(piezaId, enchufe, opciones);
  const soloApagar = !prendida && !completa.ok && completa.error === "opciones_invalidas";
  const v = soloApagar ? validarApagado(piezaId, enchufe) : completa;
  if (!v.ok) {
    return NextResponse.json({ error: v.error, mensaje: v.mensaje, ...(v.issues ? { issues: v.issues } : {}) }, { status: v.status });
  }
  const opcionesAGuardar = completa.ok ? completa.opciones : null;

  try {
    const tenant = await TenantsDB.getBasicById(tenantId);
    if (!tenant) return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });

    const actor = `superadmin:${auth.username}`;
    const fila = await TenantPiezaDB.guardar(
      tenantId,
      { piezaId, enchufe, prendida, opciones: opcionesAGuardar, version: v.manifiesto.version, orden },
      actor,
    );

    logActivity(
      prendida ? "pieza_prendida" : "pieza_apagada",
      "TenantPieza",
      `${prendida ? "Prendió" : "Apagó"} la pieza «${v.manifiesto.nombre}» (${piezaId} v${v.manifiesto.version}) ` +
        `en ${enchufe} para ${tenant.slug}`,
      fila.id,
      actor,
      undefined,
      tenantId,
    ).catch((err) => logger.error("[superadmin/piezas/asignacion] activity log failed", { error: String(err) }));

    return NextResponse.json({ ok: true, fila });
  } catch (err) {
    logger.error("[superadmin/piezas/asignacion.PUT] failed", { error: String(err), tenantId, piezaId, enchufe });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
