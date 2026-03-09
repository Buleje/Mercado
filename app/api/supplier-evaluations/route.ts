export const dynamic = 'force-dynamic'
import { NextResponse, type NextRequest } from "next/server";
import { SupplierEvaluationsDB } from "@/lib/jsondb";

export async function GET(req: NextRequest) {
  const supplierId = req.nextUrl.searchParams.get("supplierId");
  if (supplierId) {
    const [evaluations, averages] = await Promise.all([
      SupplierEvaluationsDB.getBySupplierId(supplierId),
      SupplierEvaluationsDB.getAverages(supplierId),
    ]);
    return NextResponse.json({ evaluations, averages });
  }
  const evaluations = await SupplierEvaluationsDB.getAll();
  return NextResponse.json(evaluations);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { supplierId, purchaseId, punctuality, quality, price, notes } = body;
  if (!supplierId) return NextResponse.json({ error: "supplierId requerido" }, { status: 400 });
  const evaluation = await SupplierEvaluationsDB.add({
    supplierId, purchaseId,
    punctuality: Math.min(5, Math.max(1, punctuality ?? 3)),
    quality: Math.min(5, Math.max(1, quality ?? 3)),
    price: Math.min(5, Math.max(1, price ?? 3)),
    notes,
  });
  return NextResponse.json(evaluation, { status: 201 });
}
