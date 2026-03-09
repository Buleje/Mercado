import { NextResponse } from "next/server";
import { ExpensesDB } from "@/lib/jsondb";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  await ExpensesDB.delete(id);
  return NextResponse.json({ ok: true });
}
