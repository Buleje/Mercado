"use client";

import { useMemo } from "react";
import { Search, MailOpen, AlertTriangle, Filter, Mail } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { STATUS_CONFIG, PRIORITY_CONFIG, timeAgo } from "./shared";
import type { SupportTicket, TicketStatus, TicketPriority, KpiFilter } from "./shared";

const INPUT_CLASS =
  "h-10 text-sm border-2 border-[var(--rule-base)] rounded-2xl bg-[var(--surface-raised)] text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary";

interface Props {
  tickets: SupportTicket[];
  selectedId: string | null;
  search: string;
  onSearch: (v: string) => void;
  statusFilter: TicketStatus | "all";
  onStatusFilter: (v: TicketStatus | "all") => void;
  priorityFilter: TicketPriority | "all";
  onPriorityFilter: (v: TicketPriority | "all") => void;
  /** Filtro activo desde los KPI cards (tiene prioridad sobre statusFilter). */
  kpiFilter: KpiFilter;
  onSelect: (id: string) => void;
  /** Total de tickets activos (abiertos + en progreso). */
  activeCount: number;
}

export default function TicketList({
  tickets,
  selectedId,
  search,
  onSearch,
  statusFilter,
  onStatusFilter,
  priorityFilter,
  onPriorityFilter,
  kpiFilter,
  onSelect,
  activeCount,
}: Props) {
  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      // KPI filter tiene prioridad
      if (kpiFilter === "urgent") {
        if (t.priority !== "high" || t.status === "closed") return false;
      } else if (kpiFilter !== "all") {
        // kpiFilter es un TicketStatus
        if (t.status !== (kpiFilter as TicketStatus)) return false;
      } else {
        // Sin KPI filter: aplicar dropdown de estado
        if (statusFilter !== "all" && t.status !== statusFilter) return false;
      }

      // Filtro de prioridad — siempre aplica
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;

      // Búsqueda — siempre aplica
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          t.subject.toLowerCase().includes(q) ||
          t.tenantName.toLowerCase().includes(q) ||
          t.senderEmail.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [tickets, kpiFilter, statusFilter, priorityFilter, search]);

  return (
    <div className="flex flex-col h-full">
      {/* Cabecera + filtros */}
      <div className="p-3 border-b border-[var(--rule-base)] space-y-2 shrink-0">
        {/* Título */}
        <div className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-[var(--accent)]" aria-hidden="true" />
          <h2 className="font-bold text-sm text-[var(--text-primary)]">Soporte</h2>
          <span
            aria-label={`${activeCount} tickets activos`}
            className="text-xs bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full"
          >
            {activeCount}
          </span>
        </div>

        {/* Búsqueda */}
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar tickets..."
            aria-label="Buscar tickets"
            className={cn(INPUT_CLASS, "w-full pl-10 pr-3")}
          />
        </div>

        {/* Dropdowns de estado y prioridad */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Filter
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none"
              aria-hidden="true"
            />
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilter(e.target.value as TicketStatus | "all")}
              aria-label="Filtrar por estado"
              className={cn(INPUT_CLASS, "pl-9 w-full")}
            >
              <option value="all">Todos los estados</option>
              <option value="open">Abiertos</option>
              <option value="in_progress">En progreso</option>
              <option value="closed">Cerrados</option>
            </select>
          </div>

          <select
            value={priorityFilter}
            onChange={(e) => onPriorityFilter(e.target.value as TicketPriority | "all")}
            aria-label="Filtrar por prioridad"
            className={cn(INPUT_CLASS, "flex-1 px-3")}
          >
            <option value="all">Todas las prioridades</option>
            <option value="high">Alta</option>
            <option value="medium">Media</option>
            <option value="low">Baja</option>
          </select>
        </div>
      </div>

      {/* Filas de tickets */}
      <div className="flex-1 overflow-y-auto" role="list" aria-label="Lista de tickets">
        {filtered.length === 0 ? (
          <div className="p-6 text-center">
            <MailOpen
              className="w-8 h-8 mx-auto mb-2 text-[var(--text-tertiary)] opacity-50"
              aria-hidden="true"
            />
            <p className="text-sm text-[var(--text-secondary)]">No hay tickets</p>
          </div>
        ) : (
          filtered.map((ticket) => {
            const statusCfg = STATUS_CONFIG[ticket.status];
            const priorityCfg = PRIORITY_CONFIG[ticket.priority];
            return (
              <button
                key={ticket.id}
                type="button"
                role="listitem"
                onClick={() => onSelect(ticket.id)}
                aria-current={selectedId === ticket.id ? "true" : undefined}
                className={cn(
                  "w-full text-left px-3 py-3 border-b border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] transition-colors",
                  selectedId === ticket.id &&
                    "bg-primary/5 border-l-2 border-l-primary",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle
                        className={cn("w-3.5 h-3.5 shrink-0", priorityCfg.color)}
                        aria-label={`Prioridad ${priorityCfg.label}`}
                      />
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                        {ticket.subject}
                      </p>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                      {ticket.tenantName} — {ticket.senderEmail}
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)] mt-0.5 truncate">
                      {ticket.lastMessage}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs text-[var(--text-tertiary)]">
                      {timeAgo(ticket.createdAt)}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-semibold px-1.5 py-0.5 rounded-full",
                        statusCfg.badgeClass,
                      )}
                    >
                      {statusCfg.label}
                    </span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
