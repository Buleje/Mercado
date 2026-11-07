import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { respuestaInvalida } from "@/lib/admin/sin-claves";
import { IaProveedoresDB } from "@/lib/db/ia-proveedores.db";
import { noExiste, probarClave, probarSchema, ROLES_IA, soloDuenoOAdminIa } from "../_comun";

/**
 * POST /api/admin/ia/proveedores/probar (Buleje IA, ADR-528) — admin/owner.
 * { proveedor, clave?, configId?, baseUrl? } → ResultadoPrueba
 *
 * Lista los modelos REALES del proveedor (`/models`) con la clave pegada o con
 * la ya guardada (`configId`, del mismo negocio). No guarda la clave; con
 * `configId` anota el resultado en `ultimoEstado`. Rate limit propio: cada
 * prueba es una llamada a un tercero con una clave ajena.
 */

export const POST = withApiHandler("admin-ia-proveedores-probar", async (req: NextRequest) => {
  const rl = await applyRateLimit(req, "MODERATE", "admin-ia-proveedores-probar");
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
  const parsed = probarSchema.safeParse(body);
  if (!parsed.success) {
    const r = respuestaInvalida(parsed.error);
    return NextResponse.json(r.body, { status: r.status });
  }
  const d = parsed.data;

  try {
    if (d.configId) {
      // Ownership: `conClave` filtra por tenantId; un id de otro negocio = 404.
      const guardado = await IaProveedoresDB.conClave(auth.tenantId, d.configId);
      if (!guardado) return noExiste();
      /*
       * La clave guardada solo viaja a la dirección guardada: si se pudiera
       * cambiar `baseUrl` acá, cualquiera con acceso al panel mandaría la
       * clave del negocio a un servidor suyo y la leería. Otra dirección =
       * pegar la clave de nuevo.
       */
      const prueba = d.clave
        ? await probarClave(guardado.config.proveedor, d.clave, d.baseUrl ?? guardado.config.baseUrl)
        : await probarClave(guardado.config.proveedor, guardado.clave, guardado.config.baseUrl);
      if (!d.clave) await IaProveedoresDB.anotarEstado(auth.tenantId, d.configId, prueba.estado);
      return NextResponse.json(prueba);
    }
    if (!d.clave && d.proveedor !== "personalizado") {
      return NextResponse.json({ error: "invalid_body", message: "Pega la clave para probarla." }, { status: 400 });
    }
    if (d.proveedor === "personalizado" && !d.baseUrl) {
      return NextResponse.json({ error: "invalid_body", message: "Falta la dirección del servicio (https://…)." }, { status: 400 });
    }
    return NextResponse.json(await probarClave(d.proveedor, d.clave ?? "", d.baseUrl));
  } catch (err) {
    logger.error("[ia-proveedores.probar] failed", { error: String(err), tenantId: auth.tenantId, proveedor: d.proveedor });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
