import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { isSpecializationEnabled } from "@/lib/specializations";
import { ctpErrorResponse, ctpValidationResponse } from "@/lib/forestal/ctp-api-errors";
import { WoodEntriesPrecioDB } from "@/lib/db/wood-entries-precio.db";
import { logger } from "@/lib/logger";
import { PRECIO_MINIMO_M3 } from "@/lib/forestal/precio-en-tanda";

/**
 * /api/admin/forestal/wood-entries/precio — poner precio a la madera en tanda.
 *
 * GET  → `{ filas, grupos, referencias, truncada }`: las guías vivas (ni
 *        anuladas ni rechazadas, como `balance()` del permiso), agrupadas por
 *        proveedor × especie, con lo que el tenant ya pagó, su plan de manejo
 *        y sus ventas por especie para el detector de dedazos.
 * POST → `{ precios: [{ proveedor, especie, precioM3 }], vistos: [{ id, antes }],
 *          tambienConPrecio?, confirmarAvisos? }`.
 *        200 `{ estado: "hecho", cambios, saltadas, totales }` — los totales
 *        los calcula el servidor sobre las guías bloqueadas, no el cliente.
 *        409 `{ error: "precio_fuera_de_rango", avisos }` si un precio huele a
 *        dedazo y no vino `confirmarAvisos: true`. No escribe nada.
 *
 * Mismos roles que `set_costo` (admin/owner): es plata del libro.
 */

async function ensureSpec(tenantId: string): Promise<NextResponse | null> {
  if (await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro")) return null;
  return NextResponse.json(
    { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." },
    { status: 403 },
  );
}

/** Céntimos, positivo: sin factura el costo es `null`, nunca 0 — y una tanda a S/ 0 es un error. */
const precioSchema = z.object({
  proveedor: z.string().trim().min(1).max(200),
  especie: z.string().trim().min(1).max(120),
  precioM3: z.coerce
    .number()
    /* Un céntimo, no `> 0`: S/ 0,004 se redondea a 0 y guardaría madera regalada. */
    .min(PRECIO_MINIMO_M3, "El precio por m³ tiene que ser de al menos S/ 0.01")
    .max(100_000, "Más de S/ 100 000 el m³ no es un precio de madera"),
});

const ponerPrecioSchema = z.object({
  precios: z.array(precioSchema).min(1).max(500),
  /** Lo que la vista previa mostró: sólo eso se escribe, y sólo si sigue igual. */
  vistos: z
    .array(z.object({ id: z.string().trim().min(1).max(60), antes: z.number().nonnegative().nullable() }))
    .min(1)
    .max(1_000),
  tambienConPrecio: z.boolean().default(false),
  confirmarAvisos: z.boolean().default(false),
});

export const GET = withApiHandler("forestal-wood-entries-precio-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  try {
    return NextResponse.json(await WoodEntriesPrecioDB.vista(auth.tenantId));
  } catch (err) {
    return ctpErrorResponse(err, "wood-entries.precio.GET", auth.tenantId);
  }
});

export const POST = withApiHandler("forestal-wood-entries-precio-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  /* El encargado entra por `requireAdmin`; la plata es sólo de admin/dueño (security 05-10). */
  const rol = soloAdminODueno(auth.role, "cambiar el precio de las guías");
  if (rol) return rol;
  /* Además del de `proxy.ts`: escribe la plata de muchas guías de una vez. */
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "El pedido no es JSON." }, { status: 400 });
  }
  const parsed = ponerPrecioSchema.safeParse(body);
  if (!parsed.success) return ctpValidationResponse(parsed.error);

  try {
    const r = await WoodEntriesPrecioDB.ponerPrecio(auth.tenantId, parsed.data, auth.username ?? "unknown");
    if (r.estado === "avisos") {
      return NextResponse.json(
        {
          error: "precio_fuera_de_rango",
          message: "Algún precio se aleja mucho de lo que sueles pagar. Revísalo y confirma para guardar.",
          avisos: r.avisos,
        },
        { status: 409 },
      );
    }
    logger.info("[wood-entries.precio.POST] tanda", {
      tenantId: auth.tenantId,
      filas: r.totales.filas,
      saltadas: r.saltadas.length,
      actor: auth.username,
    });
    return NextResponse.json(r);
  } catch (err) {
    return ctpErrorResponse(err, "wood-entries.precio.POST", auth.tenantId);
  }
});
