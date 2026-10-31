"use client";

import { useCallback, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";

/**
 * Subir un audio que YA existe (el de WhatsApp que mandó el chofer).
 *
 * El dictado del navegador sólo sirve para hablar en vivo. Esto va por Whisper
 * en el servidor (`/api/ai/transcribir`), que además entiende mejor con ruido
 * de motor atrás — que es donde se graban estos audios.
 *
 * `onTexto` recibe lo transcrito: va al campo, no se manda solo, porque lo
 * transcrito se lee ANTES de anotarlo.
 */
export function useAudioAdjunto(onTexto: (texto: string) => void) {
  const [transcribiendo, setTranscribiendo] = useState(false);
  const [errorAudio, setErrorAudio] = useState<string | null>(null);

  const subirAudio = useCallback(
    async (archivo: File) => {
      setTranscribiendo(true);
      setErrorAudio(null);
      try {
        const fd = new FormData();
        fd.append("audio", archivo);
        const res = await fetch("/api/ai/transcribir", {
          method: "POST",
          headers: csrfHeaders(),
          body: fd,
        });
        const json = (await res.json().catch(() => ({}))) as { texto?: string; error?: string };
        if (!res.ok || !json.texto) {
          setErrorAudio(json.error ?? "No se pudo transcribir el audio.");
          return;
        }
        onTexto(json.texto);
      } catch (e) {
        setErrorAudio(e instanceof Error ? e.message : String(e));
      } finally {
        setTranscribiendo(false);
      }
    },
    [onTexto],
  );

  return { transcribiendo, errorAudio, setErrorAudio, subirAudio };
}
