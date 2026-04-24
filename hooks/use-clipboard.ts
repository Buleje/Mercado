"use client";

/**
 * useClipboard — Copia texto al clipboard con feedback visual.
 *
 * Devuelve `copy(text)` y un `copied` boolean que se autoresettea
 * en `resetMs` ms (default 2000). Ideal para botones "Copiar link".
 *
 * Fallback: si navigator.clipboard no existe, usa execCommand legacy.
 *
 * API:
 *   const { copied, copy } = useClipboard();
 *   <button onClick={() => copy("mi-codigo-referido")}>
 *     {copied ? "Copiado ✓" : "Copiar"}
 *   </button>
 */

import { useCallback, useRef, useState } from "react";

interface Options {
  /** Ms hasta resetear `copied` a false. Default 2000 */
  resetMs?: number;
  /** Error handler opcional */
  onError?: (err: unknown) => void;
}

export function useClipboard({ resetMs = 2000, onError }: Options = {}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(
    async (text: string) => {
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          // Fallback legacy
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          const ok = document.execCommand("copy");
          document.body.removeChild(ta);
          if (!ok) throw new Error("execCommand copy failed");
        }
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), resetMs);
      } catch (err) {
        onError?.(err);
        setCopied(false);
      }
    },
    [resetMs, onError],
  );

  return { copied, copy };
}
