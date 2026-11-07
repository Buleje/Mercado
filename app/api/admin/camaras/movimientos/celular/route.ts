import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { withApiHandler } from "@/lib/api-handler";
import { createDistributedRateLimiter } from "@/lib/rate-limit";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { fuenteDeMovimientos } from "@/lib/camaras/movimientos-nube.server";
import { SILENCIO_CELULAR_MS } from "@/lib/camaras/vigia-movimientos";
import { cambiarAjustesCelular, celularParaCabecera } from "@/lib/camaras/vigia-movimientos.server";

/**
 * PUT /api/admin/camaras/movimientos/celular — el aviso de movimiento al
 * celular del vigía (`lib/camaras/vigia-movimientos.ts`).
 *
 *   { prendido: boolean } → prende o apaga el aviso (celular y campana) para
 *                           TODO el negocio: sólo admin o dueño.
 *   { silenciar: boolean } → calla 1 h (o reactiva) el celular de quien lo pide.
 *
 * Devuelve `CelularMovimiento` (lo mismo que trae la cabecera en `celular`).
 * Roles = los que reciben el aviso (admin, dueño, almacenero).
 */
const ROLES = ["admin", "owner", "almacenero"] as const;

/* Cupo entre instancias (como la foto y la lista): cada cambio escribe en la base. */
const cupo = createDistributedRateLimiter({
  key: "camaras:movimientos:celular",
  maxRequests: 20,
  windowMs: 60_000,
});

const cuerpoSchema = z
  .object({ prendido: z.boolean().optional(), silenciar: z.boolean().optional() })
  .refine((c) => c.prendido !== undefined || c.silenciar !== undefined, "Falta `prendido` o `silenciar`.");

export const PUT = withApiHandler("camaras-movimientos-celular", async (req: NextRequest) => {
  const auth = await requireAdmin(req, [...ROLES]);
  if (auth instanceof NextResponse) return auth;
  if (!(await cupo.check(`${auth.tenantId}:${auth.username}`)))
    return NextResponse.json(
      { error: "rate_limited", message: "Muchos cambios seguidos. Espera un minuto." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  let crudo: unknown = null;
  try {
    crudo = await req.json();
  } catch {
    crudo = null;
  }
  const c = cuerpoSchema.safeParse(crudo);
  if (!c.success)
    return NextResponse.json(
      { error: "validation_error", message: "Manda `prendido` o `silenciar` (sí o no)." },
      { status: 400 },
    );
  if (c.data.prendido !== undefined) {
    const veto = soloAdminODueno(auth.role, "prender o apagar el aviso de movimiento al celular");
    if (veto) return veto;
  }
  const ahora = Date.now();
  await cambiarAjustesCelular(
    auth.tenantId,
    auth.username,
    {
      prendido: c.data.prendido,
      silencioHasta: c.data.silenciar === undefined ? undefined : c.data.silenciar ? ahora + SILENCIO_CELULAR_MS : 0,
    },
    ahora,
  );
  const fuente = await fuenteDeMovimientos(auth.tenantId);
  const camaras = fuente.ok ? fuente.camaras.map((x) => x.id) : [];
  return NextResponse.json(await celularParaCabecera(auth.tenantId, auth.username, camaras, ahora), {
    headers: { "Cache-Control": "no-store" },
  });
});
