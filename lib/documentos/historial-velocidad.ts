import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";

/**
 * Cuánto tarda el drive en abrir, día por día y por negocio.
 *
 * Se optimizó el drive a ojo y con mediciones puntuales de una sola máquina.
 * Eso sirve para una ronda, pero no dice si dentro de un mes —con 800
 * documentos y otra conexión— sigue estando bien, ni si el próximo cambio lo
 * empeoró. Esto guarda el número real de cada apertura, del lado de quien lo
 * usa, para poder comparar antes y después sin adivinar.
 *
 * Storage: `PlatformSetting` con key `drive-perf:{tenantId}`, mismo patrón que
 * `lib/rum-history.ts` — cero migración. El read-modify-write puede perder
 * alguna muestra concurrente: sirve para tendencias, nunca para plata.
 */

const KEY_PREFIX = "drive-perf:";
const MAX_DIAS = 30;

/** Los tramos que se miden por separado, porque se arreglan de formas distintas. */
export type TramoDrive = "listado" | "miniaturas" | "visor";

export interface TramoAgg {
  /** Suma de milisegundos, para el promedio. */
  sum: number;
  n: number;
  /** El peor caso del día: el promedio esconde a quien esperó 8 segundos. */
  max: number;
  /** Cuántos documentos había en pantalla (sólo tiene sentido en el listado). */
  docs: number;
}

export type DiaDrive = Partial<Record<TramoDrive, TramoAgg>>;

export interface HistorialVelocidad {
  days: Record<string, DiaDrive>;
}

export interface MuestraDrive {
  tramo: TramoDrive;
  /** Milisegundos que tardó. */
  ms: number;
  /** Documentos involucrados (0 si no aplica). */
  docs?: number;
}

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

function podar(h: HistorialVelocidad): HistorialVelocidad {
  const dias = Object.keys(h.days).sort();
  while (dias.length > MAX_DIAS) {
    const viejo = dias.shift();
    if (viejo) delete h.days[viejo];
  }
  return h;
}

export async function getHistorialVelocidad(tenantId: string): Promise<HistorialVelocidad> {
  const guardado = await PlatformSettingsDB.get<HistorialVelocidad>(`${KEY_PREFIX}${tenantId}`);
  if (guardado && typeof guardado === "object" && guardado.days && typeof guardado.days === "object") {
    return guardado;
  }
  return { days: {} };
}

export async function registrarMuestras(tenantId: string, muestras: MuestraDrive[]): Promise<void> {
  if (muestras.length === 0) return;
  const historial = await getHistorialVelocidad(tenantId);
  const dia = (historial.days[hoy()] ??= {});
  for (const m of muestras) {
    // Una medición absurda (pestaña en segundo plano, reloj cambiado) ensucia
    // el promedio para siempre: se descarta antes de guardarla.
    if (!Number.isFinite(m.ms) || m.ms < 0 || m.ms > 120_000) continue;
    const agg = (dia[m.tramo] ??= { sum: 0, n: 0, max: 0, docs: 0 });
    agg.sum += m.ms;
    agg.n += 1;
    agg.max = Math.max(agg.max, m.ms);
    agg.docs = Math.max(agg.docs, m.docs ?? 0);
  }
  await PlatformSettingsDB.set(`${KEY_PREFIX}${tenantId}`, podar(historial), "drive-perf");
}

/** Promedio y peor caso por tramo, listo para dibujar. */
export function resumirPorDia(historial: HistorialVelocidad): {
  dia: string;
  tramos: Partial<Record<TramoDrive, { promedio: number; max: number; n: number; docs: number }>>;
}[] {
  return Object.entries(historial.days)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, tramos]) => ({
      dia,
      tramos: Object.fromEntries(
        Object.entries(tramos).map(([tramo, agg]) => [
          tramo,
          { promedio: agg.n > 0 ? Math.round(agg.sum / agg.n) : 0, max: Math.round(agg.max), n: agg.n, docs: agg.docs },
        ]),
      ),
    }));
}
