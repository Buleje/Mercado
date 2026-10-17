import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { firmarFotoCarga } from "@/lib/forestal/fotos-carga-storage";
import {
  esIdDeFotoDeInspeccion,
  pathDeFotoDeInspeccion,
  tenantIdSchema,
} from "@/lib/superadmin/plantas-forestales/schemas";

/**
 * GET /api/superadmin/plantas/<planta>/inspecciones/fotos/<uuid>
 *
 * La puerta de una foto de hallazgo (security 17-10), con el patrón de las
 * fotos de carga (ADR-434): sesión de superadmin → 302 a una URL firmada de
 * 10 min. Sin sesión, 401; una dirección rara o una foto que no existe, 404.
 * `<img src>` sigue el redirect solo (la cookie de la sesión viaja con él), así
 * que la pantalla y el acta usan esta ruta directo.
 *
 * `Cache-Control: private, max-age=300`: el navegador reusa el redirect 5 min
 * (menos que la firma) y ningún proxy compartido lo guarda.
 */
const NO_ESTA = { error: "Foto no encontrada" } as const;

export async function GET(req: NextRequest, ctx: { params: Promise<{ tenantId: string; foto: string }> }) {
  /* Un acta con 40 miniaturas son 40 pedidos: el preset de LECTURA del drive. */
  const limitado = applyRateLimit(req, "DRIVE_READ", "superadmin:plantas:inspecciones:fotos:ver");
  if (limitado) return limitado;
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const { tenantId, foto } = await ctx.params;
  const tid = tenantIdSchema.safeParse(tenantId);
  if (!tid.success || !esIdDeFotoDeInspeccion(foto)) return NextResponse.json(NO_ESTA, { status: 404 });

  const firmada = await firmarFotoCarga(pathDeFotoDeInspeccion(tid.data, foto));
  if (!firmada) return NextResponse.json(NO_ESTA, { status: 404 });
  return new NextResponse(null, {
    status: 302,
    headers: { Location: firmada, "Cache-Control": "private, max-age=300", "Referrer-Policy": "no-referrer" },
  });
}
