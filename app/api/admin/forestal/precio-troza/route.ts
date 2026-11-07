import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { isSpecializationEnabled } from "@/lib/specializations";
import { leerPrecioTroza } from "@/lib/forestal/precio-troza-lectura";

/**
 * GET /api/admin/forestal/precio-troza — dos preguntas del aserradero (04-11):
 *   · `porEspecie`: cuánto pagar como MÁXIMO por 1 m³ de rollo (rendimiento
 *     medido o el 56 % de la regla × 424 × S/ por PT − aserrío − flete − margen).
 *   · `porOrigen`: rendimiento de lo consumido, por proveedor / permiso / guía.
 * Contrato: `lib/forestal/precio-troza-tipos.ts`. La lectura vive en
 * `lib/forestal/precio-troza-lectura.ts`.
 *
 * Roles: es plata (precios de venta y lo que se paga), así que sólo los de la
 * plata del rendimiento (admin, owner; manager pasa siempre por requireAdmin).
 * El almacenero ve el rendimiento sin plata en `/ctp/rendimiento`.
 *
 * Query (todos opcionales): especie, desde, hasta (AAAA-MM-DD, fecha de la
 * corrida), aserrio, flete (S/ por m³ de rollo), margen (% de la venta bruta),
 * precio (S/ por PT: gana al de sus ventas), agrupar (proveedor|permiso|guia).
 */
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha AAAA-MM-DD");
const soles = z.coerce.number().finite().min(0).max(1_000_000);
const querySchema = z
  .object({
    especie: z.string().trim().min(1).max(80).optional(),
    desde: dia.optional(),
    hasta: dia.optional(),
    aserrio: soles.optional(),
    flete: soles.optional(),
    margen: z.coerce.number().finite().min(0).max(95).optional(),
    precio: z.coerce.number().finite().min(0).max(1_000).optional(),
    agrupar: z.enum(["proveedor", "permiso", "guia"]).optional(),
  })
  .refine((q) => !q.desde || !q.hasta || q.desde <= q.hasta, { message: "«desde» va antes de «hasta»", path: ["desde"] });

export const GET = withApiHandler("forestal-precio-troza", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este negocio." },
      { status: 403 },
    );
  }
  /* Un campo vacío del formulario (`aserrio=`) es «no lo escribí», no 0. */
  const crudo = Object.fromEntries([...new URL(req.url).searchParams].filter(([, v]) => v.trim() !== ""));
  const q = querySchema.safeParse(crudo);
  if (!q.success) {
    /* El `message` sale en pantalla: en palabras, no el inglés de Zod. */
    const issue = q.error.issues[0];
    const message = issue?.code === "custom" ? issue.message : `Revisa el dato «${String(issue?.path[0] ?? "consulta")}».`;
    return NextResponse.json({ error: "invalid_query", message }, { status: 400 });
  }
  const d = q.data;
  return NextResponse.json(
    await leerPrecioTroza(auth.tenantId, {
      especie: d.especie,
      desde: d.desde,
      hasta: d.hasta,
      aserrioM3: d.aserrio,
      fleteM3: d.flete,
      margenPct: d.margen,
      precioPt: d.precio,
      agruparPor: d.agrupar,
    }),
  );
});
