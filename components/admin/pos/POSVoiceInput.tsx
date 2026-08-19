'use client';

/**
 * POSVoiceInput — dictado por voz para agregar productos al carrito.
 *
 * Brandon mayo 2026 v7: rediseño estilo Google Assistant.
 *  - Panel grande centrado con bottom-sheet (modal) en vez de popover diminuto.
 *  - Ripple animado alrededor del micrófono cuando está escuchando.
 *  - Transcript en tipografía grande (lectura desde lejos del mostrador).
 *  - Empty state con sugerencias clickeables ("2 leches", "3 arroces").
 *  - Mensaje claro y CTA directo cuando el micrófono está bloqueado.
 *
 * Funciona con la Web Speech API nativa (es-PE). Si el navegador no la soporta,
 * el botón no se renderiza.
 *
 * Atajo: Ctrl+M para abrir/cerrar.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Mic, MicOff, X, Check, Loader2, Plus, HelpCircle, Lock, Sparkles,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import { comandoDe, resolverDictado, separarPedidos, type LineaDictada } from "@/lib/pos/voz-parser";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface VoiceItem {
  productName: string;
  quantity: number;
  matchedProductId?: number;
  confidence: number;
}

interface ClarificationInfo {
  question: string;
  options: string[];
}

interface POSVoiceInputProps {
  /** `stock` habilita avisar en el acto cuando no alcanza para lo dictado. */
  products: { id: number; name: string; price: number; stock?: number | null }[];
  onAddToCart: (productId: number, quantity?: number) => void;
  onHighlightProduct?: (productId: number | null) => void;
}

const QUICK_PROMPTS = [
  "2 leches",
  "3 arroces y 1 aceite",
  "5 panes",
  "1 coca cola grande",
];

