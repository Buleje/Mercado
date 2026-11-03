import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { RUTAS_PANEL } from "@/lib/auth/roles-rutas-panel";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { ctpValidationResponse } from "@/lib/forestal/ctp-api-errors";
import { ForestCtpRespaldoDB } from "@/lib/db/forest-ctp-respaldo.db";
import type { RespaldoCreado } from "@/lib/forestal/ctp-respaldo-tipos";
import { crearRespaldoSchema } from "./esquemas";
import { jsonInvalido, moduloApagado, respuestaDeError } from "./_respuestas";

/**
 * /api/admin/forestal/ctp/respaldos — Respaldos del Libro CTP (ADR-530).
 *
 *  · GET → `RespaldosListado` (sin el contenido: no descomprime nada).
 *  · POST `{ nota? }` → 201 `RespaldoCreado`: guarda una foto del libro entero
 *    a mano. Con los 20 manuales ocupados → 409 `TOPE_MANUALES`.
 */

export const GET = withApiHandler("forestal-ctp-respaldos-lista", async (req: NextRequest) => {
  const auth = await requireAdmin(req, RUTAS_PANEL["/api/admin/forestal/ctp/respaldos"]);
  if (auth instanceof NextResponse) return auth;
  const apagado = await moduloApagado(auth.tenantId);
  if (apagado) return apagado;
  try {
    return NextResponse.json(await ForestCtpRespaldoDB.listar(auth.tenantId));
  } catch (err) {
    return respuestaDeError(err, "ctp.respaldos.GET", auth.tenantId);
  }
});

export const POST = withApiHandler("forestal-ctp-respaldos-crear", async (req: NextRequest) => {
  const auth = await requireAdmin(req, RUTAS_PANEL["POST /api/admin/forestal/ctp/respaldos"]);
  if (auth instanceof NextResponse) return auth;
  /* requireAdmin deja pasar al encargado (manager) siempre: se corta acá. */
  const prohibido = soloAdminODueno(auth.role, "guardar respaldos del libro");
  if (prohibido) return prohibido;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const apagado = await moduloApagado(auth.tenantId);
  if (apagado) return apagado;

  let body: unknown = {};
  const texto = await req.text();
  if (texto.trim()) {
    try {
      body = JSON.parse(texto);
    } catch {
      return jsonInvalido();
    }
  }
  const parsed = crearRespaldoSchema.safeParse(body);
  if (!parsed.success) return ctpValidationResponse(parsed.error);
  try {
    const respaldo = await ForestCtpRespaldoDB.crear(auth.tenantId, "manual", auth.username ?? "unknown", parsed.data.nota || null);
    if (!respaldo) {
      return NextResponse.json({ error: "libro_vacio", message: "El libro está vacío: no hay nada que respaldar." }, { status: 422 });
    }
    return NextResponse.json({ respaldo } satisfies RespaldoCreado, { status: 201 });
  } catch (err) {
    return respuestaDeError(err, "ctp.respaldos.POST", auth.tenantId);
  }
});
