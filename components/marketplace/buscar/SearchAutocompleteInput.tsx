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
import { Search, Package, Tag, Store, X } from "lucide-react";

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
  const cls = "h-4 w-4 text-gray-400 flex-shrink-0";
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
    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500">
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
}

export default function SearchAutocompleteInput({
  defaultValue = "",
  placeholder = "Buscar productos, tiendas, categorias...",
  className = "",
  autoFocus = false,
}: SearchAutocompleteInputProps) {
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
          className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none"
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
            if (suggestions.length > 0) setOpen(true);
          }}
          placeholder={placeholder}
          className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 pl-10 pr-10 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
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
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Limpiar busqueda"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Loading indicator */}
      {loading && (
        <div
          className="absolute right-10 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
          aria-hidden="true"
        >
          <span className="block h-full w-full rounded-full border-2 border-gray-300 dark:border-gray-600 border-t-primary animate-spin" />
        </div>
      )}

      {/* Dropdown de sugerencias */}
      {open && suggestions.length > 0 && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="Sugerencias de busqueda"
          className="absolute top-full left-0 right-0 z-50 mt-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-lg overflow-hidden"
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
                      ? "bg-gray-50 dark:bg-gray-800"
                      : "hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <SuggestionIcon type={s.type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {s.label}
                    </p>
                    {s.type === "product" && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
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
              className="w-full flex items-center gap-3 px-4 py-3 border-t border-gray-100 dark:border-gray-800 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
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
