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
import {
  BadgeStatus,
  BodyText,
  CardTitle,
  IconBadge,
  PrimaryButton,
  cn,
  type BadgeStatusVariant,
} from "@buleje/design-system";
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
}

const STATUS_LABEL: Record<PlatformHealthStatus, string> = {
  operational: "Operativo",
  degraded: "Degradado",
  maintenance: "Mantenimiento",
  unknown: "Sin datos",
};

const STATUS_VARIANT: Record<PlatformHealthStatus, BadgeStatusVariant> = {
  operational: "success",
  degraded: "warning",
  maintenance: "warning",
  unknown: "neutral",
};

export function PlatformCard({
  name,
  description,
  href,
  icon: Icon,
  status,
  external = true,
}: PlatformCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* silent — clipboard unavailable */
    }
  };

  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-[var(--rule-base)]",
        "bg-[var(--surface-raised)] p-5",
        "transition-colors hover:border-[var(--rule-strong)]",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <IconBadge size="lg" shape="square" intent="muted" asDiv>
            <Icon className="h-6 w-6" aria-hidden />
          </IconBadge>
          <div className="min-w-0">
            <CardTitle className="truncate">{name}</CardTitle>
            <BodyText className="mt-1 text-[var(--text-secondary)]">
              {description}
            </BodyText>
          </div>
        </div>
        <BadgeStatus
          variant={STATUS_VARIANT[status]}
          label={STATUS_LABEL[status]}
          size="sm"
          dot
        />
      </header>

      <div
        className={cn(
          "flex items-center justify-between gap-2",
          "rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)]",
          "px-3 py-2",
        )}
      >
        <code className="truncate font-mono text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
          {href}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "URL copiada" : "Copiar URL"}
          className={cn(
            "shrink-0 rounded-md p-1.5 transition-colors",
            "text-[var(--text-tertiary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]",
          )}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-[var(--data-success-500)]" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      </div>

      <div className="mt-auto flex items-center justify-end">
        <PrimaryButton asChild size="sm" variant="secondary">
          <a
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
          >
            Abrir
            <ArrowUpRight className="ml-1 h-3.5 w-3.5" aria-hidden />
          </a>
        </PrimaryButton>
      </div>
    </article>
  );
}
