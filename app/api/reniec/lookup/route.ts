export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { applyRateLimit } from "@/lib/rate-limit";
import { lookupDniInReniec } from "@/lib/reniec";

const querySchema = z.object({
  dni: z
    .string()
    .min(8, "El DNI debe tener 8 dígitos")
    .max(8, "El DNI debe tener 8 dígitos")
    .regex(/^\d{8}$/, "El DNI debe contener solo dígitos"),
});

export async function GET(req: NextRequest) {
  // 1. Rate limit — MODERATE para proteger la API externa
  const rl = applyRateLimit(req, "MODERATE", "reniec-lookup");
  if (rl) return rl;

  // 2. Validación Zod del query param
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ dni: url.searchParams.get("dni") ?? "" });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "DNI inválido", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    // 3. Consultar DNI vía lib/reniec.ts (fallback chain: configured → apis.net.pe → dniperu)
    const person = await lookupDniInReniec(parsed.data.dni);
    return NextResponse.json(person);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo consultar el DNI.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
