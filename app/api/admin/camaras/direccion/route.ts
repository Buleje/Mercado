import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/camaras/direccion — a qué dirección pública tiene que mandar la
 * cámara (2026-10-01).
 *
 * El panel armaba la dirección con `window.location.origin`. En la PC de Brandon
 * eso es `http://localhost:3000`, que la cámara 4G no puede alcanzar nunca: la
 * pantalla le daba para copiar una dirección que no servía.
 *
 * En orden:
 *  1. `CAMARAS_URL_PUBLICA` — una dirección fija (un dominio propio, producción).
 *  2. El túnel de `npm run camaras:tunel`, que deja su dirección en
 *     `.camaras-tunel.json`. Esa dirección CAMBIA en cada reinicio del túnel:
 *     se devuelve `desde` para que la pantalla avise que hay que volver a
 *     pegarla en la cámara.
 *  3. Nada: `publica: null`. Si el panel corre en un dominio público, la
 *     dirección de la pestaña sirve; si corre en localhost, la pantalla tiene
 *     que decir que falta abrir el túnel.
 */

interface ArchivoTunel {
  url?: unknown;
  desde?: unknown;
  pid?: unknown;
}

/** ¿Sigue vivo el proceso que abrió el túnel? Sin proceso, la dirección no responde. */
function procesoVivo(pid: unknown): boolean {
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    // ESRCH: el proceso ya no existe — el túnel se cerró sin borrar su archivo.
    return false;
  }
}

export const GET = withApiHandler("camaras-direccion", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const sinCache = { headers: { "Cache-Control": "no-store" } };

  const fija = process.env.CAMARAS_URL_PUBLICA?.trim().replace(/\/+$/, "");
  if (fija) return NextResponse.json({ publica: fija, origen: "fija", desde: null, vivo: true }, sinCache);

  try {
    const crudo = await readFile(path.join(/* turbopackIgnore: true */ process.cwd(), ".camaras-tunel.json"), "utf8");
    const datos = JSON.parse(crudo) as ArchivoTunel;
    if (typeof datos.url === "string" && /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(datos.url)) {
      return NextResponse.json(
        {
          publica: datos.url,
          origen: "tunel",
          desde: typeof datos.desde === "string" ? datos.desde : null,
          vivo: procesoVivo(datos.pid),
        },
        sinCache,
      );
    }
  } catch (err) {
    /* Sin archivo es lo normal cuando el túnel no está abierto. */
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      logger.warn("[camaras.direccion] no se pudo leer el archivo del túnel", { error: String(err) });
    }
  }
  return NextResponse.json({ publica: null, origen: null, desde: null, vivo: false }, sinCache);
});
