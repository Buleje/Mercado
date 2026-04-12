import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { z } from "zod";
import { getRecipeCostBreakdown } from "@/lib/recipes/cost-calculator";

const QuerySchema = z.object({
  sellingPrice: z.coerce.number().positive().optional(),
});

/**
 * GET /api/recipes/[id]/cost?sellingPrice=25.00
 * Returns the cost breakdown and margin of a recipe.
 * Protected: admin, manager, cajero.
 *
 * Response: { cost, margin, sellingPrice, ingredients: [{name, qty, unitCost, subtotal}] }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "manager", "cajero"]);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;

    const parsed = QuerySchema.safeParse({
      sellingPrice: req.nextUrl.searchParams.get("sellingPrice") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
    }

    const result = await getRecipeCostBreakdown(
      auth.tenantId,
      id,
      parsed.data.sellingPrice,
    );

    if (!result) {
      return NextResponse.json(
        { error: "Receta no encontrada" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: result });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
