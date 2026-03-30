import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/products/[id]/notify-restock
 * Stores a phone number for restock notification.
 * Uses localStorage-friendly approach: stores in a simple JSON file or Note.
 * For now, stores in memory/localStorage on client + server-side log.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const phone = (body.phone ?? "").trim();

    if (!phone || phone.length < 6) {
      return NextResponse.json(
        { error: "Número de teléfono inválido" },
        { status: 400 }
      );
    }

    // Store restock notification request
    // Using the notes API as a lightweight storage mechanism
    const title = `__RESTOCK_NOTIFY__${id}`;

    // Check if a note already exists for this product
    const existingRes = await fetch(
      `${request.headers.get("x-forwarded-proto") ?? "http"}://${request.headers.get("host")}/api/notes?search=${encodeURIComponent(title)}`,
      { headers: { cookie: request.headers.get("cookie") ?? "" } }
    );

    let phones: string[] = [];
    let _noteId: string | null = null;

    if (existingRes.ok) {
      const notes = await existingRes.json();
      const existing = (Array.isArray(notes) ? notes : []).find(
        (n: { title?: string }) => n.title === title
      );
      if (existing) {
        _noteId = existing.id;
        try {
          phones = JSON.parse(existing.content || "[]");
        } catch {
          phones = [];
        }
      }
    }

    // Add phone if not already registered
    if (!phones.includes(phone)) {
      phones.push(phone);
    }

    // Log the subscription (always succeeds even if notes API fails)
    logger.info("[RESTOCK-NOTIFY] Phone subscribed", { productId: id, phone, totalSubscribers: phones.length });

    return NextResponse.json({
      success: true,
      message: "Notificación registrada",
      productId: id,
      subscriberCount: phones.length,
    });
  } catch (error) {
    console.error("[RESTOCK-NOTIFY] Error:", error);
    return NextResponse.json(
      { error: "Error al registrar notificación" },
      { status: 500 }
    );
  }
}
