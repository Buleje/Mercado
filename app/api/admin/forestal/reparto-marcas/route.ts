import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import type { SessionPayload } from "@/lib/session";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { ClaveOcupadaError } from "@/lib/db/platform-settings.db";
import { ForestRepartoMarcasDB } from "@/lib/db/forest-reparto-marcas.db";
import { LIMITES_REPARTO } from "@/lib/forestal/reparto-marcas-sync";

/**
 * /api/admin/forestal/reparto-marcas — las casillas «Distribuido», el nombre
 * de «Sin marcar», la firma del Anexo 04 y los códigos 1-01… del reparto de
 * rolliza, por negocio (Brandon, 2026-10-19: «marco en la oficina y en el
 * monte veo lo mismo»).
 *
 * GET — lo guardado (`estado: null` = el negocio nunca guardó: el navegador
 *       sube lo suyo una vez).
 * PUT — `{ cambio }`: se mezcla por fila con fecha (gana la más nueva) y los
 *       códigos con `fusionarRegistros` (nunca se repite uno). Devuelve el
 *       resultado entero.
 *
 * Guard: los mismos roles y especialización que las distribuciones guardadas.
 */

const ROLES = ["admin", "almacenero", "owner"] as const;
const fecha = z.number().int().nonnegative().max(8.64e15);
const claveFila = z.string().min(1).max(LIMITES_REPARTO.clave);
const tope = (max: number) => (o: Record<string, unknown>) => Object.keys(o).length <= max;

const cambioSchema = z
  .object({
    marcas: z
      .record(claveFila, z.object({ on: z.boolean(), at: fecha }))
      .refine(tope(LIMITES_REPARTO.marcasPorCambio), "Demasiadas filas en un cambio.")
      .optional(),
    nombreSinMarcar: z.object({ valor: z.string().max(200), at: fecha }).optional(),
    firma: z
      .object({ nombre: z.string().max(LIMITES_REPARTO.firma), cargo: z.string().max(LIMITES_REPARTO.firma), at: fecha })
      .optional(),
    codigos: z
      .object({
        v: z.literal(1).default(1),
        bloques: z.record(z.string().min(1).max(120), z.number().int().positive().max(1e6)).refine(tope(1000)),
        sigBloque: z.number().int().nonnegative().max(1e6),
        lineas: z
          .record(claveFila, z.string().regex(/^\d{1,6}-\d{1,6}$/))
          .refine(tope(LIMITES_REPARTO.lineasCodigos)),
        sigLinea: z.record(z.string().min(1).max(120), z.number().int().nonnegative().max(1e6)).refine(tope(1000)),
      })
      .optional(),
  })
  .strict();
const putSchema = z.object({ cambio: cambioSchema }).strict();

async function guardia(req: NextRequest, escribir: boolean): Promise<SessionPayload | Response> {
  const auth = await requireAdmin(req, [...ROLES]);
  if (auth instanceof NextResponse) return auth;
  if (escribir) {
    const csrf = assertCsrf(req);
    if (csrf) return csrf;
  }
  const rl = await applyRateLimit(req, "GENEROUS", "reparto-marcas");
  if (rl) return rl;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:herramientas"))) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "Las Herramientas Forestales no están habilitadas para esta tienda." },
      { status: 403 },
    );
  }
  return auth;
}

export const GET = withApiHandler("forestal-reparto-marcas-get", async (req: NextRequest) => {
  const auth = await guardia(req, false);
  if (auth instanceof Response) return auth;
  try {
    const estado = await ForestRepartoMarcasDB.leer(auth.tenantId);
    return NextResponse.json({ estado }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error("[reparto-marcas.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PUT = withApiHandler("forestal-reparto-marcas-put", async (req: NextRequest) => {
  const auth = await guardia(req, true);
  if (auth instanceof Response) return auth;

  const texto = await req.text();
  if (texto.length > LIMITES_REPARTO.bytes) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(texto); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }
  try {
    const r = await ForestRepartoMarcasDB.aplicar(auth.tenantId, parsed.data.cambio, auth.username);
    if (!r.ok) {
      return NextResponse.json(
        { error: "payload_too_large", message: "Las marcas del reparto llegaron al tope guardado.", estado: r.estado },
        { status: 413 },
      );
    }
    return NextResponse.json({ estado: r.estado }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof ClaveOcupadaError) return NextResponse.json({ error: "busy" }, { status: 503 });
    logger.error("[reparto-marcas.PUT] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
