import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { SettingsDB } from "@/lib/db/settings.db";
import { logger } from "@/lib/logger";
import { runWithAuditContext } from "@/lib/audit/audit-context";
import { conservarSellos } from "@/lib/loyalty/sellos";

/**
 * GET/PUT /api/marketplace/loyalty/rules
 *
 * SECURITY 2026-05-06 (audit team H022 fix): persistir reglas de loyalty +
 * rewards en DB (Settings.loyaltyRulesJson / loyaltyRewardsJson).
 * Antes vivían en localStorage del admin → se perdían al limpiar caché +
 * no se sincronizaban entre dispositivos/admins/multi-tab.
 */

const RulesSchema = z.object({
  rules: z.unknown().optional(),
  rewards: z.unknown().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const data = await SettingsDB.getLoyaltyRules(auth.tenantId);
    return NextResponse.json(data);
  } catch (err) {
    logger.error("[loyalty/rules] GET failed", {
      error: err instanceof Error ? err.message : String(err),
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  return runWithAuditContext(req, auth.username, async () => {
    try {
      const raw = await req.json();
      const parsed = RulesSchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
          { status: 400 },
        );
      }

      /* Reemplaza el Json entero: la tarjeta de sellos guarda su config y sus
         canjes en los mismos dos campos y no se pueden perder (11-10). */
      const datos = conservarSellos(parsed.data, await SettingsDB.getLoyaltyRules(auth.tenantId));
      if (!datos) {
        return NextResponse.json(
          { error: "La tarjeta de sellos guarda datos aquí: manda reglas y recompensas como objeto" },
          { status: 409 },
        );
      }
      await SettingsDB.updateLoyaltyRules(auth.tenantId, datos);
      return NextResponse.json({ ok: true });
    } catch (err) {
      logger.error("[loyalty/rules] PUT failed", {
        error: err instanceof Error ? err.message : String(err),
        tenantId: auth.tenantId,
      });
      return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
    }
  });
}
