import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { GuiaPlataDB } from "@/lib/db/guia-plata.db";

/**
 * GET /api/admin/forestal/guias/plata/cuenta?parte= — la cuenta del proveedor
 * dentro de «Plata de la guía» (ADR-437 §5, pedido 26-09). Sólo lectura.
 *
 * No es un tercer saldo: neto de `unificarCuentas` (la fila de «Cuenta por
 * persona») + líneas de `estadoCuentaUnificado` (el estado de cuenta del PDF).
 * La parte se valida contra ESTE tenant (IDOR): sin ficha ni movimientos acá → 404.
 */

const LEER = ["admin", "almacenero", "owner"] as const;

const QuerySchema = z.object({ parte: z.string().trim().min(1).max(60) });

export const GET = withApiHandler("forestal-guias-plata-cuenta-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, LEER);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const habilitado = await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro");
  if (!habilitado) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este negocio." },
      { status: 403 },
    );
  }

  const parsed = QuerySchema.safeParse({ parte: req.nextUrl.searchParams.get("parte") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ error: "missing_parte", message: "Falta la persona (?parte=)." }, { status: 400 });
  }

  try {
    const cuenta = await GuiaPlataDB.cuentaDeParte(auth.tenantId, parsed.data.parte);
    if (!cuenta) {
      return NextResponse.json({ error: "not_found", message: "Esa persona no está en este negocio." }, { status: 404 });
    }
    // Sin caché: tras registrar un pago el modal relee y tiene que verlo ya.
    return NextResponse.json(cuenta, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    logger.error("[guias/plata/cuenta.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
