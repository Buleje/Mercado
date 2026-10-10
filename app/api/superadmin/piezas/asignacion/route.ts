import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { PaginaDeOtroNegocioError, TenantPiezaDB } from "@/lib/db/tenant-pieza.db";
import { TenantsDB } from "@/lib/db/tenants.db";
import { REGISTRO_SERVIDOR, validarApagado, validarAsignacion } from "@/lib/extensiones/resolver";
import { ENCHUFE_PAGINA, ENCHUFES } from "@/extensiones/_contrato";

/**
 * PUT /api/superadmin/piezas/asignacion — prende, apaga o reconfigura una
 * pieza para un negocio (ADR-457). Con el DELETE de abajo, ÚNICAS vías de
 * escritura de `TenantPieza`.
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
 * 409:  { error: "pagina_de_otro_negocio", mensaje: "Esta página es de «<negocio>»." }
 *       — una página propia (`tienda.pagina`, ADR-458) es de UN negocio: se
 *       rechaza asignarla (prender o apagar) a otro mientras exista la fila
 *       del primero, aunque esté apagada. Lo decide `TenantPiezaDB.guardar`
 *       en una transacción.
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
    if (err instanceof PaginaDeOtroNegocioError) {
      return NextResponse.json(
        { error: "pagina_de_otro_negocio", mensaje: `Esta página es de «${err.dueno.nombre}».` },
        { status: 409 },
      );
    }
    logger.error("[superadmin/piezas/asignacion.PUT] failed", { error: String(err), tenantId, piezaId, enchufe });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

/**
 * DELETE /api/superadmin/piezas/asignacion — LIBERA una asignación APAGADA
 * (ADR-458): borra la fila del negocio. Sirve para soltar una página propia
 * (y poder dársela a otro negocio) y para limpiar filas apagadas de cualquier
 * pieza, también de piezas que ya no existen en el código.
 *
 * Guardas: CSRF → sesión de PLATAFORMA → rate MODERATE → Zod del cuerpo →
 * negocio que existe. El borrado va en una transacción con el MISMO candado
 * por pieza que la asignación de una página propia.
 *
 * Body: { tenantId, piezaId, enchufe }
 * 200:  { ok: true }
 * 400:  { error: "invalid_json" | "validation_error", issues? }
 * 404:  { error: "tenant_not_found" | "asignacion_no_encontrada" }
 * 409:  { error: "pagina_prendida", mensaje: "Apágala antes de liberarla." }
 */
const liberarSchema = z
  .object({
    tenantId: z.string().trim().min(1).max(50),
    piezaId: z.string().trim().min(1).max(80),
    // Texto y no el enum: una fila vieja puede tener un enchufe que el código ya no tiene.
    enchufe: z.string().trim().min(1).max(80),
  })
  .strict();

export async function DELETE(req: NextRequest) {
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
  const parsed = liberarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
  }
  const { tenantId, piezaId, enchufe } = parsed.data;

  try {
    const tenant = await TenantsDB.getBasicById(tenantId);
    if (!tenant) return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });

    const actor = `superadmin:${auth.username}`;
    const r = await TenantPiezaDB.liberar(tenantId, piezaId, enchufe, actor);
    if (!r.ok) {
      return r.motivo === "prendida"
        ? NextResponse.json({ error: "pagina_prendida", mensaje: "Apágala antes de liberarla." }, { status: 409 })
        : NextResponse.json({ error: "asignacion_no_encontrada" }, { status: 404 });
    }

    const nombre = REGISTRO_SERVIDOR.get(piezaId)?.manifiesto.nombre ?? piezaId;
    const que = enchufe === ENCHUFE_PAGINA ? "la página" : "la pieza";
    logActivity(
      "pieza_liberada",
      "TenantPieza",
      `Liberó ${que} «${nombre}» (${piezaId}, ${enchufe}) de ${tenant.slug}: ya no es de este negocio`,
      `${tenantId}:${piezaId}:${enchufe}`,
      actor,
      undefined,
      tenantId,
    ).catch((err) => logger.error("[superadmin/piezas/asignacion] activity log failed", { error: String(err) }));

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[superadmin/piezas/asignacion.DELETE] failed", { error: String(err), tenantId, piezaId, enchufe });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
