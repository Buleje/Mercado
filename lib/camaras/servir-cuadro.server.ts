import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { CamarasDB } from "@/lib/db/camaras.db";
import { ultimoCuadro } from "@/lib/camaras/cuadro-vivo.server";

/**
 * El último cuadro del puente de pantalla (ADR-466) — la parte que no es auth,
 * compartida por `/api/admin/camaras/[id]/cuadro` y el espejo del Modo TV
 * (ADR-473).
 *
 *  · 200 `image/webp` + `X-Cuadro-Ts` (ISO 8601 de cuando llegó) + `no-store`.
 *  · 204 si no llegó nada en los últimos 60 s (la PC está apagada o sin red).
 *  · 404 si la cámara no es de este negocio: el `tenantId` sale de la
 *    credencial y va en la clave de Redis, así que la de otro no se puede leer
 *    ni por id.
 */

const idSchema = z.string().trim().min(1).max(64);

export async function responderCuadro(tenantId: string, idCrudo: string): Promise<NextResponse> {
  const id = idSchema.safeParse(idCrudo);
  if (!id.success) return NextResponse.json({ error: "no_encontrada" }, { status: 404 });
  const camara = (await CamarasDB.list(tenantId)).find((c) => c.id === id.data);
  if (!camara) return NextResponse.json({ error: "no_encontrada" }, { status: 404 });

  const cuadro = await ultimoCuadro(tenantId, camara.id);
  if (!cuadro) return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  return new NextResponse(new Uint8Array(cuadro.imagen), {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "no-store",
      "X-Cuadro-Ts": new Date(cuadro.ts).toISOString(),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
