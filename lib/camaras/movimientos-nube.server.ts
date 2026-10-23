import "server-only";

/**
 * Vacía la cola de alarmas de Hik-Connect for Teams y guarda lo de las
 * últimas 24 h por negocio (Upstash, o la memoria del proceso en dev). El
 * porqué y lo medido: `movimientos-nube.ts`; leer el lote: `alarmas-hik.ts`.
 *
 * - Una sola ida a Hik-Connect cada ≥20 s por negocio, la pidan 1 o 10
 *   pestañas (`consultadoAt` + candado con dueño, que dura más que la peor
 *   vuelta y sólo lo borra quien lo puso).
 * - Lo traído se guarda ANTES de confirmar el lote, y sólo se confirma si quedó
 *   en Upstash: si se cae entre medio o Upstash falla, la cola lo vuelve a dar
 *   y el id lo deduplica (nunca se pierde un aviso).
 * - La foto firmada nunca sale del servidor: `fotoDeMovimiento` la baja, con
 *   tope de tamaño y el formato verificado; quién la vio queda en el registro.
 */
import { randomUUID } from "node:crypto";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { errorSinDatos } from "@/lib/error-sin-datos";
import { kvBorrar, kvBorrarSiEs, kvEscribir, kvEscribirDonde, kvLeer } from "@/lib/camaras/kv-efimero.server";
import { ImagenNoPermitida, verificarImagen } from "@/lib/camaras/imagen-segura";
import { llamarConToken, type CredencialesHik } from "@/lib/camaras/hik-connect-api.server";
import type { Leido } from "@/lib/camaras/hik-connect-api";
import { estadoDelAparato } from "@/lib/camaras/ezviz-control.server";
import { decodificarFotoHik, estaCifrada } from "@/lib/camaras/ezviz-foto";
import { CamarasDB } from "@/lib/db/camaras.db";
import { CamarasHikConnectDB } from "@/lib/db/camaras-hik-connect.db";
import type { Camara } from "@/lib/camaras/camaras";
import {
  aMovimientos,
  esUrlDeFotoAlarma,
  leerLoteAlarmas,
  mezclarMovimientos,
  PEDIDO_SUSCRIBIR,
  RUTAS_ALARMAS_HIK,
  SIN_SUSCRIPCION,
  type CamaraEnlazada,
  type LoteAlarmas,
  type MovimientoGuardado,
} from "@/lib/camaras/alarmas-hik";
import type { DeteccionCamara } from "@/lib/camaras/movimientos-nube";
import type { OrigenFoto } from "@/lib/camaras/vigia-movimientos";

export const CADA_SERVIDOR_MS = 20_000;
/** Lotes por vuelta: la cola da ~10 por lote; más de 30 de golpe es una ráfaga que ya avisó igual. */
const LOTES_MAX = 3;
/** Pasado esto no se empieza otro lote (la función corta a los 30 s; lo que quede, en la próxima). */
const PLAZO_VUELTA_MS = 12_000;
const VIDA_S = 24 * 3600;
/**
 * Peor vuelta: 12 s de plazo + un lote entero (token, traer, suscribir, traer y
 * confirmar a 8 s cada una = 40 s) ≈ 52 s. El candado dura más para que no
 * entre otra vuelta encima; lo normal es que se borre al terminar.
 */
export const CANDADO_S = 90;
const DETECCION_S = 5 * 60;
/** Una cámara 4G dormida no contesta: se recuerda 1 min para no preguntarle en cada vuelta. */
const DETECCION_DUDOSA_S = 60;
const FOTO_MAX_BYTES = 8 * 1024 * 1024;
/** Las fotos de alarma medidas son JPEG; otra cosa no se sirve. */
const SOLO_JPEG = new Set(["jpeg"] as const);
export const ACCION_FOTO_MOVIMIENTO = "camara.foto_movimiento_ver";

