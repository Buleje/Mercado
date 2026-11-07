import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { withApiHandler } from "@/lib/api-handler";
import { leerDireccionPublica } from "@/lib/camaras/direccion-publica.server";

/**
 * GET /api/admin/camaras/direccion — a qué dirección pública tiene que mandar la
 * cámara (2026-10-01).
 *
 * El panel armaba la dirección con `window.location.origin`. En la PC de Brandon
 * eso es `http://localhost:3000`, que la cámara 4G no puede alcanzar nunca: la
 * pantalla le daba para copiar una dirección que no servía.
 *
 * El orden (fija → túnel → nada) vive en `lib/camaras/direccion-publica.server.ts`,
 * que también usa «Probar recepción»: la prueba va a la MISMA dirección que se copia.
 * Si el panel corre en un dominio público, la dirección de la pestaña sirve; si
 * corre en localhost, la pantalla tiene que decir que falta abrir el túnel.
 */
export const GET = withApiHandler("camaras-direccion", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(await leerDireccionPublica(), {
    headers: { "Cache-Control": "no-store" },
  });
});
