import { NextRequest, NextResponse } from "next/server";
import { SurveyDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

// POST — submit a survey response (public, from customer)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, phone, rating, comment, type } = body as {
      orderId?: string;
      phone?: string;
      rating?: number;
      comment?: string;
      type?: string;
    };

    if (!orderId || !rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "orderId y rating (1-5) requeridos" },
        { status: 400 },
      );
    }

    const survey = await SurveyDB.submit({
      orderId: String(orderId),
      customerPhone: phone,
      rating: Math.round(rating),
      comment: comment?.slice(0, 500) ?? "",
      type: type ?? "nps",
    });

    return NextResponse.json(survey);
  } catch (e) {
    console.error("POST /api/surveys error", e);
    return NextResponse.json({ error: "Error al guardar" }, { status: 500 });
  }
}

// GET — admin: stats + recent responses
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const stats = await SurveyDB.stats();
    const recent = await SurveyDB.getAll(undefined, 50);

    return NextResponse.json({ stats, recent });
  } catch (e) {
    console.error("GET /api/surveys error", e);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
