import "server-only";
import { sharpSeguro, verificarImagen } from "@/lib/camaras/imagen-segura";
import { logger } from "@/lib/logger";
import type { Camara, RecorteCamara } from "@/lib/camaras/camaras";
import {
  LADO_HUELLA,
  SEGUNDOS_CUADRO,
  ajustesVivo,
  cuentaDelDia,
  decidirPaso,
  estadoDe,
  estadoTrasGuardar,
  recorteEnPixeles,
  type EstadoVivo,
  type MotivoPaso,
} from "@/lib/camaras/vivo";

/**
 * Puente de pantalla (ADR-466) — lo que toca sharp y Redis.
 *
 * Por cada cuadro que manda la PC:
 *  1. se recorta (si la cámara tiene `recorte`) y se arma un webp liviano para
 *     mirar y una huella de 32×32 en gris para comparar;
 *  2. el webp queda en Redis 60 s, por negocio y cámara: es lo que pide el
 *     panel. NO va al historial ni a la IA;
 *  3. si la decisión pura (`vivo.ts`) dice que toca, se guarda como foto por
 *     el camino de siempre (`guardar`, que pone la ruta) y se anota la huella.
 *
 * ## Redis y su respaldo
 *
 * Upstash, como el resto del repo (rate limit, costo de IA, placas). Sin las
 * variables —dev sin configurar, tests— todo vive en un `Map` del proceso: con
 * una sola instancia anda igual; con varias (Vercel) cada una vería su propio
 * cuadro, por eso en producción Upstash es obligatorio para esta función. Si
 * una llamada a Upstash falla, se loguea y se usa el respaldo: perder un cuadro
 * de un segundo no vale un 500.
 *
 * ## Costo por cuadro
 *
 * 2 comandos (SET del cuadro + GET del estado); +3 cuando se guarda (candado,
 * estado, soltar). A 1 cuadro/s son ~173 mil comandos por día y cámara.
 */

/** El cuadro para mirar: alcanza para el panel y pesa ~50–150 KB. */
const ANCHO_CUADRO = 1280;
const CALIDAD_CUADRO = 70;
/** La foto del historial, igual que la entrada de siempre (la IA lee placas). */
const ANCHO_FOTO = 1600;
const CALIDAD_FOTO = 80;
/** La huella sobrevive 3 días sin cuadros; después, el primero vuelve a entrar como `cambio`. */
const SEGUNDOS_ESTADO = 3 * 24 * 3600;
/**
 * Mientras un cuadro se guarda (storage + historial ≈ 1–3 s, hasta ~20 s con
 * el pool frío) otro no puede guardarse: sin candado, dos cuadros seguidos del
 * mismo cambio entraban los dos. Si el proceso muere, el candado vence solo.
 */
const SEGUNDOS_CANDADO = 60;

const CLAVE = {
  cuadro: (tenantId: string, camaraId: string) => `camaras:vivo:cuadro:${tenantId}:${camaraId}`,
  estado: (tenantId: string, camaraId: string) => `camaras:vivo:estado:${tenantId}:${camaraId}`,
  candado: (tenantId: string, camaraId: string) => `camaras:vivo:candado:${tenantId}:${camaraId}`,
};

// ── Redis (Upstash) con respaldo en memoria ─────────────────────────────────

type Redis = import("@upstash/redis").Redis;
let _redis: Redis | null = null;
let _resuelto = false;

async function getRedis(): Promise<Redis | null> {
  if (_resuelto) return _redis;
  _resuelto = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    logger.warn("[camaras.vivo] sin Upstash: el cuadro en vivo vive en la memoria de este proceso");
    return null;
  }
  try {
    const { Redis } = await import("@upstash/redis");
    _redis = new Redis({ url, token });
  } catch (err) {
    logger.warn("[camaras.vivo] Upstash no disponible, uso la memoria", { error: String(err) });
    _redis = null;
  }
  return _redis;
}

/** Respaldo SÓLO para cuando no hay Upstash (ver arriba). */
const memoria = new Map<string, { valor: unknown; vence: number }>();

function deMemoria(clave: string): unknown {
  const e = memoria.get(clave);
  if (!e) return null;
  if (Date.now() >= e.vence) {
    memoria.delete(clave);
    return null;
  }
  return e.valor;
}

