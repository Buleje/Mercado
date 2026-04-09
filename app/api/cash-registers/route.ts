import { NextRequest, NextResponse } from "next/server";
import { CashRegistersDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload } from "@/lib/api-error";
import { withDbRetry } from "@/lib/db-retry";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor") ?? undefined;
    const limitParam = searchParams.get("limit");

    if (limitParam !== null || cursor) {
      const limit = Math.min(Math.max(1, parseInt(limitParam ?? "25", 10)), 200);
      const result = await withDbRetry(() => CashRegistersDB.getAllPaginated(limit, cursor));
      return NextResponse.json(result);
    }

    return NextResponse.json(await withDbRetry(() => CashRegistersDB.getAll(auth.tenantId)));
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "open") {
      const openingAmount = Number(body.openingAmount) || 0;
      // Check if there's already an open register
      const open = await CashRegistersDB.getOpen();
      if (open) {
        return NextResponse.json({ error: "Ya hay una caja abierta" }, { status: 400 });
      }
      const reg = await CashRegistersDB.open(auth.tenantId, openingAmount, body.notes);
      return NextResponse.json(reg, { status: 201 });
    }

    return NextResponse.json({ error: "action required (open)" }, { status: 400 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
