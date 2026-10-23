"use client";

/**
 * Los movimientos que ve la cámara aunque nadie la tenga abierta (Brandon
 * 2026-10-23): la cabecera pregunta a `/api/admin/camaras/movimientos` cada
 * 45 s en CUALQUIER pestaña del panel y cada evento nuevo entra al camino de
 * siempre (`emitirSenalCamara` con `origen: "nube"`): el contador de la
 * cabecera, el mensaje «Movimiento en …», el sonido (si se pidió) y, con la
 * pestaña oculta, el aviso del sistema. Lo puro está en
 * `lib/camaras/movimientos-nube.ts`.
 *
 * El estado es del MÓDULO (una sola consulta aunque haya dos cabeceras). Con
 * dos pestañas, la lista de ya avisados vive en el navegador: el que lo vio
 * primero lo avisa y el otro no lo repite. Se apaga con «Avisos de movimiento
 * en segundo plano» (menú de Cámaras o «Sonido y avisos»).
 */
import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { csrfHeaders } from "@/lib/csrf-client";
import { emitirSenalCamara } from "@/lib/camaras/avisos-segundo-plano";
import {
  anotarVistos,
  avisosNubePrendidosDe,
  CADA_MS_CLIENTE,
  CADA_MS_SIN_CAMARAS,
  CLAVE_AVISOS_NUBE,
  CLAVE_AVISOS_NUBE_VISTOS,
  leerRespuestaMovimientos,
  leerVistos,
  movimientosNuevos,
  nombresDe,
  pedirDesde,
  sinDeteccion,
  type DeteccionCamara,
  type MovimientoNube,
} from "@/lib/camaras/movimientos-nube";

export const API_MOVIMIENTOS = "/api/admin/camaras/movimientos";
const ESPERA_CUPO_MS = 2 * 60_000;
const ESPERA_ERROR_MS = 90_000;
/** Al volver a la pestaña, si la última vuelta fue hace más de esto, se pregunta ya. */
const AL_VOLVER_MS = 30_000;
const ID_TOAST = "camaras-deteccion";

export interface EstadoNube {
  prendido: boolean;
  /** `null` = todavía no se preguntó. */
  vinculado: boolean | null;
  deteccion: DeteccionCamara[];
  puedeConfigurar: boolean;
  /** Última vez que el servidor miró la nube. */
  consultadoAt: number;
  /** El último movimiento que llegó (para «Foto del último movimiento»). */
  ultimo: MovimientoNube | null;
  prendiendo: boolean;
  aviso: string | null;
}

const INICIAL: EstadoNube = {
  prendido: true,
  vinculado: null,
  deteccion: [],
  puedeConfigurar: false,
  consultadoAt: 0,
  ultimo: null,
  prendiendo: false,
  aviso: null,
};

let estado: EstadoNube = INICIAL;
const oyentes = new Set<() => void>();
let conexiones = 0;
let reloj: ReturnType<typeof setTimeout> | null = null;
let enCurso = false;
let ultimaVuelta = 0;
/** 401/403: la sesión o el rol no da; no se insiste hasta recargar. */
let vetado = false;

function fijar(cambios: Partial<EstadoNube>) {
  estado = { ...estado, ...cambios };
  oyentes.forEach((f) => f());
}

