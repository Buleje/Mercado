import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import type { AdminRole } from "@/lib/session";
import { VALID_TABS } from "@/app/admin/_lib/tabs.types";
import { CLAVE_APERTURA_RE, pestanaDeClave, usoPorPestana } from "@/lib/admin/aperturas-panel";
import { leerAperturas, sumarAperturas } from "@/lib/admin/aperturas-panel.server";

/**
 * Qué pantallas del panel abre el negocio (Potenciar Buleje, 28-10).
 *
 * POST → body { claves: ["ctp-libro-operaciones", "plata:gastos", …] }
 *        Lo manda `lib/admin/registro-aperturas.ts`: cada pestaña una vez por
 *        sesión del navegador, varias juntas. Cualquier persona del panel suma.
 * GET ?resumen=1 → { tabs: { [tab]: aperturas30d } } — lo que necesita la
 *        barra para ordenar; cualquier persona del panel.
 * GET           → { claves: { [clave]: { d7, d30, ultima } }, desde } —
 *        «Uso del panel» en Configuración; SÓLO admin y dueño.
 *
 * Guardado en Upstash (`aperturas-panel.server.ts`, ahí el porqué). El negocio
 * sale del JWT, nunca del cuerpo.
 */

const ROLES_PANEL: readonly AdminRole[] = ["admin", "owner", "manager", "cajero", "almacenero", "analista", "tienda_owner"];
/** El detalle es del dueño: `requireAdmin` deja pasar al encargado (management tier), acá no. */
const ROLES_DETALLE: ReadonlySet<AdminRole> = new Set<AdminRole>(["admin", "owner"]);
const PESTANAS = new Set<string>(VALID_TABS);

const PostSchema = z.object({
  claves: z.array(z.string().regex(CLAVE_APERTURA_RE)).min(1).max(20),
});

export async function POST(req: NextRequest) {
  try {
    /* Un envío por cada tanda de pestañas nuevas de la sesión: GENEROUS (100/min) sobra. */
    const rl = applyRateLimit(req, "GENEROUS", "admin-uso-panel");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req, ROLES_PANEL);
    if (auth instanceof NextResponse) return auth;

    const body: unknown = await req.json().catch(() => ({}));
    const parsed = PostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
    }
    /* Sólo pestañas que existen: una clave inventada sería un campo más en el hash del negocio. */
    const claves = [...new Set(parsed.data.claves)].filter((c) => PESTANAS.has(pestanaDeClave(c)));
    await sumarAperturas(auth.tenantId, claves);
    return NextResponse.json({ ok: true, sumadas: claves.length });
  } catch (e) {
    logger.error("[uso-panel] post error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const rl = applyRateLimit(req, "GENEROUS", "admin-uso-panel-leer");
    if (rl) return rl;
    const auth = await requireAdmin(req, ROLES_PANEL);
    if (auth instanceof NextResponse) return auth;

    const soloResumen = req.nextUrl.searchParams.get("resumen") === "1";
    if (!soloResumen && !ROLES_DETALLE.has(auth.role)) {
      return NextResponse.json({ error: "forbidden", message: "Sólo admin y dueño ven el uso del panel" }, { status: 403 });
    }
    const { claves, desde } = await leerAperturas(auth.tenantId);
    const headers = { "Cache-Control": "private, no-store" };
    if (soloResumen) return NextResponse.json({ tabs: usoPorPestana(claves) }, { headers });
    return NextResponse.json({ claves, desde }, { headers });
  } catch (e) {
    logger.error("[uso-panel] get error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
