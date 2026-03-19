export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from "next/server";
import { ABTestDB } from "@/lib/ab-testing";
import { requireAdmin } from "@/lib/require-admin";

// GET: get results for a test (admin only)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const results = await ABTestDB.getResults(id);
  return NextResponse.json(results);
}
