import { NextResponse, type NextRequest } from "next/server";
import { ShoppingListsDB } from "@/lib/jsondb";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const list = await ShoppingListsDB.update(id, body);
  if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(list);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ShoppingListsDB.delete(id);
  return NextResponse.json({ ok: true });
}
