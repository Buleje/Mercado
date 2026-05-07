import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";

const RatingSchema = z.object({
  assignmentId: z.string().min(1),
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
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

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = RatingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");

  try {
    // Find the assignment
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

    await prisma.deliveryAssignment.update({
      where: { id: assignment.id },
      data: { notes: updatedNotes },
    });

    // SECURITY 2026-05-05 (pentest delivery H002): cap a 200 ratings recientes.
    // Antes el findMany sin take traía TODOS los assignments rated del partner
    // en cada llamada — patológico bajo carga.
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
