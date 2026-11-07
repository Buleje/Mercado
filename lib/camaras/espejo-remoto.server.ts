import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  ImagenNoPermitida,
  verificarImagen,
  type FormatoCamara,
} from "@/lib/camaras/imagen-segura";
import { kvBorrar, kvEscribir, kvLeer } from "@/lib/camaras/kv-efimero.server";
import { registrarMirada, VENTANA_MIRADA_MS } from "@/lib/camaras/registro-miradas";
import {
  LADO_MAX_CUADRO,
  LADO_MAX_ENTRADA,
  SEGUNDOS_VIDA_CUADRO,
} from "@/lib/camaras/espejo-remoto";
import { logger } from "@/lib/logger";

/**
 * El último cuadro del «Espejo del celular» para mirarlo desde otro equipo
 * (24-10; contrato en `lib/camaras/espejo-remoto.ts`).
 *
 * Qué se guarda y dónde: SÓLO el último cuadro, re-codificado a WebP, en la
 * memoria efímera del módulo (`kv-efimero.server.ts`: Upstash con vencimiento
 * de 10 s; sin Upstash, un `Map` del proceso con el mismo vencimiento). Nada
 * a disco, al bucket, a la IA ni a la base: del celular pueden salir WhatsApp
 * o el banco. La clave lleva el negocio Y el usuario de la sesión: sólo quien
 * comparte lo ve desde sus otros equipos, y ni el negocio ni el usuario salen
 * nunca del cliente.
 */

type Guardado = { ts: number; b64: string; emisor: string };

const VIDA_MS = SEGUNDOS_VIDA_CUADRO * 1000;
const FORMATOS: ReadonlySet<FormatoCamara> = new Set(["jpeg", "webp"]);
const CALIDAD_WEBP = 60;

/** El usuario va como huella: un nombre raro no arma una clave rara. */
const clave = (tenantId: string, usuario: string) =>
  `camaras:espejo:cuadro:${tenantId}:${createHash("sha256").update(usuario).digest("hex").slice(0, 32)}`;

/** El cuadro declara medidas que no salen de un espejo reducido (una bomba de píxeles pesa poco). */
export class CuadroEspejoGrande extends Error {
  constructor() {
    super("cuadro_muy_grande");
  }
}

/**
 * Verifica que sea JPEG o WebP de verdad (el `content-type` del cliente no
 * alcanza), con medidas de un espejo, y lo re-codifica: lo que se sirve sale
 * de sharp, sin metadatos ni bytes de más pegados al final.
 * @throws ImagenNoPermitida (415) · CuadroEspejoGrande (413)
 */
export async function prepararCuadroEspejo(bytes: Buffer): Promise<Buffer> {
  const meta = await verificarImagen(bytes, FORMATOS);
  if ((meta.width ?? 0) > LADO_MAX_ENTRADA || (meta.height ?? 0) > LADO_MAX_ENTRADA)
    throw new CuadroEspejoGrande();
  try {
    return await sharp(bytes, {
      limitInputPixels: LADO_MAX_ENTRADA * LADO_MAX_ENTRADA,
      failOn: "error",
    })
      .resize({
        width: LADO_MAX_CUADRO,
        height: LADO_MAX_CUADRO,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: CALIDAD_WEBP })
      .toBuffer();
  } catch {
    throw new ImagenNoPermitida("ilegible");
  }
}

const vivo = (g: Guardado | null, ahora: number): Guardado | null =>
  g && typeof g.ts === "number" && typeof g.b64 === "string" && ahora - g.ts <= VIDA_MS ? g : null;

/**
 * Guarda el cuadro como el último de este usuario.
 *  · `nuevo`: no había espejo vivo (se prendió o volvió tras un corte) — la ruta lo anota.
 *  · `sigue`: el mismo equipo sigue mandando.
 *  · `otro_equipo`: otra pestaña del mismo usuario está compartiendo: no se pisa.
 */
export async function guardarCuadroEspejo(
  tenantId: string,
  usuario: string,
  emisor: string,
  webp: Buffer,
  ahora: number = Date.now(),
): Promise<"nuevo" | "sigue" | "otro_equipo"> {
  const k = clave(tenantId, usuario);
  const previo = vivo(await kvLeer<Guardado>(k), ahora);
  if (previo && previo.emisor !== emisor) return "otro_equipo";
  await kvEscribir(
    k,
    { ts: ahora, b64: webp.toString("base64"), emisor } satisfies Guardado,
    SEGUNDOS_VIDA_CUADRO,
  );
  return previo ? "sigue" : "nuevo";
}

/** El último cuadro de este usuario, si tiene menos de 10 s (Upstash puede tardar en vencerlo). */
export async function leerCuadroEspejo(
  tenantId: string,
  usuario: string,
  ahora: number = Date.now(),
): Promise<{ edadMs: number; imagen: Buffer } | null> {
  const g = vivo(await kvLeer<Guardado>(clave(tenantId, usuario)), ahora);
  return g ? { edadMs: Math.max(0, ahora - g.ts), imagen: Buffer.from(g.b64, "base64") } : null;
}

/** Al apagar: borra sólo si el cuadro es de ESTE equipo (otra pestaña que comparte no se corta). */
export async function borrarCuadroEspejo(
  tenantId: string,
  usuario: string,
  emisor: string,
): Promise<"borrado" | "no_habia" | "otro_equipo"> {
  const k = clave(tenantId, usuario);
  const g = await kvLeer<Guardado>(k);
  if (!g) return "no_habia";
  if (g.emisor !== emisor) return "otro_equipo";
  return (await kvBorrar(k)) ? "borrado" : "no_habia";
}

/* ── Quién miró (Ley 29733) ──────────────────────────────────────────────── */

export const CAMARA_ESPEJO = { id: "espejo-celular", nombre: "Espejo del celular" } as const;

/**
 * El visor pide cada 1,5 s y `registrarMirada` consulta la base (~120 ms):
 * este `Map` deja pasar una consulta por persona cada 5 min en cada instancia;
 * entre instancias deduplica `registrarMirada` (un renglón cada 5 min).
 */
const vistos = new Map<string, number>();

export function anotarMiradaEspejo(
  tenantId: string,
  quien: { usuario: string; rol: string },
  ahora: number = Date.now(),
  /** IP y huella del navegador: con una cookie robada, «quién miró» dice desde qué equipo (revisión 24-10). */
  desde: { ip?: string; equipo?: string } = {},
): void {
  const k = `${tenantId}:${quien.usuario}:${desde.equipo ?? ""}`;
  const antes = vistos.get(k);
  if (antes !== undefined && ahora - antes < VENTANA_MIRADA_MS) return;
  if (vistos.size > 500)
    for (const [x, t] of vistos) if (ahora - t >= VENTANA_MIRADA_MS) vistos.delete(x);
  vistos.set(k, ahora);
  registrarMirada(
    tenantId,
    quien,
    /* Un renglón cada 5 min por persona Y por equipo: dos equipos con el mismo usuario se ven los dos. */
    desde.equipo ? { id: `${CAMARA_ESPEJO.id}:${desde.equipo}`, nombre: CAMARA_ESPEJO.nombre } : CAMARA_ESPEJO,
    { tipo: "vivo", calidad: "sd", ...(desde.ip ? { ip: desde.ip } : {}), ...(desde.equipo ? { equipo: desde.equipo } : {}) },
    new Date(ahora),
  ).catch((err) =>
    logger.error("[camaras.espejo] anotar quién miró falló", { tenantId, error: String(err) }),
  );
}

/** Sólo tests. */
export function __reiniciarMiradasEspejo(): void {
  vistos.clear();
}
