import { useCallback, useEffect, useState } from "react";

const CLAVE = "inv-auto-actualizar";
const CADA_MS = 5 * 60 * 1000;

/**
 * Productos y stock se trae solo cada 5 minutos (las ventas del POS bajan el
 * stock mientras miras la tabla).
 *
 * Antes era un contador «Actualiza en 293s ⏸ ↻» en la banda del hub: un texto
 * que cambiaba cada segundo —y re-pintaba la tabla entera cada segundo— y al
 * llegar a cero REMONTABA la vista (se perdían búsqueda, filtros y selección).
 * Ahora: sin contador, sin remontar (recarga en silencio), con la pestaña del
 * navegador oculta no gasta, y la pausa se recuerda. El interruptor vive en el
 * «⋯» de la vista, junto a «Actualizar».
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
