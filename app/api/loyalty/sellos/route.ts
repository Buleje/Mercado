import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { SellosDB } from "@/lib/db/sellos.db";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { runWithAuditContext } from "@/lib/audit/audit-context";
import { ConfigSellosSchema } from "@/lib/loyalty/sellos";

/**
 * Tarjeta de sellos (Campañas › Puntos y la ficha de Mis clientes).
 *
 *  · GET                → `{ config, premios }`: la config y a quién le toca premio (clave = últimos 9 dígitos).
 *  · GET ?phone=X       → `{ config, estado, canjes }`: la tarjeta de ese cliente.
 *  · PUT  {config}      → guarda la config (Settings.loyaltyRulesJson › sellos).
 *  · POST {phone}       → marca un premio canjeado; 409 si no le toca (se recuenta aquí).
 *
 * Los mismos roles que la lista de clientes (`/api/customers`: admin, y el
 * management tier que `requireAdmin` deja pasar siempre).
 */
const ROLES = ["admin"] as const;
const CanjeSchema = z.object({ phone: z.string().trim().min(6).max(40) });

function errorDe(contexto: string, err: unknown, tenantId: string) {
  logger.error(`[loyalty/sellos] ${contexto} failed`, { error: err instanceof Error ? err.message : String(err), tenantId });
  return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  try {
    const phone = req.nextUrl.searchParams.get("phone")?.trim();
    if (phone) return NextResponse.json(await SellosDB.estadoDe(auth.tenantId, phone));
    return NextResponse.json(await SellosDB.conPremio(auth.tenantId));
  } catch (err) {
    return errorDe("GET", err, auth.tenantId);
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  return runWithAuditContext(req, auth.username, async () => {
    try {
      const parsed = ConfigSellosSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json({ error: "Revisa los datos de la tarjeta", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
      }
      await SellosDB.guardarConfig(auth.tenantId, parsed.data);
      await logActivity(
        "sellos.config",
        "loyalty",
        `${parsed.data.activo ? "Activó" : "Pausó"} la tarjeta: ${parsed.data.compras} compras → ${parsed.data.premio} (desde ${parsed.data.desde})`,
        undefined,
        auth.username,
        undefined,
        auth.tenantId,
      );
      return NextResponse.json({ ok: true, config: parsed.data });
    } catch (err) {
      return errorDe("PUT", err, auth.tenantId);
    }
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  return runWithAuditContext(req, auth.username, async () => {
    try {
      const parsed = CanjeSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return NextResponse.json({ error: "Falta el celular del cliente" }, { status: 400 });
      const hecho = await SellosDB.canjear(auth.tenantId, parsed.data.phone, auth.username);
      if (!hecho) return NextResponse.json({ error: "Todavía no le toca el premio" }, { status: 409 });
      await logActivity(
        "sellos.canje",
        "customer",
        `Premio de la tarjeta de sellos entregado: ${hecho.canje.premio} (${hecho.canje.sellos} sellos)`,
        parsed.data.phone,
        auth.username,
        undefined,
        auth.tenantId,
      );
      return NextResponse.json({ ok: true, estado: hecho.estado });
    } catch (err) {
      return errorDe("POST", err, auth.tenantId);
    }
  });
}
