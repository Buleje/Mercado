/**
 * El vigía de movimientos (Brandon 2026-10-23: «que el movimiento llegue a tu
 * celular con foto aunque la PC esté apagada») — la parte pura.
 *
 * Hasta acá la cola de alarmas de Hik-Connect la vaciaba sólo la cabecera del
 * panel abierto (`movimientos-nube.ts`). El vigía la vacía del lado del
 * servidor con la MISMA función (`movimientosRecientes`, que guarda 24 h y la
 * cabecera sigue leyendo de ahí) y, de lo guardado, decide qué avisar al
 * celular (Web Push) y a la campana del panel. Lo dispara el cron
 * `/api/cron/camaras-movimientos` (producción) o `npm run camaras:vigia` (la
 * PC prendida). La red: `vigia-movimientos.server.ts`.
 *
 * Frenos (los mismos números que el aviso de la cabecera):
 * - Un aviso por cámara cada `PUSH_POR_CAMARA_MS` (5 min): una rama que se
 *   mueve toda la tarde es un aviso, no cien. Lo frenado igual queda visto.
 * - Lo que llegó en la misma vuelta va JUNTO: «Movimiento en Entrada y Patio».
 * - Lo que pasó hace más de `VENTANA_PUSH_MS` ya no se avisa (el vigía estuvo
 *   apagado, o la cámara subió tarde): a la hora no le sirve a nadie.
 * - Interruptor del negocio y «Silenciar 1 h» por usuario, guardados en el
 *   servidor (`AjustesMovimientoCelular`): el celular no lee el navegador de
 *   la PC.
 *
 * Sin `server-only`: la cabecera importa los tipos de los ajustes.
 */
import { franjaAvisa, type CelularSuscrito } from "./avisar-push";
import { AVISO_POR_CAMARA_MS, horaLima, textoMovimiento } from "./avisos-segundo-plano";
import { movimientosNuevos, recordarVistos, type MovimientoNube } from "./movimientos-nube";

/** Un aviso por cámara cada 5 min como mucho (el mismo freno que el mensaje de la cabecera). */
export const PUSH_POR_CAMARA_MS = AVISO_POR_CAMARA_MS;
/** Lo de hace más de 10 min ya no se avisa al celular. */
export const VENTANA_PUSH_MS = 10 * 60_000;
/** Cuántos ids ya decididos se recuerdan (el servidor guarda 200 movimientos). */
export const TOPE_AVISADOS = 300;
/** «Silenciar 1 h». */
export const SILENCIO_CELULAR_MS = 60 * 60_000;
/** Todos los avisos de movimiento comparten etiqueta: el nuevo reemplaza al anterior en el celular. */
export const TAG_PUSH_MOVIMIENTO = "camaras-movimiento";
export const URL_CAMARAS = "/admin?tab=camaras";
export const API_FOTO_MOVIMIENTO = "/api/admin/camaras/movimientos/foto";
/** `?movimiento=<id>` en la pestaña de Cámaras abre la foto de ese movimiento (lo que abre «Ver foto» del aviso). */
export const PARAM_MOVIMIENTO = "movimiento";
/** De dónde se pidió la foto, para el registro de actividad: `aviso` = la bajó el service worker para el aviso. */
export const ORIGENES_FOTO = ["aviso", "panel"] as const;
export type OrigenFoto = (typeof ORIGENES_FOTO)[number];

/** La pestaña de Cámaras con la foto de ese movimiento abierta. */
export function urlDelMovimiento(id: string): string {
  return `${URL_CAMARAS}&${PARAM_MOVIMIENTO}=${encodeURIComponent(id)}`;
}

/** La ruta propia de la foto de un movimiento (`origen` sólo si no es el panel). */
export function rutaFotoMovimiento(id: string, origen: OrigenFoto = "panel"): string {
  const base = `${API_FOTO_MOVIMIENTO}?id=${encodeURIComponent(id)}`;
  return origen === "panel" ? base : `${base}&origen=${origen}`;
}

export interface EstadoVigia {
  /** Ids de movimientos ya decididos (avisados o frenados). */
  avisados: string[];
  /** cámara → `at` del último movimiento que salió en un aviso. */
  ultimoPorCamara: Record<string, number>;
}

export const VIGIA_INICIAL: EstadoVigia = { avisados: [], ultimoPorCamara: {} };

