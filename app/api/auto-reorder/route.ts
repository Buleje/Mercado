import { NextResponse } from "next/server";
import { AutoReorderDB } from "@/lib/jsondb";

export async function GET() {
  const lowStock = await AutoReorderDB.getLowStockProducts();
  return NextResponse.json(lowStock);
}
