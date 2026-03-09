import { NextResponse } from "next/server";
import { ReviewsDB } from "@/lib/jsondb";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  await ReviewsDB.delete(id);
  return NextResponse.json({ ok: true });
}
