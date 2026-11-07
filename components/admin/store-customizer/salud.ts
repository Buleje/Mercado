/**
 * Cuánto de la tienda está configurado y qué le falta (Brandon 2026-06-26).
 * Antes vivía dentro de StoreCustomizer y se pintaba en una caja de 4 filas
 * (barra de %, cinco chips «Identidad 4/4» y un aviso por fila). Desde el
 * 11-10 lo que falta por sección va en la cifra de cada sección de la barra y
 * el % con los avisos en UNA línea (`AvisosApariencia`).
 */
import type { StoreTheme } from "@/components/admin/StoreCustomizer";

export type SeccionConSalud = "identidad" | "portada" | "colores" | "contacto" | "avanzado";

const CAMPOS: { id: SeccionConSalud; keys: (keyof StoreTheme)[] }[] = [
  { id: "identidad", keys: ["logo", "storeName", "slogan", "description"] },
  { id: "portada", keys: ["heroTitle", "heroSubtitle", "heroImage"] },
  { id: "colores", keys: ["primaryColor", "secondaryColor", "accentColor"] },
  { id: "contacto", keys: ["whatsapp", "email", "phone", "address"] },
  { id: "avanzado", keys: ["analyticsId", "favicon"] },
];

export function campoLleno(v: unknown): boolean {
  if (typeof v === "string") return v.trim() !== "" && v !== "var(--color-primary)";
  return Boolean(v);
}

/** Contraste WCAG del color (hex) contra texto blanco. null si no es hex. */
export function contrasteConBlanco(hex: string): number | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex ?? "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const lum = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
  return Math.round((1.05 / (L + 0.05)) * 10) / 10;
}

export interface SaludTienda {
  pct: number;
  /** Campos vacíos por sección: la cifra chica de cada sección en la barra. */
  faltan: Partial<Record<SeccionConSalud, number>>;
  avisos: { label: string; seccion: SeccionConSalud }[];
}

export function saludDeLaTienda(theme: StoreTheme): SaludTienda {
  let llenos = 0;
  let total = 0;
  const faltan: SaludTienda["faltan"] = {};
  for (const { id, keys } of CAMPOS) {
    const n = keys.filter((k) => campoLleno(theme[k])).length;
    llenos += n;
    total += keys.length;
    if (n < keys.length) faltan[id] = keys.length - n;
  }
  const avisos: SaludTienda["avisos"] = [];
  if (!campoLleno(theme.logo)) avisos.push({ label: "Falta el logo", seccion: "identidad" });
  if (!campoLleno(theme.whatsapp)) avisos.push({ label: "Sin WhatsApp para pedidos", seccion: "contacto" });
  if (!campoLleno(theme.heroImage)) avisos.push({ label: "Portada sin imagen", seccion: "portada" });
  const c = contrasteConBlanco(theme.primaryColor);
  if (c != null && c < 3) avisos.push({ label: `Color principal con contraste bajo (${c}:1)`, seccion: "colores" });
  return { pct: total ? Math.round((llenos / total) * 100) : 0, faltan, avisos };
}
