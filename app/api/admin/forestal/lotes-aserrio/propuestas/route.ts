import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { assertCsrf } from "@/lib/auth/csrf";
import { ForestLotePropuestaDB } from "@/lib/db/forest-lote-propuesta.db";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";

/**
 * «Lotes que puedes armar» (Brandon, 2026-09-27).
 *
 * GET  → las propuestas del patio: un lote por especie + permiso con la madera
 *        que ya se puede aserrar, y cuánta espera que recibas su guía.
 * POST → crea uno o varios de esos lotes. El servidor vuelve a armar la
 *        propuesta; los ids que manda la pantalla sólo acotan a «lo que vi».
 *
 * Mismo guard que `/lotes-aserrio` (armar un lote es trabajo de patio:
 * admin, almacenero y dueño) y la misma especialización del libro.
 */

const trozaId = z.string().trim().min(1).max(60);

const postSchema = z.object({
  propuestas: z
    .array(
      z.object({
        especie: z.string().trim().min(1, "Falta la especie del lote").max(120),
        permiso: z.string().trim().max(100).nullish().transform((v) => v || null),
        /* Los topes acompañan a lo que lee el GET (hasta 5000 trozas): con
           500 un grupo grande nunca se podía crear y el error salía en inglés. */
        trozaIds: z.array(trozaId).min(1).max(5000, "Son demasiadas trozas para un solo pedido").optional(),
      }),
    )
    .min(1, "Elige al menos un lote")
    .max(200, "Son demasiados lotes para un solo pedido"),
});

async function guard(req: NextRequest) {
  const rl = await applyRateLimit(req, "GENEROUS", "ctp:lotes-aserrio");
  if (rl) return { error: rl };
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return { error: auth };
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return { error: NextResponse.json({ error: "specialization_disabled" }, { status: 403 }) };
  }
  return { auth };
}

export async function GET(req: NextRequest) {
  let tenantId = "";
  try {
    const g = await guard(req);
    if (g.error) return g.error;
    tenantId = g.auth.tenantId;
    const r = await ForestLotePropuestaDB.leer(tenantId);
    return NextResponse.json(r);
  } catch (e) {
    return ctpErrorResponse(e, "forestal.lotes-aserrio.propuestas.GET", tenantId);
  }
}

export async function POST(req: NextRequest) {
  let tenantId = "";
  try {
    const g = await guard(req);
    if (g.error) return g.error;
    const csrf = assertCsrf(req);
    if (csrf) return csrf;
    tenantId = g.auth.tenantId;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid_json", message: "El pedido no es JSON." }, { status: 400 });
    }
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: parsed.error.issues[0]?.message ?? "Datos inválidos.",
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        { status: 400 },
      );
    }
    const r = await ForestLotePropuestaDB.crear(tenantId, parsed.data.propuestas, g.auth.username ?? "unknown");
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    return ctpErrorResponse(e, "forestal.lotes-aserrio.propuestas.POST", tenantId);
  }
}
