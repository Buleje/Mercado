"use client";

import { useMemo, useState } from "react";
import { MessageCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import {
  STATUS_COLORS,
  STATUS_LABELS,
  labelChipClass,
  type ChatThreadView,
  type ThreadStatus,
} from "./types";

interface ThreadsListProps {
  threads: ChatThreadView[];
  selectedThreadId: string | null;
  onSelectThread: (threadId: string | null) => void;
  loading: boolean;
  statusFilter: ThreadStatus | "all";
  onStatusFilterChange: (status: ThreadStatus | "all") => void;
}

export function ThreadsList({
  threads,
  selectedThreadId,
  onSelectThread,
  loading,
  statusFilter,
  onStatusFilterChange,
}: ThreadsListProps) {
  // Tanda 3: filtro por etiqueta (client-side sobre los hilos cargados).
  const [labelFilter, setLabelFilter] = useState<string | null>(null);

  // Etiquetas presentes en los hilos actuales (para construir la barra).
  const availableLabels = useMemo(() => {
    const set = new Set<string>();
    for (const t of threads) for (const l of t.labels ?? []) set.add(l);
    return Array.from(set);
  }, [threads]);

  // Si la etiqueta filtrada ya no existe, el filtro queda inerte (no rompe).
  const visibleThreads = useMemo(
    () =>
      labelFilter
        ? threads.filter((t) => (t.labels ?? []).some((l) => l.toLowerCase() === labelFilter.toLowerCase()))
        : threads,
    [threads, labelFilter],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Filter pills */}
      <div className="flex gap-1 border-b border-[var(--rule-base)] p-2">
        {(["all", "open", "closed"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onStatusFilterChange(s)}
            aria-pressed={statusFilter === s}
            className={cn(
 "rounded-lg px-3 py-1.5 min-h-11 sm:min-h-0 sm:py-1 text-xs font-medium transition",
              statusFilter === s
                ? "bg-primary text-white"
                : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]  dark:text-[var(--text-secondary)] dark:hover:bg-[var(--surface-sunken)]",
            )}
          >
            {s === "all" ? "Todos" : STATUS_LABELS[s as ThreadStatus]}
          </button>
        ))}
      </div>

      {/* Filtro por etiqueta (Tanda 3) — solo si hay etiquetas en uso */}
      {availableLabels.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-[var(--rule-base)] px-2 py-1.5">
          <button
            type="button"
            onClick={() => setLabelFilter(null)}
            aria-pressed={labelFilter === null}
            className={cn(
 "rounded-full px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold transition",
              labelFilter === null
                ? "bg-[var(--surface-sunken)] text-white dark:bg-[var(--surface-sunken)] dark:text-[var(--text-primary)]"
                : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] ",
            )}
          >
            Todas
          </button>
          {availableLabels.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLabelFilter((cur) => (cur === l ? null : l))}
              aria-pressed={labelFilter === l}
              className={cn(
 "rounded-full px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold transition",
                labelChipClass(l),
                labelFilter === l ? "ring-2 ring-primary/50" : "opacity-80 hover:opacity-100",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && threads.length === 0 ? (
          <div className="p-4 text-sm text-[var(--text-tertiary)]">Cargando conversaciones…</div>
        ) : visibleThreads.length === 0 ? (
          <div className="p-6 text-center">
            <MessageCircle className="mx-auto h-12 w-12 text-[var(--text-tertiary)]" />
            <p className="mt-2 text-sm text-[var(--text-tertiary)]">
              {labelFilter ? (
                <>No hay conversaciones con la etiqueta <strong>{labelFilter}</strong>.</>
              ) : (
                <>
                  No hay conversaciones
                  {statusFilter !== "all" && ` ${STATUS_LABELS[statusFilter as ThreadStatus].toLowerCase()}s`}.
                </>
              )}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--rule-soft)] dark:divide-[var(--rule-base)]" role="list">
            {visibleThreads.map((thread) => {
              const isSelected = thread.id === selectedThreadId;
              const unread = thread.unreadForSeller;
              const lastMsg = thread.lastMessageAt
                ? new Date(thread.lastMessageAt).toLocaleTimeString("es-PE", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "";

              return (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => onSelectThread(isSelected ? null : thread.id)}
                    aria-pressed={isSelected}
                    className={cn(
 "w-full border-l-4 p-3 min-h-11 text-left transition",
 "hover:bg-[var(--surface-sunken)] focus:bg-[var(--surface-sunken)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-canvas)] dark:hover:bg-[var(--surface-sunken)]/60 dark:focus:bg-[var(--surface-sunken)]/60",
                      isSelected
                        ? "border-primary bg-primary/10 dark:bg-primary/10"
                        : "border-transparent",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
 "inline-flex h-2 w-2 rounded-full",
                            STATUS_COLORS[thread.status],
                          )}
                          aria-hidden
                        />
                        <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
                          {thread.customerName}
                        </span>
                      </div>
                      {lastMsg && (
                        <span className="flex-shrink-0 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                          {lastMsg}
                        </span>
                      )}
                    </div>

                    {thread.labels && thread.labels.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {thread.labels.map((l) => (
                          <span
                            key={l}
                            className={cn(
 "inline-flex items-center rounded-full px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold",
                              labelChipClass(l),
                            )}
                          >
                            {l}
                          </span>
                        ))}
                      </div>
                    )}

                    {thread.subject && (
                      <div className="mt-0.5 truncate text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                        {thread.subject}
                      </div>
                    )}

                    {thread.lastMessageText && (
                      <div className="mt-1 flex items-start gap-1">
                        <span className="flex-1 truncate text-xs text-[var(--text-secondary)]">
                          {thread.lastSenderType === "seller" && (
                            <span className="text-primary">Vos: </span>
                          )}
                          {thread.lastMessageText}
                        </span>
                        {unread > 0 && (
                          <span
                            className="flex h-5 min-w-[20px] flex-shrink-0 items-center justify-center rounded-full bg-[var(--data-error-500)] px-1.5 text-[length:var(--ts-2xs)] font-bold text-white"
                            aria-label={`${unread} mensajes sin leer`}
                          >
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                      </div>
                    )}

                    {thread.customerPhone && (
                      <div className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                        {thread.customerPhone}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
