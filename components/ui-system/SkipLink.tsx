"use client";

/**
 * SkipLink — link accesible para saltar al contenido principal.
 *
 * WCAG 2.4.1 Bypass Blocks. Permite a usuarios de teclado y lectores
 * de pantalla saltar la navegación repetitiva y llegar directo al
 * `<main id="main-content">`.
 *
 * Comportamiento:
 * - Oculto off-screen (`-translate-y-20`) por default.
 * - Al recibir `focus-visible` (Tab), anima a `translate-y-0`.
 * - z-index alto para saltar sobre navbars.
 * - Tokens DS (ADR-075): sin colores hardcodeados.
 *
 * @example
 * // En el root layout, como primer child del <body>:
 * <SkipLink />
 * ...
 * <main id="main-content">...</main>
 */

interface SkipLinkProps {
  /** Texto visible del link. Default: "Ir al contenido". */
  label?: string;
  /** ID del elemento destino. Default: "main-content". */
  targetId?: string;
}

export function SkipLink({
  label = "Ir al contenido",
  targetId = "main-content",
}: SkipLinkProps) {
  return (
    <a
      href={`#${targetId}`}
      className={[
        // Posicionamiento y z-index (sobre navbars).
        "absolute top-2 left-2 z-[100]",
        // Estilos visuales (tokens DS).
        "px-4 py-2 rounded-lg text-sm font-medium",
        "bg-[var(--surface-raised)] text-[var(--text-primary)]",
        "border border-[var(--rule-base)] shadow-md",
        // Oculto off-screen hasta focus; anima con transform.
        "-translate-y-20 transition-transform duration-200 ease-out",
        // Al recibir foco por teclado, aparece.
        "focus-visible:translate-y-0",
        // Outline visible al focus (no depende de sombras).
        "focus-visible:outline-2 focus-visible:outline-offset-2",
        "focus-visible:outline-[var(--text-primary)]",
      ].join(" ")}
    >
      {label}
    </a>
  );
}

export default SkipLink;
