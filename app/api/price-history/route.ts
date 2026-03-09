export const dynamic = 'force-dynamic'
import { NextResponse, type NextRequest } from "next/server";
import { PriceHistoryDB } from "@/lib/jsondb";

export async function GET(req: NextRequest) {
  const productId = req.nextUrl.searchParams.get("productId");
  if (productId) {
    const history = await PriceHistoryDB.getByProduct(Number(productId));
    return NextResponse.json(history);
  }
  const history = await PriceHistoryDB.getAll();
  return NextResponse.json(history);
}
