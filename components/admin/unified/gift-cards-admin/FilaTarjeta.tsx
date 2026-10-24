"use client";

import { MoreHorizontal, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { cn } from "@/lib/utils";
import { formatDate, formatNumber } from "@/lib/format";
import type { GiftCardDetails } from "./GiftCardDetailsModal";

// ── Helpers ─────────────────────────────────────────────────────────────────

export const fmt = (n: number) => `S/ ${formatNumber(n, 2)}`;
export const fmtDate = (iso: string) => {
  if (!iso) return "Sin vencimiento";
  try {
    return formatDate(iso);
  } catch {
    return iso;
  }
};

export function maskCode(code: string) {
  if (code.length < 8) return code;
  return `${code.substring(0, 5)}•••••${code.substring(code.length - 4)}`;
}

export const STATUS_LABELS: Record<GiftCardDetails["status"], string> = {
  pendiente: "Pendiente",
  canjeada: "Canjeada",
  expirada: "Expirada",
  cancelada: "Cancelada",
};

export const STATUS_STYLES: Record<GiftCardDetails["status"], string> = {
  pendiente: "bg-[var(--data-success-100)] text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]",
  canjeada: "bg-[var(--data-info-100)] text-[var(--data-info-ink)] dark:text-[var(--data-info-500)]",
  expirada: "bg-[var(--rule-soft)] text-[var(--text-secondary)]",
  cancelada: "bg-[var(--data-error-100)] text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]",
};


export function FilaTarjeta({ c, onVer, onCancelar }: { c: GiftCardDetails; onVer: () => void; onCancelar: () => void }) {
  const mas: MenuAccion[] = c.status === "pendiente" ? [{ id: "cancelar", label: "Cancelar y reembolsar", icon: Trash2, tone: "danger", onSelect: onCancelar }] : [];
  return (
    <tr>
      <td>
        <p className="font-mono text-sm font-bold text-[var(--text-primary)]">{maskCode(c.code)}</p>
      </td>
      <td className="hidden sm:table-cell">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{c.recipientName}</p>
        {c.message && <p className="max-w-xs truncate text-sm italic text-[var(--text-secondary)]">{c.message}</p>}
      </td>
      <td className="text-right font-semibold tabular-nums">{fmt(c.amount)}</td>
      <td className="hidden text-right font-bold tabular-nums text-[var(--accent-ink)] dark:text-[var(--accent)] lg:table-cell">{fmt(c.balance)}</td>
      <td className="hidden text-[var(--text-secondary)] md:table-cell">{fmtDate(c.expiresAt)}</td>
      <td className="text-center">
        <span className={cn("inline-flex rounded-full px-2.5 py-1 text-sm font-bold", STATUS_STYLES[c.status])}>{STATUS_LABELS[c.status]}</span>
      </td>
      <td>
        <div className="flex items-center justify-end gap-1">
          <button type="button" onClick={onVer} className="inline-flex min-h-12 items-center rounded-xl px-3 text-sm font-semibold text-[var(--accent-ink)] hover:bg-primary/10 dark:text-[var(--accent)]">
            Ver
          </button>
          {mas.length === 0 && <span className="w-12 shrink-0" aria-hidden />}
          {mas.length > 0 && <ActionMenu label={`Más acciones de la tarjeta ${maskCode(c.code)}`} icon={MoreHorizontal} actions={mas} soloIcono size="md" className="w-12 shrink-0" title="Cancelar y reembolsar" />}
        </div>
      </td>
    </tr>
  );
}
