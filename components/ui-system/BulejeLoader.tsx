"use client";

/**
 * BulejeLoader — Loader full-screen con el logo de la marca + animación.
 *
 * Qué hace (Feynman): cuando una página tarda en cargar, en vez de mostrar
 * skeletons genéricos (cajas grises pulsantes), mostramos el logo de la
 * bodega respirando suavemente. El cliente percibe: "esto es Buleje, ya
 * viene mi pedido". Conexión emocional con la marca en vez de cajas vacías.
 *
 * Uso:
 *   // En un loading.tsx:
 *   export default function Loading() {
 *     return <BulejeLoader label="Cargando tus pedidos" />;
 *   }
 *
 *   // Compacto en card:
 *   <BulejeLoader size="sm" inline />
 *
 * Animación (no reduces-motion compliant):
 *   - Logo: pulse sutil 2s ease-in-out infinite (scale 1 → 1.05 → 1)
 *   - Opacidad: 0.75 → 1 → 0.75 (respiración)
 *   - Dots "..." progresivos debajo del label (cada 400ms cambia)
 *
 * Estilo: usa tokens del DS. No hardcodea colores — respeta light/dark.
 */

import { useEffect, useState } from "react";
import { BulejeMark } from "@/components/ui-system/illustrations/BulejeLogo";
import { PaicheMascot } from "@/components/ui-system/illustrations/PaicheMascot";
import { PaicheLoading } from "@/components/ui-system/illustrations/PaicheLoading";
import { cn } from "@/lib/utils";

interface Props {
  /** Texto debajo del logo. Default: "Cargando". */
  label?: string;
  /** Tamaño del logo. Default: md = 64px. */
  size?: "sm" | "md" | "lg";
  /** Si es true, no ocupa min-h-screen (útil para cards internas). */
  inline?: boolean;
  /**
   * Ilustración a mostrar:
   *   - "mark" (default): logo bodega con animación respiración
   *   - "paiche": pez paiche nadando — para secciones amazónicas
   *     (marketplace, ofertas, descubrí), más cálido y distintivo.
   */
  variant?: "mark" | "paiche";
  className?: string;
}

const LOGO_SIZE = { sm: 40, md: 64, lg: 96 } as const;
// Paiche más grande y presente — se percibe como identidad amazónica, no
// como decoración chica. Duplicamos el tamaño previo (2026-04-20).
const PAICHE_SIZE = { sm: 140, md: 240, lg: 360 } as const;

export function BulejeLoader({
  label = "Cargando",
  size = "md",
  inline = false,
  variant = "paiche",
  className,
}: Props) {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const sequence = ["", ".", "..", "..."];
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % sequence.length;
      setDots(sequence[i]);
    }, 400);
    return () => clearInterval(id);
  }, []);

  // Paiche variant: delegamos al nuevo PaicheLoading (waves + pulse + dots
  // de gran formato). El size lg/md/sm mapea a page/section/inline para que
  // las llamadas existentes hereden el look mejorado sin tocar 13 archivos.
  if (variant === "paiche" && !inline) {
    const v = size === "lg" ? "page" : size === "md" ? "section" : "inline";
    return <PaicheLoading variant={v} label={label} className={className} />;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "flex flex-col items-center justify-center gap-4 bg-[var(--surface-canvas)]",
        inline ? "py-12" : "min-h-screen",
        className,
      )}
    >
      {variant === "paiche" ? (
        <div className="text-[var(--accent)]">
          <PaicheMascot size={PAICHE_SIZE[size]} strokeWidth={1.75} animated />
        </div>
      ) : (
        <div
          className="text-[var(--accent)] motion-safe:animate-buleje-breathe"
          style={{
            animation: "buleje-breathe 2s ease-in-out infinite",
          }}
        >
          <BulejeMark size={LOGO_SIZE[size]} strokeWidth={1.75} />
        </div>
      )}

      <p className="font-display text-base text-[var(--text-secondary)] tabular-nums">
        <span>{label}</span>
        <span className="inline-block w-6 text-left" aria-hidden>
          {dots}
        </span>
      </p>

      <span className="sr-only">Cargando contenido, por favor esperá.</span>

      {/* Keyframes inline — evita depender de configuración global de Tailwind. */}
      <style jsx>{`
        @keyframes buleje-breathe {
          0%, 100% {
            transform: scale(1);
            opacity: 0.75;
          }
          50% {
            transform: scale(1.05);
            opacity: 1;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          :global(.motion-safe\\:animate-buleje-breathe) {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

export default BulejeLoader;
