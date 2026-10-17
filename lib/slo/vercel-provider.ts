import "server-only";
import { logger } from "@/lib/logger";
import type { DeployStatus, SloSourceStatus } from "./types";

/**
 * Vercel deploy status — último deploy del proyecto. Datos REALES vía la API de
 * Vercel cuando VERCEL_TOKEN está seteado; estado honesto "not_configured" si no.
 *
 * Activar: VERCEL_TOKEN (+ opcional VERCEL_TEAM_ID, VERCEL_PROJECT_ID) en el env.
 * Doc: https://vercel.com/docs/rest-api/endpoints/deployments
 */

const VERCEL_API = "https://api.vercel.com";

interface VercelDeployment {
  uid: string;
  url?: string;
  readyState?: string;
  state?: string;
  createdAt?: number;
  buildingAt?: number;
  ready?: number;
  meta?: { githubCommitRef?: string };
  target?: string | null;
}

function mapState(s: string | undefined): DeployStatus["state"] {
  switch ((s ?? "").toUpperCase()) {
    case "READY": return "READY";
    case "ERROR": return "ERROR";
    case "BUILDING": case "INITIALIZING": return "BUILDING";
    case "QUEUED": return "QUEUED";
    case "CANCELED": return "CANCELED";
    default: return "BUILDING";
  }
}

export async function getLatestDeploy(): Promise<{ status: SloSourceStatus; deploy: DeployStatus | null }> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) return { status: "not_configured", deploy: null };

  const params = new URLSearchParams({ limit: "1" });
  if (process.env.VERCEL_TEAM_ID) params.set("teamId", process.env.VERCEL_TEAM_ID);
  if (process.env.VERCEL_PROJECT_ID) params.set("projectId", process.env.VERCEL_PROJECT_ID);

  try {
    const res = await fetch(`${VERCEL_API}/v6/deployments?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      logger.warn("[SLO/Vercel] API error", { status: res.status });
      return { status: "error", deploy: null };
    }
    const json = (await res.json()) as { deployments?: VercelDeployment[] };
    const d = json.deployments?.[0];
    if (!d) return { status: "empty", deploy: null };

    const createdAt = d.createdAt ?? d.buildingAt ?? Date.now();
    const durationMs = d.ready && (d.buildingAt ?? d.createdAt)
      ? Math.max(0, d.ready - (d.buildingAt ?? d.createdAt ?? d.ready))
      : 0;

    return {
      status: "live",
      deploy: {
        id: d.uid,
        state: mapState(d.readyState ?? d.state),
        url: d.url ? `https://${d.url}` : "",
        createdAt: new Date(createdAt).toISOString(),
        durationMs,
        branch: d.meta?.githubCommitRef ?? d.target ?? "—",
      },
    };
  } catch (err) {
    logger.error("[SLO/Vercel] fetch failed", { error: String(err) });
    return { status: "error", deploy: null };
  }
}
