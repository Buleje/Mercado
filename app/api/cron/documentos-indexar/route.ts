import { NextResponse } from "next/server";
import { withCronAuth } from "@/lib/cron-auth";
import { indexarTanda } from "@/lib/documents/indexar-pendientes";
import { DocumentsDB } from "@/lib/db/documents.db";
import { logger } from "@/lib/logger";

/**
 * El drive se termina de leer solo, de noche.
 *
 * Sin esto, "indexar lo que falta" dependía de que alguien dejara una pestaña
 * abierta: con un lector de imágenes local cada escaneo tarda minutos, así que
 * 80 documentos son horas de pestaña. Acá se avanza una tanda por tenant por
 * noche y se vuelve mañana; cada vuelta deja el drive un poco más buscable.
 *
 * Es REANUDABLE por diseño: no guarda dónde quedó, se lo pregunta a la base
 * (`pendientesDeIndexar`). Si el cron falla una noche, la siguiente sigue donde
 * estaba, y lo que falló tres veces queda marcado con su motivo y no vuelve a
 * intentarse para siempre.
 */
export const maxDuration = 300;

/** Cuántos por tenant y por noche. El techo real lo pone el presupuesto de tiempo. */
const POR_TENANT = 25;

export const GET = withCronAuth("documentos-indexar", async () => {
  const arranque = Date.now();
  const tenants = await DocumentsDB.tenantsConPendientesDeIndexar(20);

  let indexados = 0;
  let fallidos = 0;
  let restantes = 0;
  const tocados: string[] = [];
  const frenos: Record<string, string> = {};

  for (const tenantId of tenants) {
    // 240 s de techo total: se corta antes de arrancar otro tenant si no entra.
    if (Date.now() - arranque > 240_000) break;
    try {
      const r = await indexarTanda(tenantId, {
        maximo: POR_TENANT,
        presupuestoMs: Math.max(20_000, 240_000 - (Date.now() - arranque)),
        actorId: "cron-indexado",
      });
      if (r.indexados > 0 || r.fallidos.length > 0) tocados.push(tenantId);
      indexados += r.indexados;
      fallidos += r.fallidos.length;
      restantes += r.restantes;
      if (r.freno) frenos[tenantId] = r.freno;
    } catch (err) {
      logger.warn("cron.documentos-indexar.tenant_fail", { tenantId, err: String(err) });
    }
  }

  return NextResponse.json({
    ok: true,
    tenants: tenants.length,
    tocados: tocados.length,
    indexados,
    fallidos,
    restantes,
    // Los frenos se reportan para que el tablero de crons muestre "las fotos no
    // se pueden leer" en vez de un ok: true que tapa el problema.
    frenos,
  });
});
