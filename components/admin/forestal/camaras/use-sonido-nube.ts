"use client";

/**
 * El sonido del vivo de la nube (ADR-471), aparte de `use-visor-nube.ts`.
 *
 * La cadena (08-10): el reproductor se crea mudo (`audio: false`: no asustar a
 * nadie con el patio a todo volumen); el parlante llama `openSound()`, que
 * pone el volumen del decodificador en 0,8. Eso sólo suena si el FLUJO trae
 * audio: la cámara tiene que tener el micrófono prendido y mandar «Video y
 * audio». EZUIKit lo dice en `audioInfo` (formato 0 = sin audio) y el código
 * de `openSound()` dice si el decodificador lo abrió. Con eso el parlante deja
 * de mentir y el ⓘ de al lado dice qué falta (`BotonSonido`).
 */

import { useCallback, useRef, useState, type RefObject } from "react";
import type { EZUIKitPlayer } from "ezuikit-js";
import {
  AUDIO_SIN_SABER,
  audioDelReproductor,
  escucharAudio,
  sonar,
  type AudioDelVivo,
} from "./reproductor-nube";

/** Por qué no se oye: `sin-audio` = la cámara no lo manda; `no-abre` = el navegador no lo abrió. */
export type FallaSonido = "sin-audio" | "no-abre" | null;

export function useSonidoNube(player: RefObject<EZUIKitPlayer | null>, actividad: () => void) {
  /** Arranca apagado en cada reproductor nuevo. */
  const [sonido, setSonido] = useState(false);
  const [audio, setAudio] = useState<AudioDelVivo>(AUDIO_SIN_SABER);
  const [noAbre, setNoAbre] = useState(false);
  /* EZUIKit puede volver a llamar `handleSuccess` (reconexión): un solo oyente por reproductor. */
  const escuchando = useRef<EZUIKitPlayer | null>(null);

  /** Reproductor nuevo (o ninguno): mudo y sin saber todavía si trae audio. */
  const reiniciar = useCallback(() => {
    setSonido(false);
    setAudio(AUDIO_SIN_SABER);
    setNoAbre(false);
  }, []);

  /** Llegó el primer cuadro: lo que el reproductor ya sabe del audio y lo que diga después. */
  const alVer = useCallback(
    (p: EZUIKitPlayer | null) => {
      if (!p) return;
      setAudio(audioDelReproductor(p));
      if (escuchando.current === p) return;
      escuchando.current = p;
      escucharAudio(p, (a) => {
        if (player.current === p) setAudio(a);
      });
    },
    [player],
  );

  const alternarSonido = useCallback(async () => {
    actividad();
    const prender = !sonido;
    const p = player.current;
    const ok = await sonar(p, prender);
    /* El reproductor cambió mientras esperaba: lo del viejo no se le pega al nuevo. */
    if (player.current !== p) return;
    if (ok) setSonido(prender);
    if (prender) setNoAbre(!ok);
  }, [actividad, player, sonido]);

  const falla: FallaSonido = audio.trae === false ? "sin-audio" : noAbre ? "no-abre" : null;

  return { sonido, alternarSonido, audio, falla, reiniciar, alVer };
}
