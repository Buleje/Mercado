export const dynamic = 'force-dynamic'
import { NextResponse } from "next/server";
import { ReviewsDB } from "@/lib/jsondb";

export async function GET() {
  try {
    return NextResponse.json(await ReviewsDB.getAll());
  } catch (e) {
    console.error("[reviews] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      id: string;
      name?: string;
      location?: string;
      text: string;
      rating: number;
      phone?: string;
      date: string;
    };
    if (!body.text?.trim() || !body.rating) {
      return NextResponse.json({ error: "text and rating are required" }, { status: 400 });
    }
    const review = ReviewsDB.add({
      id: body.id,
      name: body.name ?? "",
      location: body.location ?? "",
      text: body.text,
      rating: body.rating,
      phone: body.phone ?? null,
      date: body.date,
    });
    return NextResponse.json(review);
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
}
