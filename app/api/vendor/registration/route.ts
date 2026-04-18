/**
 * POST /api/vendor/registration
 *
 * Recibe el payload completo del wizard /vender/registro.
 * Valida con Zod (safeParse — regla CLAUDE.md #2), persiste via
 * VendorRegistrationsDB (placeholder in-memory — ver archivo para roadmap),
 * y responde con `{ id, status }` para redirigir al success page.
 *
 * tenantId (regla CLAUDE.md #3): derivado del cookie `active-tenant` o
 * default "main" (public endpoint). Rate-limited para evitar spam.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { vendorRegistrationSchema } from "@/lib/validators/vendor-registration";
import { VendorRegistrationsDB } from "@/lib/db/vendor-registrations.db";
import { applyRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const limited = applyRateLimit(req, "STRICT", "vendor-registration");
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Cuerpo de la solicitud inválido" },
        { status: 400 },
      );
    }

    // Validate with Zod — safeParse (never .parse)
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

    // Derive tenant from cookie (public endpoint — best-effort, default "main")
    const tenantId =
      req.cookies.get("active-tenant")?.value?.trim() ?? "main";

    // Persist via DB class (never Prisma directly — CLAUDE.md #1)
    const record = await VendorRegistrationsDB.create(tenantId, parsed.data);

    return NextResponse.json(
      {
        ok: true,
        id: record.id,
        status: record.status,
      },
      { status: 201 },
    );
  } catch (_err) {
    // Fire-and-forget tolerance on unexpected errors (CLAUDE.md #7)
    return NextResponse.json(
      { error: "No se pudo procesar la solicitud. Intentá nuevamente." },
      { status: 500 },
    );
  }
}
