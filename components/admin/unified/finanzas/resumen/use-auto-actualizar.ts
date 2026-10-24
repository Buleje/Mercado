import { useCallback, useEffect, useState } from "react";

const CLAVE = "plata-resumen-auto-actualizar";
const CADA_MS = 5 * 60 * 1000;

/**
 * El Resumen de Mi Plata se trae solo cada 5 minutos.
 *
 * Antes era «Actualiza en 283s ⏸ ↻» suelto en la banda del hub (medido
 * 2026-10-11): un contador que re-pintaba el hub cada segundo y, al llegar a
 * cero, REMONTABA la vista entera (esqueleto incluido). Ahora, como en
 * Inventario (`inventario/hooks/use-auto-actualizar.ts`): sin contador, recarga
 * en silencio, con la pestaña del navegador oculta no gasta, y la pausa se
 * recuerda. El interruptor y «Actualizar ahora» viven en el «⋯» del Resumen.
 */
export function useAutoActualizar(recargar: () => void) {
  const [activo, setActivo] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(CLAVE) === "0") setActivo(false);
    } catch { /* modo privado */ }
  }, []);

  useEffect(() => {
    if (!activo) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") recargar();
    }, CADA_MS);
    return () => clearInterval(t);
  }, [activo, recargar]);

  const alternar = useCallback(() => {
    setActivo((v) => {
      const siguiente = !v;
      try { localStorage.setItem(CLAVE, siguiente ? "1" : "0"); } catch { /* cuota */ }
      return siguiente;
    });
  }, []);

  return { autoActivo: activo, alternarAuto: alternar };
}