/** Lo guardado → `EstadoVigia` (cualquier otra cosa = nada decidido). */
export function leerEstadoVigia(v: unknown): EstadoVigia {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Partial<EstadoVigia>) : {};
  const avisados = Array.isArray(o.avisados) ? o.avisados.filter((x): x is string => typeof x === "string") : [];
  const ultimoPorCamara: Record<string, number> = {};
  if (o.ultimoPorCamara && typeof o.ultimoPorCamara === "object" && !Array.isArray(o.ultimoPorCamara)) {
    for (const [k, n] of Object.entries(o.ultimoPorCamara)) if (typeof n === "number" && Number.isFinite(n)) ultimoPorCamara[k] = n;
  }
  return { avisados: avisados.slice(-TOPE_AVISADOS), ultimoPorCamara };
}

export interface CamaraDelAviso {
  id: string;
  nombre: string;
  /** El movimiento más nuevo de esta cámara en la vuelta. */
  at: number;
  /** Cuántos movimientos de esta cámara entraron en la vuelta. */
  cuantos: number;
  /** El movimiento más nuevo CON foto (para el aviso), o `null`. */
  fotoId: string | null;
}

export interface GrupoMovimiento {
  /** Del más viejo al más nuevo. */
  camaras: CamaraDelAviso[];
  at: number;
}

export interface DecisionVigia {
  estado: EstadoVigia;
  /** Lo que se avisa en esta vuelta, o `null`. */
  grupo: GrupoMovimiento | null;
  /** Movimientos nuevos vistos en esta vuelta (avisados + frenados + de cámaras apagadas). */
  nuevos: number;
  /** Cámaras con movimiento nuevo que no avisan por el freno de 5 min. */
  frenadas: string[];
}

/**
 * Qué avisar de lo guardado. Puro: `ahora` y las cámaras activas los da quien
 * llama. Los movimientos de una cámara apagada se dan por vistos sin avisar.
 */
export function decidirAvisos(
  estado: EstadoVigia,
  movimientos: readonly MovimientoNube[],
  ahora: number,
  activas: ReadonlySet<string>,
): DecisionVigia {
  const nuevos = movimientosNuevos(movimientos, new Set(estado.avisados), ahora - VENTANA_PUSH_MS).filter(
    (m) => m.at <= ahora + 60_000,
  );
  if (nuevos.length === 0) return { estado, grupo: null, nuevos: 0, frenadas: [] };

  const porCamara = new Map<string, MovimientoNube[]>();
  for (const m of nuevos) {
    if (!activas.has(m.camaraId)) continue;
    porCamara.set(m.camaraId, [...(porCamara.get(m.camaraId) ?? []), m]);
  }

  const ultimoPorCamara = { ...estado.ultimoPorCamara };
  const camaras: CamaraDelAviso[] = [];
  const frenadas: string[] = [];
  for (const [id, lista] of porCamara) {
    const ultimo = lista[lista.length - 1];
    const previo = ultimoPorCamara[id];
    if (previo !== undefined && ultimo.at - previo < PUSH_POR_CAMARA_MS) {
      frenadas.push(id);
      continue;
    }
    ultimoPorCamara[id] = ultimo.at;
    const conFoto = [...lista].reverse().find((m) => m.conFoto);
    camaras.push({ id, nombre: ultimo.nombre, at: ultimo.at, cuantos: lista.length, fotoId: conFoto?.id ?? null });
  }
  camaras.sort((a, b) => a.at - b.at);

  return {
    estado: { avisados: recordarVistos(estado.avisados, nuevos, TOPE_AVISADOS), ultimoPorCamara },
    grupo: camaras.length > 0 ? { camaras, at: camaras[camaras.length - 1].at } : null,
    nuevos: nuevos.length,
    frenadas,
  };
}

/** Ninguno salió: las cámaras del grupo vuelven a su turno anterior (que la próxima vuelta sí avise). */
export function devolverTurnos(despues: EstadoVigia, antes: EstadoVigia, grupo: GrupoMovimiento): EstadoVigia {
  const ultimoPorCamara = { ...despues.ultimoPorCamara };
  for (const c of grupo.camaras) {
    const previo = antes.ultimoPorCamara[c.id];
    if (previo === undefined) delete ultimoPorCamara[c.id];
    else ultimoPorCamara[c.id] = previo;
  }
  return { ...despues, ultimoPorCamara };
}

/** Lo que el negocio eligió (vive en el servidor: el celular no lee la PC). */
export interface AjustesMovimientoCelular {
  /** Interruptor del negocio: apagado = ni celular ni campana. */
  prendido: boolean;
  /** usuario → hasta cuándo (epoch ms) calla su celular. */
  silencios: Record<string, number>;
}

export const AJUSTES_CELULAR_INICIAL: AjustesMovimientoCelular = { prendido: true, silencios: {} };

