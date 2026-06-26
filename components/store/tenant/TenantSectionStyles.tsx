"use client";

import { useEffect } from "react";

/**
 * TenantSectionStyles — estilos POR SECCIÓN (Brandon 2026-06-26, edición libre
 * por componente). Aplica fondo/texto/espaciado SOLO a la sección `[data-pb]`
 * correspondiente, sin tocar el resto de la tienda. El contenido sigue siendo
 * server-rendered (SEO intacto); esto es un override visual en cliente.
 *
 * `bg`/`text` = color CSS; `pad` = compacto|normal|amplio → padding vertical.
 */
type SectionStyle = { bg?: string; text?: string; pad?: "sm" | "md" | "lg" };

const PAD_PX: Record<"sm" | "md" | "lg", string> = { sm: "1.25rem", md: "", lg: "4rem" };

export default function TenantSectionStyles({ styles }: { styles: Record<string, SectionStyle> }) {
  useEffect(() => {
    const apply = () => {
      for (const [key, s] of Object.entries(styles)) {
        document.querySelectorAll<HTMLElement>(`[data-pb="${key}"]`).forEach((el) => {
          el.style.background = s.bg || "";
          el.style.color = s.text || "";
          if (s.pad && PAD_PX[s.pad]) {
            el.style.paddingTop = PAD_PX[s.pad];
            el.style.paddingBottom = PAD_PX[s.pad];
            el.dataset.bulejePad = s.pad;
          } else {
            el.style.removeProperty("padding-top");
            el.style.removeProperty("padding-bottom");
            delete el.dataset.bulejePad;
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
