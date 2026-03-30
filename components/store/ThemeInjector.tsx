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

  // Override ALL hardcoded green colors with custom primary
  const overrides = primaryColor ? `
    [class*="bg-[#2d6a4f]"] { background-color: ${primaryColor} !important; }
    [class*="text-[#2d6a4f]"] { color: ${primaryColor} !important; }
    [class*="border-[#2d6a4f]"] { border-color: ${primaryColor} !important; }
    [class*="bg-[#0f766e]"] { background-color: ${primaryColor} !important; }
    [class*="from-[#2d6a4f]"] { --tw-gradient-from: ${primaryColor} !important; }
    [class*="to-[#52b788]"] { --tw-gradient-to: ${primaryColor}88 !important; }
    .bg-primary, [class*="bg-primary"] { background-color: ${primaryColor} !important; }
    .text-primary, [class*="text-primary"] { color: ${primaryColor} !important; }
    .border-primary { border-color: ${primaryColor} !important; }
    .ring-primary { --tw-ring-color: ${primaryColor} !important; }
    [style*="background-color: #2d6a4f"] { background-color: ${primaryColor} !important; }
    [style*="background-color: rgb(45, 106, 79)"] { background-color: ${primaryColor} !important; }
    [style*="color: #2d6a4f"] { color: ${primaryColor} !important; }
  ` : "";

  const secondaryOverrides = secondaryColor ? `
    [class*="bg-[#f4a261]"] { background-color: ${secondaryColor} !important; }
    [class*="text-[#f4a261]"] { color: ${secondaryColor} !important; }
    [style*="#f4a261"] { --brand-secondary: ${secondaryColor}; }
  ` : "";

  return (
    <style>{`:root { ${vars} }${overrides}${secondaryOverrides}`}</style>
  );
}
