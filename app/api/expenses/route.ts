export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { ExpensesDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (from && to) {
    return NextResponse.json(await ExpensesDB.getByDateRange(new Date(from), new Date(to)));
  }
  return NextResponse.json(await ExpensesDB.getAll());
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  if (!body.category || !body.amount) {
    return NextResponse.json({ error: "category and amount required" }, { status: 400 });
  }
  const expense = await ExpensesDB.add({
    category: body.category,
    description: body.description ?? "",
    amount: Number(body.amount),
    date: body.date ?? new Date().toISOString(),
    recurring: body.recurring ?? false,
  });
  return NextResponse.json(expense, { status: 201 });
}
