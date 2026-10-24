"use client";

/**
 * Atajos de teclado de la caja abierta: «I» ingreso, «R» retiro. No se
 * disparan escribiendo en un campo, con una ventana abierta ni con Ctrl/Alt/⌘
 * (para no pisar ⌘K del buscador ni los atajos del navegador).
 */
import { useEffect, type RefObject } from "react";
import { hayModalEncima } from "@/lib/keyboard-guards";

/**
 * `raiz`: la caja. Con una ventana encima que no la contiene (un acceso rápido
 * de la cabecera, otro modal) la tecla es de esa ventana; con la caja ADENTRO
 * de un acceso rápido, los atajos siguen andando.
 */
export function useAtajosCaja(
  activo: boolean,
  acciones: { ingreso: () => void; retiro: () => void },
  raiz: RefObject<HTMLElement | null>,
) {
  const { ingreso, retiro } = acciones;
  useEffect(() => {
    if (!activo) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (hayModalEncima(raiz.current)) return;
      const k = e.key.toLowerCase();
      if (k === "i") {
        e.preventDefault();
        ingreso();
      } else if (k === "r") {
        e.preventDefault();
        retiro();
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [activo, ingreso, retiro, raiz]);
}
