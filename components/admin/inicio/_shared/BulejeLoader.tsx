"use client";

/**
 * BulejeLoader — loader elegante con logo animado de la empresa.
 *
 * Reemplaza los bloques grises de `animate-pulse` por:
 *  - Logo BulejeMark con pulsación suave (breathing)
 *  - Arcs concéntricos con fade-in staggered
 *  - Texto "Cargando..." opcional
 *  - Fondo neutral que no compite con el contenido
 *
 * Variantes:
 *  - `full`: centrado fullscreen (para loading inicial)
 *  - `inline`: embed dentro de un container
 *  - `card`: dentro de una card con altura mínima
 *
 * Compatible con LazyMotion strict (usa `m` de admin/providers).
 */

import { m } from "@/components/admin/providers";
import { BulejeMark } from "@/components/ui-system/illustrations/BulejeLogo";
import { cn } from "@/lib/utils";

interface Props {
  variant?: "full" | "inline" | "card";
  size?: number;
  label?: string;
  className?: string;
  minHeight?: number | string;
}

export function BulejeLoader({
  variant = "card",
  size = 56,
  label = "Cargando...",
  className,
  minHeight,
}: Props) {
  const wrapperCls = cn(
    "flex flex-col items-center justify-center gap-4",
    variant === "full" && "min-h-screen",
    variant === "card" && "py-12",
    variant === "inline" && "py-6",
    className,
  );

  return (
    <div
      className={wrapperCls}
      style={minHeight ? { minHeight } : undefined}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="relative" style={{ width: size * 2, height: size * 2 }}>
        {/* Arcs concéntricos con respiración */}
        {[0, 1, 2].map((i) => (
          <m.span
            key={i}
            aria-hidden
            className="absolute inset-0 rounded-full border border-primary/30"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{
              scale: [0.6, 1.15, 1.4],
              opacity: [0, 0.5, 0],
            }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              delay: i * 0.55,
              ease: "easeOut",
            }}
          />
        ))}
        {/* Logo con pulso suave */}
        <m.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{
            scale: [1, 1.06, 1],
          }}
          transition={{
            duration: 2.2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <div className="flex h-full w-full items-center justify-center rounded-full bg-[var(--surface-raised)] text-primary shadow-lg shadow-primary/10">
            <BulejeMark size={size} strokeWidth={2} />
          </div>
        </m.div>
      </div>

      {label && (
        <m.div
          className="flex flex-col items-center gap-1"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <p className="text-sm font-semibold text-[var(--text-primary)] tracking-tight">
            {label}
          </p>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <m.span
                key={i}
                className="h-1 w-1 rounded-full bg-primary"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.2,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>
        </m.div>
      )}
    </div>
  );
}

/**
 * BulejeSkeleton — skeleton individual con shimmer elegante.
 * Reemplaza los `bg-[var(--surface-sunken)] rounded-xl h-28` crudos.
 */
export function BulejeSkeleton({
  height = 120,
  className,
  delay = 0,
}: {
  height?: number;
  className?: string;
  delay?: number;
}) {
  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay }}
      className={cn(
        "relative overflow-hidden rounded-xl border border-[var(--rule-soft)]",
        className,
      )}
      style={{
        height,
        background:
          "color-mix(in srgb, var(--rule-soft) 60%, var(--surface-sunken))",
      }}
      aria-hidden
    >
      <m.div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--surface-raised) 60%, transparent) 50%, transparent 100%)",
        }}
        animate={{ x: ["-100%", "100%"] }}
        transition={{
          duration: 1.6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </m.div>
  );
}

/**
 * BulejeDashboardSkeleton — skeleton completo de un dashboard con logo loader
 * + bloques shimmer. Reemplaza los 6 DashboardSkeleton inline.
 */
export function BulejeDashboardSkeleton() {
  return (
    <div className="space-y-5">
      {/* Logo loader arriba */}
      <BulejeLoader variant="inline" label="Cargando datos..." size={40} />

      {/* KPI row skeletons */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <BulejeSkeleton key={i} height={112} delay={i * 0.04} />
        ))}
      </div>

      {/* Chart skeletons */}
      <BulejeSkeleton height={60} delay={0.1} />
      <BulejeSkeleton height={360} delay={0.15} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BulejeSkeleton height={300} delay={0.2} />
        <BulejeSkeleton height={300} delay={0.25} />
      </div>
    </div>
  );
}
