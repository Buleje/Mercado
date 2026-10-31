import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { aplicarPlan, armarPlan, deshacerOrden } from "@/lib/documents/ordenar-servidor";

/**
 * «Ordenar mi Archivo»: nombres claros, basura a la papelera, carpetas vacías,
 * repetidos y lo que la IA ya sugirió.
 *
 * - `plan`: la lista de propuestas (nada se escribe). `duplicados: false` es la
 *   versión barata del aviso del Archivo (no baja archivos para compararlos).
 * - `aplicar`: recalcula el plan ACÁ y aplica sólo los ids elegidos que siguen
 *   en él. Los papeles van a la papelera (nunca se borran del todo); las
 *   carpetas vacías SÍ se borran (no hay papelera de carpetas): `deshacer` las
 *   vuelve a crear.
 * - `deshacer`: vuelve atrás lo que devolvió `aplicar`. Llega del cliente y no
 *   se le cree: cada paso es uno que el panel ya permite a ese rol hoy y sólo
 *   se revierte lo que sigue como el orden lo dejó. El cliente lo manda en
 *   tandas (`POR_TANDA_DESHACER`).
 */

const Ids = z.array(z.string().min(1).max(80)).max(500);
/** Por lista y por pedido: el cliente parte el «Deshacer» en tandas de 100. */
const TOPE_DESHACER = 200;
const Descartadas = z.array(z.string().min(1).max(40)).max(500).optional();

const Id = z.string().min(1).max(40);
/** ISO; lo que no es fecha se ignora al revertir. */
const Fecha = z.string().max(40);

const Carpeta = z.object({
  id: Id,
  // Las de un import pueden pasar los 80 del formulario: se recorta al recrear, no se rechaza.
  name: z.string().trim().min(1).max(1000),
  parentId: Id.nullable(),
  color: z.string().max(40).nullable(),
  icon: z.string().max(40).nullable(),
  emoji: z.string().max(32).nullable(),
  tags: z.array(z.string().max(40)).max(20),
  allowedRoles: z.array(z.string().max(40)).max(20),
  creadaEn: z.string().max(40).optional(),
});

const Body = z.discriminatedUnion("modo", [
  z.object({ modo: z.literal("plan"), duplicados: z.boolean().optional(), descartadas: Descartadas }),
  z.object({ modo: z.literal("aplicar"), ids: Ids.min(1), descartadas: Descartadas }),
  z.object({
    modo: z.literal("deshacer"),
    deshacer: z.object({
      renombres: z.array(z.object({ id: Id, antes: z.string().min(1).max(255), despues: z.string().min(1).max(255) })).max(TOPE_DESHACER),
      restaurar: z.array(Id).max(TOPE_DESHACER),
      carpetas: z.array(Carpeta).max(TOPE_DESHACER),
      ia: z
        .array(
          z.object({
            id: Id,
            carpeta: z.object({ antes: Id.nullable(), despues: Id }).optional(),
            vence: z.object({ antes: Fecha.nullable(), despues: Fecha }).optional(),
          }),
        )
        .max(TOPE_DESHACER),
    }),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
    }
    const data = parsed.data;
    // Mirar repetidos baja los archivos: más caro que leer la lista.
    const rl =
      data.modo === "plan"
        ? applyRateLimit(req, data.duplicados === false ? "DRIVE_READ" : "MODERATE", "documents:ordenar:plan")
        : applyRateLimit(req, "DRIVE_BULK", "documents:ordenar");
    if (rl) return rl;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    const actor = { role: auth.role, username: auth.username };

    if (data.modo === "plan") {
      const plan = await armarPlan(auth.tenantId, auth.role, {
        duplicados: data.duplicados !== false,
        descartadas: data.descartadas,
      });
      return NextResponse.json(plan);
    }
    if (data.modo === "aplicar") {
      const r = await aplicarPlan(auth.tenantId, actor, data.ids, { descartadas: data.descartadas });
      return NextResponse.json(r);
    }
    const r = await deshacerOrden(auth.tenantId, actor, data.deshacer);
    return NextResponse.json(r);
  } catch (e) {
    logger.error("[documents.ordenar] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