function leerAlmacen(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function escribirAlmacen(clave: string, valor: string) {
  try {
    window.localStorage.setItem(clave, valor);
  } catch (err) {
    logger.warn("[camaras.nube] no se pudo guardar en el navegador", { error: String(err) });
  }
}

function programar(ms: number) {
  if (reloj) clearTimeout(reloj);
  reloj = conexiones > 0 && estado.prendido && !vetado ? setTimeout(lanzar, ms) : null;
}

/** Una vuelta: pregunta, avisa lo nuevo y deja programada la próxima. */
export async function revisarMovimientos(ahora = Date.now()): Promise<void> {
  if (enCurso || vetado || !estado.prendido) return;
  enCurso = true;
  ultimaVuelta = ahora;
  let proxima = CADA_MS_CLIENTE;
  try {
    const vistos = leerVistos(leerAlmacen(CLAVE_AVISOS_NUBE_VISTOS));
    const desde = pedirDesde(vistos, ahora);
    const r = await fetch(`${API_MOVIMIENTOS}?desde=${desde}`, { cache: "no-store" });
    if (r.status === 401 || r.status === 403) {
      vetado = true;
      return;
    }
    if (r.status === 429) {
      proxima = ESPERA_CUPO_MS;
      return;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = leerRespuestaMovimientos(await r.json());
    if (!d) throw new Error("respuesta con otra forma");
    if (!d.vinculado) proxima = CADA_MS_SIN_CAMARAS;
    /* Releer: otra pestaña pudo avisar mientras esta esperaba la respuesta. */
    const ahoraVistos = leerVistos(leerAlmacen(CLAVE_AVISOS_NUBE_VISTOS));
    const nuevos = movimientosNuevos(d.eventos, new Set(ahoraVistos.ids), desde);
    if (nuevos.length > 0) {
      escribirAlmacen(CLAVE_AVISOS_NUBE_VISTOS, JSON.stringify(anotarVistos(ahoraVistos, nuevos)));
      const panel = document.querySelector("[data-mosaico-panel]");
      for (const m of nuevos)
        emitirSenalCamara(
          { camaraId: m.camaraId, nombre: m.nombre, at: m.at, movimiento: true, aparicion: false, personas: 0, origen: "nube" },
          panel,
        );
    }
    fijar({
      vinculado: d.vinculado,
      deteccion: d.deteccion,
      puedeConfigurar: d.puedeConfigurar,
      consultadoAt: d.consultadoAt,
      ultimo: nuevos.at(-1) ?? estado.ultimo ?? d.eventos[0] ?? null,
      aviso: d.aviso,
    });
  } catch (err) {
    proxima = ESPERA_ERROR_MS;
    logger.warn("[camaras.nube] no se pudo revisar los movimientos", { error: String(err) });
  } finally {
    enCurso = false;
    programar(proxima);
  }
}

function lanzar() {
  revisarMovimientos().catch((err: unknown) =>
    logger.warn("[camaras.nube] la vuelta falló", { error: String(err) }),
  );
}

function alVolver() {
  if (!document.hidden && Date.now() - ultimaVuelta > AL_VOLVER_MS) lanzar();
}

function aplicarPreferencia(texto: string | null) {
  const prendido = avisosNubePrendidosDe(texto);
  if (prendido === estado.prendido) return;
  fijar({ prendido });
  if (prendido) lanzar();
  else programar(0);
}

/* `useLocalStorage` (lo usa «Sonido y avisos») avisa en la misma pestaña con «local-storage». */
function alAlmacen(e: Event) {
  if (e instanceof StorageEvent) {
    if (e.key === CLAVE_AVISOS_NUBE) aplicarPreferencia(e.newValue);
    return;
  }
  const d = (e as CustomEvent<{ key?: string; value?: unknown }>).detail;
  if (d?.key === CLAVE_AVISOS_NUBE) aplicarPreferencia(JSON.stringify(d.value ?? true));
}

/** Prende o apaga los avisos (lo guarda igual que el interruptor de «Sonido y avisos»). */
export function fijarAvisosNube(prendido: boolean) {
  escribirAlmacen(CLAVE_AVISOS_NUBE, JSON.stringify(prendido));
  window.dispatchEvent(new CustomEvent("local-storage", { detail: { key: CLAVE_AVISOS_NUBE, value: prendido } }));
}

function conectar(): () => void {
  conexiones += 1;
  if (conexiones === 1) {
    fijar({ prendido: avisosNubePrendidosDe(leerAlmacen(CLAVE_AVISOS_NUBE)) });
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("storage", alAlmacen);
    window.addEventListener("local-storage", alAlmacen);
    lanzar();
  }
  return () => {
    conexiones -= 1;
    if (conexiones === 0) {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("storage", alAlmacen);
      window.removeEventListener("local-storage", alAlmacen);
      programar(0);
    }
  };
}

async function prenderUna(c: DeteccionCamara): Promise<string | null> {
  const r = await fetch(`/api/admin/camaras/${encodeURIComponent(c.camaraId)}/control`, {
    method: "POST",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ accion: "deteccion", activa: true }),
  });
  if (r.ok) return null;
  let j: { message?: unknown } | null = null;
  try {
    j = (await r.json()) as { message?: unknown } | null;
  } catch {
    j = null;
  }
  return typeof j?.message === "string" ? j.message : `No se pudo (HTTP ${r.status})`;
}

/** «Prender detección»: en las cámaras que la tienen apagada, una por una. */
export async function prenderDeteccion(): Promise<void> {
  const apagadas = sinDeteccion(estado.deteccion);
  if (apagadas.length === 0 || estado.prendiendo) return;
  if (!estado.puedeConfigurar) {
    toast.info("La detección la prende el dueño o un administrador", { id: ID_TOAST });
    return;
  }
  fijar({ prendiendo: true });
  try {
    const prendidas: string[] = [];
    let error: string | null = null;
    for (const c of apagadas) {
      const e = await prenderUna(c);
      if (e) error = e;
      else prendidas.push(c.camaraId);
    }
    fijar({
      deteccion: estado.deteccion.map((d) => (prendidas.includes(d.camaraId) ? { ...d, armada: true } : d)),
    });
    if (error) toast.error("No se pudo prender la detección", { id: ID_TOAST, description: error });
    else
      toast.success(`Detección prendida en ${nombresDe(apagadas)}`, {
        id: ID_TOAST,
        description: "Te avisa cuando la cámara vea movimiento",
      });
  } catch (err) {
    logger.warn("[camaras.nube] prender la detección falló", { error: String(err) });
    toast.error("No se pudo prender la detección", { id: ID_TOAST, description: "Revisa la conexión y vuelve a intentar" });
  } finally {
    fijar({ prendiendo: false });
  }
}

/** La foto del último movimiento, en otra pestaña (la baja nuestro servidor). */
export function verFotoUltimoMovimiento() {
  const u = estado.ultimo;
  if (!u?.conFoto) return;
  window.open(`${API_MOVIMIENTOS}/foto?id=${encodeURIComponent(u.id)}`, "_blank", "noopener");
}

const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
};
const leer = () => estado;
const leerEnServidor = () => INICIAL;

/** @param activo Sólo quien puede ver Cámaras pregunta (sin permiso: nada). */
export function useMovimientosNube(activo: boolean): EstadoNube {
  const e = useSyncExternalStore(suscribir, leer, leerEnServidor);
  useEffect(() => {
    if (!activo) return;
    return conectar();
  }, [activo]);
  return e;
}

/** Sólo tests: arranca de cero. */
export function __reiniciarMovimientosNube() {
  if (reloj) clearTimeout(reloj);
  estado = INICIAL;
  conexiones = 0;
  reloj = null;
  enCurso = false;
  ultimaVuelta = 0;
  vetado = false;
}
