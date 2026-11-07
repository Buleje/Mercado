import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { PartnerPayoutsDB } from "@/lib/db/partner-payouts.db";
import { RetirosAlertasDB } from "@/lib/db/retiros-alertas.db";
import { alertasDeRetiros } from "@/lib/delivery/retiros-conciliacion";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/delivery/payouts/alertas — el supervisor justifica (o quita
 * la justificación de) una coincidencia de retiros (17-10, P36).
 *
 * No toca ningún retiro ni ningún gasto: sólo anota quién la revisó, cuándo y
 * por qué. La alerta tiene que existir AHORA (se recalcula acá): una clave
 * inventada es 404. Admin y dueño, como pagar.
 */
const cuerpoSchema = z.object({
  clave: z.string().trim().min(3).max(4000),
  /** `null` = quitar la justificación. */
  motivo: z.string().trim().min(5, "Escribe por qué (al menos 5 letras).").max(300).nullable(),
});

export async function POST(req: NextRequest) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const prohibido = soloAdminODueno(auth.role, "justificar alertas de retiros");
  if (prohibido) return prohibido;

  const parsed = cuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }
  try {
    const ahora = new Date();
    const vigentes = alertasDeRetiros(await PartnerPayoutsDB.paraAlertas(auth.tenantId, ahora), ahora).map((a) => a.clave);
    if (!vigentes.includes(parsed.data.clave)) {
      return NextResponse.json({ error: "Esa alerta ya no está: recarga la lista." }, { status: 404 });
    }
    const por = auth.name || auth.username || "admin";
    const revisada = await RetirosAlertasDB.justificar(auth.tenantId, parsed.data.clave, parsed.data.motivo, por, vigentes, ahora);
    return NextResponse.json({ ok: true, revisada });
  } catch (err) {
    logger.error("[admin/delivery/payouts/alertas] POST failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No pudimos guardar la justificación." }, { status: 500 });
  }
}
