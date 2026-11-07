import "server-only";
import { CamarasDB } from "@/lib/db/camaras.db";
import { ColaboradoresDB } from "@/lib/db/rrhh-colaboradores.db";
import { AsistenciaDB } from "@/lib/db/rrhh-asistencia.db";
import { logger } from "@/lib/logger";
import { MAX_CAPTURAS } from "./camaras";
import { movimientosDelLibro } from "./pila";
import { resumenDelDia, type ContextoDelDia, type ResumenDelDia } from "./resumen";

/**
 * Arma el resumen de un día RELEYENDO el libro y la asistencia ahora.
 *
 * Lo comparten el GET del panel y el cron de las 7 pm. Si una fuente falla,
 * su parte del contexto queda en `null` y el resumen cae a lo que la foto
 * guardó en su momento: un libro caído no puede tumbar el resumen entero.
 */
export async function armarResumen(
  tenantId: string,
  fecha: string,
): Promise<{ resumen: ResumenDelDia; camaras: Awaited<ReturnType<typeof CamarasDB.list>> }> {
  if (!tenantId) throw new Error("tenantId is required");
  const [camaras, capturas, libro, chalecos] = await Promise.all([
    CamarasDB.list(tenantId),
    CamarasDB.capturas(tenantId, { limite: MAX_CAPTURAS }),
    movimientosDelLibro(tenantId, fecha, fecha).catch((err) => {
      logger.error("[camaras.resumen] no se pudo leer el libro", { tenantId, error: String(err) });
      return null;
    }),
    contextoDeChalecos(tenantId, fecha).catch((err) => {
      logger.error("[camaras.resumen] no se pudo leer la asistencia", { tenantId, error: String(err) });
      return null;
    }),
  ]);
  const contexto: ContextoDelDia = { libro, chalecos };
  return { resumen: resumenDelDia(capturas, camaras, fecha, contexto), camaras };
}

async function contextoDeChalecos(tenantId: string, fecha: string): Promise<NonNullable<ContextoDelDia["chalecos"]>> {
  const mapa = await CamarasDB.chalecos(tenantId);
  const ids = [...new Set(Object.values(mapa))];
  const out: NonNullable<ContextoDelDia["chalecos"]> = {};
  if (!ids.length) return out;
  const [colaboradores, marcas] = await Promise.all([
    ColaboradoresDB.listar(tenantId, { incluirCesados: true }),
    AsistenciaDB.delPeriodo(tenantId, fecha, fecha, ids),
  ]);
  const nombres = new Map(colaboradores.map((c) => [c.id, c.nombre] as const));
  /* Una persona tiene UNA marca viva por día; si hubiera dos, vale la última. */
  const estado = new Map<string, string>();
  for (const m of [...marcas].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    estado.set(m.colaboradorId, m.estado);
  }
  for (const [numero, colaboradorId] of Object.entries(mapa)) {
    out[numero] = { nombre: nombres.get(colaboradorId) ?? null, estado: estado.get(colaboradorId) ?? null };
  }
  return out;
}
