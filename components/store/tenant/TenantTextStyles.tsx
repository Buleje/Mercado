"use client";

import { useEffect } from "react";

/**
 * TenantTextStyles — aplica estilos por texto (Brandon 2026-06-26, barra de
 * texto flotante). El dueño ajusta tamaño/negrita/color/alineación de cada texto
 * editable ([data-live="<campo>"]) y se guarda en storeTheme.textStyles.
 *
 * Se aplica en cliente sobre los nodos [data-live] (el contenido sigue siendo
 * server-rendered → SEO intacto; solo el estilo es override). `size` es un
 * multiplicador sobre el tamaño base del texto; re-aplica en resize para no
 * romper el clamp responsive del hero. Deja `data-buleje-size` para que el
 * editor lea el multiplicador actual.
 */
type TextStyle = { size?: number; bold?: boolean; color?: string; align?: "left" | "center" | "right" };

export default function TenantTextStyles({ styles }: { styles: Record<string, TextStyle> }) {
  useEffect(() => {
    const apply = () => {
      for (const [key, s] of Object.entries(styles)) {
        document.querySelectorAll<HTMLElement>(`[data-live="${key}"]`).forEach((el) => {
          if (typeof s.bold === "boolean") el.style.fontWeight = s.bold ? "800" : "";
          if (s.color) el.style.color = s.color;
          if (s.align) el.style.textAlign = s.align;
          if (typeof s.size === "number" && s.size > 0) {
            el.style.fontSize = ""; // reset para leer el tamaño base real
            const base = parseFloat(getComputedStyle(el).fontSize) || 16;
            el.style.fontSize = `${(base * s.size).toFixed(1)}px`;
            el.dataset.bulejeSize = String(s.size);
          }
        });
      }
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [styles]);

  return null;
}
