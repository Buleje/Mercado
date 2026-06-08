"use client";

/**
 * SearchAutocompleteInput — Input controlado con debounce 250ms + dropdown
 * de sugerencias (productos, categorias, tiendas).
 *
 * Accesibilidad: role="combobox" + aria-expanded + aria-activedescendant +
 * keyboard nav (ArrowUp/ArrowDown/Enter/Escape).
 *
 * Las sugerencias son stubbed contra la API /api/marketplace/autocomplete
 * que delega a MarketplaceSearchDB.autocomplete(). Si falla, el dropdown
 * simplemente no aparece — never throws.
 *
 * Nota: este componente es reutilizable. Para usarlo en el Header global
 * importarlo directamente en vez de modificar MarketplaceNavbar (zona de
 * riesgo por su tamaño y dependencias).
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useId,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Search, Package, Tag, Store, X, Clock } from "lucide-react";
import { loadHistory } from "./SearchSuggestions";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type ProductSuggestion = {
  type: "product";
  id: number;
  label: string;
  sub: string; // categoria
};

type CategorySuggestion = {
  type: "category";
  label: string;
  href: string;
};

type StoreSuggestion = {
  type: "store";
  label: string;
  slug: string;
};

type Suggestion = ProductSuggestion | CategorySuggestion | StoreSuggestion;

// ── Fetch de sugerencias (stub → real API) ────────────────────────────────────

async function fetchSuggestions(q: string): Promise<Suggestion[]> {
  if (!q.trim()) return [];

  try {
    const res = await fetch(
      `/api/marketplace/autocomplete?q=${encodeURIComponent(q.trim())}`,
      { signal: AbortSignal.timeout(2000) },
    );
    if (!res.ok) return [];

    const data = (await res.json()) as {
      products?: Array<{ id: number; name: string; category: string }>;
      categories?: Array<{ name: string }>;
      stores?: Array<{ slug: string; name: string }>;
    };

    const suggestions: Suggestion[] = [];

    (data.products ?? []).slice(0, 4).forEach((p) => {
      suggestions.push({
        type: "product",
        id: p.id,
        label: p.name,
        sub: p.category,
      });
    });

    (data.categories ?? []).slice(0, 2).forEach((c) => {
      const slug = c.name.toLowerCase().replace(/\s+/g, "-");
      suggestions.push({
        type: "category",
        label: c.name,
        href: `/marketplace/categoria/${slug}`,
      });
    });

    (data.stores ?? []).slice(0, 2).forEach((s) => {
      suggestions.push({
        type: "store",
        label: s.name,
        slug: s.slug,
      });
    });

    return suggestions;
  } catch {
    // Fire-and-forget: si falla el autocomplete, sin ruido al usuario.
    return [];
  }
}

// ── Iconos por tipo ───────────────────────────────────────────────────────────

function SuggestionIcon({ type }: { type: Suggestion["type"] }) {
  const cls = "h-4 w-4 text-[var(--text-tertiary)] flex-shrink-0";
  if (type === "product")
    return <Package className={cls} strokeWidth={1.5} aria-hidden="true" />;
  if (type === "category")
    return <Tag className={cls} strokeWidth={1.5} aria-hidden="true" />;
  return <Store className={cls} strokeWidth={1.5} aria-hidden="true" />;
}

function SuggestionTypeLabel({ type }: { type: Suggestion["type"] }) {
  const labels: Record<Suggestion["type"], string> = {
    product: "Producto",
    category: "Categoria",
    store: "Tienda",
  };
  return (
    <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.15em] text-[var(--text-tertiary)]">
      {labels[type]}
    </span>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

interface SearchAutocompleteInputProps {
  /** Valor inicial del query (desde URL searchParam). */
  defaultValue?: string;
  /** Placeholder del input. */
  placeholder?: string;
  /** Clase CSS adicional para el wrapper. */
  className?: string;
  /** Autofocus al montar — util en la pagina /buscar. */
  autoFocus?: boolean;
  /** Tamaño visual: "md" (default, navbar/buscar) o "lg" (hero protagonista). */
  size?: "md" | "lg";
  /** Muestra un botón "Buscar" visible dentro de la barra (estilo hero). */
  showSubmitButton?: boolean;
}

