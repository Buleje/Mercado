"use client";

/**
 * Ctrl+V de una tabla en la vista «Cargar» del cubicador, con el foco FUERA de
 * un campo: abre la tabla para pegar ya llena (Brandon 25-10: «eso se va a
 * importar rápido o pasar instantáneo»). Pegar dentro de un campo, de una
 * ventana o un valor suelto sigue siendo lo de siempre.
 */
import { useEffect, useRef } from "react";
import { pareceTabla } from "@/lib/forestal/cubicacion-pegar";

const ES_CAMPO_O_VENTANA = 'input, textarea, select, [role="dialog"], [role="alertdialog"]';

export function usePegarEnCargar(activo: boolean, onTabla: (texto: string) => void): void {
  const alTabla = useRef(onTabla);
  alTabla.current = onTabla;
  useEffect(() => {
    if (!activo) return;
    const alPegar = (e: ClipboardEvent) => {
      const el = e.target;
      // Con una ventana abierta el foco está adentro (Radix lo encierra): cae acá también.
      if (el instanceof HTMLElement && (el.isContentEditable || el.closest(ES_CAMPO_O_VENTANA))) return;
      const texto = e.clipboardData?.getData("text/plain") ?? "";
      if (!pareceTabla(texto)) return;
      e.preventDefault();
      alTabla.current(texto);
    };
    document.addEventListener("paste", alPegar);
    return () => document.removeEventListener("paste", alPegar);
  }, [activo]);
}
