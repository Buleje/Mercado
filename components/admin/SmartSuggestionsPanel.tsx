"use client";

import { useState, useEffect } from "react";
import { Lightbulb, AlertTriangle, TrendingUp, ShoppingCart, RefreshCw, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type SuggestionType = "alerta" | "oportunidad" | "optimizacion" | "accion";
interface Suggestion {
  id: string;
  type: SuggestionType;
  title: string;
  body: string;
  module?: string;
  priority: "alta" | "media" | "baja";
  icon?: string;
}

const TYPE_META: Record<SuggestionType, { icon: React.ElementType; color: string; bg: string; border: string; label: string }> = {
  alerta:      { icon: AlertTriangle, color: "text-red-500",    bg: "bg-red-50 dark:bg-red-950/30",     border: "border-red-200 dark:border-red-900/40",   label: "Alerta" },
  oportunidad: { icon: TrendingUp,    color: "text-emerald-600",bg: "bg-emerald-50 dark:bg-emerald-950/30",border:"border-emerald-200 dark:border-emerald-900/40",label:"Oportunidad"},
  optimizacion:{ icon: Lightbulb,     color: "text-amber-500",  bg: "bg-amber-50 dark:bg-amber-950/20",  border: "border-amber-200 dark:border-amber-900/30",label: "Mejora" },
  accion:      { icon: ShoppingCart,  color: "text-emerald-500",   bg: "bg-emerald-50 dark:bg-emerald-950/30",    border: "border-emerald-200 dark:border-emerald-900/40", label: "Acción" },
};

interface Props {
  context?: "compras" | "promociones" | "inventario" | "clientes" | "general";
  compact?: boolean;
  onNavigate?: (tab: string) => void;
}

export default function SmartSuggestionsPanel({ context = "general", compact = false, onNavigate }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(!compact);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/suggestions?context=${context}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions ?? []);
        }
      } catch { /* silent */ }
      setLoading(false);
    };
    void load();
  }, [context]);

  const visible = suggestions.filter(s => !dismissed.has(s.id));
  if (visible.length === 0 && !loading) return null;

  return (
    <div className={cn("rounded-2xl border overflow-hidden", compact ? "border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/10" : "border-gray-200 dark:border-card-border bg-white dark:bg-card")}>
      <button
        className="w-full flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3 hover:bg-black/[0.02] transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-bold text-gray-900 dark:text-foreground">
            Sugerencias inteligentes
          </span>
          {visible.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-white">{visible.length}</span>
          )}
        </div>
        <ChevronRight className={cn("h-4 w-4 text-gray-400 transition-transform", expanded && "rotate-90")} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-2.5 border-t border-gray-100 dark:border-card-border pt-3">
          {loading ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 dark:text-muted py-2">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Analizando datos del negocio…
            </div>
          ) : (
            visible.map(s => {
              const meta = TYPE_META[s.type];
              const Icon = meta.icon;
              return (
                <div key={s.id} className={cn("flex items-start gap-3 p-3 rounded-xl border", meta.bg, meta.border)}>
                  <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-white/60 dark:bg-black/20", meta.color)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 dark:text-foreground leading-tight">{s.title}</p>
                    <p className="text-xs text-gray-600 dark:text-muted mt-0.5 leading-relaxed">{s.body}</p>
                    {s.module && onNavigate && (
                      <button
                        onClick={() => onNavigate(s.module!)}
                        className="mt-1.5 text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                      >
                        Ver en {s.module} <ChevronRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => setDismissed(d => new Set([...d, s.id]))}
                    className="p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors shrink-0"
                    title="Descartar"
                  >
                    <span className="text-xs text-gray-400">x</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

