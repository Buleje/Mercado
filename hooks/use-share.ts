"use client";

/**
 * useShare — Wrapper de Web Share API con fallback a WhatsApp/copy.
 *
 * En Android/iOS, abre el share sheet nativo (WhatsApp, Messenger, etc).
 * En desktop/sin soporte: fallback a WhatsApp Web prellenado + copy al
 * clipboard.
 *
 * API:
 *   const { share, isSupported } = useShare();
 *   share({
 *     title: "Mirá este producto",
 *     text: "Arroz Paisana 750g a S/4.90 en Bodega San Martín",
 *     url: "https://buleje.pe/tienda/producto/arroz-paisana",
 *   });
 */

import { useCallback, useMemo } from "react";
import { useClipboard } from "./use-clipboard";

interface ShareData {
  title?: string;
  text?: string;
  url?: string;
}

interface Options {
  /** Se ejecuta cuando el share se completa (o fallback). */
  onShared?: (method: "native" | "whatsapp" | "clipboard") => void;
  /** Error handler. */
  onError?: (err: unknown) => void;
}

export function useShare({ onShared, onError }: Options = {}) {
  const { copy } = useClipboard();

  const isSupported = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return typeof navigator.share === "function";
  }, []);

  const share = useCallback(
    async (data: ShareData) => {
      try {
        if (isSupported) {
          await navigator.share(data);
          onShared?.("native");
          return;
        }
        // Fallback: abrir WhatsApp Web prellenado
        const msg = [data.title, data.text, data.url].filter(Boolean).join("\n\n");
        const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
        window.open(waUrl, "_blank", "noopener,noreferrer");
        // Y copy para que el user pueda pegar en cualquier otro lado
        if (data.url) {
          await copy(data.url);
        }
        onShared?.("whatsapp");
      } catch (err) {
        // AbortError = user canceló, no es error
        if ((err as { name?: string })?.name === "AbortError") return;
        onError?.(err);
      }
    },
    [isSupported, copy, onShared, onError],
  );

  return { share, isSupported };
}
