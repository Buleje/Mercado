/**
 * shared.ts — Tipos, helpers y configuración del módulo de soporte superadmin.
 * Fuente única: todos los sub-componentes importan desde aquí.
 */

import { Mail, Clock, CheckCircle2 } from "@buleje/design-system/icons";
import type { LucideIcon } from "@buleje/design-system/icons";

// ── Tipos ────────────────────────────────────────────────────────────────────

export type TicketStatus = "open" | "in_progress" | "closed";
export type TicketPriority = "low" | "medium" | "high";
export type KpiFilter = "all" | TicketStatus | "urgent";

export interface TicketMessage {
  id: string;
  from: "tenant" | "support";
  body: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  subject: string;
  tenantName: string;
  tenantSlug: string;
  senderEmail: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  lastMessage: string;
  messages: TicketMessage[];
}

export interface ReplyTemplate {
  id: string;
  name: string;
  body: string;
  starred: boolean;
}

export interface SupportKpiData {
  open: number;
  inProgress: number;
  closed: number;
  /** priority="high" y status !== "closed" */
  urgent: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  return `hace ${Math.floor(hours / 24)}d`;
}

export function computeKpis(tickets: SupportTicket[]): SupportKpiData {
  return {
    open: tickets.filter((t) => t.status === "open").length,
    inProgress: tickets.filter((t) => t.status === "in_progress").length,
    closed: tickets.filter((t) => t.status === "closed").length,
    urgent: tickets.filter((t) => t.priority === "high" && t.status !== "closed").length,
  };
}

// ── Configuraciones DS (CERO hex) ────────────────────────────────────────────

export interface StatusConfig {
  label: string;
  /** Clases Tailwind con tokens DS exclusivamente. */
  badgeClass: string;
  icon: LucideIcon;
}

export const STATUS_CONFIG: Record<TicketStatus, StatusConfig> = {
  open: {
    label: "Abierto",
    badgeClass:
      "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 text-[var(--data-error-500)]",
    icon: Mail,
  },
  in_progress: {
    label: "En progreso",
    badgeClass: "bg-[var(--accent-soft)] text-[var(--accent)]",
    icon: Clock,
  },
  closed: {
    label: "Cerrado",
    badgeClass:
      "bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/20 text-[var(--data-success-500)]",
    icon: CheckCircle2,
  },
};

export interface PriorityConfig {
  label: string;
  /** Color del ícono/texto de prioridad — tokens DS. */
  color: string;
}

export const PRIORITY_CONFIG: Record<TicketPriority, PriorityConfig> = {
  low: { label: "Baja", color: "text-[var(--text-tertiary)]" },
  medium: { label: "Media", color: "text-[var(--data-warning-500)]" },
  high: { label: "Alta", color: "text-[var(--data-error-500)]" },
};
