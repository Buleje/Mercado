import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line no-restricted-properties -- legacy: ProductsDB no expone bulk id-list select; migrar en sprint posterior.
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { toErrorPayload } from "@/lib/api-error";


export async function GET(req: NextRequest) {
  const limited = applyRateLimit(req, "GENEROUS", "stock-check");
  if (limited) return limited;

  const auth = await requireAdmin(req, ["admin", "owner", "manager", "almacenero", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const ids = req.nextUrl.searchParams.get("ids");
    if (!ids) return NextResponse.json([]);

    const idList = ids
      .split(",")
      .map((s) => parseInt(s, 10))
      .filter((n) => !isNaN(n) && n > 0)
      .slice(0, 100); // limit to 100 products

    if (idList.length === 0) return NextResponse.json([]);

    // tenantId guard prevents cross-tenant stock enumeration
    const products = await prisma.product.findMany({
      where: { id: { in: idList }, tenantId: auth.tenantId },
      select: { id: true, stock: true },
    });

    return NextResponse.json(products);
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
