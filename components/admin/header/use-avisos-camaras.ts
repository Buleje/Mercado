"use client";

/**
 * Los avisos de movimiento de las cámaras en la cabecera (Brandon 2026-10-10).
 * La regla (cuándo suma, cuándo avisa, cómo agrupa) es pura y vive en
 * `lib/camaras/avisos-segundo-plano.ts`; acá sólo se escuchan las señales del
 * detector, se guarda el contador y se muestra el mensaje flotante (sonner,
 * el mismo del «Apareció 1 persona» del mosaico).
 *
 * El estado es del MÓDULO, no del componente: sobrevive a que la cabecera se
 * vuelva a montar, y una sola escucha atiende aunque haya dos cabeceras.
 * Dos silencios, recordados en este navegador (el contador sigue sumando):
 * - «Silenciar movimiento 1 h» del mensaje: calla SÓLO el movimiento.
 * - «Silenciar alarmas» (menú y «Sonido y avisos»): calla todo, también la
 *   alarma de personas y los avisos del sistema.
 * El movimiento suena sólo si se pidió en «Sonido y avisos» (2026-10-15); con
 * la pestaña oculta, el aviso del sistema lleva el mensaje
 * (`lib/camaras/sonido-avisos-audio.ts`).
 */
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { CLAVE_SILENCIO_ALARMAS, CLAVE_SILENCIO_MOVIMIENTO, silencioDe } from "@/lib/camaras/sonido-avisos";
import { notificarSistema, sonarAlarma } from "@/lib/camaras/sonido-avisos-audio";
import {
  ESTADO_AVISOS_INICIAL,
  EVENTO_EXPANDIR_MOSAICO,
  EVENTO_MOSAICO_A_LA_VISTA,
  EVENTO_SENAL_CAMARA,
  horaLima,
  marcarVisto,
  registrarSenal,
  resumenSinVer,
  soltarMensaje,
  textoMovimiento,
  type EstadoAvisos,
  type MensajeMovimiento,
  type SenalCamara,
} from "@/lib/camaras/avisos-segundo-plano";

const ID_MENSAJE = "camaras-movimiento";
const SILENCIO_MS = 60 * 60_000;
/** Aviso del sistema de «apareció alguien»: uno por cámara cada 20 s (como el mensaje del mosaico). */
const PERSONA_SISTEMA_CADA_MS = 20_000;
const personaAvisadaEn = new Map<string, number>();

/** Hasta cuándo calla cada silencio (epoch ms, 0 = no). */
interface Silencios {
  /** «Silenciar alarmas»: todo. */
  silencioHasta: number;
  /** «Silenciar movimiento» del mensaje: sólo el movimiento. */
  silencioMovimientoHasta: number;
}
interface Instantanea extends Silencios {
  avisos: EstadoAvisos;
}
/** Lo que dibuja la cabecera: sólo cambia cuando cambia el contador o un silencio. */
interface Vista extends Silencios {
  sinVer: EstadoAvisos["sinVer"];
}

const SIN_SILENCIO: Silencios = { silencioHasta: 0, silencioMovimientoHasta: 0 };
const INICIAL: Instantanea = { avisos: ESTADO_AVISOS_INICIAL, ...SIN_SILENCIO };
const VISTA_INICIAL: Vista = { sinVer: ESTADO_AVISOS_INICIAL.sinVer, ...SIN_SILENCIO };
const CLAVE: Record<keyof Silencios, string> = {
  silencioHasta: CLAVE_SILENCIO_ALARMAS,
  silencioMovimientoHasta: CLAVE_SILENCIO_MOVIMIENTO,
};
let actual: Instantanea = INICIAL;
let vista: Vista = VISTA_INICIAL;
let silencioLeido = false;
const oyentes = new Set<() => void>();
/** Lo que hace «Ver» cuando no hay mosaico que expandir: lo pone la cabecera. */
const config: { abrirCamaras: (() => void) | null } = { abrirCamaras: null };
let conexiones = 0;

