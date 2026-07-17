"use client";

import { useMemo, useState } from "react";
import { Search, MessageCircle, Bot, User, Archive } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { WaConversation } from "./useWhatsAppInbox";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7) return d.toLocaleDateString("es-PE", { weekday: "short" });
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" });
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** "519xxxxxxxx" → "+51 9xx xxx xxx" para mostrar. */
function prettyPhone(phone: string): string {
  if (phone.startsWith("51") && phone.length === 11) {
    return `+51 ${phone.slice(2, 5)} ${phone.slice(5, 8)} ${phone.slice(8)}`;
  }
  return `+${phone}`;
}

// ── Componente ────────────────────────────────────────────────────────────────

interface Props {
  conversations: WaConversation[];
  selectedPhone: string | null;
  onSelect: (phone: string) => void;
  loading: boolean;
  /** Archivadas: contador + vista alternada. */
  archivedCount?: number;
  showArchived?: boolean;
  onToggleShowArchived?: () => void;
}

/** Columna izquierda del inbox: buscador + lista de conversaciones. */
export default function WaConversationList({
  conversations,
  selectedPhone,
  onSelect,
  loading,
  archivedCount = 0,
  showArchived = false,
  onToggleShowArchived,
}: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) => c.customerName.toLowerCase().includes(q) || c.customerPhone.includes(q),
    );
  }, [conversations, search]);

  return (
    <div className="flex h-full flex-col">
      {/* Buscador */}
      <div className="space-y-2 border-b border-slate-200 p-3 dark:border-slate-700">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o número…"
            className="h-12 w-full rounded-2xl border-2 border-slate-200 bg-white pl-9 pr-3 text-base text-slate-900 outline-none transition focus:border-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
        {(archivedCount > 0 || showArchived) && (
          <button
            type="button"
            onClick={onToggleShowArchived}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border-2 px-3 text-sm font-bold transition",
              showArchived
                ? "border-primary bg-primary/10 text-primary"
                : "border-slate-200 text-slate-500 hover:border-primary/50 dark:border-slate-700 dark:text-slate-400",
            )}
          >
            <Archive className="h-4 w-4" />
            {showArchived ? "← Volver a la bandeja" : `Archivadas (${archivedCount})`}
          </button>
        )}
      </div>

      {/* Lista (min-h-0: scroll interno, no empuja el contenedor) */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && (
          <p className="p-4 text-sm text-slate-500">Cargando conversaciones…</p>
        )}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <MessageCircle className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-500">
              {search
                ? "Nada coincide con tu búsqueda"
                : "Cuando un cliente escriba a tu WhatsApp, la conversación aparece acá."}
            </p>
          </div>
        )}
        <ul>
          {filtered.map((c) => {
            const active = c.customerPhone === selectedPhone;
            const unread = c.unread > 0;
            return (
              <li key={c.customerPhone}>
                <button
                  type="button"
                  onClick={() => onSelect(c.customerPhone)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-3 text-left transition",
                    active
                      ? "bg-primary/10"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800/60",
                  )}
                >
                  {/* Avatar iniciales */}
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                    {initials(c.customerName) || <User className="h-5 w-5" />}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn(
                          "truncate text-sm text-slate-900 dark:text-white",
                          unread ? "font-bold" : "font-semibold",
                        )}
                      >
                        {c.customerName !== "Cliente" ? c.customerName : prettyPhone(c.customerPhone)}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-[length:var(--ts-xs)] tabular-nums",
                          unread ? "font-bold text-primary" : "text-slate-400",
                        )}
                      >
                        {formatTime(c.lastAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "flex min-w-0 items-center gap-1 truncate text-sm",
                          unread
                            ? "font-semibold text-slate-700 dark:text-slate-200"
                            : "text-slate-500 dark:text-slate-400",
                        )}
                      >
                        {c.lastDirection === "out" && c.lastSentBy === "ai" && (
                          <Bot className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="Respondió el bot" />
                        )}
                        {c.lastDirection === "out" && c.lastSentBy === "admin" && (
                          <span className="shrink-0 text-slate-400">Tú:</span>
                        )}
                        <span className="truncate">{c.lastMessage}</span>
                      </span>
                      {unread && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[length:var(--ts-xs)] font-bold text-white">
                          {c.unread > 99 ? "99+" : c.unread}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