export function leerAjustesCelular(v: unknown): AjustesMovimientoCelular {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Partial<AjustesMovimientoCelular>) : {};
  const silencios: Record<string, number> = {};
  if (o.silencios && typeof o.silencios === "object" && !Array.isArray(o.silencios)) {
    for (const [u, n] of Object.entries(o.silencios)) if (typeof n === "number" && Number.isFinite(n)) silencios[u] = n;
  }
  return { prendido: o.prendido !== false, silencios };
}

/** Lo que ve la cabecera de los ajustes: sin los silencios de otros. */
export interface CelularMovimiento {
  prendido: boolean;
  /** Hasta cuándo calla el celular de quien pregunta (0 = no calla). */
  silencioHasta: number;
  /** Dispositivos de este negocio que reciben avisos de alguna cámara de la nube. */
  dispositivos: number;
  /** El servidor tiene las claves para mandar (sin ellas no sale nada). */
  conClaves: boolean;
}

export const silencioDe = (a: AjustesMovimientoCelular, usuario: string, ahora: number): number => {
  const h = a.silencios[usuario] ?? 0;
  return h > ahora ? h : 0;
};

/** Callar (o reactivar con `hasta = 0`) el celular de un usuario; los silencios vencidos se olvidan. */
export function fijarSilencio(
  a: AjustesMovimientoCelular,
  usuario: string,
  hasta: number,
  ahora: number,
): AjustesMovimientoCelular {
  const silencios: Record<string, number> = {};
  for (const [u, h] of Object.entries(a.silencios)) if (h > ahora && u !== usuario) silencios[u] = h;
  if (hasta > ahora) silencios[usuario] = hasta;
  return { ...a, silencios };
}

export interface CargaPushMovimiento {
  title: string;
  body: string;
  url: string;
  tag: string;
  /**
   * Ruta propia de la foto (con `origen=aviso`); `null` = sin foto. Con foto, el
   * aviso lleva «Ver foto» (abre `url`, el panel con ese movimiento).
   */
  foto: string | null;
  /** Sólo con `true` el service worker baja la foto y la pone en el aviso (se ve con el celular bloqueado). */
  fotoEnAviso: boolean;
}

/**
 * El aviso de ESTE dispositivo: sólo las cámaras del grupo que tiene
 * prendidas («Avisarme en este celular») en su franja, y nada si su usuario lo
 * calló. `null` = a este no le toca.
 */
export function pushParaDispositivo(
  grupo: GrupoMovimiento,
  d: Pick<CelularSuscrito, "usuario" | "camaras" | "fotoEnAviso">,
  ahora: Date,
  ajustes: AjustesMovimientoCelular,
): CargaPushMovimiento | null {
  if (!ajustes.prendido || silencioDe(ajustes, d.usuario, ahora.getTime()) > 0) return null;
  const suyas = grupo.camaras.filter((c) => {
    const cuando = d.camaras?.[c.id];
    return (cuando === "siempre" || cuando === "noche") && franjaAvisa(cuando, ahora);
  });
  if (suyas.length === 0) return null;
  const at = Math.max(...suyas.map((c) => c.at));
  const conFoto = [...suyas].sort((a, b) => b.at - a.at).find((c) => c.fotoId);
  const cuantos = suyas.reduce((n, c) => n + c.cuantos, 0);
  const verQue = conFoto ? "Toca para ver la foto." : "Toca para abrir las cámaras.";
  return {
    title: `${textoMovimiento(suyas.map((c) => c.nombre))} · ${horaLima(at)}`,
    body: cuantos > 1 ? `${cuantos} detecciones. ${verQue}` : verQue,
    /* «Ver foto» y tocar el aviso abren el panel con ESE movimiento (con la sesión). */
    url: conFoto?.fotoId ? urlDelMovimiento(conFoto.fotoId) : URL_CAMARAS,
    tag: TAG_PUSH_MOVIMIENTO,
    foto: conFoto?.fotoId ? rutaFotoMovimiento(conFoto.fotoId, "aviso") : null,
    /* La foto se ve con el celular bloqueado sólo si SU dueño lo aceptó (Ley 29733). */
    fotoEnAviso: !!d.fotoEnAviso,
  };
}

/** El aviso de la campana del panel: uno solo sin leer, que se pone al día con lo último. */
export function textoCampana(grupo: GrupoMovimiento): { title: string; body: string } {
  const cuantos = grupo.camaras.reduce((n, c) => n + c.cuantos, 0);
  return {
    title: `${textoMovimiento(grupo.camaras.map((c) => c.nombre))} · ${horaLima(grupo.at)}`,
    body:
      cuantos > 1
        ? `La cámara detectó ${cuantos} movimientos. Mira la foto en el menú de Cámaras.`
        : "La cámara detectó movimiento. Mira la foto en el menú de Cámaras.",
  };
}
