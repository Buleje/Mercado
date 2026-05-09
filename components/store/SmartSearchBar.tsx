"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { Search, X, ShoppingCart, Loader2, Mic, MicOff } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface SearchResult {
  id: number;
  name: string;
  price: number;
  image?: string;
  category?: string;
  stock?: number;
}

interface SmartSearchBarProps {
  onAddToCart?: (product: SearchResult) => void;
  className?: string;
}

export default function SmartSearchBar({ onAddToCart, className }: SmartSearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Web Speech API support check + setup
  const speechSupported = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const toggleVoiceSearch = () => {
    if (!speechSupported) return;

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionApi) return;
    const recognition = new SpeechRecognitionApi();
    recognition.lang = "es-PE";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      if (transcript) {
        setQuery(transcript);
        setOpen(true);
        setSelected(-1);
      }
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const fmt = (n: number) => `S/${n.toFixed(2)}`;

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/product-search?q=${encodeURIComponent(q)}&limit=8`);
      if (res.ok) {
        const data = await res.json();
        setResults(Array.isArray(data) ? data : (data.products ?? []));
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected(s => Math.min(s + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected(s => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && selected >= 0 && results[selected]) {
      onAddToCart?.(results[selected]);
      setQuery("");
      setOpen(false);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); setSelected(-1); }}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder="Buscar productos..."
          className="w-full pl-9 pr-16 py-2.5 rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 dark:text-foreground"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {query && (
            <button
              onClick={() => { setQuery(""); setResults([]); setOpen(false); inputRef.current?.focus(); }}
              className="p-1 rounded-full hover:bg-[var(--surface-sunken)] dark:hover:bg-accent"
            >
              <X className="h-3.5 w-3.5 text-gray-400" />
            </button>
          )}
          {speechSupported && (
            <button
              onClick={toggleVoiceSearch}
              className={cn(
                "p-1.5 rounded-full transition-colors",
                isListening
                  ? "bg-red-100 dark:bg-red-900/30 text-[var(--data-error-500)] animate-pulse"
                  : "hover:bg-[var(--surface-sunken)] dark:hover:bg-accent text-gray-400",
              )}
              aria-label={isListening ? "Detener dictado" : "Buscar por voz"}
              title={isListening ? "Detener dictado" : "Buscar por voz en espanol"}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Results dropdown */}
      {open && (query.length >= 2) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl shadow-xl z-50 max-h-80 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-muted">
              No encontramos &ldquo;{query}&rdquo;
            </div>
          ) : (
            results.map((product, i) => (
              <button
                key={product.id}
                onClick={() => {
                  onAddToCart?.(product);
                  setQuery("");
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--surface-alt)] dark:hover:bg-surface transition-colors",
                  i === selected && "bg-primary/5",
                  i < results.length - 1 && "border-b border-[var(--rule-soft)] dark:border-card-border"
                )}
              >
                {product.image ? (
                  <Image src={product.image} alt="" width={40} height={40} className="rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="h-10 w-10 rounded-lg bg-[var(--surface-sunken)] dark:bg-accent flex items-center justify-center shrink-0">
                    <ShoppingCart className="h-4 w-4 text-gray-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 dark:text-foreground truncate">{product.name}</p>
                  {product.category && (
                    <p className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-muted">{product.category}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-extrabold text-primary">{fmt(product.price)}</p>
                  {product.stock != null && product.stock <= 5 && (
                    <p className="text-[length:var(--ts-2xs)] text-[var(--data-warning-600)] font-bold">Quedan {product.stock}</p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
