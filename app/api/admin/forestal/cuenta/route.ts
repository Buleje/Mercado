import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import {
  CargoDeCorridaError,
  ForestCuentaDB,
  FleteYaCargadoError,
  GuiaCobradaPorCubicacionError,
  GuiaYaAnotadaError,
  MaderaDeGuiaError,
  MovimientoDeCubicacionError,
  MovimientoDeLiquidacionError,
} from "@/lib/db/forest-cuenta.db";
import { CONCEPTOS_MANUALES, movimientoInputSchema } from "@/lib/forestal/cuenta-corriente";

/**
 * /api/admin/forestal/cuenta — cuenta corriente con las partes (ADR-322).
 * GET lista (`parte` filtra) · POST alta/edición · DELETE baja lógica (`?id=`).
 * Guard: `spec:forestal:ctp-libro` · rate-limit GENEROUS bucket 'ctp'.
 */

async function guard(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok
    ? null
    : NextResponse.json(
        { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." },
        { status: 403 },
      );
}

export const GET = withApiHandler("forestal-cuenta-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const g = await guard(auth.tenantId);
  if (g) return g;
  try {
    const movimientos = await ForestCuentaDB.listar(auth.tenantId, {
      parteId: req.nextUrl.searchParams.get("parte")?.trim() || undefined,
    });
    return NextResponse.json({ movimientos });
  } catch (err) {
    logger.error("[cuenta.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

/* Sólo los conceptos que se anotan a mano (ADR-437 §5):
   · `compensacion` — un cruce con adelantos (ADR-413) lo escribe una
     liquidación: anotado a mano le falta la otra pata.
   · `adelanto` — la plata adelantada vive en Adelantos; anotada también acá
     se contaría dos veces en «Cuenta por persona». */
const MOTIVO_NO_MANUAL: Partial<Record<string, string>> = {
  compensacion: "Un cruce con adelantos se hace desde «Liquidar cuenta»: anotado a mano le falta la otra pata.",
  adelanto: "Un adelanto se anota en Adelantos: anotado también acá se contaría dos veces en la cuenta de la persona.",
};
const postSchema = movimientoInputSchema
  .extend({ id: z.string().trim().max(40).optional() })
  .superRefine((d, ctx) => {
    if (CONCEPTOS_MANUALES.includes(d.concepto)) return;
    ctx.addIssue({
      code: "custom",
      message: MOTIVO_NO_MANUAL[d.concepto] ?? "Ese concepto no se anota a mano.",
      path: ["concepto"],
    });
  });

/** La venta de una guía: dos movimientos en un acto, idempotente por N° de guía. */
const ventaGuiaSchema = z.object({
  accion: z.literal("venta_guia"),
  parteId: z.string().trim().min(1).max(40),
  parteNombre: z.string().trim().min(1).max(200),
  fecha: z.string().trim().min(10).max(10),
  gtfNumber: z.string().trim().min(1).max(80),
  total: z.number().positive().max(9_999_999),
  cobrado: z.number().min(0).max(9_999_999).optional(),
  notas: z.string().trim().max(500).optional(),
});

export const POST = withApiHandler("forestal-cuenta-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const g = await guard(auth.tenantId);
  if (g) return g;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  /* La venta de una guía entra por el mismo POST: es un movimiento de la misma
     cuenta, sólo que el servidor arma las dos patas y las hace idempotentes. */
  const venta = ventaGuiaSchema.safeParse(body);
  if (venta.success) {
    try {
      const r = await ForestCuentaDB.anotarVentaDeGuia(auth.tenantId, venta.data, auth.username ?? "unknown");
      return NextResponse.json(r);
    } catch (err) {
      if (err instanceof GuiaYaAnotadaError) {
        const codigo = err instanceof GuiaCobradaPorCubicacionError ? "guia_cobrada_por_cubicacion" : "guia_ya_anotada";
        return NextResponse.json({ error: codigo, message: err.message }, { status: 409 });
      }
      if (err instanceof Error && /tiene que|obligatoria/.test(err.message)) {
        return NextResponse.json({ error: "validation_error", message: err.message }, { status: 422 });
      }
      logger.error("[cuenta.POST.venta] failed", { error: String(err), tenantId: auth.tenantId });
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    /* `message` = la primera causa en palabras: la pantalla muestra `message` y,
       sin él, sólo «No se pudo guardar el movimiento». 400: el cuerpo no es un
       movimiento que se pueda anotar (mismo código que `invalid_json`). */
    const issues = parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return NextResponse.json(
      { error: "validation_error", message: issues[0]?.message ?? "Datos inválidos.", issues },
      { status: 400 },
    );
  }
  try {
    const movimiento = await ForestCuentaDB.guardar(auth.tenantId, parsed.data, auth.username ?? "unknown");
    return NextResponse.json({ movimiento });
  } catch (err) {
    if (err instanceof FleteYaCargadoError) {
      return NextResponse.json({ error: "flete_ya_cargado", message: err.message }, { status: 409 });
    }
    /* El cargo de una corrida (ADR-412) se corrige desde la corrida. */
    if (err instanceof CargoDeCorridaError) {
      return NextResponse.json({ error: "cargo_de_corrida", message: err.message }, { status: 409 });
    }
    /* Una pata de una liquidación (ADR-413) se corrige anulando la liquidación. */
    if (err instanceof MovimientoDeLiquidacionError) {
      return NextResponse.json({ error: "movimiento_de_liquidacion", message: err.message }, { status: 409 });
    }
    /* Una pata de una cubicación aplicada (ADR-484) se corrige anulando la cubicación. */
    if (err instanceof MovimientoDeCubicacionError) {
      return NextResponse.json({ error: "movimiento_de_cubicacion", message: err.message, codigo: err.codigo }, { status: 409 });
    }
    /* El abono de madera de una guía (ADR-437 §4) se corrige desde la guía. */
    if (err instanceof MaderaDeGuiaError) {
      return NextResponse.json({ error: "madera_de_guia", message: err.message, gtfNumber: err.gtfNumber }, { status: 409 });
    }
    if (err instanceof Error && err.message.startsWith("La fecha")) {
      return NextResponse.json({ error: "fecha_invalida", message: err.message }, { status: 422 });
    }
    logger.error("[cuenta.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("forestal-cuenta-delete", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const g = await guard(auth.tenantId);
  if (g) return g;
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  try {
    const ok = await ForestCuentaDB.eliminar(auth.tenantId, id, auth.username ?? "unknown");
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof CargoDeCorridaError) {
      return NextResponse.json({ error: "cargo_de_corrida", message: err.message }, { status: 409 });
    }
    if (err instanceof MovimientoDeLiquidacionError) {
      return NextResponse.json({ error: "movimiento_de_liquidacion", message: err.message }, { status: 409 });
    }
    /* Una pata de una cubicación aplicada (ADR-484) se corrige anulando la cubicación. */
    if (err instanceof MovimientoDeCubicacionError) {
      return NextResponse.json({ error: "movimiento_de_cubicacion", message: err.message, codigo: err.codigo }, { status: 409 });
    }
    if (err instanceof MaderaDeGuiaError) {
      return NextResponse.json({ error: "madera_de_guia", message: err.message, gtfNumber: err.gtfNumber }, { status: 409 });
    }
    logger.error("[cuenta.DELETE] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
