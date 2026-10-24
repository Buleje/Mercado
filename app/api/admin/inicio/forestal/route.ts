import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import type { AdminRole } from "@/lib/session";
import { inicioForestalCacheado } from "@/lib/forestal/inicio-forestal-cache";
import { ROLES_INICIO_FORESTAL } from "@/lib/forestal/inicio-forestal";

/**
 * GET /api/admin/inicio/forestal?from=&to=[&adelantos=1] — la pestaña
 * «Forestal» del Inicio. SÓLO LECTURA.
 *
 * Junta lo que el Libro CTP, el LO-TH y Adelantos ya publican en sus pantallas
 * (`lib/forestal/inicio-forestal-server.ts`): no calcula nada propio.
 *
 * Guard: los roles que ven el libro (admin · almacenero · owner; el encargado
 * pasa por management tier) + al menos una de las dos especializaciones. Cada
 * bloque sale sólo si su módulo está prendido. Los adelantos son plata: sólo
 * para admin, dueño o encargado, y sólo si la pantalla dice que el negocio
 * tiene el módulo.
 */

const querySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    adelantos: z.enum(["0", "1"]).optional(),
  })
  .refine((q) => q.from.getTime() <= q.to.getTime(), { message: "El rango de fechas está invertido." })
  .refine((q) => q.to.getTime() - q.from.getTime() <= 3_700 * 86_400_000, {
    message: "El rango puede ser de hasta diez años.",
  });

const VEN_PLATA: readonly AdminRole[] = ["admin", "owner", "manager"];

export const GET = withApiHandler("inicio-forestal-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ROLES_INICIO_FORESTAL);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "GENEROUS", "inicio-forestal");
  if (rl) return rl;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", message: parsed.error.issues[0]?.message ?? "Parámetros inválidos." },
      { status: 400 },
    );
  }

  const [ctp, loth] = await Promise.all([
    isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"),
    isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"),
  ]);
  if (!ctp && !loth) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "Este negocio no usa los libros forestales." },
      { status: 403 },
    );
  }

  try {
    const data = await inicioForestalCacheado(auth.tenantId, {
      from: parsed.data.from.toISOString(),
      to: parsed.data.to.toISOString(),
      ctp,
      loth,
      adelantos: parsed.data.adelantos === "1" && VEN_PLATA.includes(auth.role),
    });
    return NextResponse.json(data);
  } catch (err) {
    logger.error("[api/admin/inicio/forestal] GET failed", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json(
      { error: "internal_error", message: "No se pudo armar el resumen forestal." },
      { status: 500 },
    );
  }
});
