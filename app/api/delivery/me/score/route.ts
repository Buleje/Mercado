import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePartner } from "@/lib/delivery/partner-session";
import { DeliveryScoreDb } from "@/lib/db/delivery-score.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/delivery/me/score
 *
 * Devuelve el score de gamificacion del repartidor autenticado:
 *   - score  : puntos acumulados (campo DeliveryPartner.score)
 *   - tier   : bronce | plata | oro | diamante (calculado server-side)
 *   - badges : lista fija mock de 6 insignias (se conectara a DeliveryBadge cuando exista)
 *
 * Auth: cookie buleje-partner-sess (requirePartner)
 */

// ─── Tipos del endpoint ──────────────────────────────────────────────────────

type Tier = "bronce" | "plata" | "oro" | "diamante";

type BadgeDef = {
  id:          string;
  name:        string;
  description: string;
  icon:        string;
  unlocked:    boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTier(score: number): Tier {
  if (score >= 9000) return "diamante";
  if (score >= 6000) return "oro";
  if (score >= 2000) return "plata";
  return "bronce";
}

/**
 * Badges mock — 6 fijos hasta que exista la tabla DeliveryBadge.
 * TODO: conectar a DeliveryBadge cuando este disponible.
 */
function getMockBadges(score: number): BadgeDef[] {
  return [
    {
      id:          "first_delivery",
      name:        "Primera entrega",
      description: "Completaste tu primera entrega.",
      icon:        "package",
      unlocked:    score >= 1,
    },
    {
      id:          "speed_demon",
      name:        "Velocista",
      description: "Entregaste 10 pedidos en tiempo record.",
      icon:        "zap",
      unlocked:    score >= 500,
    },
    {
      id:          "trusted_partner",
      name:        "Socio confiable",
      description: "Alcanzaste nivel Plata.",
      icon:        "shield",
      unlocked:    score >= 2000,
    },
    {
      id:          "gold_rider",
      name:        "Repartidor de oro",
      description: "Alcanzaste nivel Oro.",
      icon:        "award",
      unlocked:    score >= 6000,
    },
    {
      id:          "diamond_elite",
      name:        "Elite Diamante",
      description: "Alcanzaste el nivel mas alto.",
      icon:        "gem",
      unlocked:    score >= 9000,
    },
    {
      id:          "night_owl",
      name:        "Buho nocturno",
      description: "Completaste 5 entregas entre las 10pm y 2am.",
      icon:        "moon",
      unlocked:    false, // requiere logica de horarios — siempre false por ahora
    },
  ];
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    // 1. Auth
    const session = await requirePartner(req);
    if (session instanceof NextResponse) return session;

    // 2. Leer score desde DB
    const { score } = await DeliveryScoreDb.getScore(session.partnerId);

    // 3. Calcular tier y badges server-side
    const tier:   Tier       = getTier(score);
    const badges: BadgeDef[] = getMockBadges(score);

    return NextResponse.json({ score, tier, badges });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