const claveMovimientos = (t: string) => `camaras:movimientos:${t}`;
const claveCandado = (t: string) => `camaras:movimientos:candado:${t}`;
const claveDeteccion = (t: string) => `camaras:movimientos:deteccion:${t}`;

interface Guardado {
  movimientos: MovimientoGuardado[];
  consultadoAt: number;
  aviso: string | null;
}

export interface Recientes {
  movimientos: MovimientoGuardado[];
  consultadoAt: number;
  aviso: string | null;
}

async function leerGuardado(tenantId: string): Promise<Guardado> {
  const g = await kvLeer<Guardado>(claveMovimientos(tenantId));
  return g && Array.isArray(g.movimientos)
    ? g
    : { movimientos: [], consultadoAt: 0, aviso: null };
}

export type FuenteMovimientos =
  | { ok: true; camaras: CamaraEnlazada[]; lista: Camara[]; cred: CredencialesHik }
  /** `motivo` = por qué no hay credenciales; `null` = no hay cámaras enlazadas. */
  | { ok: false; motivo: string | null };

/**
 * Las cámaras del negocio enlazadas a Hik-Connect y las credenciales para
 * vaciar su cola. Lo usan la ruta de la cabecera y el vigía (`vigia-movimientos.server.ts`).
 */
export async function fuenteDeMovimientos(tenantId: string): Promise<FuenteMovimientos> {
  const [cuenta, lista] = await Promise.all([CamarasHikConnectDB.leer(tenantId), CamarasDB.list(tenantId)]);
  const enlaces = cuenta?.enlaces ?? {};
  const camaras: CamaraEnlazada[] = lista
    .filter((c) => enlaces[c.id])
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      resourceId: enlaces[c.id].resourceId,
      deviceSerial: enlaces[c.id].deviceSerial,
    }));
  if (camaras.length === 0) return { ok: false, motivo: null };
  const cred = await CamarasHikConnectDB.credenciales(tenantId);
  if (!cred.ok) return { ok: false, motivo: cred.motivo };
  return { ok: true, camaras, lista, cred: cred.valor };
}

/** Un lote de la cola; si la cuenta no está suscrita (OPEN000016), se suscribe y repite una vez. */
async function traerLote(tenantId: string, c: CredencialesHik): Promise<Leido<LoteAlarmas>> {
  let r = await llamarConToken(tenantId, c, RUTAS_ALARMAS_HIK.traer, {});
  if (!r.ok && r.error.codigo === SIN_SUSCRIPCION) {
    const s = await llamarConToken(tenantId, c, RUTAS_ALARMAS_HIK.suscribir, PEDIDO_SUSCRIBIR);
    if (!s.ok) return s;
    logger.info("[camaras.movimientos] cola de alarmas suscrita", { tenantId });
    r = await llamarConToken(tenantId, c, RUTAS_ALARMAS_HIK.traer, {});
  }
  return r.ok ? { ok: true, valor: leerLoteAlarmas(r.valor) } : r;
}

/**
 * Los movimientos de las últimas 24 h; si pasaron ≥20 s desde la última ida,
 * antes vacía la cola. Si Hik-Connect falla, devuelve lo guardado con `aviso`.
 */
