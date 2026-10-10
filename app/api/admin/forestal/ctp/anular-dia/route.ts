import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { RUTAS_PANEL } from "@/lib/auth/roles-rutas-panel";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { isSpecializationEnabled } from "@/lib/specializations";
import {
  AnularDiaError,
  anularDiaSchema,
  ESTADO_HTTP_ANULAR_DIA,
  previaAnularDiaSchema,
} from "@/lib/forestal/anular-dia-produccion";
import { ctpErrorResponse, ctpValidationResponse } from "@/lib/forestal/ctp-api-errors";
import { ForestCtpAnularDiaDB } from "@/lib/db/forest-ctp-anular-dia.db";

/**
 * /api/admin/forestal/ctp/anular-dia — anular lo declarado en UN día de
 * producción (2026-09-23).
 *
 *  · GET `?dia=AAAA-MM-DD` → `PreviaAnularDia`: qué se anularía (con los
 *    números del casillero) y qué corrida lo impide, para decirlo ANTES de
 *    pedir confirmación.
 *  · POST `{ dia, ids, motivo }` → `RespuestaAnularDia`: anula todas o ninguna,
 *    en una transacción (`ForestCtpAnularDiaDB.anular`).
 *
 * Los mismos roles que anular una fila del libro (PATCH `action: "annul"` de
 * `/api/admin/forestal/ctp`): admin y owner; manager entra por el bypass de
 * gestión de `requireAdmin`. El almacenero registra pero no anula. El array
 * vive en `RUTAS_PANEL` para que la tira decida con el MISMO (`puedePedir`).
 *
 * 400 pedido mal armado · 404 el día ya no tiene nada · 409 el día cambió o
 * alguna corrida tiene movimientos (`detail.corridas`) · 422 mes cerrado. Los
 * errores del negocio van `{ error: <código>, message, detail? }`, como el
 * resto del libro.
 */

async function moduloApagado(tenantId: string): Promise<NextResponse | null> {
  if (await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro")) return null;
  return NextResponse.json(
    {
      error: "specialization_disabled",
      message: "El módulo CTP no está habilitado para este tenant.",
    },
    { status: 403 },
  );
}

function respuestaDeError(err: unknown, ctx: string, tenantId: string): NextResponse {
  if (err instanceof AnularDiaError) {
    return NextResponse.json(
      { error: err.code, message: err.message, ...(err.detail ? { detail: err.detail } : {}) },
      { status: ESTADO_HTTP_ANULAR_DIA[err.code] },
    );
  }
  return ctpErrorResponse(err, ctx, tenantId);
}

export const GET = withApiHandler("forestal-ctp-anular-dia-previa", async (req: NextRequest) => {
  const auth = await requireAdmin(req, RUTAS_PANEL["/api/admin/forestal/ctp/anular-dia"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const apagado = await moduloApagado(auth.tenantId);
  if (apagado) return apagado;

  const parsed = previaAnularDiaSchema.safeParse({
    dia: new URL(req.url).searchParams.get("dia") ?? "",
  });
  if (!parsed.success) return ctpValidationResponse(parsed.error);
  try {
    return NextResponse.json(await ForestCtpAnularDiaDB.previa(auth.tenantId, parsed.data.dia));
  } catch (err) {
    return respuestaDeError(err, "ctp.anular-dia.GET", auth.tenantId);
  }
});

export const POST = withApiHandler("forestal-ctp-anular-dia", async (req: NextRequest) => {
  const auth = await requireAdmin(req, RUTAS_PANEL["/api/admin/forestal/ctp/anular-dia"]);
  if (auth instanceof NextResponse) return auth;
  /* Además del de `proxy.ts`: saca del libro todo un día de producción. */
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const apagado = await moduloApagado(auth.tenantId);
  if (apagado) return apagado;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "El pedido no es JSON." },
      { status: 400 },
    );
  }
  const parsed = anularDiaSchema.safeParse(body);
  if (!parsed.success) return ctpValidationResponse(parsed.error);
  try {
    return NextResponse.json(
      await ForestCtpAnularDiaDB.anular(auth.tenantId, parsed.data, auth.username ?? "unknown"),
    );
  } catch (err) {
    return respuestaDeError(err, "ctp.anular-dia.POST", auth.tenantId);
  }
});