export default function SearchAutocompleteInput({
  defaultValue = "",
  placeholder = "Buscar productos, tiendas, categorias...",
  className = "",
  autoFocus = false,
  size = "md",
  showSubmitButton = false,
}: SearchAutocompleteInputProps) {
  const isLg = size === "lg";
  const router = useRouter();
  const instanceId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  // UX P2-1 fix 2026-04-30: historial de búsquedas locales — se muestran
  // como chips cuando el input está focused y vacío.
  const [history, setHistory] = useState<string[]>([]);

  const listboxId = `autocomplete-listbox-${instanceId}`;

  // ── Debounce fetch ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const results = await fetchSuggestions(query);
      setSuggestions(results);
      setOpen(results.length > 0);
      setLoading(false);
      setActiveIdx(-1);
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // ── Cerrar al hacer click fuera ────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        inputRef.current &&
        !inputRef.current.contains(target) &&
        listRef.current &&
        !listRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Navegar a la sugerencia seleccionada ───────────────────────────────────

  const navigateTo = useCallback(
    (suggestion: Suggestion) => {
      setOpen(false);
      if (suggestion.type === "product") {
        router.push(
          `/marketplace/buscar?q=${encodeURIComponent(suggestion.label)}`,
        );
      } else if (suggestion.type === "category") {
        router.push(suggestion.href);
      } else {
        router.push(`/marketplace/${suggestion.slug}`);
      }
    },
    [router],
  );

  // ── Submit del form ────────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setOpen(false);
      if (activeIdx >= 0 && suggestions[activeIdx]) {
        navigateTo(suggestions[activeIdx]);
        return;
      }
      if (query.trim()) {
        // MK-05: registrar en historial local para sugerir en próximas visitas.
        // Import dinámico para no acoplar el input al SearchSuggestions.
        void import("./SearchSuggestions")
          .then((m) => m.pushSearchHistory(query.trim()))
          .catch(() => {/* historial es opcional, no bloquea */});
        router.push(
          `/marketplace/buscar?q=${encodeURIComponent(query.trim())}`,
        );
      }
    },
    [query, activeIdx, suggestions, navigateTo, router],
  );

  // ── Keyboard navigation ────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!open || suggestions.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIdx((i) => Math.max(i - 1, -1));
          break;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          setActiveIdx(-1);
          break;
        case "Tab":
          setOpen(false);
          break;
        default:
          break;
      }
    },
    [open, suggestions.length],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      aria-label="Buscar en el marketplace"
      className={`relative ${className}`}
    >
      {/* Input */}
      <div className="relative">
        <Search
          className={`absolute top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none ${
            isLg ? "left-4 sm:left-5 h-5 w-5" : "left-3.5 h-4 w-4"
          }`}
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-activedescendant={
            activeIdx >= 0 ? `option-${instanceId}-${activeIdx}` : undefined
          }
          autoComplete="off"
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            // Cargar historial al primer focus para mostrar chips si query vacío
            if (history.length === 0) setHistory(loadHistory());
            if (suggestions.length > 0) setOpen(true);
          }}
          placeholder={placeholder}
          className={
            isLg
              ? `w-full h-14 sm:h-16 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-sm pl-12 sm:pl-14 ${
                  showSubmitButton ? "pr-28 sm:pr-32" : "pr-12"
                } text-base sm:text-lg text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition-all`
              : "w-full h-12 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] pl-10 pr-10 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition-all"
          }
        />

        {/* Clear button */}
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSuggestions([]);
              setOpen(false);
              inputRef.current?.focus();
            }}
            className={`absolute top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors ${
              isLg
                ? showSubmitButton
                  ? "right-24 sm:right-28"
                  : "right-4"
                : "right-3"
            }`}
            aria-label="Limpiar busqueda"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          </button>
        )}

        {/* Botón Buscar visible (estilo hero) */}
        {isLg && showSubmitButton && (
          <button
            type="submit"
            aria-label="Buscar"
            className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center gap-2 h-10 sm:h-12 rounded-xl px-4 sm:px-6 font-extrabold text-white text-base bg-[var(--accent)] transition-opacity hover:opacity-90 active:scale-[0.98]"
          >
            <Search className="h-5 w-5 sm:hidden" strokeWidth={2.5} aria-hidden />
            <span className="hidden sm:inline">Buscar</span>
          </button>
        )}
      </div>

      {/* Loading indicator */}
      {loading && (
        <div
          className={`absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${
            isLg
              ? showSubmitButton
                ? "right-28 sm:right-36"
                : "right-12"
              : "right-10"
          }`}
          aria-hidden="true"
        >
          <span className="block h-full w-full rounded-full border-2 border-[var(--rule-base)] border-t-[var(--accent)] animate-spin" />
        </div>
      )}

      {/* Historial de búsquedas — solo visible cuando query vacío y hay history.
          UX P2-1 fix 2026-04-30: el vecino que vuelve a buscar ve sus
          búsquedas pasadas como chips (1 click) en lugar de re-tipear. */}
      {query.length === 0 && history.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] shadow-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--rule-soft)]">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Búsquedas recientes
            </p>
          </div>
          <ul role="list" className="p-2">
            {history.slice(0, 6).map((term) => (
              <li key={term}>
                <button
                  type="button"
                  onClick={() => {
                    setQuery(term);
                    router.push(`/marketplace/buscar?q=${encodeURIComponent(term)}`);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-[var(--surface-sunken)] transition-colors"
                >
                  <Clock
                    className="h-4 w-4 text-[var(--text-tertiary)] flex-shrink-0"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {term}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Dropdown de sugerencias */}
      {open && suggestions.length > 0 && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="Sugerencias de busqueda"
          className="absolute top-full left-0 right-0 z-50 mt-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] shadow-lg overflow-hidden"
        >
          {suggestions.map((s, idx) => {
            const isActive = idx === activeIdx;
            const optionId = `option-${instanceId}-${idx}`;

            return (
              <li
                key={optionId}
                id={optionId}
                role="option"
                aria-selected={isActive}
              >
                <button
                  type="button"
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => navigateTo(s)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    isActive
                      ? "bg-[var(--surface-sunken)]"
                      : "hover:bg-[var(--surface-sunken)]"
                  }`}
                >
                  <SuggestionIcon type={s.type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                      {s.label}
                    </p>
                    {s.type === "product" && (
                      <p className="text-xs text-[var(--text-tertiary)] truncate">
                        {s.sub}
                      </p>
                    )}
                  </div>
                  <SuggestionTypeLabel type={s.type} />
                </button>
              </li>
            );
          })}

          {/* Footer: buscar todo */}
          <li role="option" aria-selected={false}>
            <button
              type="submit"
              className="w-full flex items-center gap-3 px-4 py-3 border-t border-[var(--rule-soft)] text-left hover:bg-[var(--surface-sunken)] transition-colors"
            >
              <Search
                className="h-4 w-4 text-primary flex-shrink-0"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span className="text-sm font-semibold text-primary">
                Buscar &ldquo;{query}&rdquo; en todo el marketplace
              </span>
            </button>
          </li>
        </ul>
      )}
    </form>
  );
}
