import "server-only";

/**
 * Estado de cada fuente del SLO Dashboard. Honesto por diseño: nunca inventamos
 * datos. "not_configured" = faltan las env vars; "error" = configurado pero la
 * API falló; "empty" = conectó pero no hay datos en la ventana; "live" = datos
 * reales. Reemplaza el MOCK_DATA viejo que mostraba números ficticios.
 */
export type SloSourceStatus = "live" | "empty" | "not_configured" | "error";

export interface DeployStatus {
  id: string;
  state: "READY" | "ERROR" | "BUILDING" | "CANCELED" | "QUEUED";
  url: string;
  createdAt: string;
  durationMs: number;
  branch: string;
}

export interface SentryErrorRow {
  type: string;
  count: number;
  trend: "up" | "down" | "stable";
}

export interface FunnelStep {
  step: string;
  sessions: number;
  dropoff: number;
}
