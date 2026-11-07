import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { respuestaInvalida } from "@/lib/admin/sin-claves";
import { IaProveedoresDB } from "@/lib/db/ia-proveedores.db";
import type { EstadoProveedorIa } from "@/lib/ia-proveedores/tipos";
import { editarSchema, idValido, modeloFaltante, noExiste, probarClave, ROLES_IA, soloDuenoOAdminIa } from "../_comun";

/**
 * /api/admin/ia/proveedores/[id] (Buleje IA, ADR-528) — admin/owner.
 * PATCH { nombre?, modelo?, modeloVision?, baseUrl?, clave?, principal?, activo? } → { proveedor }
 *   Si cambia la clave, la dirección o el modelo, se vuelve a probar (clave mala = 422).
 *   Cambiar la dirección exige pegar la clave otra vez: la guardada no viaja a otra URL.
 * DELETE → { ok: true }. Un id de otro negocio = 404.
 */

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withApiHandler("admin-ia-proveedor-patch", async (req: NextRequest, ctx: Ctx) => {
  const rl = await applyRateLimit(req, "MODERATE", "admin-ia-proveedores-alta");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ROLES_IA);
  if (auth instanceof NextResponse) return auth;
  const soloDueno = soloDuenoOAdminIa(auth);
  if (soloDueno) return soloDueno;
  const id = idValido((await ctx.params).id);
  if (!id) return noExiste();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body", message: "El cuerpo no es JSON." }, { status: 400 });
  }
  const parsed = editarSchema.safeParse(body);
  if (!parsed.success) {
    const r = respuestaInvalida(parsed.error);
    return NextResponse.json(r.body, { status: r.status });
  }
  const d = parsed.data;

  try {
    const guardado = await IaProveedoresDB.conClave(auth.tenantId, id);
    if (!guardado) return noExiste();
    const { config } = guardado;

    const cambiaUrl = d.baseUrl !== undefined && (d.baseUrl || null) !== config.baseUrl;
    if (cambiaUrl && !d.clave) {
      return NextResponse.json(
        { error: "falta_clave", message: "Para cambiar la dirección, pega la clave de nuevo." },
        { status: 400 },
      );
    }
    if (config.proveedor === "personalizado" && d.baseUrl === null) {
      return NextResponse.json({ error: "invalid_body", message: "El personalizado necesita su dirección (https://…)." }, { status: 400 });
    }

    let ultimoEstado: EstadoProveedorIa | undefined;
    if (d.clave || cambiaUrl || d.modelo || d.modeloVision) {
      const prueba = await probarClave(
        config.proveedor,
        d.clave ?? guardado.clave,
        d.baseUrl !== undefined ? d.baseUrl : config.baseUrl,
      );
      if (prueba.estado === "clave_invalida" || prueba.estado === "sin_permiso") {
        return NextResponse.json({ error: prueba.estado, message: prueba.mensaje, prueba }, { status: 422 });
      }
      const falta = modeloFaltante(prueba, d.modelo, d.modeloVision);
      if (falta) {
        return NextResponse.json(
          { error: "modelo_no_disponible", message: `«${falta}» no está entre los modelos de tu cuenta. Elige uno de la lista.`, prueba },
          { status: 422 },
        );
      }
      ultimoEstado = prueba.estado;
    }

    const proveedor = await IaProveedoresDB.actualizar(
      auth.tenantId,
      id,
      { ...d, ...(ultimoEstado ? { ultimoEstado } : {}) },
      auth.username ?? "unknown",
    );
    return proveedor ? NextResponse.json({ proveedor }) : noExiste();
  } catch (err) {
    logger.error("[ia-proveedores.PATCH] failed", { error: String(err), tenantId: auth.tenantId, id });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("admin-ia-proveedor-delete", async (req: NextRequest, ctx: Ctx) => {
  const rl = await applyRateLimit(req, "MODERATE", "admin-ia-proveedores-alta");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ROLES_IA);
  if (auth instanceof NextResponse) return auth;
  const soloDueno = soloDuenoOAdminIa(auth);
  if (soloDueno) return soloDueno;
  const id = idValido((await ctx.params).id);
  if (!id) return noExiste();
  try {
    const ok = await IaProveedoresDB.borrar(auth.tenantId, id, auth.username ?? "unknown");
    return ok ? NextResponse.json({ ok: true }) : noExiste();
  } catch (err) {
    logger.error("[ia-proveedores.DELETE] failed", { error: String(err), tenantId: auth.tenantId, id });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
