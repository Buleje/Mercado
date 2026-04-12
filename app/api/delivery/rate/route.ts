import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

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
 */
export async function POST(req: NextRequest) {
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

    // Check if already rated
    if (assignment.notes?.includes('"rated":true')) {
      return NextResponse.json({ error: "Ya calificaste esta entrega", alreadyRated: true }, { status: 409 });
    }

    // Save rating in notes (JSON format)
    const ratingData = {
      rated: true,
      stars: parsed.data.stars,
      comment: parsed.data.comment || null,
      ratedAt: new Date().toISOString(),
    };

    const existingNotes = assignment.notes || "";
    const updatedNotes = existingNotes
      ? `${existingNotes}\n---RATING---\n${JSON.stringify(ratingData)}`
      : `---RATING---\n${JSON.stringify(ratingData)}`;

    await prisma.deliveryAssignment.update({
      where: { id: assignment.id },
      data: { notes: updatedNotes },
    });

    // Update DeliveryPartner running average rating
    // Get all rated assignments for this partner
    const allAssignments = await prisma.deliveryAssignment.findMany({
      where: { partnerId: assignment.partnerId, notes: { contains: '"rated":true' } },
      select: { notes: true },
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
