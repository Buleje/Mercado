"use client";

import { useSettings } from "@/contexts/settings-context";

/**
 * ThemeInjector — inyecta CSS variables de colores del storeTheme en el DOM.
 * Lee de settings-context (que a su vez lee de DB via /api/settings).
 * Los cambios guardados en ThemeCustomizer se reflejan aquí para TODOS los visitantes.
 */
export default function ThemeInjector() {
  const { storeTheme } = useSettings();

  if (!storeTheme) return null;

  const { primaryColor, secondaryColor, accentColor, backgroundColor, textColor } = storeTheme;

  // Solo inyectar si hay al menos un color personalizado
  if (!primaryColor && !secondaryColor && !accentColor && !backgroundColor && !textColor) return null;

  const vars = [
    primaryColor    && `--color-primary: ${primaryColor};`,
    primaryColor    && `--brand-primary: ${primaryColor};`,
    primaryColor    && `--color-primary-dark: ${primaryColor};`,
    secondaryColor  && `--color-secondary: ${secondaryColor};`,
    secondaryColor  && `--brand-secondary: ${secondaryColor};`,
    accentColor     && `--color-accent: ${accentColor};`,
    backgroundColor && `--color-bg: ${backgroundColor};`,
    textColor       && `--color-text: ${textColor};`,
  ].filter(Boolean).join("\n    ");

  // Override ONLY backgrounds and borders with primary — NEVER default text color
  const overrides = primaryColor ? `
    [class*="bg-[#2d6a4f]"] { background-color: ${primaryColor} !important; }
    [class*="border-[#2d6a4f]"] { border-color: ${primaryColor} !important; }
    [class*="bg-[#0f766e]"] { background-color: ${primaryColor} !important; }
    [class*="from-[#2d6a4f]"] { --tw-gradient-from: ${primaryColor} !important; }
    [class*="to-[#52b788]"] { --tw-gradient-to: ${primaryColor}66 !important; }
    .border-primary { border-color: ${primaryColor} !important; }
    .ring-primary { --tw-ring-color: ${primaryColor} !important; }
  ` : "";

  const secondaryOverrides = secondaryColor ? `
    [class*="bg-[#f4a261]"] { background-color: ${secondaryColor} !important; }
  ` : "";

  const bgOverride = backgroundColor ? `
    body { background-color: ${backgroundColor}; }
  ` : "";

  return (
    <style>{`:root { ${vars} }${overrides}${secondaryOverrides}${bgOverride}`}</style>
  );
}