async function leer(clave: string): Promise<unknown> {
  const r = await getRedis();
  if (r) {
    try {
      return await r.get(clave);
    } catch (err) {
      logger.warn("[camaras.vivo] Redis get falló, leo la memoria", { error: String(err) });
    }
  }
  return deMemoria(clave);
}

async function escribir(clave: string, valor: unknown, segundos: number): Promise<void> {
  const r = await getRedis();
  if (r) {
    try {
      await r.set(clave, valor, { ex: segundos });
      return;
    } catch (err) {
      logger.warn("[camaras.vivo] Redis set falló, guardo en memoria", { error: String(err) });
    }
  }
  memoria.set(clave, { valor, vence: Date.now() + segundos * 1000 });
}

/** SET NX: `true` si el candado era libre y ahora es de este cuadro. */
async function tomar(clave: string, segundos: number): Promise<boolean> {
  const r = await getRedis();
  if (r) {
    try {
      return (await r.set(clave, "1", { nx: true, ex: segundos })) === "OK";
    } catch (err) {
      logger.warn("[camaras.vivo] Redis candado falló, uso la memoria", { error: String(err) });
    }
  }
  if (deMemoria(clave) !== null) return false;
  memoria.set(clave, { valor: "1", vence: Date.now() + segundos * 1000 });
  return true;
}

async function soltar(clave: string): Promise<void> {
  memoria.delete(clave);
  const r = await getRedis();
  if (r) await r.del(clave);
}

/** Sólo para los tests: vuelve a leer las variables y vacía la memoria. */
export function _reiniciarCuadroVivoParaTests(): void {
  _redis = null;
  _resuelto = false;
  memoria.clear();
}

// ── Imagen ──────────────────────────────────────────────────────────────────

/** Lo que llegó no es una imagen que sharp pueda leer: la ruta lo contesta 415. */
export class CuadroIlegible extends Error {
  constructor(causa: unknown) {
    super(`cuadro ilegible: ${String(causa)}`);
    this.name = "CuadroIlegible";
  }
}

export interface CuadroPreparado {
  /** webp ≤ 1280 px para mirar. */
  cuadro: Buffer;
  /** 32×32 grises (1024 bytes) para comparar. */
  huella: Uint8Array;
  /** La foto del historial (webp ≤ 1600 px): se arma sólo si se guarda. */
  foto: () => Promise<Buffer>;
}

/**
 * Recorta y prepara el cuadro. El recorte se aplica DESPUÉS de enderezar
 * (EXIF): las fracciones son de la imagen como se ve. Todo sale re-codificado
 * por nosotros, como en la entrada de siempre.
 */
export async function prepararCuadro(bytes: Buffer, recorte?: RecorteCamara | null): Promise<CuadroPreparado> {
  let ancho: number;
  let alto: number;
  try {
    /* Formato REAL (no el content-type) y techo de píxeles: ver `imagen-segura.ts`. */
    const meta = await verificarImagen(bytes, new Set(["jpeg", "webp"]));
    if (!meta.width || !meta.height) throw new Error("sin medidas");
    const girada = (meta.orientation ?? 1) >= 5;
    ancho = girada ? meta.height : meta.width;
    alto = girada ? meta.width : meta.height;
  } catch (err) {
    throw new CuadroIlegible(err);
  }
  const px = recorteEnPixeles(recorte, ancho, alto);
  const base = () => {
    const s = sharpSeguro(bytes).rotate();
    return px ? s.extract(px) : s;
  };
  try {
    const [cuadro, gris] = await Promise.all([
      base().resize({ width: ANCHO_CUADRO, withoutEnlargement: true }).webp({ quality: CALIDAD_CUADRO }).toBuffer(),
      base()
        .resize(LADO_HUELLA, LADO_HUELLA, { fit: "fill" })
        .removeAlpha()
        .toColourspace("b-w")
        .raw()
        .toBuffer({ resolveWithObject: true }),
    ]);
    /* `b-w` da un canal; si algún formato devolviera más, se toma el primero de cada punto. */
    const canales = gris.info.channels;
    const huella = new Uint8Array(LADO_HUELLA * LADO_HUELLA);
    for (let i = 0; i < huella.length; i++) huella[i] = gris.data[i * canales] ?? 0;
    return {
      cuadro,
      huella,
      foto: () => base().resize({ width: ANCHO_FOTO, withoutEnlargement: true }).webp({ quality: CALIDAD_FOTO }).toBuffer(),
    };
  } catch (err) {
    throw new CuadroIlegible(err);
  }
}

