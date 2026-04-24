"use client";

/**
 * SmartSearchBar — Search con sugerencias, historial y quick actions.
 *
 * UI patterns de Stripe, Linear, GitHub command palette adaptados a
 * e-commerce peruano.
 *
 * Caracteristicas:
 *   - Debounced query (300ms)
 *   - Historial de busquedas (localStorage, max 8)
 *   - Quick actions configurables
 *   - Categorias sugeridas (chips)
 *   - Keyboard nav: ArrowUp/Down + Enter + Escape
 *   - Voice input opcional (boton mic)
 *
 * NO es un command palette (para eso hay CommandPalette separado).
 * Este va DIRECTO en el header.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Search, X, Clock, TrendingUp, Mic } from "@buleje/design-system/icons";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

interface Suggestion {
  id: string;
  label: string;
  type: "product" | "category" | "store" | "recent" | "trending";
  href: string;
  subtitle?: string;
  image?: string;
}

interface Props {
  /** Handler cuando el user busca o elige una sugerencia */
  onSearch: (query: string) => void;
  /** Fetcher async de sugerencias (si null, usa suggestions estaticas) */
  fetchSuggestions?: (q: string) => Promise<Suggestion[]>;
  /** Sugerencias trending cuando el input esta vacio */
  trendingSuggestions?: Suggestion[];
  /** Categorias chip debajo del input */
  quickCategories?: { label: string; href: string }[];
  /** Placeholder del input */
  placeholder?: string;
  /** Habilitar voice input. Default false */
  enableVoice?: boolean;
  /** Handler de voice input (se pasa transcript) */
  onVoiceQuery?: (transcript: string) => void;
  /** ClassName */
  className?: string;
}

const HISTORY_KEY = "buleje-search-history-v1";
const HISTORY_MAX = 8;

function readHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}
function writeHistory(h: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, HISTORY_MAX)));
  } catch {
    /* silent */
  }
}

export default function SmartSearchBar({
  onSearch,
  fetchSuggestions,
  trendingSuggestions = [],
  quickCategories = [],
  placeholder = "Buscá arroz, limpieza, bebidas…",
  enableVoice = false,
  onVoiceQuery,
  className,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debouncedQuery = useDebounce(query, 300);

  // Hidratar history
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(readHistory());
  }, []);

  // Fetch sugerencias al cambiar query debounced
  useEffect(() => {
    if (!fetchSuggestions) return;
    if (debouncedQuery.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchSuggestions(debouncedQuery)
      .then((res) => {
        if (!cancelled) setSuggestions(res);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, fetchSuggestions]);

  // Listado combinado que se muestra en el dropdown
  const displayed = useMemo<Suggestion[]>(() => {
    if (query.length === 0) {
      const historyItems = history.map<Suggestion>((h, i) => ({
        id: `hist-${i}`,
        label: h,
        type: "recent",
        href: `/tienda/buscar?q=${encodeURIComponent(h)}`,
      }));
      return [...historyItems, ...trendingSuggestions];
    }
    return suggestions;
  }, [query, history, suggestions, trendingSuggestions]);

  const commitSearch = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length === 0) return;
      // Save history
      const newHistory = [trimmed, ...history.filter((h) => h !== trimmed)].slice(0, HISTORY_MAX);
      setHistory(newHistory);
      writeHistory(newHistory);
      onSearch(trimmed);
      setOpen(false);
      inputRef.current?.blur();
    },
    [history, onSearch],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => Math.min(i + 1, displayed.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlight >= 0 && displayed[highlight]) {
        const s = displayed[highlight];
        commitSearch(s.label);
      } else {
        commitSearch(query);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const clearHistory = () => {
    setHistory([]);
    writeHistory([]);
  };

  return (
    <div className={cn("relative w-full", className)}>
      <div
        className={cn(
          "flex items-center gap-2 h-11 px-3 rounded-full bg-[var(--surface-raised)] border border-[var(--rule-base)] transition-all",
          open && "border-[var(--accent)] shadow-sm",
        )}
      >
        <Search className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" strokeWidth={2} aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          aria-label="Buscar productos"
          aria-expanded={open}
          aria-controls="smart-search-listbox"
          aria-activedescendant={highlight >= 0 ? `smart-search-opt-${highlight}` : undefined}
          role="combobox"
          autoComplete="off"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Limpiar búsqueda"
            className="shrink-0 p-0.5 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </button>
        )}
        {enableVoice && onVoiceQuery && (
          <button
            type="button"
            onClick={() => onVoiceQuery("")}
            aria-label="Buscar por voz"
            className="shrink-0 p-1 rounded-full text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
          >
            <Mic className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (displayed.length > 0 || quickCategories.length > 0) && (
        <>
          {/* Backdrop mobile */}
          <button
            type="button"
            aria-label="Cerrar sugerencias"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 md:hidden"
          />
          <div
            id="smart-search-listbox"
            role="listbox"
            className="absolute top-full left-0 right-0 z-40 mt-2 rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-base)] shadow-xl overflow-hidden motion-safe:animate-[fadeIn_0.15s]"
          >
            {/* Loading */}
            {loading && (
              <div className="px-4 py-6 text-center text-xs text-[var(--text-tertiary)]">Buscando…</div>
            )}

            {/* Sugerencias */}
            {!loading && displayed.length > 0 && (
              <ul className="max-h-[60vh] overflow-y-auto py-1">
                {displayed.map((s, i) => (
                  <SuggestionRow
                    key={s.id}
                    suggestion={s}
                    index={i}
                    isHighlighted={highlight === i}
                    onSelect={() => commitSearch(s.label)}
                    onHover={() => setHighlight(i)}
                  />
                ))}
              </ul>
            )}

            {/* Limpiar history */}
            {query.length === 0 && history.length > 0 && (
              <div className="border-t border-[var(--rule-base)] px-3 py-2 flex justify-end">
                <button
                  type="button"
                  onClick={clearHistory}
                  className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  Borrar historial
                </button>
              </div>
            )}

            {/* Quick categories */}
            {quickCategories.length > 0 && (
              <div className="border-t border-[var(--rule-base)] px-3 py-3 bg-[var(--surface-sunken)]">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                  Categorías populares
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {quickCategories.map((c) => (
                    <a
                      key={c.label}
                      href={c.href}
                      className="inline-flex items-center rounded-full bg-[var(--surface-raised)] border border-[var(--rule-base)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                    >
                      {c.label}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SuggestionRow({
  suggestion,
  index,
  isHighlighted,
  onSelect,
  onHover,
}: {
  suggestion: Suggestion;
  index: number;
  isHighlighted: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  const Icon = suggestion.type === "recent" ? Clock : suggestion.type === "trending" ? TrendingUp : Search;
  return (
    <li
      id={`smart-search-opt-${index}`}
      role="option"
      aria-selected={isHighlighted}
      onMouseEnter={onHover}
    >
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
          isHighlighted ? "bg-[var(--surface-sunken)]" : "hover:bg-[var(--surface-sunken)]",
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" strokeWidth={2} aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--text-primary)] truncate">{suggestion.label}</p>
          {suggestion.subtitle && (
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">
              {suggestion.subtitle}
            </p>
          )}
        </div>
      </button>
    </li>
  );
}