export default function POSVoiceInput({ products, onAddToCart, onHighlightProduct }: POSVoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [items, setItems] = useState<VoiceItem[]>([]);
  const [clarification, setClarification] = useState<ClarificationInfo | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);

  /**
   * Lo dictado, resuelto frase por frase contra el inventario. Antes había que
   * decir «listo» y esperar a la IA para saber si algo se había entendido: el
   * cajero hablaba a ciegas y un fallo de red se llevaba el dictado entero.
   */
  const [lineas, setLineas] = useState<LineaDictada[]>([]);
  const lineasRef = useRef<LineaDictada[]>([]);
  const catalogoRef = useRef(products);
  useEffect(() => { catalogoRef.current = products; }, [products]);

  const recognitionRef = useRef<any>(null);
  const transcriptBufferRef = useRef("");

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  // ── Interpretar transcripción vía API ────────────────────────────────────
  const interpretVoice = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setProcessing(true);
      setError(null);

      try {
        const res = await fetch("/api/pos/voice-interpret", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            transcript: text,
            availableProducts: products.map((p) => p.name),
          }),
        });
        if (!res.ok) throw new Error("Error al interpretar el comando de voz");
        const data = await res.json();
        if (data.needsClarification) setClarification(data.needsClarification);
        if (data.items && data.items.length > 0) {
          const mappedItems: VoiceItem[] = data.items.map((item: VoiceItem) => {
            const match =
              products.find((p) => p.name.toLowerCase() === item.productName.toLowerCase()) ||
              products.find((p) => p.name.toLowerCase().includes(item.productName.toLowerCase())) ||
              products.find((p) => item.productName.toLowerCase().includes(p.name.toLowerCase()));
            return { ...item, matchedProductId: match?.id ?? item.matchedProductId };
          });
          setItems(mappedItems);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      }
      setProcessing(false);
    },
    [products],
  );

  // ── Start listening ──────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!isSupported) {
      setError("Tu navegador no soporta reconocimiento de voz");
      return;
    }
    try {
      const SpeechRecognitionAPI =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognitionAPI();
      recognition.lang = "es-PE";
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        let interim = "";
        let final = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) final += t;
          else interim += t;
        }
        if (final) {
          transcriptBufferRef.current += " " + final;
          setTranscript(transcriptBufferRef.current.trim());
          const lower = final.toLowerCase().trim();

          // Cada frase se resuelve YA, contra el catálogo que está en pantalla.
          const cmd = comandoDe(final);
          if (cmd === "deshacer") {
            lineasRef.current = lineasRef.current.slice(0, -1);
            setLineas([...lineasRef.current]);
          } else if (!cmd) {
            const nuevas = separarPedidos(final)
              .map((frase, i) => resolverDictado(frase, catalogoRef.current, `${Date.now()}-${i}`))
              .filter((l): l is LineaDictada => l != null);
            if (nuevas.length > 0) {
              lineasRef.current = [...lineasRef.current, ...nuevas];
              setLineas([...lineasRef.current]);
              // Resaltar en la grilla lo último que se entendió.
              const ultimo = nuevas[nuevas.length - 1];
              if (ultimo.elegido) onHighlightProduct?.(ultimo.elegido.id);
            }
          }

          if (lower.includes("listo") || lower.includes("confirmar")) {
            recognition.stop();
            setIsListening(false);
            interpretVoice(transcriptBufferRef.current.trim());
            return;
          }
          if (lower.includes("cancelar")) {
            recognition.stop();
            setIsListening(false);
            setTranscript("");
            setItems([]);
            transcriptBufferRef.current = "";
            setShowPanel(false);
            return;
          }
        }
        setInterimTranscript(interim);
        if (interim && onHighlightProduct) {
          const words = interim.toLowerCase().trim();
          const exact = products.find((p) => p.name.toLowerCase() === words);
          const partial = !exact
            ? products.find(
                (p) =>
                  p.name.toLowerCase().includes(words) ||
                  words.includes(p.name.toLowerCase()),
              )
            : null;
          const match = exact || partial;
          onHighlightProduct(match ? match.id : null);
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === "not-allowed") setError("not-allowed");
        else if (event.error !== "no-speech") setError(`Error de reconocimiento: ${event.error}`);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript("");
        onHighlightProduct?.(null);
        if (transcriptBufferRef.current.trim()) {
          interpretVoice(transcriptBufferRef.current.trim());
        }
      };

      recognitionRef.current = recognition;
      transcriptBufferRef.current = "";
      setTranscript("");
      setInterimTranscript("");
      setItems([]);
      lineasRef.current = [];
      setLineas([]);
      setClarification(null);
      setError(null);
      setShowPanel(true);
      recognition.start();
      setIsListening(true);
    } catch (err) {
      setError("No se pudo iniciar el reconocimiento de voz");
      console.error(err);
    }
  }, [isSupported, interpretVoice, onHighlightProduct, products]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const togglePanel = useCallback(() => {
    if (showPanel) {
      stopListening();
      setShowPanel(false);
      onHighlightProduct?.(null);
    } else {
      startListening();
    }
  }, [showPanel, startListening, stopListening, onHighlightProduct]);

  // Ctrl+M shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === "m" || e.key === "M")) {
        e.preventDefault();
        togglePanel();
      }
      if (e.key === "Escape" && showPanel) {
        stopListening();
        setShowPanel(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePanel, showPanel, stopListening]);

  // Lock scroll cuando el panel está abierto
  useEffect(() => {
    if (!showPanel) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = orig;
    };
  }, [showPanel]);

  const addItem = useCallback(
    (item: VoiceItem) => {
      if (item.matchedProductId) {
        for (let i = 0; i < (item.quantity || 1); i++) {
          onAddToCart(item.matchedProductId);
        }
        setItems((prev) => prev.filter((it) => it !== item));
      }
    },
    [onAddToCart],
  );

  const addAllItems = useCallback(() => {
    items.forEach((item) => {
      if (item.matchedProductId) {
        for (let i = 0; i < (item.quantity || 1); i++) {
          onAddToCart(item.matchedProductId);
        }
      }
    });
    setItems([]);
    setClarification(null);
    setTranscript("");
    transcriptBufferRef.current = "";
    setShowPanel(false);
  }, [items, onAddToCart]);

  const handleClarificationAnswer = useCallback(
    (option: string) => {
      setClarification(null);
      interpretVoice(option);
    },
    [interpretVoice],
  );

  const handleQuickPrompt = useCallback(
    (prompt: string) => {
      setTranscript(prompt);
      transcriptBufferRef.current = prompt;
      interpretVoice(prompt);
    },
    [interpretVoice],
  );

  if (!isSupported) return null;

  return (
    <>
      {/* Botón micrófono trigger */}
      <button
        onClick={togglePanel}
        className={cn(
          "relative h-10 w-10 rounded-full flex items-center justify-center transition-all border-2 shrink-0",
          isListening
            ? "bg-[var(--data-error-500)] border-[var(--data-error-500)] text-white"
            : "bg-[var(--surface-raised)] border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-primary hover:text-primary",
        )}
        title={showPanel ? "Cerrar dictado (Esc)" : "Dictar por voz (Ctrl+M)"}
        aria-label={showPanel ? "Cerrar dictado por voz" : "Abrir dictado por voz"}
      >
        {isListening ? (
          <>
            <Mic className="h-4 w-4 relative z-10" />
            <span
              aria-hidden
              className="absolute inset-0 rounded-full bg-[var(--data-error-500)]/60 animate-ping"
            />
          </>
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </button>

      {/* ── Panel estilo Google Assistant ─────────────────────────────── */}
      {showPanel && (
        <div
          className="fixed inset-0 z-[100] bg-black/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-4"
          onClick={() => {
            stopListening();
            setShowPanel(false);
            onHighlightProduct?.(null);
          }}
        >
          <div
            role="dialog"
            aria-label="Dictado por voz"
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-xl bg-[var(--surface-raised)] rounded-3xl shadow-2xl border-2 border-[var(--rule-base)] overflow-hidden flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <header className="px-5 sm:px-6 py-4 flex items-start justify-between gap-3 border-b border-[var(--rule-soft)]">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    "h-11 w-11 rounded-2xl flex items-center justify-center shrink-0",
                    isListening
                      ? "bg-[var(--data-error-500)]/15 text-[var(--data-error-500)]"
                      : "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
                  )}
                >
                  <Mic className="h-5 w-5" strokeWidth={2.25} />
                </div>
                <div className="min-w-0">
                  <p className="text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">
                    Dictado por voz
                  </p>
                  <h2 className="text-lg sm:text-xl font-extrabold text-[var(--text-primary)] leading-tight">
                    {isListening
                      ? "Escuchando…"
                      : processing
                        ? "Procesando…"
                        : items.length > 0
                          ? "Productos reconocidos"
                          : 'Decí los productos que necesitás'}
                  </h2>
                </div>
              </div>
              <button
                onClick={() => {
                  stopListening();
                  setShowPanel(false);
                  onHighlightProduct?.(null);
                }}
                className="h-10 w-10 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors shrink-0"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            {/* Body — scroll si hay muchos items */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 sm:py-6">
              {/* Mic central con ripple */}
              <div className="flex flex-col items-center text-center mb-5">
                <button
                  onClick={() => {
                    if (isListening) stopListening();
                    else startListening();
                  }}
                  className="relative h-24 w-24 sm:h-28 sm:w-28 rounded-full flex items-center justify-center transition-colors mb-4"
                  style={{
                    background: isListening
                      ? "var(--data-error-500)"
                      : "var(--accent)",
                    color: "white",
                  }}
                  aria-pressed={isListening}
                  aria-label={isListening ? "Detener" : "Hablar"}
                >
                  {isListening ? (
                    <>
                      <span
                        aria-hidden
                        className="absolute inset-0 rounded-full bg-[var(--data-error-500)]/40 animate-ping"
                      />
                      <span
                        aria-hidden
                        className="absolute -inset-3 rounded-full border-2 border-[var(--data-error-500)]/30"
                      />
                      <MicOff className="h-9 w-9 sm:h-10 sm:w-10 relative z-10" />
                    </>
                  ) : (
                    <Mic className="h-9 w-9 sm:h-10 sm:w-10" />
                  )}
                </button>
                <p className="text-sm font-bold text-[var(--text-secondary)]">
                  {isListening
                    ? 'Decí "listo" para confirmar · "cancelar" para descartar'
                    : "Tocá el micrófono o empezá a hablar"}
                </p>
              </div>

              {/* Transcript grande */}
              {(transcript || interimTranscript) && (
                <div className="rounded-2xl bg-[var(--surface-sunken)] border-2 border-[var(--rule-soft)] px-5 py-4 mb-4">
                  <p className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] leading-snug">
                    {transcript}
                    {interimTranscript && (
                      <span className="text-[var(--text-tertiary)] italic">
                        {" "}
                        {interimTranscript}
                      </span>
                    )}
                  </p>
                </div>
              )}

              {/* Empty state: sugerencias rápidas */}
              {!isListening && !transcript && !interimTranscript && items.length === 0 && !processing && !error && (
                <div>
                  <p className="text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-2.5">
                    Probá decir
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => handleQuickPrompt(prompt)}
                        className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-1.5 text-sm font-bold text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])] hover:bg-primary/10 hover:border-[var(--accent)]/40 transition-colors"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden />
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Processing */}
              {processing && (
                <div className="flex items-center justify-center gap-2.5 py-4 text-[var(--accent)]">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  <p className="text-sm font-bold">Interpretando lo que dijiste…</p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="rounded-2xl bg-[var(--data-error-500)]/10 border-2 border-[var(--data-error-500)]/30 p-4">
                  {error === "not-allowed" ? (
                    <div className="flex items-start gap-3">
                      <Lock className="h-5 w-5 text-[var(--data-error-500)] shrink-0 mt-0.5" aria-hidden />
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-[var(--data-error-500)] leading-tight">
                          Micrófono bloqueado
                        </p>
                        <p className="mt-1 text-sm text-[var(--text-secondary)] leading-relaxed">
                          Tocá el ícono del candado en la barra de direcciones del navegador y elegí{" "}
                          <strong className="text-[var(--text-primary)]">Permitir</strong> para el micrófono. Después volvé a este panel.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm font-bold text-[var(--data-error-500)]">{error}</p>
                  )}
                </div>
              )}

              {/* Aclaración */}
              {clarification && (
                <div className="mt-4 rounded-2xl bg-[var(--data-warning-500)]/10 border-2 border-[var(--data-warning-500)]/30 p-4">
                  <div className="flex items-start gap-2.5 mb-3">
                    <HelpCircle className="h-5 w-5 text-[var(--data-warning-500)] shrink-0 mt-0.5" aria-hidden />
                    <p className="text-sm font-bold text-[var(--data-warning-700,var(--data-warning-500))] leading-relaxed">
                      {clarification.question}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {clarification.options.map((option) => (
                      <button
                        key={option}
                        onClick={() => handleClarificationAnswer(option)}
                        className="inline-flex items-center rounded-full border-2 border-[var(--data-warning-500)]/40 bg-[var(--surface-raised)] px-3.5 py-1.5 text-sm font-extrabold text-[var(--text-primary)] hover:bg-[var(--data-warning-500)]/15 transition-colors"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Lo dictado, resuelto en vivo contra el inventario */}
              {lineas.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                      {lineas.filter((l) => l.estado === "listo").length} de {lineas.length} listo
                      {lineas.filter((l) => l.estado === "listo").length === 1 ? "" : "s"} para agregar
                    </p>
                    <button
                      type="button"
                      onClick={() => { lineasRef.current = []; setLineas([]); }}
                      className="text-[length:var(--ts-2xs,0.6875rem)] font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                    >
                      Limpiar
                    </button>
                  </div>

                  {lineas.map((l) => {
                    const p = l.elegido;
                    const tono =
                      l.estado === "listo"
                        ? "border-primary/40 bg-primary/5"
                        : l.estado === "sin_stock"
                          ? "border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10"
                          : l.estado === "ambiguo"
                            ? "border-[var(--data-info-500)]/50 bg-[var(--data-info-500)]/10"
                            : "border-[var(--data-error-500)]/50 bg-[var(--data-error-500)]/10";
                    return (
                      <div key={l.id} className={cn("rounded-xl border-2 px-3 py-2", tono)}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-[var(--text-primary)]">
                              <span className="font-mono">{l.pedido.cantidad}</span>
                              {l.pedido.unidad ? ` ${l.pedido.unidad}` : ""} ·{" "}
                              {p ? p.name : <span className="italic">«{l.pedido.crudo}»</span>}
                            </p>
                            <p className="text-xs text-[var(--text-secondary)]">
                              {l.estado === "listo" && p && (
                                <>
                                  S/ {(p.price * l.pedido.cantidad).toFixed(2)}
                                  {p.stock != null && ` · quedan ${p.stock}`}
                                </>
                              )}
                              {l.estado === "sin_stock" && p && (
                                <>Sin stock suficiente: hay {p.stock ?? 0} y se pidieron {l.pedido.cantidad}</>
                              )}
                              {l.estado === "ambiguo" && <>¿Cuál de estos?</>}
                              {l.estado === "no_encontrado" && <>No está en el inventario — repetilo o buscalo a mano</>}
                            </p>
                            {l.estado === "ambiguo" && (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {l.candidatos.map((c) => (
                                  <button
                                    key={c.producto.id}
                                    type="button"
                                    onClick={() => {
                                      lineasRef.current = lineasRef.current.map((x) =>
                                        x.id === l.id ? { ...x, elegido: c.producto, estado: "listo" as const } : x,
                                      );
                                      setLineas([...lineasRef.current]);
                                    }}
                                    className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 py-1 text-xs font-bold text-[var(--text-primary)] hover:border-primary"
                                  >
                                    {c.producto.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          {l.estado !== "no_encontrado" && p && (
                            <button
                              type="button"
                              onClick={() => {
                                onAddToCart(p.id, l.pedido.cantidad);
                                lineasRef.current = lineasRef.current.filter((x) => x.id !== l.id);
                                setLineas([...lineasRef.current]);
                              }}
                              title="Agregar al carrito"
                              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-bold text-white hover:opacity-90"
                            >
                              <Plus className="h-3.5 w-3.5" /> Agregar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {lineas.some((l) => l.estado === "listo") && (
                    <button
                      type="button"
                      onClick={() => {
                        for (const l of lineasRef.current) {
                          if (l.estado === "listo" && l.elegido) onAddToCart(l.elegido.id, l.pedido.cantidad);
                        }
                        lineasRef.current = lineasRef.current.filter((l) => l.estado !== "listo");
                        setLineas([...lineasRef.current]);
                      }}
                      className="w-full rounded-xl bg-primary py-2.5 text-sm font-extrabold text-white hover:opacity-90"
                    >
                      Agregar los {lineas.filter((l) => l.estado === "listo").length} al carrito
                    </button>
                  )}
                </div>
              )}

              {/* Productos reconocidos por la IA (respaldo de lo que no se resolvió acá) */}
              {items.length > 0 && (
                <div className="mt-2 space-y-2">
                  <p className="text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                    {items.length} producto{items.length === 1 ? "" : "s"} reconocido{items.length === 1 ? "" : "s"}
                  </p>
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "h-9 w-9 rounded-xl flex items-center justify-center shrink-0",
                          item.matchedProductId
                            ? "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]"
                            : "bg-[var(--data-warning-500)]/10 text-[var(--data-warning-500)]",
                        )}
                      >
                        {item.matchedProductId ? <Check className="h-4 w-4" /> : <HelpCircle className="h-4 w-4" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-extrabold text-[var(--text-primary)] truncate">
                          {item.productName}
                        </p>
                        <p className="text-xs font-semibold text-[var(--text-secondary)]">
                          Cantidad: {item.quantity}
                          {item.confidence < 0.8 && " · Baja confianza"}
                        </p>
                      </div>
                      {item.matchedProductId && (
                        <button
                          onClick={() => addItem(item)}
                          className="inline-flex items-center gap-1 h-9 px-3 rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] text-sm font-extrabold hover:bg-[var(--accent)] hover:text-white transition-colors"
                          title="Agregar al carrito"
                        >
                          <Plus className="h-4 w-4" aria-hidden />
                          Sumar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <footer className="px-5 sm:px-6 py-4 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)] flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-[var(--text-tertiary)] hidden sm:block">
                <kbd className="rounded bg-[var(--surface-raised)] border border-[var(--rule-base)] px-1.5 py-0.5 font-mono text-[length:var(--ts-2xs,0.6875rem)]">
                  Ctrl+M
                </kbd>{" "}
                abre · <kbd className="rounded bg-[var(--surface-raised)] border border-[var(--rule-base)] px-1.5 py-0.5 font-mono text-[length:var(--ts-2xs,0.6875rem)]">Esc</kbd> cierra
              </p>
              {items.some((i) => i.matchedProductId) ? (
                <button
                  onClick={addAllItems}
                  className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-[var(--accent)] text-white text-sm font-extrabold hover:opacity-90 transition-opacity"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Agregar todo al carrito
                </button>
              ) : (
                <span className="text-xs font-semibold text-[var(--text-tertiary)] sm:hidden">
                  Esc cierra
                </span>
              )}
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
