import { NextResponse, type NextRequest } from "next/server";
import { ABTestDB } from "@/lib/ab-testing";

// POST: track an impression or conversion event
export async function POST(req: NextRequest) {
  const { testId, variantId, visitorId, event, value } = await req.json();
  if (!testId || !variantId || !visitorId || !["impression", "conversion"].includes(event)) {
    return NextResponse.json({ error: "testId, variantId, visitorId, event requeridos" }, { status: 400 });
  }
  await ABTestDB.trackEvent(testId, variantId, visitorId, event, value);
  return NextResponse.json({ ok: true }, { status: 201 });
}