export async function movimientosRecientes(
  tenantId: string,
  c: CredencialesHik,
  camaras: readonly CamaraEnlazada[],
  ahora = Date.now(),
): Promise<Recientes> {
  const g = await leerGuardado(tenantId);
  if (ahora - g.consultadoAt < CADA_SERVIDOR_MS) return g;
  const dueno = randomUUID();
  if (!(await kvEscribir(claveCandado(tenantId), dueno, CANDADO_S, { soloSiNueva: true }))) return g;
  const inicio = Date.now();
  let movimientos = g.movimientos;
  let aviso: string | null = null;
  try {
    for (let i = 0; i < LOTES_MAX && Date.now() - inicio < PLAZO_VUELTA_MS; i++) {
      const r = await traerLote(tenantId, c);
      if (!r.ok) {
        aviso = r.error.mensaje;
        logger.warn("[camaras.movimientos] la cola de alarmas no contestó", {
          tenantId,
          codigo: r.error.codigo,
        });
        break;
      }
      const { lote, quedan, alarmas } = r.valor;
      movimientos = mezclarMovimientos(movimientos, aMovimientos(alarmas, camaras), ahora);
      /* Primero guardar, después confirmar: lo confirmado y no guardado se perdería. */
      const donde = await kvEscribirDonde(
        claveMovimientos(tenantId),
        { movimientos, consultadoAt: ahora, aviso: null },
        VIDA_S,
      );
      if (!lote) break;
      if (donde === "respaldo") {
        /* Quedó sólo en esta instancia: sin confirmar, la cola lo vuelve a dar a la próxima. */
        logger.warn("[camaras.movimientos] Upstash no guardó: el lote queda sin confirmar", { tenantId });
        break;
      }
      const ok = await llamarConToken(tenantId, c, RUTAS_ALARMAS_HIK.confirmar, { batchId: lote });
      if (!ok.ok) {
        logger.warn("[camaras.movimientos] confirmar el lote falló (vuelve en la próxima)", {
          tenantId,
          codigo: ok.error.codigo,
        });
        break;
      }
      if (quedan <= 0) break;
    }
    const final: Guardado = { movimientos, consultadoAt: ahora, aviso };
    await kvEscribir(claveMovimientos(tenantId), final, VIDA_S);
    return final;
  } finally {
    await kvBorrarSiEs(claveCandado(tenantId), dueno);
  }
}

/** Detección armada por cámara (guardado 5 min: es un `device/info` por cámara). */
export async function deteccionDe(
  tenantId: string,
  c: CredencialesHik,
  camaras: readonly CamaraEnlazada[],
): Promise<DeteccionCamara[]> {
  const guardada = await kvLeer<DeteccionCamara[]>(claveDeteccion(tenantId));
  if (Array.isArray(guardada) && guardada.length === camaras.length) return guardada;
  const lista = await Promise.all(
    camaras.map(async (cam): Promise<DeteccionCamara> => {
      const r = await estadoDelAparato(tenantId, c, cam.deviceSerial);
      return { camaraId: cam.id, nombre: cam.nombre, armada: r.ok ? r.valor.deteccion : null };
    }),
  );
  /* Lo que no se supo (cámara dormida) se recuerda 1 min, no 5: que se vuelva a preguntar pronto. */
  const seSupo = lista.every((d) => d.armada !== null);
  await kvEscribir(claveDeteccion(tenantId), lista, seSupo ? DETECCION_S : DETECCION_DUDOSA_S);
  return lista;
}

/** Tras prender o apagar la detección desde el panel: la cabecera lo ve en la próxima vuelta. */
export async function olvidarDeteccion(tenantId: string): Promise<void> {
  await kvBorrar(claveDeteccion(tenantId));
}

export type FotoMovimiento =
  | { ok: true; valor: Buffer; movimiento: Pick<MovimientoGuardado, "id" | "camaraId" | "nombre" | "at"> }
  | { ok: false; status: 404 | 502; error: string };

/** Lee el cuerpo por partes y corta al pasar el tope (sin `content-length` no se sabe antes). */
async function leerConTope(r: Response, tope: number): Promise<Buffer | null> {
  const lector = r.body?.getReader();
  if (!lector) return Buffer.alloc(0);
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) return Buffer.concat(partes);
    total += value.byteLength;
    if (total > tope) {
      try {
        await lector.cancel();
      } catch (err) {
        logger.warn("[camaras.movimientos] cortar la foto falló", { error: errorSinDatos(err) });
      }
      return null;
    }
    partes.push(value);
  }
}

