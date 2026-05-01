"use client";

/**
 * ErrorPageLayout — Layout editorial para 404, 500, offline y otros
 * errores de página completa.
 *
 * Incluye:
 *   - Ilustración contextual del DS
 *   - Código de error (404, 500, etc) display grande
 *   - Título editorial + mensaje humano
 *   - 2 CTAs: primary (volver al inicio) + secondary (buscar/reportar)
 *   - Footer con link a ayuda/WhatsApp
 *
 * Props:
 *   code, title, message, primaryAction, secondaryAction, illustration
 */

import Link from "next/link";
import { Home, Search, MessageCircle, ArrowLeft } from "@buleje/design-system/icons";
import { BrujulaPerdida } from "@/components/ui-system/illustrations/contextual";
import type { ReactNode } from "react";

interface ActionConfig {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: ReactNode;
}

interface Props {
  /** Código de error como "404", "500", o null si no aplica */
  code?: string;
  title: string;
  message?: string;
  illustration?: ReactNode;
  primaryAction?: ActionConfig;
  secondaryAction?: ActionConfig;
  /** Numero WhatsApp soporte. Default +51 916 409 675 */
  supportPhone?: string;
}

function RenderAction({ action, variant }: { action: ActionConfig; variant: "primary" | "secondary" }) {
  const classes =
    variant === "primary"
      ? "rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-6 py-3 text-sm font-bold hover:bg-[var(--accent)] transition-colors active:scale-[0.98] inline-flex items-center gap-2"
      : "rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-primary)] px-6 py-3 text-sm font-bold hover:border-[var(--accent)] transition-colors inline-flex items-center gap-2";
  const content = (
    <>
      {action.icon}
      {action.label}
    </>
  );
  if (action.href) {
    return (
      <Link href={action.href} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={classes}>
      {content}
    </button>
  );
}

export default function ErrorPageLayout({
  code,
  title,
  message,
  illustration,
  primaryAction = {
    label: "Volver al inicio",
    href: "/",
    icon: <Home className="h-4 w-4" strokeWidth={1.75} aria-hidden />,
  },
  secondaryAction,
  supportPhone = "916409675",
}: Props) {
  const defaultIllustration = <BrujulaPerdida size={200} />;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16 bg-[var(--surface-canvas)]">
      <div className="w-full max-w-2xl text-center">
        {/* Code display XL */}
        {code && (
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2">
            Error {code}
          </p>
        )}

        {/* Ilustración */}
        <div className="mx-auto mb-8 text-[var(--text-primary)]/75">
          {illustration ?? defaultIllustration}
        </div>

        {/* Título + mensaje */}
        <h1 className="text-[clamp(2rem,6vw,3.5rem)] font-extrabold tracking-tight text-[var(--text-primary)] leading-[0.95] mb-4">
          {title}
        </h1>
        {message && (
          <p className="text-lg text-[var(--text-secondary)] leading-relaxed max-w-xl mx-auto mb-10">
            {message}
          </p>
        )}

        {/* CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
          <RenderAction action={primaryAction} variant="primary" />
          {secondaryAction && <RenderAction action={secondaryAction} variant="secondary" />}
        </div>

        {/* Footer con soporte */}
        <p className="text-xs text-[var(--text-tertiary)]">
          ¿Necesitás ayuda?{" "}
          <a
            href={`https://wa.me/51${supportPhone}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-bold text-[var(--accent)] hover:underline"
          >
            <MessageCircle className="h-3 w-3" strokeWidth={1.75} aria-hidden />
            Escribinos por WhatsApp
          </a>
        </p>
      </div>
    </main>
  );
}

/** Preset 404 listo para app/not-found.tsx */
export function NotFoundPage() {
  return (
    <ErrorPageLayout
      code="404"
      title="Perdiste el camino"
      message="Esta página no existe o la movimos. Volvé al inicio o buscá lo que necesitás."
      secondaryAction={{
        label: "Buscar productos",
        href: "/marketplace/buscar",
        icon: <Search className="h-4 w-4" strokeWidth={1.75} aria-hidden />,
      }}
    />
  );
}

/** Preset 500 / error boundary */
export function ServerErrorPage({ onReset }: { onReset?: () => void } = {}) {
  return (
    <ErrorPageLayout
      code="500"
      title="Algo salió mal acá"
      message="Fue un error nuestro, no tuyo. Ya estamos viéndolo — reintentá en un momento."
      primaryAction={
        onReset
          ? {
              label: "Reintentar",
              onClick: onReset,
              icon: <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />,
            }
          : {
              label: "Volver al inicio",
              href: "/",
              icon: <Home className="h-4 w-4" strokeWidth={1.75} aria-hidden />,
            }
      }
    />
  );
}
