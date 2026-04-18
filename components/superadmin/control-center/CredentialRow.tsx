"use client";

/**
 * components/superadmin/control-center/CredentialRow.tsx
 *
 * Fila de la tabla "Credenciales del sistema" del Centro de Control.
 *
 * SEGURIDAD: nunca muestra el valor real del secreto. Solo expone:
 *   - label (nombre legible)
 *   - scope (dónde se usa)
 *   - estado (configurada / sin configurar)
 *   - última rotación (cuando aplica)
 *   - acción (abrir dashboard externo, alert si la acción está pendiente).
 */

import type { LucideIcon } from "@buleje/design-system/icons";
import {
  ArrowUpRight,
  RefreshCw,
  Settings,
  ShieldCheck,
} from "@buleje/design-system/icons";
import {
  BadgeStatus,
  BodyText,
  Caption,
  PrimaryButton,
  cn,
} from "@buleje/design-system";

export type CredentialActionKind = "rotate" | "change" | "external" | "configure";

export interface CredentialRowProps {
  label: string;
  scope: string;
  configured: boolean;
  /** Texto libre (ej: "hace 45d", "activo", "—"). */
  rotatedLabel?: string;
  actionKind: CredentialActionKind;
  /** Etiqueta del botón. */
  actionLabel: string;
  /** Href externo — cuando está presente, abre en nueva pestaña. */
  actionHref?: string;
  /** Callback si la acción es un stub local (ej: alert). */
  onAction?: () => void;
}

const ACTION_ICON: Record<CredentialActionKind, LucideIcon> = {
  rotate: RefreshCw,
  change: ShieldCheck,
  external: ArrowUpRight,
  configure: Settings,
};

export function CredentialRow({
  label,
  scope,
  configured,
  rotatedLabel,
  actionKind,
  actionLabel,
  actionHref,
  onAction,
}: CredentialRowProps) {
  const ActionIcon = ACTION_ICON[actionKind];

  const actionButton = actionHref ? (
    <PrimaryButton asChild size="sm" variant="ghost">
      <a href={actionHref} target="_blank" rel="noopener noreferrer">
        <ActionIcon className="mr-1 h-3.5 w-3.5" aria-hidden />
        {actionLabel}
      </a>
    </PrimaryButton>
  ) : (
    <PrimaryButton size="sm" variant="ghost" onClick={onAction}>
      <ActionIcon className="mr-1 h-3.5 w-3.5" aria-hidden />
      {actionLabel}
    </PrimaryButton>
  );

  return (
    <tr className="border-b border-[var(--rule-base)] last:border-b-0">
      <td className="px-4 py-3 align-middle">
        <div className="flex flex-col">
          <BodyText className="font-semibold text-[var(--text-primary)]">
            {label}
          </BodyText>
          <Caption className="text-[var(--text-tertiary)]">{scope}</Caption>
        </div>
      </td>
      <td className="px-4 py-3 align-middle">
        <BadgeStatus
          variant={configured ? "success" : "neutral"}
          label={configured ? "Configurada" : "Sin configurar"}
          size="sm"
          dot
        />
      </td>
      <td className="px-4 py-3 align-middle">
        <Caption
          className={cn(
            "font-mono",
            configured ? "text-[var(--text-secondary)]" : "text-[var(--text-tertiary)]",
          )}
        >
          {rotatedLabel ?? "—"}
        </Caption>
      </td>
      <td className="px-4 py-3 align-middle text-right">{actionButton}</td>
    </tr>
  );
}
