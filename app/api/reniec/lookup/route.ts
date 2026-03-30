export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { applyRateLimit } from "@/lib/rate-limit";
import { lookupDniInReniec, ReniecConfigError } from "@/lib/reniec";

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
    // 3. Consultar RENIEC vía lib/reniec.ts
    const person = await lookupDniInReniec(parsed.data.dni);
    return NextResponse.json(person);
  } catch (error) {
    if (error instanceof ReniecConfigError) {
      // API no configurada — retornar mock de prueba para desarrollo
      const dni = parsed.data.dni;
      return NextResponse.json(
        {
          dni,
          nombres: "USUARIO",
          apellidoPaterno: "DEMO",
          apellidoMaterno: "PRUEBA",
          nombreCompleto: "USUARIO DEMO PRUEBA",
          _mock: true,
          _note: "Configura RENIEC_API_URL en .env para datos reales",
        },
        { status: 200 }
      );
    }

    const message = error instanceof Error ? error.message : "No se pudo consultar RENIEC.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
