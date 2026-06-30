"use client";

import { useState } from "react";
import { LoadingState } from "@buleje/design-system";
import { MailOpen, RotateCcw } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useSupportTickets } from "./support/use-support-tickets";
import { computeKpis } from "./support/shared";
import type { KpiFilter, TicketStatus, TicketPriority } from "./support/shared";
import SupportKpis from "./support/SupportKpis";
import TicketList from "./support/TicketList";
import TicketDetail from "./support/TicketDetail";

/**
 * SupportInbox — Bandeja de soporte del superadmin.
 * Orquesta KPIs, lista con filtros y detalle de ticket.
 * La página en app/superadmin/support/page.tsx importa este componente.
 */
export default function SupportInbox() {
  const {
    tickets,
    loading,
    error,
    reload,
    reply,
    setStatus,
    setPriority,
    templates,
    loadTemplates,
    saveTemplate,
  } = useSupportTickets();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | "all">("all");
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>("all");

  const selected = tickets.find((t) => t.id === selectedId) ?? null;
  const kpis = computeKpis(tickets);
  const activeCount = tickets.filter((t) => t.status !== "closed").length;

  const handleKpiPick = (key: KpiFilter) => {
    setKpiFilter(key);
    // Al activar un KPI de estado, resetear el dropdown de estado
    // para evitar filtros contradictorios.
    if (key !== "all" && key !== "urgent") {
      setStatusFilter("all");
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return <LoadingState />;

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <p className="text-base text-[var(--text-secondary)]">{error}</p>
        <button
          type="button"
          onClick={reload}
          className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl bg-primary text-white"
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* KPI cards clickeables */}
      <SupportKpis kpis={kpis} active={kpiFilter} onPick={handleKpiPick} />

      {/* Panel principal Gmail-style */}
      <div
        className={cn(
          "flex flex-col lg:flex-row h-[640px]",
          "bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden",
        )}
      >
        {/* Lista de tickets */}
        <div
          className={cn(
            "flex flex-col border-r border-[var(--rule-base)]",
            selected ? "hidden lg:flex lg:w-96" : "w-full",
          )}
        >
          <TicketList
            tickets={tickets}
            selectedId={selectedId}
            search={search}
            onSearch={setSearch}
            statusFilter={statusFilter}
            onStatusFilter={setStatusFilter}
            priorityFilter={priorityFilter}
            onPriorityFilter={setPriorityFilter}
            kpiFilter={kpiFilter}
            onSelect={setSelectedId}
            activeCount={activeCount}
          />
        </div>

        {/* Detalle del ticket seleccionado */}
        {selected ? (
          <TicketDetail
            ticket={selected}
            onClose={() => setSelectedId(null)}
            onSetStatus={setStatus}
            onSetPriority={setPriority}
            onReply={reply}
            templates={templates}
            onLoadTemplates={loadTemplates}
            onSaveTemplate={saveTemplate}
          />
        ) : (
          <div className="hidden lg:flex flex-1 items-center justify-center">
            <div className="text-center">
              <MailOpen
                className="w-12 h-12 mx-auto mb-3 text-[var(--text-tertiary)] opacity-30"
                aria-hidden="true"
              />
              <p className="text-sm font-medium text-[var(--text-secondary)]">
                Seleccioná un ticket
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">
                para ver los detalles y responder
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