/* Con movimiento llega una señal por segundo y por cámara: el estado interno
   cambia en cada una, pero la cabecera sólo se vuelve a dibujar si cambió lo
   que muestra (el contador o el silencio). */
function fijar(cambios: Partial<Instantanea>) {
  actual = { ...actual, ...cambios };
  if (
    actual.avisos.sinVer === vista.sinVer &&
    actual.silencioHasta === vista.silencioHasta &&
    actual.silencioMovimientoHasta === vista.silencioMovimientoHasta
  )
    return;
  const { silencioHasta, silencioMovimientoHasta } = actual;
  vista = { sinVer: actual.avisos.sinVer, silencioHasta, silencioMovimientoHasta };
  oyentes.forEach((f) => f());
}

const vigente = (v: number) => (v > Date.now() ? v : 0);

function fijarSilencio(cual: keyof Silencios, hasta: number) {
  const cambio: Partial<Silencios> = {};
  cambio[cual] = hasta;
  fijar(cambio);
}

function leerSilencios(): void {
  if (silencioLeido || typeof window === "undefined") return;
  silencioLeido = true;
  try {
    const leido = (k: keyof Silencios) => vigente(silencioDe(window.localStorage.getItem(CLAVE[k])));
    fijar({ silencioHasta: leido("silencioHasta"), silencioMovimientoHasta: leido("silencioMovimientoHasta") });
  } catch {
    /* Almacenamiento bloqueado (modo privado estricto): sin silencio recordado. */
  }
}

/** Hasta cuándo calla el mensaje de movimiento: lo calla cualquiera de los dos silencios. */
function movimientoCalladoHasta(): number {
  leerSilencios();
  return Math.max(actual.silencioHasta, actual.silencioMovimientoHasta);
}

function guardarSilencio(cual: keyof Silencios, hasta: number) {
  fijarSilencio(cual, hasta);
  try {
    if (hasta > 0) window.localStorage.setItem(CLAVE[cual], String(hasta));
    else window.localStorage.removeItem(CLAVE[cual]);
  } catch {
    /* Sin almacenamiento: el silencio dura hasta recargar. */
  }
}

export const marcarVistosAvisosCamaras = () => fijar({ avisos: marcarVisto(actual.avisos) });

/** «Silenciar alarmas»: personas, movimiento y avisos del sistema por `ms` (1 h por defecto). */
export const silenciarAlarmasCamaras = (ms: number = SILENCIO_MS) => {
  guardarSilencio("silencioHasta", Date.now() + ms);
  toast.dismiss(ID_MENSAJE);
};
/** El «Silenciar» del mensaje de movimiento: sólo el movimiento (las personas siguen sonando). */
export const silenciarMovimientoCamaras = (ms: number = SILENCIO_MS) => {
  guardarSilencio("silencioMovimientoHasta", Date.now() + ms);
  toast.dismiss(ID_MENSAJE);
};
/** Vuelve todo a sonar (los dos silencios). */
export const reactivarAvisosCamaras = () => {
  guardarSilencio("silencioHasta", 0);
  guardarSilencio("silencioMovimientoHasta", 0);
};

/** «Ver»: el mosaico minimizado se expande (ahí está lo que se movió); si no hay, se abre Cámaras. */
export function verCamaras() {
  marcarVistosAvisosCamaras();
  if (document.querySelector("[data-mosaico-panel]")) {
    window.dispatchEvent(new Event(EVENTO_EXPANDIR_MOSAICO));
  } else {
    config.abrirCamaras?.();
  }
}

function mostrarMensaje(m: MensajeMovimiento) {
  toast.info(textoMovimiento(m.camaras.map((c) => c.nombre)), {
    id: ID_MENSAJE,
    description: `A las ${horaLima(m.at)}`,
    duration: 10_000,
    /* Cerrado (a mano o por tiempo): el próximo arma su propio grupo. */
    onDismiss: () => fijar({ avisos: soltarMensaje(actual.avisos, m.at) }),
    onAutoClose: () => fijar({ avisos: soltarMensaje(actual.avisos, m.at) }),
    action: { label: "Ver", onClick: verCamaras },
    cancel: { label: "Silenciar movimiento 1 h", onClick: () => silenciarMovimientoCamaras() },
  });
  sonarAlarma({ tipo: "movimiento" }).catch((err: unknown) =>
    logger.warn("[camaras] la alarma de movimiento falló", { error: String(err) }),
  );
  notificarSistema({
    titulo: textoMovimiento(m.camaras.map((c) => c.nombre)),
    cuerpo: `A las ${horaLima(m.at)}`,
    etiqueta: ID_MENSAJE,
    alTocar: verCamaras,
  });
}

