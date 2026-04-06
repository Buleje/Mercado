import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { toErrorPayload } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = applyRateLimit(req, "GENEROUS", "stock-check");
  if (limited) return limited;

  try {
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
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
