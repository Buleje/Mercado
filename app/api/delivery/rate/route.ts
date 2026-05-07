import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { verifyRatingToken } from "@/lib/delivery/rating-token";
import { logger } from "@/lib/logger";

const RatingSchema = z.object({
  assignmentId: z.string().min(1),
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
  // SECURITY (F3 2026-05-07): token HMAC para prevenir 1-star bombing.
  // Backwards-compat: opcional por ahora.
  token: z.string().max(200).optional(),
  // orderId necesario para verificar el token (el token está ligado al orderId).
  orderId: z.string().max(100).optional(),
});

/**
 * POST /api/delivery/rate
 *
 * Permite al cliente calificar la entrega.
 * Actualiza el rating promedio del repartidor y guarda la calificación
 * en las notas del assignment.
 *
 * No requiere auth — se valida por assignmentId (link único enviado al cliente).
 *
 * SECURITY 2026-05-05 (pentest delivery H002): aplicamos rate-limit STRICT por
 * IP para evitar 1-star bombing del partner por brute-force de assignmentIds.
 * El fix completo (token HMAC del order) requiere migración + columna dedicada;
 * mientras tanto el rate-limit + comprobación `status:"delivered"` reduce el
 * impacto de manipulación de rating.
 */
export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "STRICT", "delivery-rate");
  if (rl) return rl;

  const body = await req.json().catch((err) => {
    logger.warn("[delivery/rate] body parse failed", { err: String(err) });
    return null;
  });
  if (!body) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = RatingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  // SECURITY (F3 2026-05-07): validar token HMAC cuando viene.
  // Token también puede venir en query param ?token=... junto con ?orderId=...
  const tokenFromQuery = new URL(req.url).searchParams.get("token");
  const orderIdFromQuery = new URL(req.url).searchParams.get("orderId");
  const token = parsed.data.token ?? tokenFromQuery ?? null;
  const orderId = parsed.data.orderId ?? orderIdFromQuery ?? null;
  if (token && orderId) {
    const result = verifyRatingToken(token, orderId);
    if (!result.valid) {
      return NextResponse.json({ error: "Token inválido o expirado" }, { status: 403 });
    }
  } else if (token && !orderId) {
    return NextResponse.json({ error: "orderId requerido para verificar token" }, { status: 400 });
  } else {
    // Backwards-compat: sin token se permite con warning para medir adopción.
    logger.warn("[delivery/rate] legacy unauthenticated request", {
      assignmentId: parsed.data.assignmentId,
      ip: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown",
      userAgent: req.headers.get("user-agent")?.slice(0, 100) ?? "unknown",
    });
  }

  const { prisma } = await import("@/lib/prisma");

  try {
    // Find the assignment — lookup publico por assignmentId; verifyRatingToken arriba garantiza ownership.
    const assignment = await prisma.deliveryAssignment.findUnique({
      where: { id: parsed.data.assignmentId },
      select: {
        id: true,
        partnerId: true,
        notes: true,
        status: true,
        partner: { select: { id: true, rating: true } },
      },
    });

    if (!assignment) {
      return NextResponse.json({ error: "Entrega no encontrada" }, { status: 404 });
    }

    // SECURITY 2026-05-05 (pentest delivery H002): solo se puede calificar
    // entregas confirmadas. Antes cualquier assignment pendiente era brute-able.
    if (assignment.status !== "delivered") {
      return NextResponse.json({ error: "Solo entregas confirmadas pueden calificarse" }, { status: 422 });
    }

    // Check if already rated
    if (assignment.notes?.includes('"rated":true')) {
      return NextResponse.json({ error: "Ya calificaste esta entrega", alreadyRated: true }, { status: 409 });
    }

    // SECURITY 2026-05-05 (pentest delivery H011): notes corruption.
    // Antes el rate appendea `---RATING---` y el siguiente tracking/update
    // hace JSON.parse(notes) y cae a `{}`, perdiendo lat/lng acumulados.
    // Ahora si notes contiene JSON, mergeamos las claves rating en él en
    // vez de appendear texto plano.
    const ratingData = {
      rated: true,
      stars: parsed.data.stars,
      comment: parsed.data.comment || null,
      ratedAt: new Date().toISOString(),
    };

    const existingNotes = assignment.notes || "";
    let updatedNotes: string;
    let parsedExistingNotes: Record<string, unknown> | null = null;
    if (existingNotes) {
      try {
        const obj = JSON.parse(existingNotes);
        if (obj && typeof obj === "object" && !Array.isArray(obj)) {
          parsedExistingNotes = obj as Record<string, unknown>;
        }
      } catch {
        // Notes no es JSON — formato legacy texto plano.
      }
    }
    if (parsedExistingNotes) {
      updatedNotes = JSON.stringify({ ...parsedExistingNotes, ...ratingData });
    } else {
      updatedNotes = existingNotes
        ? `${existingNotes}\n---RATING---\n${JSON.stringify(ratingData)}`
        : `---RATING---\n${JSON.stringify(ratingData)}`;
    }

    // update por id ya validado por findUnique anterior con assignmentId+token.
    await prisma.deliveryAssignment.update({
      where: { id: assignment.id },
      data: { notes: updatedNotes },
    });

    // SECURITY 2026-05-05 (pentest delivery H002): cap a 200 ratings recientes.
    // Antes el findMany sin take traía TODOS los assignments rated del partner
    // en cada llamada — patológico bajo carga.
    // aggregate read scoped por partnerId; refactor a DeliveryAssignmentsDB.recentRatings pendiente.
    const allAssignments = await prisma.deliveryAssignment.findMany({
      where: { partnerId: assignment.partnerId, notes: { contains: '"rated":true' } },
      select: { notes: true },
      orderBy: { deliveredAt: "desc" },
      take: 200,
    });

    let totalStars = parsed.data.stars;
    let ratingCount = 1;

    for (const a of allAssignments) {
      if (a.notes === updatedNotes) continue; // Skip current (already counted)
      const match = a.notes?.match(/"stars":(\d)/);
      if (match) {
        totalStars += parseInt(match[1], 10);
        ratingCount++;
      }
    }

    const newAvgRating = Math.round((totalStars / ratingCount) * 10) / 10;

    await prisma.deliveryPartner.update({
      where: { id: assignment.partnerId },
      data: { rating: newAvgRating },
    });

    return NextResponse.json({
      success: true,
      newRating: newAvgRating,
      totalRatings: ratingCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
