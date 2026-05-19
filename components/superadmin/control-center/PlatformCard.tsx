"use client";

/**
 * components/superadmin/control-center/PlatformCard.tsx
 *
 * Tarjeta grande tipo launchpad que expone un destino operativo
 * (SuperAdmin, Admin, Tienda, Marketplace, etc.). Diseñada para el
 * Centro de Control del superadmin (regla minimalist-admin + tokens DS).
 *
 * UX:
 *   - Ícono + nombre + descripción corta.
 *   - Badge de estado (operativo / degradado / mantenimiento / desconocido).
 *   - URL copiable en fuente mono.
 *   - CTA "Abrir" → nueva pestaña.
 */

import { useState } from "react";
import type { LucideIcon } from "@buleje/design-system/icons";
import {
  ArrowUpRight,
  Check,
  Copy,
} from "@buleje/design-system/icons";
import { cn } from "@buleje/design-system";
import type { PlatformHealthStatus } from "@/lib/superadmin/platform-health";

export interface PlatformCardProps {
  id: string;
  name: string;
  description: string;
  /** Ruta interna o URL absoluta. */
  href: string;
  /** Ícono del DS (usa `@buleje/design-system/icons`). */
  icon: LucideIcon;
  /** Estado operacional — derivado de `getPlatformHealth()`. */
  status: PlatformHealthStatus;
  /** Abre en nueva pestaña (default true para launchpad). */
  external?: boolean;
  /** Tono visual del card (color del ícono + accent del hover). */
  tone?: "teal" | "violet" | "amber" | "sky" | "rose" | "emerald" | "slate";
  /** Etiqueta de categoría (chip arriba del nombre). */
  category?: string;
}

const STATUS_META: Record<PlatformHealthStatus, { label: string; dot: string; bg: string; text: string }> = {
  operational: {
    label: "Operativo",
    dot: "bg-[var(--data-success-500)]",
    bg: "bg-[var(--data-success-500)]/10",
    text: "text-[var(--data-success-700,var(--data-success-500))]",
  },
  degraded: {
    label: "Degradado",
    dot: "bg-[var(--data-warning-500)]",
    bg: "bg-[var(--data-warning-500)]/10",
    text: "text-[var(--data-warning-500)]",
  },
  maintenance: {
    label: "Mantenimiento",
    dot: "bg-[var(--data-warning-500)]",
    bg: "bg-[var(--data-warning-500)]/10",
    text: "text-[var(--data-warning-500)]",
  },
  unknown: {
    label: "Sin datos",
    dot: "bg-[var(--text-tertiary)]",
    bg: "bg-[var(--surface-sunken)]",
    text: "text-[var(--text-tertiary)]",
  },
};

const TONE_GRADIENT: Record<NonNullable<PlatformCardProps["tone"]>, string> = {
  teal:    "from-teal-500/15 to-cyan-500/5 text-teal-600 dark:text-teal-300 ring-teal-500/30",
  violet:  "from-violet-500/15 to-purple-500/5 text-violet-600 dark:text-violet-300 ring-violet-500/30",
  amber:   "from-amber-500/15 to-orange-500/5 text-amber-600 dark:text-amber-300 ring-amber-500/30",
  sky:     "from-sky-500/15 to-blue-500/5 text-sky-600 dark:text-sky-300 ring-sky-500/30",
  rose:    "from-rose-500/15 to-pink-500/5 text-rose-600 dark:text-rose-300 ring-rose-500/30",
  emerald: "from-emerald-500/15 to-green-500/5 text-emerald-600 dark:text-emerald-300 ring-emerald-500/30",
  slate:   "from-slate-500/15 to-zinc-500/5 text-slate-600 dark:text-slate-300 ring-slate-500/30",
};

export function PlatformCard({
  name,
  description,
  href,
  icon: Icon,
  status,
  external = true,
  tone = "teal",
  category,
}: PlatformCardProps) {
  const [copied, setCopied] = useState(false);
  const statusMeta = STATUS_META[status];

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* silent — clipboard unavailable */
    }
  };

  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={cn(
        "group relative flex flex-col gap-3 rounded-2xl border border-[var(--rule-base)]",
        "bg-[var(--surface-raised)] p-5",
        "transition-all duration-200",
        "hover:border-[var(--rule-strong)] hover:shadow-lg hover:-translate-y-0.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
      )}
    >
      {/* Header — icono coloreado a la izquierda + status dot a la derecha */}
      <header className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "inline-flex h-12 w-12 items-center justify-center rounded-xl shrink-0",
            "bg-gradient-to-br ring-1",
            TONE_GRADIENT[tone],
          )}
        >
          <Icon className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            statusMeta.bg,
            statusMeta.text,
          )}
          aria-label={statusMeta.label}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full animate-pulse", statusMeta.dot)} aria-hidden />
          {statusMeta.label}
        </span>
      </header>

      {/* Nombre + categoría + descripción */}
      <div className="min-w-0">
        {category && (
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
            {category}
          </p>
        )}
        <h3 className="text-[15px] font-bold text-[var(--text-primary)] leading-tight">
          {name}
        </h3>
        <p className="mt-1 text-[13px] text-[var(--text-secondary)] leading-snug line-clamp-2">
          {description}
        </p>
      </div>

      {/* URL pill + copy + arrow */}
      <div className="mt-auto flex items-center justify-between gap-2 pt-2 border-t border-[var(--rule-soft)]">
        <code className="truncate font-mono text-[11px] font-semibold text-[var(--text-tertiary)]">
          {href}
        </code>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? "URL copiada" : "Copiar URL"}
            className={cn(
              "rounded-md p-1.5 transition-colors",
              "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
            )}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-[var(--data-success-500)]" aria-hidden />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
          <span
            className={cn(
              "inline-flex items-center justify-center rounded-md h-7 w-7",
              "text-[var(--text-tertiary)] transition-all",
              "group-hover:text-[var(--accent)] group-hover:translate-x-0.5",
            )}
            aria-hidden
          >
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </a>
  );
}
