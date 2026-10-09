import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { ROLES_AVANCE } from "@/lib/metas/roles";
import { MetasSerieDB } from "@/lib/db/metas-serie.db";
import { sumarDiasAFecha } from "@/lib/admin/metas-tareas";
import { limaDateKey } from "@/lib/utils";
import type { RespuestaSerieDia, RespuestaSerieHora } from "@/lib/metas/logros-reglas";

/**
 * GET /api/goals/serie — lo vendido por hora o por día de Lima (ADR-488).
 *
 * - `?por=hora&dia=YYYY-MM-DD` → las 24 horas del día y las de la víspera
 *   (la comparación con ayer de «Hoy»). Sin `dia`: hoy.
 * - `?por=dia&mes=YYYY-MM` → los días del mes y los del mes anterior (el
 *   calendario y «vs el mes pasado al mismo día»). Sin `mes`: el de hoy.
 *
 * «Vendido» = ventas del POS + pedidos que entran como ingreso, la misma regla
 * que el avance de la meta `ventas` (`MetasSerieDB`). Sólo lee.
 *
 * Roles: los mismos que el avance (`ROLES_AVANCE`); cajero y almacenero, 403.
 */

const fecha = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

const consulta = z.discriminatedUnion("por", [
  z.object({ por: z.literal("hora"), dia: fecha.optional() }),
  z.object({ por: z.literal("dia"), mes: mes.optional() }),
]);

const SIN_CACHE = { "Cache-Control": "private, no-store" };

const ultimoDia = (m: string) => {
  const [a, n] = m.split("-").map(Number) as [number, number];
  return `${m}-${String(new Date(Date.UTC(a, n, 0)).getUTCDate()).padStart(2, "0")}`;
};
const mesAnterior = (m: string) => sumarDiasAFecha(`${m}-01`, -1).slice(0, 7);

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES_AVANCE);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const parsed = consulta.safeParse({
    por: sp.get("por") ?? undefined,
    ...(sp.get("dia") ? { dia: sp.get("dia") } : {}),
    ...(sp.get("mes") ? { mes: sp.get("mes") } : {}),
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Pide ?por=hora&dia=AAAA-MM-DD o ?por=dia&mes=AAAA-MM",
        code: "validation_error",
        issues: parsed.error.issues,
      },
      { status: 422, headers: SIN_CACHE },
    );
  }

  const hoy = limaDateKey();
  try {
    if (parsed.data.por === "hora") {
      const dia = parsed.data.dia ?? hoy;
      const ayer = sumarDiasAFecha(dia, -1);
      const [horas, horasAyer] = await Promise.all([
        MetasSerieDB.porHora(auth.tenantId, dia),
        MetasSerieDB.porHora(auth.tenantId, ayer),
      ]);
      const cuerpo: RespuestaSerieHora = {
        por: "hora",
        hoy,
        dia,
        horas,
        ayer: { dia: ayer, horas: horasAyer },
      };
      return NextResponse.json(cuerpo, { headers: SIN_CACHE });
    }
    const m = parsed.data.mes ?? hoy.slice(0, 7);
    const anterior = mesAnterior(m);
    const dias = await MetasSerieDB.porDia(auth.tenantId, `${anterior}-01`, ultimoDia(m));
    const delMes = (prefijo: string) =>
      Object.fromEntries(Object.entries(dias).filter(([k]) => k.startsWith(`${prefijo}-`)));
    const cuerpo: RespuestaSerieDia = {
      por: "dia",
      hoy,
      mes: m,
      dias: delMes(m),
      anterior: { mes: anterior, dias: delMes(anterior) },
    };
    return NextResponse.json(cuerpo, { headers: SIN_CACHE });
  } catch (e) {
    logger.error("[goals/serie] GET error", {
      tenantId: auth.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: "No se pudieron leer tus ventas. Reintenta en un rato." },
      { status: 503, headers: SIN_CACHE },
    );
  }
}
