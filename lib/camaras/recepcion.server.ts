import "server-only";
import sharp from "sharp";
import { logger } from "@/lib/logger";
import {
  avisoDePrueba,
  direccionesDePrueba,
  leerAviso,
  leerLlega,
  protocoloQueSirve,
  type PasoRecepcion,
  type RespuestaPrueba,
  type ResultadoRecepcion,
} from "@/lib/camaras/recepcion";
import { baseParaLaCamara } from "@/lib/camaras/direccion-publica.server";

/**
 * «Probar recepción» desde el servidor (2026-10-05).
 *
 * La prueba la hace el servidor y no el navegador: la dirección pública es otro
 * dominio (el túnel) y el navegador no deja leer su respuesta. Además así se
 * recorre el mismo camino que la cámara: DNS → Cloudflare → portero → panel.
 *
 * SSRF: la dirección NO viene del pedido. Sale de la configuración del servidor
 * (`baseParaLaCamara`: variable de entorno, archivo del túnel con forma
 * `*.trycloudflare.com`, o el dominio del panel) y sin seguir redirecciones.
 */

const TIEMPO_MS = 12_000;

/** Una foto chica hecha acá: no se guarda nunca, sólo prueba que el receptor la decodifica. */
async function jpegDePrueba(): Promise<Buffer> {
  return sharp({
    create: { width: 320, height: 180, channels: 3, background: { r: 0, g: 128, b: 128 } },
  })
    .jpeg({ quality: 70 })
    .toBuffer();
}

async function pedir(
  url: string,
  init: RequestInit,
): Promise<{ status: number | null; json: RespuestaPrueba | null; ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      ...init,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TIEMPO_MS),
    });
    let json: RespuestaPrueba | null = null;
    try {
      json = (await r.json()) as RespuestaPrueba;
    } catch {
      json = null;
    }
    return { status: r.status, json, ms: Date.now() - t0 };
  } catch (err) {
    const tiempo =
      err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return {
      status: null,
      json: null,
      ms: Date.now() - t0,
      error: tiempo ? "tiempo" : String(err),
    };
  }
}

export async function probarRecepcion(token: string): Promise<ResultadoRecepcion> {
  const destino = await baseParaLaCamara();
  if (!destino.base) return { base: null, bloqueo: destino.motivo, pasos: [], protocolo: null };

  const urls = direccionesDePrueba(destino.base, token);
  const pasos: PasoRecepcion[] = [];

  const ping = await pedir(urls.llega, { method: "GET" });
  const llega = leerLlega(ping.status, ping.json, ping.ms, ping.error);
  pasos.push(llega);
  /* Sin `prueba: true` no se manda la foto: un servidor que no conoce el modo
     la guardaría como foto real. */
  if (!llega.ok) return { base: destino.base, bloqueo: null, pasos, protocolo: null };

  const { cuerpo, contentType } = avisoDePrueba(await jpegDePrueba(), new Date().toISOString());
  const variantes = [
    ["https", urls.https],
    ["http", urls.http],
  ] as const;
  for (const [paso, url] of variantes) {
    if (!url) continue;
    const r = await pedir(url, {
      method: "POST",
      headers: { "content-type": contentType, "content-length": String(cuerpo.length) },
      body: new Uint8Array(cuerpo),
    });
    pasos.push(leerAviso(paso, r.status, r.json, r.ms, r.error));
  }
  const protocolo = protocoloQueSirve(pasos);
  if (!protocolo)
    logger.warn("[camaras.recepcion] la prueba no llegó", { base: destino.base, pasos });
  return { base: destino.base, bloqueo: null, pasos, protocolo };
}
