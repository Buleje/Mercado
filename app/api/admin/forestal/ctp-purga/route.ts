import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { ForestCtpPurgaDB } from "@/lib/db/forest-ctp-purga.db";
import { alcancesDeLaUrl, alcancesSchema, conteoEsperadoSchema } from "@/lib/forestal/ctp-purga-plan";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

/**
 * Vaciar el Libro de Operaciones del CTP — entero o por alcances (Brandon,
 * 2026-09-01; varios a la vez y «Lotes», 2026-10-02).
 *
 * GET  `?scope=trozas_disponibles,lotes` → qué se borraría (la unión, sin
 *      contar dos veces), alcance por alcance, los lotes que no se pueden y
 *      si hay un mes cerrado que lo impide. Para mostrarlo antes de preguntar.
 * POST `{ confirmacion, scopes: [...], esperado }` → lo vacía, todo en una
 *      transacción. `esperado` son las cifras que la vista previa MOSTRÓ: si el
 *      libro de ahora no da lo mismo, 409 `libro_cambio` y no se borra nada.
 *
 * Alcance desconocido, lista vacía o «todo» combinado con otro → 400. Antes un
 * alcance raro caía en «todo» por defecto: sobre esta operación, el valor por
 * defecto tiene que ser «no hacer nada».
 *
 * Sólo `admin` y `owner` (el dueño): no es tarea de encargado, cajero ni
 * almacenero. `requireAdmin` deja pasar a `manager` por el management tier
 * aunque la ruta no lo pida, así que el rol se vuelve a mirar acá. La confirmación
 * escrita va en el servidor y no sólo en la pantalla, porque un POST a mano no
 * puede saltearse el guard que protege al operador de sí mismo.
 */

const PALABRA = "VACIAR LIBRO";

const bodySchema = z.object({
  /* Literal, no un boolean: un `{confirmar:true}` se manda sin querer; esta
     frase hay que escribirla. */
  confirmacion: z.string().trim(),
  scopes: alcancesSchema,
  /* Lo que la vista previa mostró. Obligatorio: el modal es el único cliente. */
  esperado: conteoEsperadoSchema,
});

/** La sesión, si es de admin o del dueño; si no, la respuesta (401/403) tal cual. */
async function adminODueno(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const prohibido = soloAdminODueno(auth.role, "vaciar el Libro de Operaciones");
  if (prohibido) {
    logger.warn("[ctp-purga] rol sin permiso para vaciar el libro", {
      role: auth.role,
      username: auth.username,
      tenantId: auth.tenantId,
      method: req.method,
    });
    return prohibido;
  }
  return auth;
}

export const GET = withApiHandler("forestal-ctp-purga-get", async (req: NextRequest) => {
  const auth = await adminODueno(req);
  if (auth instanceof NextResponse) return auth;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }

  const alcances = alcancesDeLaUrl(new URL(req.url).searchParams);
  if (!alcances.success) {
    return NextResponse.json(
      { error: "alcance_invalido", message: alcances.error.issues[0]?.message, issues: alcances.error.issues },
      { status: 400 },
    );
  }
  const [resumen, periodos] = await Promise.all([
    ForestCtpPurgaDB.contar(auth.tenantId, alcances.data),
    ForestCtpPurgaDB.periodosQueBloquean(auth.tenantId),
  ]);
  return NextResponse.json({ ...resumen, periodos, sePuede: periodos.length === 0, palabra: PALABRA });
});

export const POST = withApiHandler("forestal-ctp-purga", async (req: NextRequest) => {
  const limite = applyRateLimit(req, "STRICT");
  if (limite) return limite;

  const auth = await adminODueno(req);
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
    return NextResponse.json(
      { error: "invalid_body", message: parsed.error.issues[0]?.message, issues: parsed.error.issues },
      { status: 400 },
    );
  }
  if (parsed.data.confirmacion.toUpperCase() !== PALABRA) {
    return NextResponse.json(
      { error: "confirmacion_invalida", message: `Escribe «${PALABRA}» para confirmar.` },
      { status: 400 },
    );
  }

  /* El asiento lleva a la persona de la sesión; nunca un «admin» inventado. */
  const usuario = auth.username?.trim() || (auth.jti ? `sesión ${auth.jti}` : "");
  if (!usuario) {
    return NextResponse.json(
      { error: "unauthorized", message: "La sesión no dice quién eres: vuelve a entrar." },
      { status: 401 },
    );
  }

  const r = await ForestCtpPurgaDB.vaciar(auth.tenantId, usuario, parsed.data.scopes, parsed.data.esperado);
  if (!r.ok) {
    return NextResponse.json({ error: r.codigo, message: r.motivo, periodos: r.periodos }, { status: 409 });
  }
  return NextResponse.json({ ok: true, ...r.resumen });
});
