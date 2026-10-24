"use client";

/**
 * «Guardar esta foto» del visor en vivo (ADR-421). Salió de `VisorEnVivo` el
 * 07-10 sin cambiar lo que hace, para que el visor entre en 300 líneas con el
 * botón «Transmitir al TV».
 *
 * Sale por un canvas de lo que hay en pantalla —el `<video>` o la foto— y no
 * de un pedido nuevo: lo que se guarda es exactamente lo que la persona está
 * mirando cuando aprieta. Entra por la MISMA puerta que usa la cámara, como
 * evento «manual», así que queda al lado del resto y la IA lo lee igual.
 */

import { useState, type RefObject } from "react";

interface Opciones {
  camaraId: string;
  /** La puerta por la que ya entran las fotos (`…/webhooks/camara?k=token`). */
  direccionWebhook: string;
  modo: "video" | "fotos";
  videoRef: RefObject<HTMLVideoElement | null>;
  imgRef: RefObject<HTMLImageElement | null>;
  onGuardada?: () => void;
}

export function useGuardarCuadro({ camaraId, direccionWebhook, modo, videoRef, imgRef, onGuardada }: Opciones) {
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const guardar = async () => {
    const fuente: HTMLVideoElement | HTMLImageElement | null =
      modo === "video" ? videoRef.current : imgRef.current;
    const ancho = fuente instanceof HTMLVideoElement ? fuente.videoWidth : (fuente?.naturalWidth ?? 0);
    const alto = fuente instanceof HTMLVideoElement ? fuente.videoHeight : (fuente?.naturalHeight ?? 0);
    setAviso(null);
    if (!fuente || !ancho || !alto) {
      setAviso("Todavía no hay ninguna imagen para guardar.");
      return;
    }
    setGuardando(true);
    try {
      const lienzo = document.createElement("canvas");
      lienzo.width = ancho;
      lienzo.height = alto;
      lienzo.getContext("2d")?.drawImage(fuente, 0, 0);
      const blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, "image/jpeg", 0.9));
      if (!blob) throw new Error("El navegador no pudo armar la foto.");
      const form = new FormData();
      form.append("file", blob, `${camaraId}.jpg`);
      const r = await fetch(
        `${direccionWebhook}&evento=manual&nota=${encodeURIComponent("guardada desde el visor en vivo")}`,
        { method: "POST", body: form },
      );
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(`No la aceptó (${j.error ?? r.status}).`);
      setAviso("Guardada en el historial de abajo.");
      onGuardada?.();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  return { guardar, guardando, aviso, setAviso };
}
