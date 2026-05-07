"use client";

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useId,
  type KeyboardEvent,
  type ElementType,
} from "react";
import Image from "next/image";
import { Search, X, Loader2, Store, Package, Tag, History, ArrowRight, Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { m, AnimatePresence } from "framer-motion";

export type MarketplaceSuggestionType = "query" | "store" | "product" | "category";

export interface MarketplaceSuggestionItem {
  id: string;
  type: MarketplaceSuggestionType;
  label: string;
  subtitle?: string;
  href: string;
  image?: string | null;
  searchCount?: number;
}

interface Props {
  onSearch: (q: string) => void;
  onSelect?: (item: MarketplaceSuggestionItem) => void;
  placeholder?: string;
  className?: string;
}

interface SuggestionsResponse {
  suggestions?: MarketplaceSuggestionItem[];
}

const TYPE_META: Record<MarketplaceSuggestionType, { title: string; icon: ElementType }> = {
  query: { title: "Búsquedas", icon: History },
  store: { title: "Tiendas", icon: Store },
  product: { title: "Productos", icon: Package },
  category: { title: "Categorías", icon: Tag },
};

export default function SearchAutocomplete({
  onSearch,
  onSelect,
  placeholder = "Buscar productos, tiendas o categorías...",
  className,
}: Props) {
  const [value, setValue] = useState("");
  const [items, setItems] = useState<MarketplaceSuggestionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLFormElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listId = useId();

  const grouped = useMemo(() => {
    const g: Record<MarketplaceSuggestionType, MarketplaceSuggestionItem[]> = {
      query: [],
      store: [],
      product: [],
      category: [],
    };
    for (const it of items) g[it.type].push(it);
    return g;
  }, [items]);

  const flatItems = useMemo(
    () => [...grouped.query, ...grouped.store, ...grouped.product, ...grouped.category],
    [grouped],
  );

  const fetchSuggestions = useCallback(async (q: string) => {
    const normalized = q.trim();
    if (normalized.length < 1) {
      setItems([]);
      setLoading(false);
      setOpen(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/marketplace/search/suggestions?q=${encodeURIComponent(normalized)}`);
      if (res.ok) {
        const json = (await res.json()) as SuggestionsResponse;
        const next = Array.isArray(json.suggestions) ? json.suggestions : [];
        setItems(next);
        setActiveIndex(-1);
        setOpen(true);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Voice search (Web Speech API) ──────────────────────────────────────────
  // Declarado DESPUÉS de fetchSuggestions para evitar TDZ en el dep array.
  const [isListening, setIsListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const speechSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const startListening = useCallback(() => {
    if (!speechSupported || isListening) return;

    // Web Speech API no tiene tipos oficiales en lib.dom por default.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SpeechRecognitionAPI = w.webkitSpeechRecognition ?? w.SpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "es-PE";
    recognition.continuous = false;
    recognition.interimResults = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript: string = event?.results?.[0]?.[0]?.transcript ?? "";
      if (transcript) {
        setValue(transcript);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          fetchSuggestions(transcript);
          onSearch(transcript);
        }, 0);
      }
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
      window.dispatchEvent(
        new CustomEvent("marketplace-toast", {
          detail: { message: "No pudimos escucharte, prueba de nuevo", type: "error" },
        }),
      );
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [speechSupported, isListening, fetchSuggestions, onSearch]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const handleChange = (nextValue: string) => {
    setValue(nextValue);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const q = nextValue.trim();
      fetchSuggestions(q);
      onSearch(q);
    }, 180);
  };

  const handleSelect = useCallback(
    (item: MarketplaceSuggestionItem) => {
      setValue(item.label);
      setOpen(false);
      setItems([]);
      onSearch(item.label);

      if (onSelect) {
        onSelect(item);
        return;
      }

      if (item.href) {
        window.location.href = item.href;
      }
    },
    [onSearch, onSelect],
  );

  const handleSubmitRaw = useCallback(() => {
    const q = value.trim();
    if (!q) return;

    const fallback: MarketplaceSuggestionItem = {
      id: `manual:${q}`,
      type: "query",
      label: q,
      subtitle: "Buscar en marketplace",
      href: `/marketplace?buscar=${encodeURIComponent(q)}`,
    };
    handleSelect(fallback);
  }, [value, handleSelect]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || flatItems.length === 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmitRaw();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && flatItems[activeIndex]) {
        handleSelect(flatItems[activeIndex]);
      } else {
        handleSubmitRaw();
      }
      return;
    }

    if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const showDropdown = open && (loading || items.length > 0 || value.trim().length > 0);

  // Mayo 2026 (designer audit P0): wrap raíz en <form> para que la tecla
  // Enter dispare submit nativo. Antes era <div> y Enter solo funcionaba
  // por handleKeyDown, que tenía branches que no siempre disparaban.
  return (
    <form
      ref={containerRef}
      onSubmit={(e) => { e.preventDefault(); handleSubmitRaw(); }}
      role="search"
      className={cn("relative w-full", className)}
    >
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
          aria-label="Buscar productos, tiendas o categorías"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (value.trim().length >= 1) setOpen(true);
          }}
          placeholder={placeholder}
          autoComplete="off"
          className={cn(
            "w-full pl-12 py-3.5 pr-12 rounded-2xl border text-base font-medium",
            "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900",
            "text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500",
            "outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
            "transition-all shadow-sm",
          )}
        />

        {loading ? (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin pointer-events-none" />
        ) : value ? (
          <button
            type="button"
            onClick={() => {
              setValue("");
              setItems([]);
              setOpen(false);
              onSearch("");
              inputRef.current?.focus();
            }}
            aria-label="Limpiar búsqueda"
            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        ) : speechSupported ? (
          <button
            type="button"
            onClick={isListening ? stopListening : startListening}
            aria-label="Buscar por voz"
            aria-pressed={isListening}
            className={cn(
              "absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full transition-colors",
              isListening
                ? "text-[var(--data-error-500)] animate-pulse hover:bg-red-50 dark:hover:bg-red-900/20"
                : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800",
            )}
          >
            {isListening ? (
              <MicOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Mic className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>

      <AnimatePresence>
        {showDropdown && (
          <m.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className={cn(
              "absolute top-full left-0 right-0 mt-2 z-50 rounded-2xl shadow-2xl overflow-hidden",
              "border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900",
              "sm:max-h-[28rem] max-h-[60vh]",
            )}
          >
            {loading && (
              <div role="status" aria-live="polite" className="flex items-center gap-3 px-5 py-4">
                <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" aria-hidden="true" />
                <span className="text-sm text-gray-500 dark:text-gray-400">Buscando sugerencias…</span>
              </div>
            )}

            {!loading && flatItems.length > 0 && (
              <div id={listId} role="listbox" aria-label="Sugerencias de búsqueda" className="overflow-y-auto">
                {(Object.keys(TYPE_META) as MarketplaceSuggestionType[]).map((type) => {
                  const section = grouped[type];
                  if (section.length === 0) return null;
                  const Icon = TYPE_META[type].icon;

                  return (
                    <div key={type} className="border-b border-gray-100 dark:border-gray-800 last:border-b-0">
                      <div aria-hidden="true" className="px-4 py-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center gap-1.5 bg-gray-50/70 dark:bg-gray-900/70">
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        {TYPE_META[type].title}
                      </div>
                      {section.map((item) => {
                        const index = flatItems.findIndex((f) => f.id === item.id);
                        const active = index === activeIndex;
                        const ItemIcon = TYPE_META[item.type].icon;
                        return (
                          <button
                            key={item.id}
                            id={`sugg-${index}`}
                            role="option"
                            aria-selected={active}
                            onMouseDown={() => handleSelect(item)}
                            className={cn(
                              "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                              active
                                ? "bg-primary/10 dark:bg-primary/15"
                                : "hover:bg-gray-50 dark:hover:bg-gray-800",
                            )}
                          >
                            <div className="h-9 w-9 rounded-xl bg-gray-100 dark:bg-gray-800 overflow-hidden flex items-center justify-center shrink-0">
                              {item.image ? (
                                <Image
                                  src={item.image}
                                  alt=""
                                  width={36}
                                  height={36}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <ItemIcon className="h-4 w-4 text-gray-400" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                {item.label}
                              </p>
                              {item.subtitle && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                  {item.subtitle}
                                </p>
                              )}
                            </div>
                            <ArrowRight className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600 shrink-0" aria-hidden="true" />
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}

            {!loading && flatItems.length === 0 && value.trim().length > 0 && (
              <div className="px-4 py-4">
                <button
                  onMouseDown={handleSubmitRaw}
                  aria-label={`Buscar "${value.trim()}" en el marketplace`}
                  className="w-full flex items-center justify-between rounded-xl border border-dashed border-gray-200 dark:border-gray-700 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    Buscar &ldquo;<strong className="text-gray-900 dark:text-white">{value.trim()}</strong>&rdquo;
                  </span>
                  <ArrowRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
                </button>
              </div>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </form>
  );
}
