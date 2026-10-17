import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { indexarTanda } from "@/lib/documents/indexar-pendientes";
import { DocumentsDB } from "@/lib/db/documents.db";
import { isAnalyzableMime } from "@/lib/documents/analyzable-mime";
import { logger } from "@/lib/logger";

/**
 * Indexar de a tandas lo que todavía no tiene contexto.
 *
 * El botón "describir los que faltan" corría un bucle en el NAVEGADOR: cerrar
 * la pestaña mataba el trabajo. Acá cada llamada hace una tanda y devuelve
 * cuántos quedan, así el panel muestra el avance y —sobre todo— el cron nocturno
 * puede seguir por su cuenta hasta que no quede ninguno.
 *
 * `maxDuration` alto porque un escaneo leído con visión tarda minutos.
 */
export const maxDuration = 300;

const Body = z.object({
  /** Cuántos documentos como mucho en esta tanda. */
  maximo: z.number().int().min(1).max(50).optional(),
  /**
   * Incluir también fotos y escaneos, que tardan MINUTOS cada uno.
   *
   * Por omisión no: el botón del panel tiene que contestar rápido y mover la
   * barra. Lo lento lo hace el cron de la madrugada, donde nadie espera.
   */
  incluirLentos: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "GENEROUS", "documents:indexar:estado");
  if (rl) return rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const pendientes = await DocumentsDB.pendientesDeIndexar(auth.tenantId, 500);
  const analizables = pendientes.filter((d) => isAnalyzableMime(d.mimeType));
  // Lo que ya se intentó y no salió: la pantalla puede decir POR QUÉ falta, en
  // vez de dejar un contador que nunca baja sin explicación.
  const conMotivo = analizables.filter((d) => d.intentos > 0).length;
  return NextResponse.json({
    pendientes: analizables.length,
    yaIntentados: conMotivo,
    noAnalizables: pendientes.length - analizables.length,
  });
}

export async function POST(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "DRIVE_IA", "documents:indexar:tanda");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json().catch(() => ({}));
    const parsed = Body.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
    }

    const r = await indexarTanda(auth.tenantId, {
      // De a 5: con más, una tanda con un par de documentos pesados pasaba los
      // cuatro minutos y el navegador cortaba la espera aunque el servidor
      // estuviera trabajando bien.
      maximo: parsed.data.maximo ?? 5,
      // Corto a propósito: el panel prefiere muchas respuestas rápidas —cada
      // una mueve la barra— antes que una sola que tarda cuatro minutos y
      // parece colgada. El cron nocturno sí usa presupuesto largo.
      presupuestoMs: 60_000,
      soloRapidos: !parsed.data.incluirLentos,
      actorId: auth.username,
    });
    logger.info("[documents.indexar] tanda", {
      tenantId: auth.tenantId, indexados: r.indexados, fallidos: r.fallidos.length, restantes: r.restantes,
    });
    return NextResponse.json(r);
  } catch (e) {
    logger.error("[documents.indexar] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
