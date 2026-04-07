"use client";

/**
 * SearchAutocomplete
 * Input de busqueda con dropdown de sugerencias, debounce 300ms,
 * "did you mean", soporte teclado (↑↓ Enter Esc), mobile-first.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useId,
  type KeyboardEvent,
} from "react";
import { Search, X, Loader2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Suggestion {
  suggestion: string;
  searchCount: number;
}

interface DidYouMean {
  suggestion: string;
  similarity: number;
}

interface Props {
  onSearch: (q: string) => void;
  placeholder?: string;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SearchAutocomplete({
  onSearch,
  placeholder = "Buscar productos…",
  className,
}: Props) {
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [didYouMean, setDidYouMean] = useState<DidYouMean[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [noResults, setNoResults] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listId = useId();

  // Fetch sugerencias con debounce 300ms
  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSuggestions([]);
      setDidYouMean([]);
      setLoading(false);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/marketplace/search/suggestions?q=${encodeURIComponent(q.trim())}`
      );
      if (res.ok) {
        const json = await res.json() as { data: Suggestion[] };
        setSuggestions(json.data ?? []);
        setActiveIndex(-1);
        setOpen(true);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch resultados reales (para did you mean)
  const fetchSearchResults = useCallback(async (q: string) => {
    try {
      const res = await fetch(
        `/api/marketplace/search?q=${encodeURIComponent(q.trim())}`
      );
      if (res.ok) {
        const json = await res.json() as {
          data: unknown[];
          didYouMean?: DidYouMean[];
        };
        const empty = !json.data || json.data.length === 0;
        setNoResults(empty);
        setDidYouMean(empty ? (json.didYouMean ?? []) : []);
        if (empty) setOpen(true);
      }
    } catch {
      /* silent */
    }
  }, []);

  const handleChange = (v: string) => {
    setValue(v);
    setNoResults(false);
    setDidYouMean([]);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(v);
    }, 300);
  };

  const handleSubmit = useCallback(
    (q: string) => {
      if (!q.trim()) return;
      setValue(q);
      setOpen(false);
      setSuggestions([]);
      onSearch(q.trim());
      fetchSearchResults(q.trim());
    },
    [onSearch, fetchSearchResults]
  );

  const handleSuggestionClick = (s: string) => {
    setValue(s);
    setOpen(false);
    setSuggestions([]);
    onSearch(s);
    fetchSearchResults(s);
    inputRef.current?.focus();
  };

  // Navegar con teclado
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === "Enter") handleSubmit(value);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        handleSuggestionClick(suggestions[activeIndex].suggestion);
      } else {
        handleSubmit(value);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  // Cerrar al hacer click afuera
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const showDropdown = open && (loading || suggestions.length > 0 || noResults);

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {/* Input */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls={listId}
          aria-activedescendant={activeIndex >= 0 ? `sugg-${activeIndex}` : undefined}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (value.length >= 2) setOpen(true); }}
          placeholder={placeholder}
          autoComplete="off"
          className={cn(
            "w-full pl-12 py-3.5 pr-12 rounded-2xl border text-base font-medium",
            "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900",
            "text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500",
            "outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
            "transition-all shadow-sm"
          )}
        />
        {/* Clear / spinner */}
        {loading ? (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin pointer-events-none" />
        ) : value ? (
          <button
            type="button"
            onClick={() => { setValue(""); setSuggestions([]); setOpen(false); setNoResults(false); setDidYouMean([]); inputRef.current?.focus(); }}
            aria-label="Limpiar busqueda"
            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        ) : null}
      </div>

      {/* Dropdown */}
      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "absolute top-full left-0 right-0 mt-2 z-50 rounded-2xl shadow-2xl overflow-hidden",
              "border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900",
              // Mobile: pantalla completa
              "sm:max-h-72 max-h-[60vh]"
            )}
          >
            {loading && (
              <div className="flex items-center gap-3 px-5 py-4">
                <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                <span className="text-sm text-gray-500 dark:text-gray-400">Buscando sugerencias…</span>
              </div>
            )}

            {/* Sugerencias */}
            {!loading && suggestions.length > 0 && (
              <ul
                id={listId}
                role="listbox"
                className="overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800"
              >
                {suggestions.map((s, i) => (
                  <li
                    key={s.suggestion}
                    id={`sugg-${i}`}
                    role="option"
                    aria-selected={i === activeIndex}
                    onMouseDown={() => handleSuggestionClick(s.suggestion)}
                    className={cn(
                      "flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors",
                      i === activeIndex
                        ? "bg-primary/8 dark:bg-primary/15"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800"
                    )}
                  >
                    <Search className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600 shrink-0" />
                    <span className="flex-1 text-sm text-gray-900 dark:text-white font-medium">
                      {s.suggestion}
                    </span>
                    {s.searchCount > 0 && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                        {s.searchCount} busquedas
                      </span>
                    )}
                    <ArrowRight className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600 shrink-0" />
                  </li>
                ))}
              </ul>
            )}

            {/* No resultados + did you mean */}
            {!loading && noResults && (
              <div className="px-5 py-4 space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  No encontramos{" "}
                  <strong className="text-gray-900 dark:text-white">&ldquo;{value}&rdquo;</strong>
                </p>
                {didYouMean.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">Quisiste decir:</p>
                    <div className="flex flex-wrap gap-2">
                      {didYouMean.map((d) => (
                        <button
                          key={d.suggestion}
                          type="button"
                          onMouseDown={() => handleSuggestionClick(d.suggestion)}
                          className="px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors"
                        >
                          {d.suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
