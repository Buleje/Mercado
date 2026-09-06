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
  // Transcript en vivo — se actualiza con cada interim result para que el
  // overlay tipo Google muestre lo que el usuario va dictando en tiempo real.
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
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
    // interimResults=true permite mostrar la transcripción en vivo durante
    // el dictado (el overlay tipo Google necesita feedback visual inmediato).
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    setInterimTranscript("");
    setVoiceError(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) finalText += t;
        else interim += t;
      }
      if (interim) setInterimTranscript(interim);
      if (finalText) {
        const clean = finalText.trim();
        setValue(clean);
        setInterimTranscript(clean);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          fetchSuggestions(clean);
          onSearch(clean);
        }, 0);
        // Pequeño delay para que el usuario vea el resultado final en el overlay
        // antes de cerrarlo (mejor UX que cerrar instantáneamente).
        setTimeout(() => {
          setIsListening(false);
          setInterimTranscript("");
        }, 600);
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      const code = e?.error ?? "unknown";
      const msg =
        code === "not-allowed" || code === "service-not-allowed"
          ? "Habilitá el micrófono en tu navegador para buscar por voz"
          : code === "no-speech"
            ? "No te escuchamos, intentá de nuevo"
            : "No pudimos escucharte, probá de nuevo";
      setVoiceError(msg);
      // No cerramos el overlay inmediatamente — mostramos el error 2.5s
      setTimeout(() => {
        setIsListening(false);
        setVoiceError(null);
        setInterimTranscript("");
      }, 2500);
    };

    recognition.onend = () => {
      // Si terminó sin dispatch de result final, cerramos overlay.
      setTimeout(() => {
        setIsListening((prev) => {
          if (prev) setInterimTranscript("");
          return false;
        });
      }, 100);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      // start() puede tirar si ya hay una instancia activa.
      setIsListening(false);
    }
  }, [speechSupported, isListening, fetchSuggestions, onSearch]);

  const stopListening = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    setIsListening(false);
    setInterimTranscript("");
    setVoiceError(null);
  }, []);

  // ESC cierra overlay de voz
  useEffect(() => {
    if (!isListening) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") stopListening();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isListening, stopListening]);

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
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)] pointer-events-none" aria-hidden="true" />
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
            "w-full pl-12 py-3.5 pr-14 rounded-2xl border text-base font-medium",
            "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900",
            "text-[var(--text-primary)] dark:text-white placeholder:text-[var(--text-tertiary)] dark:placeholder:text-[var(--text-secondary)]",
            "outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
            "transition-all shadow-sm",
          )}
        />

        {loading ? (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] animate-spin pointer-events-none" />
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
            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-[var(--surface-sunken)] dark:hover:bg-gray-800 transition-colors"
          >
            <X className="h-4 w-4 text-[var(--text-tertiary)]" />
          </button>
        ) : speechSupported ? (
          <button
            type="button"
            onClick={isListening ? stopListening : startListening}
            aria-label={isListening ? "Detener búsqueda por voz" : "Buscar por voz (micrófono)"}
            aria-pressed={isListening}
            title={isListening ? "Escuchando… toca para detener" : "Buscar por voz"}
            className={cn(
              // Tap target accesible (≥44×44 en mobile) y boton mas visible.
              "absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full transition-all",
              isListening
                ? "bg-[var(--data-error-500)]/15 text-[var(--data-error-500)] ring-2 ring-[var(--data-error-500)]/40 animate-pulse"
                : "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-[var(--accent)]/15 hover:scale-105",
            )}
          >
            {isListening ? (
              <MicOff className="h-5 w-5" aria-hidden="true" strokeWidth={2} />
            ) : (
              <Mic className="h-5 w-5" aria-hidden="true" strokeWidth={2} />
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
                <span className="text-sm text-[var(--text-secondary)] dark:text-gray-400">Buscando sugerencias…</span>
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
                      <div aria-hidden="true" className="px-4 py-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] dark:text-gray-500 flex items-center gap-1.5 bg-[var(--surface-alt)]/70 dark:bg-gray-900/70">
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
                                : "hover:bg-[var(--surface-alt)] dark:hover:bg-gray-800",
                            )}
                          >
                            <div className="h-9 w-9 rounded-xl bg-[var(--surface-sunken)] dark:bg-gray-800 overflow-hidden flex items-center justify-center shrink-0">
                              {item.image ? (
                                <Image
                                  src={item.image}
                                  alt=""
                                  width={36}
                                  height={36}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <ItemIcon className="h-4 w-4 text-[var(--text-tertiary)]" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-white truncate">
                                {item.label}
                              </p>
                              {item.subtitle && (
                                <p className="text-xs text-[var(--text-secondary)] dark:text-gray-400 truncate">
                                  {item.subtitle}
                                </p>
                              )}
                            </div>
                            <ArrowRight className="h-3.5 w-3.5 text-[var(--text-tertiary)] dark:text-gray-600 shrink-0" aria-hidden="true" />
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
                  className="w-full flex items-center justify-between rounded-xl border border-dashed border-gray-200 dark:border-gray-700 px-4 py-3 hover:bg-[var(--surface-alt)] dark:hover:bg-gray-800 transition-colors"
                >
                  <span className="text-sm text-[var(--text-secondary)] dark:text-gray-300">
                    Buscar &ldquo;<strong className="text-[var(--text-primary)] dark:text-white">{value.trim()}</strong>&rdquo;
                  </span>
                  <ArrowRight className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden="true" />
                </button>
              </div>
            )}
          </m.div>
        )}
      </AnimatePresence>

      {/* ── Voice overlay tipo Google ─────────────────────────────────────────
           Full-screen modal centrado con orbe pulsante + transcript live.
           Brandon, mayo 14 2026: cuando el cliente toca el mic, le aparece
           este overlay grande con animación radial — feedback inmediato de
           que la app lo está escuchando (igual que el "Hey Google"). */}
      <VoiceOverlay
        open={isListening}
        transcript={interimTranscript}
        error={voiceError}
        onClose={stopListening}
      />
    </form>
  );
}

