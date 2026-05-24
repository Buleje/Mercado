/**
 * lib/superadmin-layout.ts
 *
 * Constantes ÚNICAS de layout para toda la consola /superadmin/*.
 *
 * Por qué existe esto:
 *  - Antes cada página inventaba su ancho (1100, 1200, 1280, 1400) y su
 *    padding vertical (py-5/7, py-6/8, py-6/10). Eso producía un brinco
 *    visual al cambiar de tab — el contenido "saltaba" hacia los lados.
 *  - Ahora TODAS las páginas usan estas tres clases. Si querés cambiar
 *    el ancho global, cambiás aquí y se propaga.
 *
 * Cambio 2026-05-24 (Brandon): mismo ancho que `/superadmin/dashboard`.
 *  - Antes: `max-w-[1400px] mx-auto` → cap a 1400px aunque el viewport sea 1920.
 *  - Ahora: sin cap → el contenido ocupa todo el ancho del <main> (que ya
 *    está acotado por la sidebar 240px). En 1280 viewport → 1040px content.
 *    En 1920 viewport → 1680px content. Aprovecha pantallas grandes.
 *
 * Uso típico (Server Component o Client):
 *   import { SUPERADMIN_HERO, SUPERADMIN_HERO_INNER, SUPERADMIN_CONTENT } from "@/lib/superadmin-layout";
 *
 *   <header className={SUPERADMIN_HERO}>
 *     <div className={SUPERADMIN_HERO_INNER}>…hero…</div>
 *   </header>
 *   <div className={SUPERADMIN_CONTENT}>…contenido…</div>
 */

/** `<header>` exterior del hero (rule + surface raised + padding horizontal). */
export const SUPERADMIN_HERO =
  "border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 sm:px-6 lg:px-8 py-6 sm:py-8";

/** Wrapper interno del hero — sin cap, ocupa todo el ancho disponible. */
export const SUPERADMIN_HERO_INNER = "w-full";

/** Wrapper del contenido bajo el hero — full width + padding consistente. */
export const SUPERADMIN_CONTENT =
  "w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8";

/** Wrapper de página raíz (background canvas full-height). */
export const SUPERADMIN_PAGE = "min-h-screen bg-[var(--surface-canvas)]";
