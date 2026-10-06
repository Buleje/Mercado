import "server-only";

import { logger } from "@/lib/logger";
import { permisoDeControl, type CredencialesHik } from "@/lib/camaras/hik-connect-api.server";
import {
  ERROR_FORMA_EZVIZ,
  ERROR_RED_EZVIZ,
  esUrlDeFotoEzviz,
  leerCapacidades,
  leerEstado,
  leerMicrofono,
  leerRespuestaEzviz,
  leerSalud,
  leerUrlFoto,
  pedidoAlarma,
  pedidoArmado,
  pedidoCapacidad,
  pedidoEstado,
  pedidoFoto,
  pedidoInfo,
  pedidoLeerMicrofono,
  pedidoMicrofono,
  pedidoMover,
  pedidoParar,
  type Capacidades,
  type Direccion,
  type ErrorEzviz,
  type EstadoAparato,
  type LeidoEzviz,
  type PedidoCabeceras,
  type Salud,
  type PedidoForm,
  type Velocidad,
} from "@/lib/camaras/ezviz-control";
import { decodificarFotoHik } from "@/lib/camaras/ezviz-foto";

/**
 * Controles del aparato por EZVIZ Open — la red (ADR-472). Lo puro está en
 * `ezviz-control.ts`.
 *
 * ## Lo que este archivo NUNCA hace
 *
 * Pedirle algo a un dominio que no sea de EZVIZ (el permiso abre TODAS las
 * cámaras de la cuenta del equipo): el dominio sale de `permisoDeControl`, que
 * ya lo filtró a `*.ezvizlife.com`, y acá se vuelve a mirar. La foto se baja
 * sólo de `https://*.ezvizlife.com`, sin seguir redirecciones. Tampoco loguea
 * el permiso, la serie completa ni la URL firmada de la foto.
 *
 * ## Tiempos medidos (05-10, DS-2CFSP4/4G por 4G)
 *
 * `ptz/start` 1,2-1,6 s · `ptz/stop` 0,9-2,4 s · `defence/set` 1,5 s ·
 * `sound/set` 3,5-4,5 s · `capture` 3,7 s · `capacity` 0,2-0,7 s.
 */

const TIMEOUT_MS = 12_000;
const TIMEOUT_FOTO_MS = 20_000;
const MAX_FOTO = 8 * 1024 * 1024;
/** Lo que la cámara sabe hacer no cambia: se pregunta una vez cada 30 min. */
const VIDA_CAPACIDADES_MS = 30 * 60_000;

const capacidadesGuardadas = new Map<string, { valor: Capacidades; vence: number }>();

const esDominioEzviz = (d: string) => {
  try {
    const u = new URL(d);
    return u.protocol === "https:" && u.hostname.endsWith(".ezvizlife.com");
  } catch {
    return false;
  }
};

const serieCorta = (s: string) => `…${s.slice(-4)}`;

