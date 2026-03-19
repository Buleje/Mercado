import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get("ids");
  if (!ids) return NextResponse.json([]);

  const idList = ids
    .split(",")
    .map((s) => parseInt(s, 10))
    .filter((n) => !isNaN(n) && n > 0)
    .slice(0, 100); // limit to 100 products

  if (idList.length === 0) return NextResponse.json([]);

  const products = await prisma.product.findMany({
    where: { id: { in: idList } },
    select: { id: true, stock: true },
  });

  return NextResponse.json(products);
}
