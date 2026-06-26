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
type SectionStyle = { bg?: string; text?: string; pad?: "sm" | "md" | "lg"; radius?: number; border?: string; borderW?: number; shadow?: "none" | "soft" | "deep" };

const PAD_PX: Record<"sm" | "md" | "lg", string> = { sm: "1.25rem", md: "", lg: "4rem" };
const SHADOW_CSS: Record<"none" | "soft" | "deep", string> = { none: "none", soft: "0 4px 16px rgba(0,0,0,0.10)", deep: "0 12px 32px rgba(0,0,0,0.18)" };

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
          // Forma (Brandon 2026-06-26): radio de bordes, borde, sombra.
          if (typeof s.radius === "number") el.style.borderRadius = `${s.radius}px`;
          else el.style.removeProperty("border-radius");
          if (s.border) el.style.border = `${s.borderW ?? 2}px solid ${s.border}`;
          else el.style.removeProperty("border");
          if (s.shadow) el.style.boxShadow = SHADOW_CSS[s.shadow] ?? "";
          else el.style.removeProperty("box-shadow");
        });
      }
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [styles]);

  return null;
}
