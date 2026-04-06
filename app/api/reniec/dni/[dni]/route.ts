export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { lookupDniInReniec } from "@/lib/reniec";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ dni: string }> }
) {
  const rl = applyRateLimit(req, "MODERATE", "reniec-dni");
  if (rl) return rl;

  const { dni } = await params;
  const normalized = dni.replace(/\D/g, "");

  if (!/^\d{8}$/.test(normalized)) {
    return NextResponse.json({ error: "El DNI debe tener 8 dígitos." }, { status: 400 });
  }

  try {
    const person = await lookupDniInReniec(normalized);
    return NextResponse.json(person);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo consultar el DNI.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}