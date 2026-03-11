export const dynamic = 'force-dynamic'
import { NextResponse, type NextRequest } from "next/server";
import { DeliverySlotsDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { ALLOWED_ROLES } from "@/lib/auth/role-permissions";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ALLOWED_ROLES.DELIVERY_SLOTS_READ);
  if (auth instanceof NextResponse) return auth;

  const date = req.nextUrl.searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "date requerido (YYYY-MM-DD)" }, { status: 400 });
  }
  
  const slots = await DeliverySlotsDB.getByDate(date);
  return NextResponse.json(slots);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ALLOWED_ROLES.DELIVERY_SLOTS_WRITE);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const { orderId, date, slot, notes } = body;
  
  if (!orderId || !date || !slot) {
    return NextResponse.json({ error: "orderId, date, slot requeridos" }, { status: 400 });
  }
  
  const result = await DeliverySlotsDB.set({ orderId, date, slot, notes });
  return NextResponse.json(result, { status: 201 });
}