// ── VoiceOverlay ─────────────────────────────────────────────────────────────

interface VoiceOverlayProps {
  open: boolean;
  transcript: string;
  error: string | null;
  onClose: () => void;
}

function VoiceOverlay({ open, transcript, error, onClose }: VoiceOverlayProps) {
  return (
    <AnimatePresence>
      {open && (
        <m.div
          role="dialog"
          aria-modal="true"
          aria-label="Buscar por voz"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 flex items-center justify-center px-6 backdrop-blur-2xl bg-slate-950/70 dark:bg-black/80"
          style={{ zIndex: 2147483647 }}
        >
          <m.div
            initial={{ scale: 0.92, y: 12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md flex flex-col items-center gap-6 rounded-[28px] bg-white dark:bg-gray-900 px-8 py-10 shadow-2xl shadow-black/50"
          >
            {/* Cerrar */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar dictado por voz"
              className="absolute top-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] dark:hover:bg-gray-800 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Orbe pulsante con anillos animados — estilo Google */}
            <div className="relative flex items-center justify-center h-32 w-32">
              {/* Anillos pulsantes */}
              <span
                aria-hidden
                className="absolute inset-0 rounded-full bg-[var(--accent)]/20 animate-ping"
                style={{ animationDuration: "1.6s" }}
              />
              <span
                aria-hidden
                className="absolute inset-4 rounded-full bg-[var(--accent)]/30 animate-ping"
                style={{ animationDuration: "1.2s", animationDelay: "0.2s" }}
              />
              <span
                aria-hidden
                className="absolute inset-8 rounded-full bg-[var(--accent)]/40 animate-ping"
                style={{ animationDuration: "0.9s", animationDelay: "0.4s" }}
              />
              {/* Core */}
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-linear-to-br from-[var(--accent)] to-[var(--accent-600,var(--accent))] shadow-xl">
                <Mic className="h-9 w-9 text-white" strokeWidth={2.25} aria-hidden />
              </div>
            </div>

            {/* Estado / transcript */}
            <div className="text-center min-h-[3.5rem] flex flex-col items-center justify-center w-full">
              {error ? (
                <p className="text-base font-bold text-[var(--data-error-500)]">
                  {error}
                </p>
              ) : transcript ? (
                <p className="text-lg sm:text-xl font-semibold text-[var(--text-primary)] dark:text-white leading-snug break-words max-w-full">
                  &ldquo;{transcript}&rdquo;
                </p>
              ) : (
                <>
                  <p className="text-lg font-bold text-[var(--text-primary)] dark:text-white">
                    Te escucho…
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                    Decí qué buscás (ej. &ldquo;pollo&rdquo;, &ldquo;arroz&rdquo;)
                  </p>
                </>
              )}
            </div>

            {/* Equalizer bars decorativas */}
            {!error && (
              <div
                aria-hidden
                className="flex items-end justify-center gap-1.5 h-8 w-full"
              >
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 rounded-full bg-[var(--accent)]"
                    style={{
                      animation: `voice-bar 0.9s ease-in-out ${i * 0.08}s infinite`,
                      height: "30%",
                    }}
                  />
                ))}
              </div>
            )}

            <p className="text-xs text-[var(--text-tertiary)]">
              Toca afuera o presiona <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] dark:bg-gray-800 font-mono text-[10px]">ESC</kbd> para cerrar
            </p>

            <style jsx>{`
              @keyframes voice-bar {
                0%, 100% { height: 25%; opacity: 0.4; }
                50% { height: 100%; opacity: 1; }
              }
              @media (prefers-reduced-motion: reduce) {
                :global([role="dialog"][aria-label="Buscar por voz"] *) {
                  animation: none !important;
                }
              }
            `}</style>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
