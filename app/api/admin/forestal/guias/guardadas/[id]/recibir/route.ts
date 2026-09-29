import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiHandler } from "@/lib/api-handler";
import { applyRateLimitWithTenant, RateLimitPresets } from "@/lib/rate-limit";
import { GuiaThAlCtpDB, GuiaThError } from "@/lib/db/guia-th-al-ctp.db";
import { mensajeDeRecibirInvalido, RecibirGuiaThInput } from "@/lib/forestal/guia-th-al-ctp";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";
import { guardGuias } from "../../guard";

/**
 * Recibir una guía que viene del Libro TH del mismo negocio (28-09-2026).
 *
 *   GET  → lo que se va a registrar: un renglón por especie con sus trozas
 *          (código, D1, D2, largo, m³, `trozadoId` y `arbolCodigo`), el total,
 *          el vencimiento de la guía y la `huella` de la lista (ADR-450).
 *   POST RecibirGuiaThInput → registra el ingreso con sus trozas SIN tipear y
 *          lo recepciona con la fecha de llegada que pone quien recibe.
 *          ADR-450: con el `conteo` de TODAS las trozas (la que no llegó entra
 *          «no llegó»; la distinta guarda lo medido en planta) y la `huella`
 *          del GET. 409 `GUIA_CAMBIO` si la lista cambió; 422
 *          `CONTEO_INCOMPLETO` · `NADA_LLEGO` · `FALTANTES_SIN_CONFIRMAR`.
 *
 * Guard: el de las guías guardadas (admin/almacenero/dueño → CSRF en POST →
 * rate limit → Libro CTP habilitado) + en el POST un límite por negocio. El tenant sale de la sesión: la guía del
 * TH, la guardada y el ingreso son del MISMO negocio; nada cruza de tenant.
 */

type Ctx = { params: Promise<{ id: string }> };
const Id = z.string().trim().min(1).max(40);

const noEsta = () =>
  NextResponse.json({ error: "not_found", message: "Esa guía ya no está." }, { status: 404 });

function errorDeRecibir(err: unknown, ctx: string, tenantId: string): NextResponse {
  if (err instanceof GuiaThError) {
    return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
  }
  return ctpErrorResponse(err, ctx, tenantId);
}

export const GET = withApiHandler("forestal-guia-guardada-recibir-get", async (req: NextRequest, ctx: Ctx) => {
  const g = await guardGuias(req, false);
  if ("res" in g) return g.res;
  const id = Id.safeParse((await ctx.params).id);
  if (!id.success) return noEsta();
  try {
    const preparado = await GuiaThAlCtpDB.preparar(g.auth.tenantId, id.data);
    return preparado ? NextResponse.json({ preparado }) : noEsta();
  } catch (err) {
    return errorDeRecibir(err, "guia-guardada-recibir.GET", g.auth.tenantId);
  }
});

export const POST = withApiHandler("forestal-guia-guardada-recibir-post", async (req: NextRequest, ctx: Ctx) => {
  const g = await guardGuias(req, true);
  if ("res" in g) return g.res;
  /* Además del límite de las guías guardadas, uno por negocio: recibir escribe
     el libro entero de una guía. */
  const rl = applyRateLimitWithTenant(req, "MODERATE", g.auth.tenantId, "guia-th-recibir", RateLimitPresets.MODERATE);
  if (rl) return rl;
  const id = Id.safeParse((await ctx.params).id);
  if (!id.success) return noEsta();
  const body = RecibirGuiaThInput.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      /* El mensaje, siempre en español: el de Zod («Too big…») no llega a la pantalla. */
      { error: "invalid_body", message: mensajeDeRecibirInvalido(body.error.issues), issues: body.error.issues },
      { status: 400 },
    );
  }
  try {
    const r = await GuiaThAlCtpDB.recibir(g.auth.tenantId, id.data, body.data, g.auth.username ?? "unknown");
    return r ? NextResponse.json({ recibida: r }, { status: 201 }) : noEsta();
  } catch (err) {
    return errorDeRecibir(err, "guia-guardada-recibir.POST", g.auth.tenantId);
  }
});
