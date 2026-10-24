"use client";

/**
 * Atajos de Facturas y boletas (F37): «/» lleva al buscador y «N» ABRE la
 * ventana de emitir (nunca emite: emitir pide revisar y confirmar con el
 * botón). No se disparan escribiendo en un campo, con una ventana encima ni
 * con Ctrl/Alt/⌘. Se apagan desde «Más» y la elección queda en este navegador.
 * Mismo patrón que los atajos de Compras (C63).
 */
import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import { useRegisterShortcuts, type ShortcutSection } from "@/contexts/admin-shortcuts-context";
import { hayModalEncima } from "@/lib/keyboard-guards";

const CLAVE_ATAJOS = "bsm-comprobantes-atajos";

const SECCIONES: ShortcutSection[] = [
  {
    title: "Comprobantes",
    items: [
      { keys: ["/"], description: "Buscar: serie-número, cliente, RUC, #pedido, importe o estado" },
      { keys: ["N"], description: "Abrir «Emitir comprobante» (no emite: revisas y confirmas con el botón)" },
      { keys: ["Esc"], description: "En el buscador: borrar lo escrito" },
    ],
  },
];
const SIN_SECCIONES: ShortcutSection[] = [];

function leerActivos(): boolean {
  try {
    return localStorage.getItem(CLAVE_ATAJOS) !== "0";
  } catch {
    return true;
  }
}

export function useAtajosComprobantes(acciones: { buscar: () => void; emitir: () => void }, raiz: RefObject<HTMLElement | null>) {
  const [activos, setActivos] = useState<boolean>(() => (typeof window === "undefined" ? true : leerActivos()));
  const { buscar, emitir } = acciones;

  useEffect(() => {
    if (!activos) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (hayModalEncima(raiz.current)) return;
      const k = e.key.toLowerCase();
      const accion = k === "/" ? buscar : k === "n" ? emitir : null;
      if (!accion) return;
      e.preventDefault();
      accion();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [activos, buscar, emitir, raiz]);

  useRegisterShortcuts("comprobantes", activos ? SECCIONES : SIN_SECCIONES);

  const alternar = useCallback(() => {
    setActivos((a) => {
      try {
        localStorage.setItem(CLAVE_ATAJOS, a ? "0" : "1");
      } catch {
        /* sin almacenamiento: vale para esta visita */
      }
      return !a;
    });
  }, []);

  return useMemo(() => ({ activos, alternar }), [activos, alternar]);
}
