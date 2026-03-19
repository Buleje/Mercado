export const dynamic = 'force-dynamic'
import { NextResponse, type NextRequest } from "next/server";
import { ExpensesDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const summary = await ExpensesDB.getSummary();
  return NextResponse.json(summary);
}
