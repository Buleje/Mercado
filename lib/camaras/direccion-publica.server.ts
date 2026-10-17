import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { logger } from "@/lib/logger";
import { esDireccionLocal } from "@/lib/camaras/camaras";

/**
 * A qué dirección PÚBLICA tiene que mandar la cámara (2026-10-01; movido acá el
 * 05-10 para que «Probar recepción» pruebe exactamente la que se copia).
 *
 * En orden:
 *  1. `CAMARAS_URL_PUBLICA` — una dirección fija (un dominio propio, producción).
 *  2. El túnel de `npm run camaras:tunel`, que deja su dirección en
 *     `.camaras-tunel.json`. CAMBIA en cada reinicio: `desde` dice desde cuándo.
 *  3. Nada: `publica: null`.
 */

export interface DireccionPublicaServidor {
  publica: string | null;
  origen: "fija" | "tunel" | null;
  desde: string | null;
  /** ¿Sigue vivo el proceso del túnel? Con la fija, siempre `true`. */
  vivo: boolean;
}

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

export async function leerDireccionPublica(): Promise<DireccionPublicaServidor> {
  const fija = process.env.CAMARAS_URL_PUBLICA?.trim().replace(/\/+$/, "");
  if (fija) return { publica: fija, origen: "fija", desde: null, vivo: true };

  try {
    const crudo = await readFile(
      path.join(/* turbopackIgnore: true */ process.cwd(), ".camaras-tunel.json"),
      "utf8",
    );
    const datos = JSON.parse(crudo) as ArchivoTunel;
    /* Sólo un túnel rápido de Cloudflare: el servidor después le hace un
       pedido («Probar recepción»), así que el archivo no puede apuntarlo a
       cualquier host. */
    if (
      typeof datos.url === "string" &&
      /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(datos.url)
    ) {
      return {
        publica: datos.url,
        origen: "tunel",
        desde: typeof datos.desde === "string" ? datos.desde : null,
        vivo: procesoVivo(datos.pid),
      };
    }
  } catch (err) {
    /* Sin archivo es lo normal cuando el túnel no está abierto. */
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      logger.warn("[camaras.direccion] no se pudo leer el archivo del túnel", {
        error: String(err),
      });
    }
  }
  return { publica: null, origen: null, desde: null, vivo: false };
}

/**
 * La misma base que copia la pantalla (`estadoDireccion` en el cliente): la
 * fija, el túnel vivo, o el dominio del panel si no es local. `null` + motivo
 * cuando la cámara no tendría a dónde mandar.
 */
export async function baseParaLaCamara(): Promise<
  { base: string; motivo: null } | { base: null; motivo: "sin_publica" | "tunel_caido" }
> {
  const dir = await leerDireccionPublica();
  if (dir.publica) {
    return dir.vivo ? { base: dir.publica, motivo: null } : { base: null, motivo: "tunel_caido" };
  }
  const panel = (process.env.NEXT_PUBLIC_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (panel && !esDireccionLocal(panel)) return { base: panel, motivo: null };
  return { base: null, motivo: "sin_publica" };
}
