import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiHandler } from "@/lib/api-handler";
import { applyRateLimitWithTenant, RateLimitPresets } from "@/lib/rate-limit";
import { GuiaThError } from "@/lib/db/guia-th-al-ctp.db";
import { GuiaThPorIngresarDB } from "@/lib/db/guia-th-por-ingresar.db";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";
import { guardGuias } from "../guardadas/guard";

/**
 * «Nuevo ingreso › Desde tu Libro TH» (ADR-481).
 *
 *   GET  [?numero=019-001-0000001] → `{ porIngresar, ingresadas }`: las guías
 *        del Libro TH (emitidas, de trozas) que todavía no entraron al CTP, con
 *        `lista` y `motivo`; `ingresadas` = cuántas ya tienen ingreso.
 *   POST { gtfId } | { gtfNumber } → `{ alistada: { guardadaId, gtfNumber, creada } }`:
 *        la guía queda guardada en el CTP (el mismo pase de «Despachar con
 *        guía») y la pantalla abre «Recibir» con todo relleno. 409/422 con
 *        `{ error, message }` cuando ya entró, ya no está o no va a tu planta.
 *
 * Guard: el de las guías guardadas (admin/almacenero/dueño → CSRF en POST →
 * rate limit → Libro CTP habilitado) + en el POST un límite por negocio. El
 * tenant sale de la sesión.
 */

const Numero = z.string().trim().min(1).max(40);
const Body = z
  .object({
    gtfId: z.string().trim().min(1).max(40).optional(),
    gtfNumber: Numero.optional(),
  })
  .refine((b) => !!b.gtfId || !!b.gtfNumber, { message: "Elige la guía de tu Libro TH." });

function errorDe(err: unknown, ctx: string, tenantId: string): NextResponse {
  if (err instanceof GuiaThError) {
    return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
  }
  return ctpErrorResponse(err, ctx, tenantId);
}

export const GET = withApiHandler("forestal-guias-libro-th-get", async (req: NextRequest) => {
  const g = await guardGuias(req, false);
  if ("res" in g) return g.res;
  const raw = req.nextUrl.searchParams.get("numero");
  const numero = raw ? Numero.safeParse(raw) : null;
  if (numero && !numero.success) {
    return NextResponse.json({ error: "invalid_query", message: "El N° de guía no se entiende." }, { status: 400 });
  }
  try {
    const cruce = await GuiaThPorIngresarDB.listar(g.auth.tenantId, { numero: numero?.data ?? null });
    return NextResponse.json({ porIngresar: cruce.porIngresar, ingresadas: cruce.ingresadas.length });
  } catch (err) {
    return errorDe(err, "guias-libro-th.GET", g.auth.tenantId);
  }
});

export const POST = withApiHandler("forestal-guias-libro-th-post", async (req: NextRequest) => {
  const g = await guardGuias(req, true);
  if ("res" in g) return g.res;
  const rl = applyRateLimitWithTenant(req, "MODERATE", g.auth.tenantId, "guia-th-alistar", RateLimitPresets.MODERATE);
  if (rl) return rl;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: "invalid_body", message: body.error.issues[0]?.message ?? "Elige la guía de tu Libro TH." },
      { status: 400 },
    );
  }
  try {
    const alistada = await GuiaThPorIngresarDB.alistar(g.auth.tenantId, body.data, g.auth.username ?? "unknown");
    return NextResponse.json({ alistada });
  } catch (err) {
    return errorDe(err, "guias-libro-th.POST", g.auth.tenantId);
  }
});
