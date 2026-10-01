import { NextRequest, NextResponse } from "next/server";
import { requireAgente } from "@/lib/sync/auth-agente";
import { rutasLogicas } from "@/lib/sync/drive-sync";
import { DocumentsDB } from "@/lib/db/documents.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export type ItemManifiesto = {
  id: string;
  /** Ruta lógica dentro de la carpeta: `Boletas/2026/enero.pdf`. */
  ruta: string;
  size: number;
  mimeType: string;
  /** Firma de cambio del lado servidor (ADR-307 §2). */
  updatedAt: string;
};

/**
 * GET /api/sync/manifest — foto del Drive para que el agente compare (ADR-307).
 *
 * Devuelve solo lo vivo: los borrados quedan fuera, y el agente los trata como
 * "hay que borrarlo también de la carpeta".
 */
export async function GET(req: NextRequest) {
  // El agente hace un manifest por ciclo; SHELL_POLL cubre un ciclo corto sin ahogarlo.
  const rl = await applyRateLimit(req, "SHELL_POLL", "sync:manifest");
  if (rl) return rl;

  const auth = await requireAgente(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const [rutas, docs] = await Promise.all([
      rutasLogicas(auth.tenantId),
      DocumentsDB.list(auth.tenantId, {}),
    ]);

    const items: ItemManifiesto[] = docs.flatMap((d) => {
      const ruta = rutas.get(d.id);
      if (!ruta) return [];
      return [
        {
          id: d.id,
          ruta,
          size: d.size,
          mimeType: d.mimeType,
          updatedAt: new Date(d.updatedAt).toISOString(),
        },
      ];
    });

    return NextResponse.json({ items, total: items.length, generadoEn: new Date().toISOString() });
  } catch (e) {
    logger.error("[sync/manifest] GET error", {
      error: (e as Error).message,
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ error: "manifest_fail" }, { status: 503 });
  }
}
