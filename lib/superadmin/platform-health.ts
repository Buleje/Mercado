/**
 * lib/superadmin/platform-health.ts
 *
 * Stub de estado operacional de cada plataforma expuesta en el Launchpad
 * del /superadmin/control-center.
 *
 * TODO: implementar health checks reales por URL (ping + status HTTP) cuando
 * exista el ADR correspondiente. Por ahora devuelve "operational" para las
 * rutas internas conocidas, lo que evita falsos positivos en dev y previews.
 */

export type PlatformHealthStatus = "operational" | "degraded" | "maintenance" | "unknown";

export interface PlatformHealthEntry {
  id: string;
  status: PlatformHealthStatus;
  lastCheckedAt: string | null;
}

export type PlatformHealthMap = Record<string, PlatformHealthEntry>;

/**
 * Retorna el estado actual de cada plataforma del Launchpad.
 *
 * @param platformIds identificadores de las plataformas a evaluar.
 * @returns mapa id → entry con status y fecha de último check (null cuando
 *          todavía no hay check real implementado).
 */
export function getPlatformHealth(platformIds: readonly string[]): PlatformHealthMap {
  const result: PlatformHealthMap = {};
  for (const id of platformIds) {
    // TODO(health-checks): reemplazar por un ping real con timeout corto y
    // caché de ~30s por plataforma. De momento asumimos "operational".
    result[id] = {
      id,
      status: "operational",
      lastCheckedAt: null,
    };
  }
  return result;
}
