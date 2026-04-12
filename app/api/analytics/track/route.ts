import { NextRequest, NextResponse } from "next/server";
import { trackEvent } from "@/lib/analytics/posthog";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const event = typeof body?.event === "string" ? body.event : "unknown";
    const properties = typeof body?.properties === "object" && body.properties !== null ? body.properties : {};
    const distinctId = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "anonymous";
    trackEvent(distinctId, event, properties);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
