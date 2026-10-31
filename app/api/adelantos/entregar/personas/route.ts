import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { esModoCajero, permisoEntregar } from "@/lib/adelantos/permisos";
import { PersonasEntregarQuery } from "@/lib/adelantos/entregar-schema";
import { TOPE_CAJERO_POR_DEFECTO, type PersonaEntregar, type PersonasEntregarRespuesta } from "@/lib/adelantos/entregar-tipos";
import { codigoDeMarcacion } from "@/lib/rrhh/kiosko";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { SettingsDB } from "@/lib/db/settings.db";
import { CashRegistersMovementsDB } from "@/lib/db/cash-registers-movements.db";

/**
 * GET /api/adelantos/entregar/personas?q=&codigo= — a quién entregar (ADR-491).
 *
 * Las 3 frecuentes, la búsqueda (`q`) y la lectura del fotocheck (`codigo`:
 * URL del QR o DNI). Sólo personas ACTIVAS de este negocio, sin banco, CCI ni
 * dirección. Al cajero (`restringido`) no le da el saldo de nadie y le dice su
 * tope; a todos, si la caja está abierta y si la firma es obligatoria.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoEntregar(auth.role);
  if (sinPermiso) return sinPermiso;
  const rl = await applyRateLimit(req, "GENEROUS", "adelantos-entregar-personas");
  if (rl) return rl;

  const sp = req.nextUrl.searchParams;
  const parsed = PersonasEntregarQuery.safeParse({ q: sp.get("q") ?? undefined, codigo: sp.get("codigo") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }
  const restringido = esModoCajero(auth.role);
  const conSaldo = !restringido;
  try {
    const codigo = parsed.data.codigo ? codigoDeMarcacion(parsed.data.codigo) : null;
    const [listas, porCodigo, settings, caja] = await Promise.all([
      AdelantosDB.personasParaEntregar(auth.tenantId, { q: parsed.data.q, conSaldo }),
      codigo ? AdelantosDB.personaPorCodigo(auth.tenantId, codigo, { conSaldo }) : Promise.resolve<PersonaEntregar | null>(null),
      restringido ? SettingsDB.get(auth.tenantId) : Promise.resolve(null),
      CashRegistersMovementsDB.findCurrentOpenRegister(auth.tenantId),
    ]);
    const respuesta: PersonasEntregarRespuesta = {
      frecuentes: listas.frecuentes,
      resultados: listas.resultados,
      porCodigo,
      codigoSinPersona: !!parsed.data.codigo && !porCodigo,
      restringido,
      topeCajero: restringido ? (settings?.adelantoTopeCajero ?? TOPE_CAJERO_POR_DEFECTO) : null,
      firmaObligatoria: restringido,
      cajaAbierta: !!caja,
    };
    return NextResponse.json(respuesta, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[adelantos/entregar/personas] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
