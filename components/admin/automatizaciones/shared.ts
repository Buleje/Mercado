"use client";

/** Piezas compartidas por los paneles de Automatizaciones. */

import { useCallback, useState } from "react";

/** Copiar al portapapeles con acuse visible: sin el tilde nadie sabe si copió. */
export function useCopiar() {
  const [copiado, setCopiado] = useState<string | null>(null);
  const copiar = useCallback((texto: string, clave: string) => {
    navigator.clipboard
      .writeText(texto)
      .then(() => {
        setCopiado(clave);
        setTimeout(() => setCopiado(null), 1600);
      })
      .catch(() => setCopiado(null));
  }, []);
  return { copiado, copiar };
}