/** Con la pestaña oculta, el «Apareció…» del mosaico no se ve: va al sistema. */
function avisarPersonaOculta(s: SenalCamara) {
  if (!document.hidden) return;
  const antes = personaAvisadaEn.get(s.camaraId) ?? 0;
  if (s.at - antes < PERSONA_SISTEMA_CADA_MS) return;
  personaAvisadaEn.set(s.camaraId, s.at);
  const n = Math.max(1, Math.round(s.personas));
  notificarSistema({
    titulo: n === 1 ? `Apareció 1 persona en ${s.nombre}` : `Aparecieron ${n} personas en ${s.nombre}`,
    cuerpo: `A las ${horaLima(s.at)}`,
    etiqueta: `camaras-persona-${s.camaraId}`,
    alTocar: verCamaras,
  });
}

/** Otra pestaña silenció o reactivó: el menú de esta lo muestra igual. */
function alAlmacen(e: StorageEvent) {
  const cual = (Object.keys(CLAVE) as (keyof Silencios)[]).find((k) => CLAVE[k] === e.key);
  if (cual) fijarSilencio(cual, vigente(silencioDe(e.newValue)));
}

function alSenal(e: Event) {
  const s = (e as CustomEvent<SenalCamara>).detail;
  if (!s || typeof s.camaraId !== "string" || typeof s.at !== "number") return;
  const callado = movimientoCalladoHasta();
  const d = registrarSenal(actual.avisos, s, callado);
  fijar({ avisos: d.estado });
  if (d.evento?.tipo === "persona") avisarPersonaOculta(s);
  if (d.quitarMensaje) toast.dismiss(ID_MENSAJE);
  else if (d.mensaje && callado <= Date.now()) mostrarMensaje(d.mensaje);
}

/** Una sola escucha para todas las cabeceras montadas. */
function conectar(): () => void {
  conexiones += 1;
  if (conexiones === 1) {
    window.addEventListener(EVENTO_SENAL_CAMARA, alSenal);
    window.addEventListener(EVENTO_MOSAICO_A_LA_VISTA, marcarVistosAvisosCamaras);
    window.addEventListener("storage", alAlmacen);
  }
  return () => {
    conexiones -= 1;
    if (conexiones === 0) {
      window.removeEventListener(EVENTO_SENAL_CAMARA, alSenal);
      window.removeEventListener(EVENTO_MOSAICO_A_LA_VISTA, marcarVistosAvisosCamaras);
      window.removeEventListener("storage", alAlmacen);
    }
  };
}

const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
};
const leer = () => vista;
const leerEnServidor = () => VISTA_INICIAL;

/**
 * @param activo Sólo quien puede ver Cámaras escucha (sin permiso: ni cuenta ni avisa).
 * @param abrirCamaras «Ver» sin mosaico abierto: abrir Cámaras (el modal de accesos).
 */
export function useAvisosCamaras(activo: boolean, abrirCamaras: () => void) {
  const { sinVer, silencioHasta, silencioMovimientoHasta } = useSyncExternalStore(suscribir, leer, leerEnServidor);

  useEffect(() => {
    config.abrirCamaras = abrirCamaras;
  }, [abrirCamaras]);

  useEffect(() => {
    if (!activo) return;
    leerSilencios();
    return conectar();
  }, [activo]);

  const resumen = useMemo(() => resumenSinVer(sinVer), [sinVer]);

  return {
    sinVer: activo ? sinVer.length : 0,
    resumen: activo ? resumen : null,
    silencioHasta,
    silencioMovimientoHasta,
  };
}
