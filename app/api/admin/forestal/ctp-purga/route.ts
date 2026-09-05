import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { ForestCtpPurgaDB, type ScopeVaciado } from "@/lib/db/forest-ctp-purga.db";
import { withApiHandler } from "@/lib/api-handler";

/**
 * Vaciar el Libro de Operaciones del CTP — entero o por alcance (Brandon, 2026-09-01).
 *
 * GET  → qué hay (en el alcance elegido) y si se puede borrar (para mostrarlo antes de preguntar).
 * POST → lo vacía. Exige la palabra de confirmación en el body.
 *
 * Sólo `admin`: no es una tarea de cajero ni de almacenero. La confirmación
 * escrita va en el servidor y no sólo en la pantalla, porque un POST a mano no
 * puede saltearse el guard que protege al operador de sí mismo.
 */

const PALABRA = "VACIAR LIBRO";

const SCOPES = ["trozas_disponibles", "madera_disponible", "consumo", "todo"] as const;
const scopeSchema = z.enum(SCOPES).catch("todo");

const bodySchema = z.object({
  /* Literal, no un boolean: un `{confirmar:true}` se manda sin querer; esta
     frase hay que escribirla. */
  confirmacion: z.string().trim(),
  scope: z.enum(SCOPES).optional(),
});

export const GET = withApiHandler("forestal-ctp-purga-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }

  const scope: ScopeVaciado = scopeSchema.parse(new URL(req.url).searchParams.get("scope"));
  const [conteo, periodos] = await Promise.all([
    ForestCtpPurgaDB.contar(auth.tenantId, scope),
    ForestCtpPurgaDB.periodosQueBloquean(auth.tenantId),
  ]);
  return NextResponse.json({ conteo, periodos, sePuede: periodos.length === 0, palabra: PALABRA });
});

export const POST = withApiHandler("forestal-ctp-purga", async (req: NextRequest) => {
  const limite = applyRateLimit(req, "STRICT");
  if (limite) return limite;

  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }
  if (parsed.data.confirmacion.toUpperCase() !== PALABRA) {
    return NextResponse.json(
      { error: "confirmacion_invalida", message: `Escribí «${PALABRA}» para confirmar.` },
      { status: 400 },
    );
  }

  const r = await ForestCtpPurgaDB.vaciar(auth.tenantId, auth.username ?? "admin", parsed.data.scope ?? "todo");
  if (!r.ok) {
    return NextResponse.json({ error: "periodo_cerrado", message: r.motivo, periodos: r.periodos }, { status: 409 });
  }
  return NextResponse.json({ ok: true, borrado: r.borrado });
});
