import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { fechaDeLima } from "@/lib/camaras/resumen";
import { armarResumen } from "@/lib/camaras/resumen.server";

/**
 * GET /api/admin/camaras/resumen?fecha=YYYY-MM-DD — el resumen del día del patio.
 *
 * `fecha` es el día de Lima (default: hoy). Sale de las capturas del KV; lo que
 * la IA no leyó cuenta en `sinLectura`. «Gente por hora» son fotos por evento,
 * no un conteo continuo (ver `lib/camaras/resumen.ts`).
 */
const querySchema = z.object({
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((f) => !Number.isNaN(Date.parse(`${f}T12:00:00Z`)) && new Date(`${f}T12:00:00Z`).toISOString().startsWith(f))
    .optional(),
});

export const GET = withApiHandler("camaras-resumen-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "camaras-resumen");
  if (rl) return rl;

  const q = querySchema.safeParse({ fecha: new URL(req.url).searchParams.get("fecha") ?? undefined });
  if (!q.success) {
    return NextResponse.json(
      { error: "validation_error", message: "La fecha tiene que ser YYYY-MM-DD." },
      { status: 400 },
    );
  }
  const fecha = q.data.fecha ?? fechaDeLima(new Date());

  /* El libro y la asistencia se releen ahora: lo anotado después de la foto cuenta. */
  const { resumen } = await armarResumen(auth.tenantId, fecha);
  return NextResponse.json(resumen);
});
