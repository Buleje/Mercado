import { NextRequest, NextResponse } from "next/server";
import { SalesDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const sale = await SalesDB.getById(id);
  if (!sale) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Return only public fields
  return NextResponse.json({
    id: sale.id,
    items: sale.items,
    total: sale.total,
    payment: sale.payment,
    amountPaid: sale.amountPaid,
    change: sale.change,
    createdAt: sale.createdAt,
  });
}
