import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAgente } from "@/lib/sync/auth-agente";
import { registrarLatido } from "@/lib/sync/estado-agentes";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * POST /api/sync/latido — el agente cuenta qué hizo en el ciclo (ADR-307).
 *
 * Sin esto el sync era ciego: si el agente se caía o la tarea de arranque no
 * levantaba, el panel no tenía forma de saberlo y el dueño se enteraba al notar
 * que un archivo no estaba.
 *
 * Un latido que falla NO rompe el ciclo del agente (él lo manda y sigue): esto es
 * telemetría de operación, no parte de la sincronización.
 */

const Body = z.object({
  equipoId: z.string().trim().min(1).max(80),
  nombre: z.string().trim().max(80).optional(),
  carpeta: z.string().trim().max(300),
  version: z.string().trim().max(20).optional(),
  motivo: z.string().trim().max(60).optional(),
  subidos: z.coerce.number().int().min(0).max(100000).optional(),
  bajados: z.coerce.number().int().min(0).max(100000).optional(),
  borrados: z.coerce.number().int().min(0).max(100000).optional(),
  archivos: z.coerce.number().int().min(0).max(1000000).optional(),
  conflictos: z.array(z.string().trim().max(300)).max(20).optional(),
  error: z.string().trim().max(300).nullable().optional(),
});

export async function POST(req: NextRequest) {
  // Un latido por ciclo, igual que el manifest: mismo bucket, mismo techo.
  const rl = await applyRateLimit(req, "SHELL_POLL", "sync:latido");
  if (rl) return rl;

  const auth = await requireAgente(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }

  try {
    const estado = await registrarLatido(auth.tenantId, {
      ...parsed.data,
      nombre: parsed.data.nombre ?? parsed.data.equipoId,
      version: parsed.data.version ?? "?",
    });
    return NextResponse.json({ ok: true, visto: estado.visto });
  } catch (e) {
    logger.error("[sync/latido] error", { error: (e as Error).message, tenantId: auth.tenantId });
    // 200 a propósito: el agente no tiene nada que reintentar y no queremos que
    // un fallo de telemetría le ensucie el log de sincronización.
    return NextResponse.json({ ok: false });
  }
}
