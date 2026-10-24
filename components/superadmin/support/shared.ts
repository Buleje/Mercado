/**
 * shared.ts — Tipos, helpers y configuración del módulo de soporte superadmin.
 * Fuente única: todos los sub-componentes importan desde aquí.
 */

import { Mail, Clock, CheckCircle2 } from "@buleje/design-system/icons";
import type { LucideIcon } from "@buleje/design-system/icons";
import {
  ESTADO_GENERAL_ETIQUETA,
  etiquetaEstado,
  type SolicitudCorreccionPlataformaDTO,
} from "@/lib/soporte/correccion-guia";

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
  /** `general` | `correccion_guia` (ADR-512). Opcional: una respuesta vieja no lo trae. */
  kind?: string;
  entityType?: string | null;
  entityId?: string | null;
  /** El estado tal como se guarda (open|replied|closed o open|in_review|closed|rejected). */
  rawStatus?: string;
  /** Sólo en una corrección de guía: qué casillero, qué dice y qué debería decir. */
  correccion?: SolicitudCorreccionPlataformaDTO | null;
}

/** Bandeja: los mensajes de siempre o los pedidos de corrección de guía. */
export type Bandeja = "mensajes" | "correcciones";

export const esCorreccion = (t: Pick<SupportTicket, "kind">): boolean => t.kind === "correccion_guia";

/** El estado en palabras del contrato (`etiquetaEstado`): una corrección dice «En revisión», no «Respondido». */
export function etiquetaDelTicket(t: Pick<SupportTicket, "kind" | "rawStatus" | "status">): string {
  return t.kind && t.rawStatus ? etiquetaEstado(t.kind, t.rawStatus) : STATUS_CONFIG[t.status].label;
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
    label: ESTADO_GENERAL_ETIQUETA.open,
    badgeClass:
      "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 text-[var(--data-error-500)]",
    icon: Mail,
  },
  in_progress: {
    label: ESTADO_GENERAL_ETIQUETA.replied,
    badgeClass: "bg-primary/10 text-[var(--accent)]",
    icon: Clock,
  },
  closed: {
    label: ESTADO_GENERAL_ETIQUETA.closed,
    badgeClass:
      "bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/20 text-[var(--data-success-500)]",
    icon: CheckCircle2,
  },
};

/** Los estados en su orden, para los filtros (la etiqueta sale de `STATUS_CONFIG`). */
export const STATUS_ORDEN: readonly TicketStatus[] = ["open", "in_progress", "closed"];

/** «Abiertos», «Respondidos», «Cerrados» (las tres etiquetas del contrato hacen el plural con «s»). */
export const etiquetaPlural = (s: TicketStatus): string => `${STATUS_CONFIG[s].label}s`;

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
