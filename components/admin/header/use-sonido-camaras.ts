"use client";

/**
 * El sonido y la vigilancia de las cámaras, vistos desde la cabecera
 * (Brandon 2026-10-15: «el audio, sonido, alarma a veces no funcionan bien»).
 *
 * - Despierta el audio con el primer toque en cualquier lado del panel y dice
 *   si sigue bloqueado («Activa el sonido» en el menú de Cámaras). Si una
 *   alarma no pudo sonar, avisa una vez por minuto con «Activar sonido».
 * - Mira el mosaico (abierto, acoplado o en la burbuja): si se pausó (5 min
 *   sin tocar = sin video, sin detector, sin alarma) lo dice con «Seguir
 *   vigilando» y, con la pestaña oculta, con un aviso del sistema. Antes se
 *   callaba sin que nadie lo notara.
 *
 * La regla del sonido vive en `lib/camaras/sonido-avisos*.ts`.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { EVENTO_EXPANDIR_MOSAICO } from "@/lib/camaras/avisos-segundo-plano";
import {
  alBloquearSonido,
  desbloquearAudio,
  instalarDesbloqueo,
  leerEstadoAudio,
  leerEstadoAudioServidor,
  notificarSistema,
  sonarAlarma,
  suscribirEstadoAudio,
  type EstadoAudio,
} from "@/lib/camaras/sonido-avisos-audio";

const ID_SIN_SONIDO = "camaras-sin-sonido";
const ID_PAUSA = "camaras-pausa";
/** El mosaico marca su pausa en el panel; mirarla cada 3 s cuesta un `querySelector`. */
const MIRAR_PAUSA_MS = 3_000;
/* El panel existe abierto, acoplado y minimizado (la burbuja sólo minimizado). */
const PAUSADO = '[data-mosaico-panel][data-mosaico-pausa="pausado"]';
const BURBUJA = "[data-mosaico-burbuja]";

/** Despierta el audio (es un gesto) y suena una muestra: así se sabe que anda. */
export async function activarSonidoCamaras(): Promise<EstadoAudio> {
  const e = await desbloquearAudio();
  if (e === "listo") {
    toast.dismiss(ID_SIN_SONIDO);
    await sonarAlarma({ tipo: "persona", probar: true });
  }
  return e;
}

const activar = () => {
  activarSonidoCamaras().catch((err: unknown) =>
    logger.warn("[camaras] activar el sonido falló", { error: String(err) }),
  );
};

/**
 * «Seguir vigilando»: minimizado, tocar la burbuja (sigue y se abre); abierto,
 * su propio «Seguir viendo»; si no hay ninguno, se pide expandir el mosaico.
 */
export function seguirVigilandoCamaras(): void {
  const boton =
    document.querySelector<HTMLElement>(`${BURBUJA} button`) ??
    document.querySelector<HTMLElement>("[data-mosaico-panel] [data-mosaico-seguir]");
  if (boton) boton.click();
  else window.dispatchEvent(new Event(EVENTO_EXPANDIR_MOSAICO));
  toast.dismiss(ID_PAUSA);
}

function avisarPausa() {
  toast.warning("Las cámaras dejaron de vigilar", {
    id: ID_PAUSA,
    description: "5 min sin tocar el mosaico: sin video no hay alarma",
    duration: Number.POSITIVE_INFINITY,
    action: { label: "Seguir vigilando", onClick: seguirVigilandoCamaras },
  });
  notificarSistema({
    titulo: "Las cámaras dejaron de vigilar",
    cuerpo: "Toca para seguir vigilando",
    etiqueta: ID_PAUSA,
    alTocar: seguirVigilandoCamaras,
  });
}

function avisarSinSonido() {
  toast.warning("La alarma no pudo sonar", {
    id: ID_SIN_SONIDO,
    description: "El navegador pide un toque antes de sonar",
    duration: 15_000,
    action: { label: "Activar sonido", onClick: activar },
  });
}

export interface SonidoCamaras {
  estadoAudio: EstadoAudio;
  /** El mosaico está en pausa (no vigila). */
  pausado: boolean;
  activarSonido: () => void;
  seguirVigilando: () => void;
}

/**
 * @param activo El rol ve Cámaras.
 * @param vigilando Hay algo que puede sonar (el mosaico abierto o avisos de
 *   cámaras en curso). Sólo entonces se escuchan los gestos para despertar el
 *   audio y se mira la pausa: una sesión que nunca abre Cámaras no carga nada.
 */
export function useSonidoCamaras(activo: boolean, vigilando: boolean): SonidoCamaras {
  const estadoAudio = useSyncExternalStore(suscribirEstadoAudio, leerEstadoAudio, leerEstadoAudioServidor);
  const [pausado, setPausado] = useState(false);
  const atento = activo && vigilando;

  useEffect(() => {
    if (!activo) return;
    alBloquearSonido(avisarSinSonido);
    return () => alBloquearSonido(null);
  }, [activo]);

  useEffect(() => {
    if (!atento) return;
    return instalarDesbloqueo();
  }, [atento]);

  useEffect(() => {
    if (!atento) return;
    let antes = false;
    const mirar = () => {
      const ahora = document.querySelector(PAUSADO) !== null;
      if (ahora === antes) return;
      antes = ahora;
      setPausado(ahora);
      if (ahora) avisarPausa();
      else toast.dismiss(ID_PAUSA);
    };
    mirar();
    const reloj = setInterval(mirar, MIRAR_PAUSA_MS);
    return () => {
      clearInterval(reloj);
      /* Se cerró el mosaico estando en pausa: ya no hay nada que seguir. */
      if (antes) {
        toast.dismiss(ID_PAUSA);
        setPausado(false);
      }
    };
  }, [atento]);

  const seguirVigilando = useCallback(() => seguirVigilandoCamaras(), []);

  return {
    estadoAudio: activo ? estadoAudio : "listo",
    pausado: atento && pausado,
    activarSonido: activar,
    seguirVigilando,
  };
}
