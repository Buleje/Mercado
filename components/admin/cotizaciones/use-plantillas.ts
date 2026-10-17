"use client";

/** Plantillas de ítems guardadas en este navegador (hasta 10). */
import { useCallback, useEffect, useState } from "react";
import { loadTemplates, MAX_TEMPLATES, saveTemplates, type Cotizacion, type Plantilla } from "./tipos";

export function usePlantillas() {
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  /** `elegir` = desde el formulario (usar una) · `gestionar` = desde «Más» (usar o borrar). */
  const [ventana, setVentana] = useState<"elegir" | "gestionar" | null>(null);

  useEffect(() => {
    setPlantillas(loadTemplates());
  }, []);

  const guardarDesde = useCallback((c: Cotizacion, nombre: string): boolean => {
    const items = (c.items ?? []).map((it) => ({ descripcion: it.descripcion, cantidad: it.cantidad, precioUnit: it.precioUnit }));
    if (!nombre.trim() || items.length === 0) return false;
    setPlantillas((prev) => {
      const nuevas = [{ id: `tpl_${Date.now()}`, nombre: nombre.trim(), items, createdAt: new Date().toISOString() }, ...prev].slice(0, MAX_TEMPLATES);
      saveTemplates(nuevas);
      return nuevas;
    });
    return true;
  }, []);

  const borrar = useCallback((id: string) => {
    setPlantillas((prev) => {
      const nuevas = prev.filter((t) => t.id !== id);
      saveTemplates(nuevas);
      return nuevas;
    });
  }, []);

  return { plantillas, ventana, setVentana, guardarDesde, borrar };
}

export type Plantillas = ReturnType<typeof usePlantillas>;
