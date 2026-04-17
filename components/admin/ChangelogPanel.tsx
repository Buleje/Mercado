"use client";

import { useState, useEffect, useCallback } from "react";
import { History, X, Plus, Pencil, Trash2, FileDown, FileUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type ChangeEntry = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  detail: string;
  user: string;
  humanLabel: string;
  createdAt: string;
};

type ActionType = "create" | "update" | "delete" | "export" | "import" | "other";

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectActionType(action: string): ActionType {
  const a = action.toLowerCase();
  if (a.includes("creat") || a.includes("create") || a.includes("nuevo") || a.includes("agreg")) return "create";
  if (a.includes("updat") || a.includes("edit") || a.includes("modif") || a.includes("actualiz")) return "update";
  if (a.includes("delet") || a.includes("elimin") || a.includes("borr")) return "delete";
  if (a.includes("export")) return "export";
  if (a.includes("import")) return "import";
  return "other";
}

const ACTION_ICON: Record<ActionType, React.ElementType> = {
  create: Plus,
  update: Pencil,
  delete: Trash2,
  export: FileDown,
  import: FileUp,
  other: History,
};

const ACTION_STYLE: Record<ActionType, { dot: string; icon: string; bg: string }> = {
  create: {
    dot: "bg-emerald-500",
    icon: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
  },
  update: {
    dot: "bg-emerald-500",
    icon: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
  },
  delete: {
    dot: "bg-red-500",
    icon: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20",
  },
  export: {
    dot: "bg-[var(--text-primary)]",
    icon: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    bg: "bg-[var(--surface-sunken)]",
  },
  import: {
    dot: "bg-amber-500",
    icon: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20",
  },
  other: {
    dot: "bg-gray-400",
    icon: "text-gray-500 dark:text-gray-400",
    bg: "bg-gray-50 dark:bg-gray-800",
  },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-PE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  entity: string;
  entityId?: string;
  label?: string; // Ej: "Producto", "Cliente"
};

// ── Componente principal ──────────────────────────────────────────────────────

export default function ChangelogPanel({ entity, entityId, label = "elemento" }: Props) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ChangeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ entity, limit: "20" });
      if (entityId) params.set("entityId", entityId);
      const res = await fetch(`/api/changelog?${params}`);
      if (!res.ok) throw new Error("No se pudo cargar el historial");
      const json = await res.json();
      setEntries(json.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [entity, entityId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  return (
    <>
      {/* Botón disparador */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
          "border border-[var(--rule-base)]",
          "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800",
        )}
      >
        <History className="w-3.5 h-3.5" />
        Ver historial
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Panel lateral deslizable */}
      <div
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-full max-w-[400px]",
          "bg-white dark:bg-gray-900 border-l border-[var(--rule-base)]",
          "flex flex-col transition-transform duration-[var(--dur-base)] ease-in-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-base)]">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-gray-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white text-sm">
              Historial de cambios
            </h2>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Subheader con contexto */}
        {(entity || entityId) && (
          <div className="px-5 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-[var(--rule-base)]">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {label}
              {entityId && <span className="ml-1 font-mono text-gray-400">#{entityId}</span>}
            </p>
          </div>
        )}

        {/* Cuerpo — Timeline */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-sm text-red-500 dark:text-red-400">{error}</div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <History className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">Sin cambios registrados</p>
            </div>
          ) : (
            <ol className="relative border-l border-[var(--rule-base)] space-y-0">
              {entries.map((entry, idx) => {
                const type = detectActionType(entry.action);
                const style = ACTION_STYLE[type];
                const Icon = ACTION_ICON[type];
                return (
                  <li key={entry.id} className={cn("ml-4 pb-6", idx === entries.length - 1 && "pb-0")}>
                    {/* Punto del timeline */}
                    <span
                      className={cn(
                        "absolute -left-[9px] flex h-[18px] w-[18px] items-center justify-center rounded-full",
                        style.bg,
                        "border-2 border-white dark:border-[var(--rule-base)]",
                      )}
                    >
                      <span className={cn("w-2 h-2 rounded-full", style.dot)} />
                    </span>

                    {/* Contenido */}
                    <div className="pl-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Icon className={cn("w-3.5 h-3.5 flex-shrink-0", style.icon)} />
                        <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">
                          <span className="font-medium">{entry.user}</span>{" "}
                          <span className="text-gray-600 dark:text-gray-400">{entry.humanLabel}</span>
                        </p>
                      </div>
                      {entry.detail && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 ml-5 leading-relaxed">
                          {entry.detail}
                        </p>
                      )}
                      <time className="block text-xs text-gray-400 mt-1 ml-5">
                        {formatDate(entry.createdAt)}
                      </time>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--rule-base)]">
          <button
            onClick={load}
            disabled={loading}
            className="w-full text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            Actualizar historial
          </button>
        </div>
      </div>
    </>
  );
}
