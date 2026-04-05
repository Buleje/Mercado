"use client";

import { useEffect } from "react";
import { useSettings } from "@/contexts/settings-context";

const GOOGLE_FONTS: Record<string, { url: string; family: string }> = {
  inter:      { url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap", family: "'Inter', sans-serif" },
  poppins:    { url: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap", family: "'Poppins', sans-serif" },
  montserrat: { url: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap", family: "'Montserrat', sans-serif" },
  raleway:    { url: "https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700;800&display=swap", family: "'Raleway', sans-serif" },
  nunito:     { url: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&display=swap", family: "'Nunito', sans-serif" },
  lato:       { url: "https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap", family: "'Lato', sans-serif" },
  roboto:     { url: "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap", family: "'Roboto', sans-serif" },
  opensans:   { url: "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap", family: "'Open Sans', sans-serif" },
};

const SHADOW_MAP = {
  none: "none",
  soft: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
  deep: "0 10px 25px rgba(0,0,0,0.12), 0 4px 10px rgba(0,0,0,0.08)",
};

const BG_PATTERN_MAP: Record<string, string> = {
  dots: "radial-gradient(circle, currentColor 1px, transparent 1px)",
  waves: "url(\"data:image/svg+xml,%3Csvg width='100' height='20' viewBox='0 0 100 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M21.184 20c.357-.13.72-.264 1.088-.402l1.768-.661C33.64 15.347 39.647 14 50 14c10.271 0 15.362 1.222 24.629 4.928.955.383 1.869.74 2.75 1.072h6.225c-2.51-.73-5.139-1.691-8.233-2.928C65.888 13.278 60.562 12 50 12c-10.626 0-16.855 1.397-26.66 5.063l-1.767.662c-2.475.923-4.66 1.674-6.724 2.275h6.335zm0-20C13.258 2.892 8.077 4 0 4V2c5.744 0 9.951-.574 14.85-2h6.334zM77.38 0C85.239 2.966 90.502 4 100 4V2c-6.842 0-11.386-.542-16.396-2h-6.225zM0 14c8.44 0 13.718-1.21 22.272-4.402l1.768-.661C33.64 5.347 39.647 4 50 4c10.271 0 15.362 1.222 24.629 4.928C84.112 12.722 89.438 14 100 14v-2c-10.271 0-15.362-1.222-24.629-4.928C65.888 3.278 60.562 2 50 2 39.374 2 33.145 3.397 23.34 7.063l-1.767.662C13.223 10.84 8.163 12 0 12v2z' fill='%23000' fill-opacity='0.03' fill-rule='evenodd'/%3E%3C/svg%3E\")",
  gradient: "",
};

export default function ThemeInjector() {
  const { storeTheme } = useSettings();

  useEffect(() => {
    if (!storeTheme) return;
    if (storeTheme.darkMode) document.documentElement.classList.add("dark");
  }, [storeTheme]);

  if (!storeTheme) return null;

  const {
    primaryColor, secondaryColor, accentColor,
    backgroundColor, textColor, fontFamily,
    borderRadius, spacing, cardStyle, shadowLevel,
    buttonStyle, navbarStyle, animations, backgroundPattern,
    customCSS,
  } = storeTheme;

  // ── CSS variables ──
  const vars = [
    primaryColor    && `--color-primary: ${primaryColor};`,
    primaryColor    && `--brand-primary: ${primaryColor};`,
    primaryColor    && `--color-primary-dark: ${primaryColor};`,
    secondaryColor  && `--color-secondary: ${secondaryColor};`,
    secondaryColor  && `--brand-secondary: ${secondaryColor};`,
    accentColor     && `--color-accent: ${accentColor};`,
    backgroundColor && `--color-bg: ${backgroundColor};`,
    textColor       && `--color-text: ${textColor};`,
    borderRadius != null && `--store-radius: ${borderRadius}px;`,
  ].filter(Boolean).join("\n    ");

  // ── Color overrides ──
  const colorOverrides = [
    primaryColor && `[class*="bg-[#00B4A6]"]{background-color:${primaryColor}!important}`,
    primaryColor && `[class*="bg-[#00B4A6]"]{background-color:${primaryColor}!important}`,
    primaryColor && `[class*="border-[#00B4A6]"]{border-color:${primaryColor}!important}`,
    primaryColor && `[class*="from-[#00B4A6]"]{--tw-gradient-from:${primaryColor}!important}`,
    primaryColor && `.border-primary{border-color:${primaryColor}!important}`,
    secondaryColor && `[class*="bg-[#f4a261]"]{background-color:${secondaryColor}!important}`,
    backgroundColor && `body{background-color:${backgroundColor}}`,
  ].filter(Boolean).join("\n");

  // ── Font ──
  const fontConfig = fontFamily ? GOOGLE_FONTS[fontFamily] : null;
  const fontCSS = fontConfig ? `body,.font-sans{font-family:${fontConfig.family}!important}` : "";

  // ── Border radius global ──
  const radiusCSS = borderRadius != null ? `
    .rounded-xl{border-radius:${borderRadius}px!important}
    .rounded-2xl{border-radius:${Math.round(borderRadius * 1.33)}px!important}
    .rounded-lg{border-radius:${Math.round(borderRadius * 0.67)}px!important}
    .rounded-full{border-radius:9999px!important}
  ` : "";

  // ── Spacing ──
  const spacingCSS = spacing === "compact" ? `
    section{padding-top:2.5rem!important;padding-bottom:2.5rem!important}
    @media(min-width:640px){section{padding-top:3.5rem!important;padding-bottom:3.5rem!important}}
  ` : spacing === "spacious" ? `
    section{padding-top:5rem!important;padding-bottom:5rem!important}
    @media(min-width:640px){section{padding-top:7rem!important;padding-bottom:7rem!important}}
  ` : "";

  // ── Card styles ──
  const cardCSS = {
    minimal: `.product-card,.store-card{border:1px solid transparent!important;box-shadow:none!important}`,
    shadow: `.product-card,.store-card{box-shadow:0 4px 12px rgba(0,0,0,0.08)!important;border-color:transparent!important}`,
    border: `.product-card,.store-card{border:2px solid ${primaryColor ?? "#00B4A6"}20!important;box-shadow:none!important}`,
    glass: `.product-card,.store-card{background:rgba(255,255,255,0.7)!important;backdrop-filter:blur(12px)!important;border:1px solid rgba(255,255,255,0.3)!important}`,
  }[cardStyle ?? ""] ?? "";

  // ── Button styles ──
  const btnCSS = {
    square: `button,[role="button"]{border-radius:4px!important}`,
    pill: `button,[role="button"]{border-radius:9999px!important}`,
    rounded: `button,[role="button"]{border-radius:${borderRadius ?? 12}px!important}`,
  }[buttonStyle ?? ""] ?? "";

  // ── Shadow level ──
  const shadowCSS = shadowLevel && shadowLevel !== "soft" ? `
    .shadow-sm,.shadow,.shadow-md,.shadow-lg{box-shadow:${SHADOW_MAP[shadowLevel]}!important}
  ` : "";

  // ── Animations ──
  const animCSS = animations === "none" ? `
    *,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}
  ` : animations === "dynamic" ? `
    .product-card:hover,.store-card:hover{transform:translateY(-4px) scale(1.02)!important;transition:transform 0.3s ease!important}
    button:hover{transform:scale(1.05)!important;transition:transform 0.2s ease!important}
    section{animation:fadeInUp 0.6s ease both!important}
    @keyframes fadeInUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  ` : "";

  // ── Background pattern ──
  const bgPatternCSS = backgroundPattern && backgroundPattern !== "none" ? (
    backgroundPattern === "gradient" && primaryColor
      ? `body::before{content:"";position:fixed;inset:0;z-index:-1;background:linear-gradient(135deg,${primaryColor}08 0%,transparent 50%,${secondaryColor ?? primaryColor}05 100%)}`
      : BG_PATTERN_MAP[backgroundPattern]
        ? `body{background-image:${BG_PATTERN_MAP[backgroundPattern]};background-size:${backgroundPattern === "dots" ? "20px 20px" : "100px 20px"}}`
        : ""
  ) : "";

  // ── Navbar style ──
  const navCSS = {
    transparent: `header,.store-header{background:transparent!important}`,
    blur: `header,.store-header{background:rgba(255,255,255,0.8)!important;backdrop-filter:blur(16px)!important}`,
    minimal: `header,.store-header{border-bottom:1px solid rgba(0,0,0,0.05)!important;box-shadow:none!important}`,
  }[navbarStyle ?? ""] ?? "";

  // Combinar todo
  const allCSS = [
    `:root{${vars}}`,
    colorOverrides,
    fontCSS,
    radiusCSS,
    spacingCSS,
    cardCSS,
    btnCSS,
    shadowCSS,
    animCSS,
    bgPatternCSS,
    navCSS,
    customCSS ?? "",
  ].filter(Boolean).join("\n");

  return (
    <>
      {fontConfig && <link rel="stylesheet" href={fontConfig.url} />}
      <style>{allCSS}</style>
    </>
  );
}
