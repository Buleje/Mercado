import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { SalesAnomaliesDB } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(req, ["admin", "almacenero", "tienda_owner"]);
    if (auth instanceof NextResponse) return auth;
    const { id: anomalyId } = await params;
    const anomaly = await SalesAnomaliesDB.acknowledge(auth.tenantId, anomalyId);
    logger.info("[marketplace/anomalies/acknowledge] success", { tenantId: auth.tenantId, anomalyId });
    return NextResponse.json({ data: anomaly });
  } catch (err) {
    logger.error("[marketplace/anomalies/acknowledge] POST error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}