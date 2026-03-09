import { NextRequest, NextResponse } from "next/server";
import { getSessionPayload, SESSION } from "@/lib/session";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ role: null }, { status: 401 });
  const payload = await getSessionPayload(token);
  if (!payload) return NextResponse.json({ role: null }, { status: 401 });
  return NextResponse.json(payload);
}
