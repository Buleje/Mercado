"use client";

import { useCallback, useState } from "react";

export type TamanoLetra = "normal" | "large" | "xlarge";

/** La clase del contenedor del mostrador para cada tamaño (menú «Más» › Pantalla). */
const CLASE: Record<TamanoLetra, string> = { normal: "", large: "pos-large", xlarge: "pos-xlarge" };

const ESTILO = `
  .pos-large { font-size: 16px; }
  .pos-large button { min-height: 48px; }
  .pos-xlarge { font-size: 18px; }
  .pos-xlarge button { min-height: 56px; }
`;

/** Tamaño de letra del mostrador, recordado en este navegador (`pos-font-size`). */
export function usePOSTamanoLetra() {
  const [fontSize, setFontSize] = useState<TamanoLetra>(() => {
    if (typeof window === "undefined") return "normal";
    return (localStorage.getItem("pos-font-size") as TamanoLetra) || "normal";
  });
  const changeFontSize = useCallback((size: TamanoLetra) => {
    setFontSize(size);
    localStorage.setItem("pos-font-size", size);
  }, []);
  const estilo = fontSize !== "normal" ? <style>{ESTILO}</style> : null;
  return { fontSize, changeFontSize, claseLetra: CLASE[fontSize], estilo };
}
