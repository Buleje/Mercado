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
 * «Silenciar 1 h» se recuerda en este navegador y sólo apaga el mensaje: el
 * contador sigue sumando. Sin pitido: el pitido queda para «apareció alguien».
 */
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { toast } from "sonner";
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
export const CLAVE_SILENCIO_AVISOS = "camaras:avisos-silencio-hasta";
const SILENCIO_MS = 60 * 60_000;

interface Instantanea {
  avisos: EstadoAvisos;
  silencioHasta: number;
}
/** Lo que dibuja la cabecera: sólo cambia cuando cambia el contador o el silencio. */
interface Vista {
  sinVer: EstadoAvisos["sinVer"];
  silencioHasta: number;
}

const INICIAL: Instantanea = { avisos: ESTADO_AVISOS_INICIAL, silencioHasta: 0 };
const VISTA_INICIAL: Vista = { sinVer: ESTADO_AVISOS_INICIAL.sinVer, silencioHasta: 0 };
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
  if (actual.avisos.sinVer === vista.sinVer && actual.silencioHasta === vista.silencioHasta) return;
  vista = { sinVer: actual.avisos.sinVer, silencioHasta: actual.silencioHasta };
  oyentes.forEach((f) => f());
}

function leerSilencio(): number {
  if (!silencioLeido && typeof window !== "undefined") {
    silencioLeido = true;
    try {
      const v = Number(window.localStorage.getItem(CLAVE_SILENCIO_AVISOS));
      if (Number.isFinite(v) && v > Date.now()) fijar({ silencioHasta: v });
    } catch {
      /* Almacenamiento bloqueado (modo privado estricto): sin silencio recordado. */
    }
  }
  return actual.silencioHasta;
}

function guardarSilencio(hasta: number) {
  fijar({ silencioHasta: hasta });
  try {
    if (hasta > 0) window.localStorage.setItem(CLAVE_SILENCIO_AVISOS, String(hasta));
    else window.localStorage.removeItem(CLAVE_SILENCIO_AVISOS);
  } catch {
    /* Sin almacenamiento: el silencio dura hasta recargar. */
  }
}

export const marcarVistosAvisosCamaras = () => fijar({ avisos: marcarVisto(actual.avisos) });

export const silenciarAvisosCamaras = () => {
  guardarSilencio(Date.now() + SILENCIO_MS);
  toast.dismiss(ID_MENSAJE);
};
export const reactivarAvisosCamaras = () => guardarSilencio(0);

/** «Ver»: el mosaico minimizado se expande (ahí está lo que se movió); si no hay, se abre Cámaras. */
function verCamaras() {
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
    cancel: { label: "Silenciar 1 h", onClick: silenciarAvisosCamaras },
  });
}

function alSenal(e: Event) {
  const s = (e as CustomEvent<SenalCamara>).detail;
  if (!s || typeof s.camaraId !== "string" || typeof s.at !== "number") return;
  const d = registrarSenal(actual.avisos, s, leerSilencio());
  fijar({ avisos: d.estado });
  if (d.quitarMensaje) toast.dismiss(ID_MENSAJE);
  else if (d.mensaje && actual.silencioHasta <= Date.now()) mostrarMensaje(d.mensaje);
}

/** Una sola escucha para todas las cabeceras montadas. */
function conectar(): () => void {
  conexiones += 1;
  if (conexiones === 1) {
    window.addEventListener(EVENTO_SENAL_CAMARA, alSenal);
    window.addEventListener(EVENTO_MOSAICO_A_LA_VISTA, marcarVistosAvisosCamaras);
  }
  return () => {
    conexiones -= 1;
    if (conexiones === 0) {
      window.removeEventListener(EVENTO_SENAL_CAMARA, alSenal);
      window.removeEventListener(EVENTO_MOSAICO_A_LA_VISTA, marcarVistosAvisosCamaras);
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
  const { sinVer, silencioHasta } = useSyncExternalStore(suscribir, leer, leerEnServidor);

  useEffect(() => {
    config.abrirCamaras = abrirCamaras;
  }, [abrirCamaras]);

  useEffect(() => {
    if (!activo) return;
    leerSilencio();
    return conectar();
  }, [activo]);

  const resumen = useMemo(() => resumenSinVer(sinVer), [sinVer]);

  return {
    sinVer: activo ? sinVer.length : 0,
    resumen: activo ? resumen : null,
    silencioHasta,
  };
}
