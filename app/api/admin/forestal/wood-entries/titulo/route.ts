import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { isSpecializationEnabled } from "@/lib/specializations";
import { TituloGuiaDB } from "@/lib/db/forest-titulo-guia.db";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";

/**
 * PATCH /api/admin/forestal/wood-entries/titulo — declarar el título
 * habilitante de una guía ya asentada que no lo traía (Brandon 05-10, modal
 * «Sin título declarado» de Trozas).
 *
 * Body: `{ gtfNumber, contratoId? | originCode?, originSourceNumber? }`.
 * Toca TODOS los ingresos de esa guía (uno por especie, ADR-312), pero sólo
 * sus casilleros VACÍOS y con el mes abierto (`planearTitulo`). Responde
 * `{ originCode, actualizados, omitidos: [{ id, especie, motivo }] }`.
 *
 * Sólo admin/dueño, como `update` de un ingreso: separación de funciones —
 * quien carga la madera no completa el origen legal sin un segundo par de ojos.
 */

const schema = z
  .object({
    gtfNumber: z.string().trim().min(1).max(50),
    contratoId: z.string().trim().min(1).max(60).nullable().optional(),
    originCode: z.string().trim().max(100).nullable().optional(),
    originSourceNumber: z.string().trim().max(100).nullable().optional(),
  })
  .refine((b) => Boolean(b.contratoId) || Boolean(b.originCode?.trim()), {
    message: "Elige un permiso o escribe el código del título",
    path: ["originCode"],
  });

export async function PATCH(req: NextRequest) {
  const rl = await applyRateLimit(req, "GENEROUS", "ctp:titulo");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  /* `requireAdmin` deja pasar al encargado (bypass de gestión): «sólo admin/dueño» se chequea
     a mano (security 05-10, veto: el encargado declaraba el título). */
  const rol = soloAdminODueno(auth.role, "declarar el título de una guía");
  if (rol) return rol;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }

  try {
    const r = await TituloGuiaDB.declarar(auth.tenantId, parsed.data, auth.username ?? "unknown");
    return NextResponse.json(r);
  } catch (e) {
    return ctpErrorResponse(e, "forestal.wood-entries.titulo.PATCH", auth.tenantId);
  }
}
