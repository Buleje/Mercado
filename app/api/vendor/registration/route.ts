/**
 * POST /api/vendor/registration
 *
 * Recibe el payload completo del wizard /vender/registro.
 * Valida con Zod (safeParse — regla CLAUDE.md #2), mapea al shape que
 * espera VendorApplicationsDB y persiste via Prisma (ADR-079).
 *
 * RUC unico a nivel plataforma: duplicate => 409.
 * Publico / sin auth — rate-limit STRICT para evitar spam.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { vendorRegistrationSchema } from "@/lib/validators/vendor-registration";
import {
  VendorApplicationsDB,
  RucAlreadyRegisteredError,
} from "@/lib/db/vendor-applications.db";
import { mapWizardToSubmitInput } from "@/lib/vendor/registration-mapper";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const limited = applyRateLimit(req, "STRICT", "vendor-registration");
  if (limited) return limited;

  try {
    let body: unknown = null;
    try {
      body = await req.json();
    } catch (parseErr) {
      logger.warn("[api/vendor/registration] invalid json", {
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
      });
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Cuerpo de la solicitud inválido" },
        { status: 400 },
      );
    }

    // Validate with Zod — safeParse (CLAUDE.md #2)
    const parsed = vendorRegistrationSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        {
          error: first?.message ?? "Datos inválidos",
          field: first?.path.join("."),
        },
        { status: 400 },
      );
    }

    // Map UI shape -> DB shape
    const submitInput = mapWizardToSubmitInput(parsed.data);

    try {
      const row = await VendorApplicationsDB.submit(submitInput);
      return NextResponse.json(
        {
          ok: true,
          id: row.id,
          status: row.status,
        },
        { status: 201 },
      );
    } catch (err) {
      if (err instanceof RucAlreadyRegisteredError) {
        return NextResponse.json(
          {
            error:
              "Ya tienes una aplicación con ese RUC. Contactá a soporte para consultar su estado.",
            code: err.code,
          },
          { status: 409 },
        );
      }
      throw err;
    }
  } catch (err) {
    logger.error("[api/vendor/registration] unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "No se pudo procesar la solicitud. Intentá nuevamente." },
      { status: 500 },
    );
  }
}
