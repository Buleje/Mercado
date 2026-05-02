"use client";

/**
 * <T> — componente client minimalista para traducir un string inline
 * dentro de Server Components sin tener que convertir toda la sección
 * a "use client".
 *
 * Uso:
 *   <h1><T k="landing.finalCta.title1" /></h1>
 *
 * Render path:
 *   - SSR: muestra `fallback` si se pasa, sino la clave en español.
 *   - Cliente tras hidratar: lee del LocaleContext y reactivo a cambios.
 */

import { useLocale } from "@/contexts/locale-context";

interface Props {
  /** Clave en TRANSLATIONS (ej. "landing.hero.title1"). */
  k: string;
  /** Texto SSR antes de hidratar (default: traducción ES). */
  fallback?: string;
}

export default function T({ k, fallback }: Props) {
  const { t } = useLocale();
  const value = t(k);
  // Si la clave no existe (fallback raw key), usa el fallback prop.
  if (value === k && fallback) return <>{fallback}</>;
  return <>{value}</>;
}
