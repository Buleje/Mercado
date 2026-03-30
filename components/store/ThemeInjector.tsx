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

  const vars = [
    primaryColor && `--color-primary: ${primaryColor};`,
    primaryColor && `--brand-primary: ${primaryColor};`,
    primaryColor && `--color-primary-dark: ${primaryColor};`,
    secondaryColor && `--color-secondary: ${secondaryColor};`,
    secondaryColor && `--brand-secondary: ${secondaryColor};`,
    accentColor && `--color-accent: ${accentColor};`,
  ].filter(Boolean).join("\n    ");

  // Also override hardcoded bg-[#2d6a4f] and text-[#2d6a4f] with CSS specificity
  const overrides = primaryColor ? `
    .bg-\\[\\#2d6a4f\\] { background-color: ${primaryColor} !important; }
    .text-\\[\\#2d6a4f\\] { color: ${primaryColor} !important; }
    .border-\\[\\#2d6a4f\\] { border-color: ${primaryColor} !important; }
    .bg-\\[\\#0f766e\\] { background-color: ${primaryColor} !important; }
    .from-\\[\\#2d6a4f\\] { --tw-gradient-from: ${primaryColor} !important; }
  ` : "";

  return (
    <style>{`:root { ${vars} }${overrides}`}</style>
  );
}
