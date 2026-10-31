"use client";

/**
 * Atajos de Compras (C63): «/» busca, «N» abre una compra nueva con el buscador
 * de productos listo y «R» elige la orden que llegó para recibirla. No se
 * disparan escribiendo en un campo, con una ventana encima ni con Ctrl/Alt/⌘
 * (no pisan ⌘K del panel ni los atajos del navegador). Se apagan desde «Más»
 * y la elección queda en este navegador.
 */
import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import { hayModalEncima } from "@/lib/keyboard-guards";
import { useRegisterShortcuts, type ShortcutSection } from "@/contexts/admin-shortcuts-context";

const CLAVE_ATAJOS = "bsm-compras-atajos";

export type AccionesAtajos = { buscar: () => void; nuevaCompra: () => void; recibir: () => void };

const SECCIONES: ShortcutSection[] = [
  {
    title: "Compras",
    items: [
      { keys: ["/"], description: "Buscar en Compras: comprobante, orden, RUC, importe o nombre" },
      { keys: ["N"], description: "Compra nueva: ir a Comprar con el buscador de productos listo" },
      { keys: ["R"], description: "Recibir mercadería: elegir la orden que llegó" },
      { keys: ["↑", "↓", "Enter"], description: "En la búsqueda: moverte y abrir el primer paso" },
      { keys: ["F2"], description: "En Comprar: abrir o cerrar el lector de códigos" },
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

export function useAtajosCompras(acciones: AccionesAtajos, raiz: RefObject<HTMLElement | null>) {
  const [activos, setActivos] = useState<boolean>(() => (typeof window === "undefined" ? true : leerActivos()));
  const { buscar, nuevaCompra, recibir } = acciones;

  useEffect(() => {
    if (!activos) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (hayModalEncima(raiz.current)) return;
      const k = e.key.toLowerCase();
      const accion = k === "/" ? buscar : k === "n" ? nuevaCompra : k === "r" ? recibir : null;
      if (!accion) return;
      e.preventDefault();
      accion();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [activos, buscar, nuevaCompra, recibir, raiz]);

  useRegisterShortcuts("compras", activos ? SECCIONES : SIN_SECCIONES);

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