async function enviar(
  dominio: string,
  appToken: string,
  pedido: PedidoForm | PedidoCabeceras,
): Promise<unknown> {
  if (!esDominioEzviz(dominio)) {
    logger.error("[ezviz] dominio fuera de la lista", { dominio });
    return null;
  }
  const conCabeceras = "cabeceras" in pedido;
  try {
    const r = await fetch(`${dominio}${pedido.ruta}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...(conCabeceras && { accessToken: appToken, ...pedido.cabeceras }),
      },
      body: new URLSearchParams(
        conCabeceras ? pedido.campos : { accessToken: appToken, ...pedido.campos },
      ).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
      redirect: "error",
    });
    /* Las APIs `v3` contestan 4xx CON su JSON (60020 vino en un 422): se lee igual. */
    return await r.json().catch(() => {
      logger.warn("[ezviz] respuesta que no es JSON", { ruta: pedido.ruta, status: r.status });
      return null;
    });
  } catch (err) {
    logger.warn("[ezviz] sin respuesta", {
      ruta: pedido.ruta,
      error: err instanceof Error ? err.name : "desconocido",
    });
    return null;
  }
}

/** Un pedido con el permiso; si EZVIZ dice que venció (10002), otro permiso y UN reintento. */
async function conPermiso(
  tenantId: string,
  c: CredencialesHik,
  pedido: PedidoForm | PedidoCabeceras,
): Promise<LeidoEzviz<unknown>> {
  for (let intento = 0; intento < 2; intento++) {
    const p = await permisoDeControl(tenantId, c, intento > 0);
    if (!p.ok)
      return {
        ok: false,
        error: { codigo: p.error.codigo, tipo: "red", mensaje: p.error.mensaje },
      };
    const raw = await enviar(p.valor.dominioVideo, p.valor.appToken, pedido);
    if (raw === null) return { ok: false, error: ERROR_RED_EZVIZ };
    const r = leerRespuestaEzviz(raw);
    if (r.ok || r.error.tipo !== "token" || intento > 0) return r;
  }
  return { ok: false, error: ERROR_FORMA_EZVIZ };
}

function anotarRechazo(tenantId: string, que: string, serie: string, e: ErrorEzviz) {
  logger.info("[ezviz] rechazado", { tenantId, que, serie: serieCorta(serie), codigo: e.codigo });
}

export interface ControlesCamara {
  capacidades: Capacidades;
  estado: EstadoAparato;
  salud: Salud;
  /** Micrófono de la cámara prendido; `null` = no se sabe. */
  microfono: boolean | null;
}

/** Qué sabe hacer la cámara (guardado 30 min) y su estado de ahora (detección, en línea). */
export async function controlesDe(
  tenantId: string,
  c: CredencialesHik,
  serie: string,
): Promise<LeidoEzviz<ControlesCamara>> {
  const clave = `${tenantId}:${serie}`;
  const g = capacidadesGuardadas.get(clave);
  const vigente = g && g.vence > Date.now() ? g.valor : null;
  const [cap, info, salud, mic] = await Promise.all([
    vigente
      ? Promise.resolve<LeidoEzviz<unknown>>({ ok: true, valor: null })
      : conPermiso(tenantId, c, pedidoCapacidad(serie)),
    conPermiso(tenantId, c, pedidoInfo(serie)),
    conPermiso(tenantId, c, pedidoEstado(serie)),
    conPermiso(tenantId, c, pedidoLeerMicrofono(serie)),
  ]);
  if (!cap.ok) {
    anotarRechazo(tenantId, "capacidad", serie, cap.error);
    return cap;
  }
  const capacidades = vigente ?? leerCapacidades(cap.valor);
  if (!vigente)
    capacidadesGuardadas.set(clave, {
      valor: capacidades,
      vence: Date.now() + VIDA_CAPACIDADES_MS,
    });
  return {
    ok: true,
    valor: {
      capacidades,
      /* Sin `info` (cámara dormida) los botones igual se muestran: el estado queda «no se sabe». */
      estado: info.ok ? leerEstado(info.valor) : { enLinea: null, deteccion: null, modelo: null },
      salud: salud.ok ? leerSalud(salud.valor) : { bateria: null, tarjeta: null },
      microfono: mic.ok ? leerMicrofono(mic.valor) : null,
    },
  };
}

/** Empieza a mover (o frena con `"stop"`). La cámara sigue hasta que llega el stop. */
export async function mover(
  tenantId: string,
  c: CredencialesHik,
  serie: string,
  direccion: Direccion | "stop",
  velocidad: Velocidad = 1,
  ultima?: Direccion,
): Promise<LeidoEzviz<null>> {
  const pedido =
    direccion === "stop" ? pedidoParar(serie, ultima) : pedidoMover(serie, direccion, velocidad);
  const r = await conPermiso(tenantId, c, pedido);
  if (!r.ok) {
    anotarRechazo(tenantId, `ptz:${direccion}`, serie, r.error);
    return r;
  }
  return { ok: true, valor: null };
}

/**
 * Arma o desarma la detección. Con el 200 de EZVIZ vale lo pedido: releer
 * `device/info` enseguida devuelve el estado VIEJO (medido 05-10: leído al
 * instante decía lo de antes; a los 1,5 s, lo nuevo).
 */
export async function cambiarDeteccion(
  tenantId: string,
  c: CredencialesHik,
  serie: string,
  activa: boolean,
): Promise<LeidoEzviz<boolean>> {
  const r = await conPermiso(tenantId, c, pedidoArmado(serie, activa));
  if (!r.ok) {
    anotarRechazo(tenantId, "deteccion", serie, r.error);
    return r;
  }
  return { ok: true, valor: activa };
}

/** Prende o apaga el micrófono de la cámara (mismo criterio que la detección: vale el 200). */
export async function cambiarMicrofono(
  tenantId: string,
  c: CredencialesHik,
  serie: string,
  activo: boolean,
): Promise<LeidoEzviz<boolean>> {
  const r = await conPermiso(tenantId, c, pedidoMicrofono(serie, activo));
  if (!r.ok) {
    anotarRechazo(tenantId, "microfono", serie, r.error);
    return r;
  }
  return { ok: true, valor: activo };
}

/** Sirena + luz de la cámara («defensa activa»). `false` la apaga. */
export async function alarma(
  tenantId: string,
  c: CredencialesHik,
  serie: string,
  activa: boolean,
): Promise<LeidoEzviz<null>> {
  const r = await conPermiso(tenantId, c, pedidoAlarma(serie, activa));
  if (!r.ok) {
    anotarRechazo(tenantId, activa ? "alarma:on" : "alarma:off", serie, r.error);
    return r;
  }
  return { ok: true, valor: null };
}

/**
 * Una foto que saca la propia cámara (no el cuadro del reproductor). EZVIZ la
 * deja en su nube 2 h; se baja ya y se descifra si viene cifrada.
 */
export async function sacarFoto(
  tenantId: string,
  c: CredencialesHik,
  serie: string,
  codigo: string | null,
): Promise<LeidoEzviz<Buffer>> {
  const r = await conPermiso(tenantId, c, pedidoFoto(serie));
  if (!r.ok) {
    anotarRechazo(tenantId, "foto", serie, r.error);
    return r;
  }
  const url = leerUrlFoto(r.valor);
  if (!url.ok || !esUrlDeFotoEzviz(url.valor)) return { ok: false, error: ERROR_FORMA_EZVIZ };
  let bytes: Uint8Array;
  try {
    const f = await fetch(url.valor, {
      signal: AbortSignal.timeout(TIMEOUT_FOTO_MS),
      cache: "no-store",
      redirect: "error",
    });
    const largo = Number(f.headers.get("content-length") ?? 0);
    if (!f.ok || largo > MAX_FOTO) return { ok: false, error: ERROR_RED_EZVIZ };
    bytes = new Uint8Array(await f.arrayBuffer());
    if (bytes.length > MAX_FOTO || bytes.length < 100)
      return { ok: false, error: ERROR_FORMA_EZVIZ };
  } catch (err) {
    logger.warn("[ezviz] la foto no bajó", { error: err instanceof Error ? err.name : "?" });
    return { ok: false, error: ERROR_RED_EZVIZ };
  }
  const d = decodificarFotoHik(bytes, codigo);
  return d.ok
    ? { ok: true, valor: d.valor }
    : { ok: false, error: { codigo: "CIFRADO", tipo: "otro", mensaje: d.error } };
}