// ── El último cuadro ────────────────────────────────────────────────────────

export interface UltimoCuadro {
  /** Epoch ms en que llegó. */
  ts: number;
  imagen: Buffer;
}

/**
 * El último cuadro de una cámara, o `null` si no llegó nada en 60 s. La clave
 * lleva el `tenantId`: con la cámara de otro negocio no hay nada que leer.
 */
export async function ultimoCuadro(tenantId: string, camaraId: string, ahora = Date.now()): Promise<UltimoCuadro | null> {
  if (!tenantId) throw new Error("tenantId is required");
  const raw = await leer(CLAVE.cuadro(tenantId, camaraId));
  if (!raw || typeof raw !== "object") return null;
  const { ts, b64 } = raw as { ts?: unknown; b64?: unknown };
  if (typeof ts !== "number" || typeof b64 !== "string" || !b64) return null;
  /* El TTL de Redis ya lo borra; esto cubre la memoria y un reloj corrido. */
  if (ahora - ts > SEGUNDOS_CUADRO * 1000) return null;
  return { ts, imagen: Buffer.from(b64, "base64") };
}

// ── Un cuadro que llega ─────────────────────────────────────────────────────

export interface PasoDelCuadro {
  guardada: boolean;
  motivo: MotivoPaso;
}

const huellaDe = (estado: EstadoVivo | null) =>
  estado ? new Uint8Array(Buffer.from(estado.huella, "base64")) : null;

function decidir(estado: EstadoVivo | null, huella: Uint8Array, ahora: number, camara: Camara) {
  const anterior = huellaDe(estado);
  return decidirPaso({
    huella,
    anterior: estado && anterior ? { huella: anterior, guardadaEn: estado.guardadaEn } : null,
    cuentaHoy: cuentaDelDia(estado, ahora),
    ahora,
    ajustes: ajustesVivo(camara),
  });
}

/**
 * Recibe un cuadro del puente: lo deja para mirar y decide si pasa al
 * historial. `guardar` es el camino de siempre (storage + historial + IA): lo
 * pone la ruta, que es quien sabe de `after()`. Si `guardar` falla, la huella
 * no se mueve —el próximo cuadro vuelve a intentarlo— y el error sube.
 */
export async function recibirCuadro(
  tenantId: string,
  camara: Camara,
  bytes: Buffer,
  guardar: (foto: Buffer, motivo: Exclude<MotivoPaso, "sin_cambio" | "tope_del_dia">) => Promise<void>,
  ahora = Date.now(),
): Promise<PasoDelCuadro> {
  if (!tenantId) throw new Error("tenantId is required");
  const prep = await prepararCuadro(bytes, camara.recorte);
  await escribir(CLAVE.cuadro(tenantId, camara.id), { ts: ahora, b64: prep.cuadro.toString("base64") }, SEGUNDOS_CUADRO);

  const claveEstado = CLAVE.estado(tenantId, camara.id);
  const primera = decidir(estadoDe(await leer(claveEstado)), prep.huella, ahora, camara);
  if (!primera.guardar) return { guardada: false, motivo: primera.motivo };

  /* Otro cuadro se está guardando ahora mismo: éste es el mismo momento visto
     un segundo después, no hace falta otra foto. */
  const claveCandado = CLAVE.candado(tenantId, camara.id);
  if (!(await tomar(claveCandado, SEGUNDOS_CANDADO))) return { guardada: false, motivo: "sin_cambio" };
  try {
    /* Releída con el candado: entre la primera lectura y ahora pudo terminar
       de guardarse otro cuadro, y contra ESA foto hay que medir. */
    const estado = estadoDe(await leer(claveEstado));
    const paso = decidir(estado, prep.huella, ahora, camara);
    if (!paso.guardar) return { guardada: false, motivo: paso.motivo };
    const motivo = paso.motivo === "intervalo" ? "intervalo" : "cambio";
    await guardar(await prep.foto(), motivo);
    await escribir(claveEstado, estadoTrasGuardar(estado, Buffer.from(prep.huella).toString("base64"), ahora), SEGUNDOS_ESTADO);
    return { guardada: true, motivo };
  } finally {
    await soltar(claveCandado).catch((err) =>
      logger.warn("[camaras.vivo] no se pudo soltar el candado (vence solo en 60 s)", {
        error: String(err),
        camaraId: camara.id,
      }),
    );
  }
}
