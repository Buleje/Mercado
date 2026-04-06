export const dynamic = 'force-dynamic'
import { NextResponse, type NextRequest } from "next/server";
import { DeliverySlotsDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { ALLOWED_ROLES } from "@/lib/auth/role-permissions";
import { toErrorPayload } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ALLOWED_ROLES.DELIVERY_SLOTS_READ);
  if (auth instanceof NextResponse) return auth;

  try {
    const date = req.nextUrl.searchParams.get("date");
    if (!date) {
      return NextResponse.json({ error: "date requerido (YYYY-MM-DD)" }, { status: 400 });
    }

    const slots = await DeliverySlotsDB.getByDate(date);
    return NextResponse.json(slots);
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ALLOWED_ROLES.DELIVERY_SLOTS_WRITE);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { orderId, date, slot, notes } = body;

    if (!orderId || !date || !slot) {
      return NextResponse.json({ error: "orderId, date, slot requeridos" }, { status: 400 });
    }

    const result = await DeliverySlotsDB.set({ orderId, date, slot, notes });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
