"use client";

/**
 * DesktopOnlyGate — bloquea acceso al editor de banners en mobile/tablet.
 *
 * Brandon 2026-05-20 v13 audit superadmin responsive:
 * BannerPreviewStudio es un editor canvas Photoshop-like de 3090 LOC con
 * herramientas, capas, transformaciones, color pickers, etc. Refactorizarlo
 * a mobile requeriría ~2-3 días (Brandon decidió desktop-only warning).
 *
 * Comportamiento:
 *   - SSR: renderiza children siempre (para no romper prerender estático
 *     y no crear FOUC al hidratar).
 *   - Tras mount client: si viewport < 1024px (lg), reemplaza por warning UX.
 *   - Reactiva si el usuario rota tablet a horizontal o cambia el zoom.
 */

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useIsDesktop } from "@/hooks/use-media-query";
import { Monitor, ArrowLeft } from "@buleje/design-system/icons";

interface DesktopOnlyGateProps {
  children: ReactNode;
}

export default function DesktopOnlyGate({ children }: DesktopOnlyGateProps) {
  const isDesktop = useIsDesktop(); // ≥1024px (lg breakpoint)
  // mount flag — evita FOUC: en SSR/primer-render mostramos children
  // siempre (el SSR hace prerender del editor). Tras hidratar y detectar
  // mobile/tablet, reemplazamos por warning.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // SSR + first paint → renderiza children (sin flash)
  if (!mounted) return <>{children}</>;

  // Desktop hidratado → renderiza el editor normalmente
  if (isDesktop) return <>{children}</>;

  // Mobile / tablet hidratado → warning UX
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 bg-[var(--surface-canvas)]">
      <div className="max-w-md w-full text-center">
        {/* Ilustración */}
        <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] mb-6">
          <Monitor className="h-10 w-10" strokeWidth={1.5} aria-hidden />
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] mb-3">
          Editor de banners requiere pantalla grande
        </h1>

        <p className="text-base text-[var(--text-secondary)] leading-relaxed mb-2">
          El editor de banners es un canvas tipo Photoshop con herramientas,
          capas y transformaciones. Necesita al menos{" "}
          <strong className="text-[var(--text-primary)]">1024px de ancho</strong>{" "}
          para funcionar correctamente.
        </p>

        <p className="text-sm text-[var(--text-tertiary)] mb-8">
          Abrilo desde tu computadora o tablet en horizontal.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/superadmin/dashboard"
            className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-[var(--accent)] text-white text-sm font-extrabold shadow-md hover:bg-[var(--accent)]/90 active:scale-[0.98] transition-all"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            Volver al dashboard
          </Link>
        </div>

        {/* Detalle */}
        <p className="mt-8 text-xs text-[var(--text-tertiary)]">
          Tip: en una tablet, podés girarla a horizontal para alcanzar 1024px.
        </p>
      </div>
    </div>
  );
}
