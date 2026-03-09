export const dynamic = 'force-dynamic'
import { NextResponse } from "next/server";
import { ExpensesDB } from "@/lib/jsondb";

export async function GET() {
  const summary = await ExpensesDB.getSummary();
  return NextResponse.json(summary);
}
