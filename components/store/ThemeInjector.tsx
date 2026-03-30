"use client";

import { useEffect } from "react";
import { useSettings } from "@/contexts/settings-context";

// Mapeo de fontFamily → URL de Google Fonts + font-family CSS
const GOOGLE_FONTS: Record<string, { url: string; family: string }> = {
  inter:      { url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap", family: "'Inter', sans-serif" },
  poppins:    { url: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap", family: "'Poppins', sans-serif" },
  montserrat: { url: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap", family: "'Montserrat', sans-serif" },
};

/**
 * ThemeInjector — inyecta colores, fuentes y dark mode del storeTheme en el DOM.
 * Lee de settings-context (DB via /api/settings).
 * Aplica a TODOS los visitantes de la tienda.
 */
export default function ThemeInjector() {
  const { storeTheme } = useSettings();

  // Dark mode forzado por el admin
  useEffect(() => {
    if (!storeTheme) return;
    const html = document.documentElement;
    if (storeTheme.darkMode) {
      html.classList.add("dark");
    }
    // No quitamos "dark" si es false — el usuario puede tener su propia preferencia
  }, [storeTheme?.darkMode, storeTheme]);

  if (!storeTheme) return null;

  const {
    primaryColor, secondaryColor, accentColor,
    backgroundColor, textColor, fontFamily,
  } = storeTheme;

  const hasColors = primaryColor || secondaryColor || accentColor || backgroundColor || textColor;
  const hasFont = fontFamily && fontFamily !== "sistema" && fontFamily !== "geist";

  if (!hasColors && !hasFont) return null;

  // ── CSS variables de colores ──────────────────────────────────────────────
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

  // Override backgrounds/borders — NEVER text color
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

  // ── Fuentes de Google Fonts ───────────────────────────────────────────────
  const fontConfig = fontFamily ? GOOGLE_FONTS[fontFamily] : null;
  const fontOverride = fontConfig
    ? `body, .font-sans { font-family: ${fontConfig.family} !important; }`
    : "";

  return (
    <>
      {/* Importar Google Font si es necesario */}
      {fontConfig && (
        <link rel="stylesheet" href={fontConfig.url} />
      )}
      <style>{`:root { ${vars} }${overrides}${secondaryOverrides}${bgOverride}${fontOverride}`}</style>
    </>
  );
}