async function bajar(url: string, primerSalto: boolean): Promise<Response | null> {
  if (!esUrlDeFotoAlarma(url, primerSalto)) return null;
  return fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000), cache: "no-store" });
}

/**
 * La foto de un movimiento de ESTE negocio (se busca en lo guardado del
 * tenant: el id de otro da 404). Sigue una sola redirección, y sólo hacia el
 * almacén de EZVIZ. La URL firmada no se loguea nunca.
 */
export async function fotoDeMovimiento(tenantId: string, id: string): Promise<FotoMovimiento> {
  const g = await leerGuardado(tenantId);
  const m = g.movimientos.find((x) => x.id === id);
  if (!m?.foto) return { ok: false, status: 404, error: "Ese movimiento no tiene foto (o ya pasaron 24 h)." };
  try {
    let r = await bajar(m.foto, true);
    const destino = r && r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
    if (r && destino) r = await bajar(new URL(destino, m.foto).toString(), false);
    if (!r || !r.ok) {
      logger.warn("[camaras.movimientos] foto no disponible", { tenantId, status: r?.status ?? 0 });
      return { ok: false, status: 502, error: "La nube de la cámara no dio la foto. Puede que ya haya vencido." };
    }
    const largo = Number(r.headers.get("content-length") ?? 0);
    const bytes = largo > FOTO_MAX_BYTES ? null : await leerConTope(r, FOTO_MAX_BYTES);
    if (!bytes) return { ok: false, status: 502, error: "La foto es demasiado grande." };
    if (bytes.length < 100) return { ok: false, status: 502, error: "La foto llegó vacía. Vuelve a intentar." };
    const codigo = estaCifrada(bytes)
      ? ((await CamarasHikConnectDB.enlaceParaVideo(tenantId, m.camaraId))?.codigo ?? null)
      : null;
    const foto = decodificarFotoHik(bytes, codigo);
    if (!foto.ok) return { ok: false, status: 502, error: foto.error };
    /* El formato REAL, no el que dice la nube (mismo criterio que la foto del vivo). */
    await verificarImagen(foto.valor, SOLO_JPEG);
    return { ok: true, valor: foto.valor, movimiento: { id: m.id, camaraId: m.camaraId, nombre: m.nombre, at: m.at } };
  } catch (err) {
    if (err instanceof ImagenNoPermitida) {
      logger.warn("[camaras.movimientos] la foto no es una imagen válida", { tenantId, motivo: err.motivo });
      return { ok: false, status: 502, error: "La foto llegó dañada. Vuelve a intentar." };
    }
    logger.warn("[camaras.movimientos] bajar la foto falló", {
      tenantId,
      error: err instanceof Error ? err.name : "desconocido",
    });
    return { ok: false, status: 502, error: "La nube de la cámara no contestó. Vuelve a intentar." };
  }
}

/**
 * Quién vio la foto de un movimiento (Ley 29733: son fotos de personas). Al
 * mismo `ActivityLog` que «quién miró» el video. Nunca tira.
 */
export async function registrarFotoVista(
  tenantId: string,
  quien: { usuario: string; rol: string },
  m: Pick<MovimientoGuardado, "id" | "camaraId" | "nombre" | "at">,
  /** `aviso` = la bajó el service worker del celular para mostrarla en el aviso. */
  origen: OrigenFoto = "panel",
): Promise<void> {
  try {
    await logActivity(
      ACCION_FOTO_MOVIMIENTO,
      "camara",
      JSON.stringify({ rol: quien.rol, camara: m.nombre, movimiento: m.id, at: new Date(m.at).toISOString(), origen }),
      m.camaraId,
      quien.usuario,
      undefined,
      tenantId,
    );
  } catch (err) {
    logger.warn("[camaras.movimientos] no se pudo anotar quién vio la foto", {
      tenantId,
      camaraId: m.camaraId,
      error: errorSinDatos(err),
    });
  }
}
