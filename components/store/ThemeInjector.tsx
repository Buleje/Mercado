"use client";

import { useSettings } from "@/contexts/settings-context";

/**
 * ThemeInjector — inyecta CSS variables de colores del storeTheme en el DOM.
 * Debe ser Client Component para leer el contexto.
 * Se monta dentro de StoreProviders (que ya tiene SettingsProvider).
 */
export default function ThemeInjector() {
  const { storeTheme } = useSettings();

  if (!storeTheme) return null;

  const { primaryColor, secondaryColor, accentColor } = storeTheme;

  // Solo inyectar si hay al menos un color personalizado
  if (!primaryColor && !secondaryColor && !accentColor) return null;

  const css = [
    primaryColor ? `--color-primary: ${primaryColor};` : "",
    secondaryColor ? `--color-secondary: ${secondaryColor};` : "",
    accentColor ? `--color-accent: ${accentColor};` : "",
  ]
    .filter(Boolean)
    .join("\n    ");

  return (
    <style>{`:root {\n    ${css}\n  }`}</style>
  );
}
