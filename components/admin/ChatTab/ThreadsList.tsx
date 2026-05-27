"use client";

import { MessageCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import {
  STATUS_COLORS,
  STATUS_LABELS,
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
  return (
    <div className="flex h-full flex-col">
      {/* Filter pills */}
      <div className="flex gap-1 border-b border-slate-200 p-2 dark:border-slate-700">
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
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
            )}
          >
            {s === "all" ? "Todos" : STATUS_LABELS[s as ThreadStatus]}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && threads.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">Cargando conversaciones…</div>
        ) : threads.length === 0 ? (
          <div className="p-6 text-center">
            <MessageCircle className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">
              No hay conversaciones
              {statusFilter !== "all" && ` ${STATUS_LABELS[statusFilter as ThreadStatus].toLowerCase()}s`}.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800" role="list">
            {threads.map((thread) => {
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
                      "hover:bg-slate-50 focus:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-canvas)] dark:hover:bg-slate-800/60 dark:focus:bg-slate-800/60",
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
                        <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                          {thread.customerName}
                        </span>
                      </div>
                      {lastMsg && (
                        <span className="flex-shrink-0 text-[length:var(--ts-2xs)] text-slate-500">
                          {lastMsg}
                        </span>
                      )}
                    </div>

                    {thread.subject && (
                      <div className="mt-0.5 truncate text-[length:var(--ts-xs)] text-slate-500 dark:text-slate-400">
                        {thread.subject}
                      </div>
                    )}

                    {thread.lastMessageText && (
                      <div className="mt-1 flex items-start gap-1">
                        <span className="flex-1 truncate text-xs text-slate-600 dark:text-slate-400">
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
                      <div className="mt-1 text-[length:var(--ts-2xs)] text-slate-400">
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
