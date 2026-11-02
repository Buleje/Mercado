import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { respuestaInvalida } from "@/lib/admin/sin-claves";
import { IaProveedoresDB } from "@/lib/db/ia-proveedores.db";
import { CATALOGO_IA } from "@/lib/ia-proveedores/catalogo";
import { resolveLLMRoute } from "@/lib/llm-router";
import { anthropicProvider, groqProvider, xaiProvider } from "@/lib/llm-providers";
import { crearSchema, modeloFaltante, probarClave, ROLES_IA, soloDuenoOAdminIa } from "./_comun";

/**
 * /api/admin/ia/proveedores — los modelos de IA del negocio (Buleje IA, ADR-528).
 * Solo admin/owner. La clave JAMÁS vuelve: solo sus últimos 4 (`claveFinal`).
 *
 * GET  → { catalogo, configurados, plataforma: { disponible, proveedor?, modelo? } }
 * POST { proveedor, nombre?, modelo, modeloVision?, baseUrl?, clave, principal? }
 *      → 201 { proveedor } · prueba la clave antes: clave mala = 422 y no guarda.
 */

export const GET = withApiHandler("admin-ia-proveedores-get", async (req: NextRequest) => {
  const rl = await applyRateLimit(req, "GENEROUS", "admin-ia-proveedores");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES_IA);
  if (auth instanceof NextResponse) return auth;
  try {
    const configurados = await IaProveedoresDB.listar(auth.tenantId);
    const disponible = [groqProvider, xaiProvider, anthropicProvider].some((p) => p.isAvailable());
    const ruta = resolveLLMRoute("balanced");
    return NextResponse.json({
      catalogo: CATALOGO_IA,
      configurados,
      plataforma: disponible ? { disponible, proveedor: ruta.provider, modelo: ruta.model } : { disponible },
    });
  } catch (err) {
    logger.error("[ia-proveedores.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("admin-ia-proveedores-post", async (req: NextRequest) => {
  const rl = await applyRateLimit(req, "MODERATE", "admin-ia-proveedores-alta");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ROLES_IA);
  if (auth instanceof NextResponse) return auth;
  const soloDueno = soloDuenoOAdminIa(auth);
  if (soloDueno) return soloDueno;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body", message: "El cuerpo no es JSON." }, { status: 400 });
  }
  const parsed = crearSchema.safeParse(body);
  if (!parsed.success) {
    const r = respuestaInvalida(parsed.error);
    return NextResponse.json(r.body, { status: r.status });
  }
  const d = parsed.data;
  if (d.proveedor === "personalizado" && !d.baseUrl) {
    return NextResponse.json({ error: "invalid_body", message: "Falta la dirección del servicio (https://…)." }, { status: 400 });
  }

  const prueba = await probarClave(d.proveedor, d.clave, d.baseUrl);
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

  try {
    const proveedor = await IaProveedoresDB.crear(
      auth.tenantId,
      { ...d, ultimoEstado: prueba.estado },
      auth.username ?? "unknown",
    );
    return NextResponse.json({ proveedor, prueba }, { status: 201 });
  } catch (err) {
    logger.error("[ia-proveedores.POST] failed", { error: String(err), tenantId: auth.tenantId, proveedor: d.proveedor });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
