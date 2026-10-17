/**
 * GET /api/juntas/[code]/qr — QR (SVG) del link de la junta para imprimir y
 * pegar en la puerta de la bodega o en el grupo de WhatsApp del barrio.
 *
 * El QR codifica `${BASE_URL}/junta/${code}`. Se genera en el servidor con el
 * algoritmo puro de `lib/qr/qr-matrix.ts` (sin canvas, sin dependencias del
 * cliente) y se devuelve como imagen SVG cacheable que el front muestra con
 * `<img>`. Verifica que la junta exista para no generar QRs de códigos basura.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveTenantIdForRoute } from "@/lib/resolve-tenant";
import { JuntasDB } from "@/lib/db/juntas.db";
import { logger } from "@/lib/logger";
import { makeQRMatrix, qrMatrixToSvg } from "@/lib/qr/qr-matrix";

const ParamsSchema = z.object({ code: z.string().min(3).max(64) });

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }
  const { code } = parsed.data;

  try {
    const tenantId = await resolveTenantIdForRoute(req);
    const junta = await JuntasDB.getByCode(tenantId, code);
    if (!junta) {
      return NextResponse.json({ error: "Junta no encontrada" }, { status: 404 });
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
      `https://${req.headers.get("host") ?? "localhost:3000"}`;
    const juntaUrl = `${baseUrl}/junta/${junta.code}`;

    // El QR es v3-M (cap ~47 bytes). Si la URL excede, makeQRMatrix la truncaría
    // y el QR apuntaría a un link roto: lo avisamos para detectarlo en prod.
    if (Buffer.byteLength(juntaUrl, "utf8") > 47) {
      logger.warn("[juntas/qr] URL excede capacidad v3-M, QR podría truncarse", {
        code: junta.code,
        urlLength: juntaUrl.length,
      });
    }

    const svg = qrMatrixToSvg(makeQRMatrix(juntaUrl), {
      dark: "#111111",
      light: "#ffffff",
    });

    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "Content-Disposition": `inline; filename="junta-${junta.code}.svg"`,
      },
    });
  } catch (err) {
    logger.error("[juntas/qr] Error generando QR", {
      code,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Error generando QR" }, { status: 503 });
  }
}
