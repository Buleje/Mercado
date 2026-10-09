"use client";

/**
 * Atajos de teclado de la caja abierta: «I» ingreso, «R» retiro. No se
 * disparan escribiendo en un campo, con una ventana abierta ni con Ctrl/Alt/⌘
 * (para no pisar ⌘K del buscador ni los atajos del navegador).
 */
import { useEffect } from "react";

export function useAtajosCaja(activo: boolean, acciones: { ingreso: () => void; retiro: () => void }) {
  const { ingreso, retiro } = acciones;
  useEffect(() => {
    if (!activo) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
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
  }, [activo, ingreso, retiro]);
}
