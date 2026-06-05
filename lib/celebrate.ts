/**
 * celebrate() — dispara una micro-celebración (confetti + haptic) en respuesta a
 * una acción REAL del usuario (agregar al carrito, votar, alcanzar una racha).
 *
 * Es un emisor de eventos desacoplado: despacha `buleje:celebrate` en window y
 * el `<CelebrationLayer/>` (montado una vez en el marketplace) lo escucha y
 * renderiza el confetti. Si no hay layer montado, es un no-op silencioso — por
 * eso es seguro llamarlo desde componentes compartidos (UnifiedProductCard, etc).
 *
 * No-fake: solo se llama desde handlers de acciones reales, nunca en intervalos.
 */
export interface CelebrateOptions {
  /** Coordenada X en px del origen (p.ej. e.clientX). Default: centro. */
  x?: number;
  /** Coordenada Y en px del origen (p.ej. e.clientY). Default: 70% alto. */
  y?: number;
  /** Intensidad del estallido. */
  intensity?: "sm" | "md" | "lg";
  /** Vibración haptic en mobile (default true). */
  haptic?: boolean;
}

export function celebrate(opts: CelebrateOptions = {}): void {
  if (typeof window === "undefined") return;
  // Haptic inmediato (no depende del layer).
  if (opts.haptic !== false && typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(opts.intensity === "lg" ? [12, 40, 18] : 18);
    } catch {
      /* silent */
    }
  }
  window.dispatchEvent(new CustomEvent("buleje:celebrate", { detail: opts }));
}
