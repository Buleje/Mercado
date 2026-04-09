import { NextResponse, type NextRequest } from "next/server";
import { ShoppingListsDB } from "@/lib/jsondb";
import { applyRateLimit } from "@/lib/rate-limit";
import { toErrorPayload } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  try {
    const phone = req.nextUrl.searchParams.get("phone");
    if (!phone) return NextResponse.json({ error: "phone requerido" }, { status: 400 });
    const lists = await ShoppingListsDB.getByPhone(phone);
    return NextResponse.json(lists);
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "shopping-lists");
  if (rl) return rl;

  try {
    const body = await req.json();
    const { customerPhone, name, items } = body;
    if (!customerPhone || !name) return NextResponse.json({ error: "customerPhone y name requeridos" }, { status: 400 });
    const list = await ShoppingListsDB.add({ customerPhone, name, items: items ?? [] });
    return NextResponse.json(list, { status: 201 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
