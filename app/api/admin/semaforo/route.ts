import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { SemaforoDB } from "@/lib/db/semaforo.db";
import { RUTAS_PANEL } from "@/lib/auth/roles-rutas-panel";
import { configSemaforoSchema } from "@/lib/semaforo/config";
import { rangoDePeriodo, type PeriodoId } from "@/lib/semaforo/evaluar";

/**
 * Semáforo del negocio (ADR-508) — Metas › Semáforo.
 *
 * GET `?periodo=semana|mes|lanzamiento` (defecto semana: la revisión es cada lunes)
 *   → `SemaforoDTO` + `config` guardada (para el modal de ajustes).
 *   `?fresco=1` vuelve a medir (botón «Volver a medir»).
 * PUT `ConfigSemaforoGuardada` parcial → mezcla por indicador y guarda en
 *   `featureFlagsJson.semaforo` (sólo esas subclaves, una sentencia).
 *
 * Plata del negocio: dueño, admin, dueño de tienda y encargado. Cajero,
 * almacenero y analista → 403 (array en RUTAS_PANEL, la vista lo consulta con
 * `puedePedir`). Sin sesión → 401.
 */
const ROLES = [...RUTAS_PANEL["/api/admin/semaforo"]];
const PERIODOS: readonly PeriodoId[] = ["semana", "mes", "lanzamiento"];

export async function GET(req: NextRequest) {
  const fresco = req.nextUrl.searchParams.get("fresco") === "1";
  const rl = applyRateLimit(req, fresco ? "GENEROUS" : "MODERATE", fresco ? "semaforo-fresco" : "semaforo");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;

  const pedido = req.nextUrl.searchParams.get("periodo") ?? "semana";
  const periodo = (PERIODOS as readonly string[]).includes(pedido) ? (pedido as PeriodoId) : "semana";
  try {
    if (fresco) SemaforoDB.olvidar(auth.tenantId);
    const hoy = limaDateKey();
    const config = await SemaforoDB.configGuardada(auth.tenantId);
    const { desde, hasta } = rangoDePeriodo(periodo, hoy, config.lanzamiento ?? null);
    const semaforo = await SemaforoDB.semaforo(auth.tenantId, desde, hasta, hoy);
    return NextResponse.json({ ...semaforo, periodo, config });
  } catch (err) {
    logger.error("[semaforo] GET falló", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "No se pudo medir el semáforo. Reintenta." }, { status: 503 });
  }
}

export async function PUT(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "semaforo-put");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;

  const parsed = configSemaforoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const config = await SemaforoDB.guardarConfig(auth.tenantId, parsed.data);
    const claves = Object.keys(parsed.data).join(", ") || "nada";
    logActivity("update", "settings", `Semáforo: cambió ${claves}`, "semaforo", auth.username, undefined, auth.tenantId).catch(
      (err) => logger.warn("[semaforo] activity", { error: String(err) }),
    );
    return NextResponse.json({ config });
  } catch (err) {
    logger.error("[semaforo] PUT falló", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "No se pudo guardar. Reintenta." }, { status: 503 });
  }
}
