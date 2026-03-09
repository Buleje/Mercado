import { NextResponse, type NextRequest } from "next/server";
import { ShoppingListsDB } from "@/lib/jsondb";

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone) return NextResponse.json({ error: "phone requerido" }, { status: 400 });
  const lists = await ShoppingListsDB.getByPhone(phone);
  return NextResponse.json(lists);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { customerPhone, name, items } = body;
  if (!customerPhone || !name) return NextResponse.json({ error: "customerPhone y name requeridos" }, { status: 400 });
  const list = await ShoppingListsDB.add({ customerPhone, name, items: items ?? [] });
  return NextResponse.json(list, { status: 201 });
}
