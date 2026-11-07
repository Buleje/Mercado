"use client";

/**
 * piezas/use-copiar.ts — copiar un texto al portapapeles y marcar cuál se
 * copió durante 2 s (para que el botón diga «Copiado»). Si el navegador no
 * deja copiar, lo dice con un aviso.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export function useCopiar(): { copiado: string | null; copiar: (id: string, texto: string) => Promise<boolean> } {
  const [copiado, setCopiado] = useState<string | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (reloj.current) clearTimeout(reloj.current);
    },
    [],
  );

  const copiar = async (id: string, texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      toast.error("Tu navegador no dejó copiar. Selecciona el texto y cópialo a mano.");
      return false;
    }
    setCopiado(id);
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => setCopiado(null), 2000);
    return true;
  };

  return { copiado, copiar };
}
