'use client';

import { useState, useEffect, useCallback, useRef } from "react";
import { Mic, MicOff, X, Check, Loader2, Plus, HelpCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

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
  products: { id: number; name: string; price: number }[];
  onAddToCart: (productId: number, quantity?: number) => void;
  onHighlightProduct?: (productId: number | null) => void;
}

export default function POSVoiceInput({ products, onAddToCart, onHighlightProduct }: POSVoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [items, setItems] = useState<VoiceItem[]>([]);
  const [clarification, setClarification] = useState<ClarificationInfo | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);

  const recognitionRef = useRef<any>(null);
  const transcriptBufferRef = useRef("");

  // Check if Web Speech API is supported
  const isSupported = typeof window !== "undefined" && (
    "SpeechRecognition" in window || "webkitSpeechRecognition" in window
  );

  // Interpret voice via API
  const interpretVoice = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setProcessing(true);
    setError(null);

    try {
      const res = await fetch("/api/pos/voice-interpret", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          transcript: text,
          availableProducts: products.map(p => p.name),
        }),
      });

      if (!res.ok) {
        throw new Error("Error al interpretar el comando de voz");
      }

      const data = await res.json();

      if (data.needsClarification) {
        setClarification(data.needsClarification);
      }

      if (data.items && data.items.length > 0) {
        // Map product names to IDs
        const mappedItems: VoiceItem[] = data.items.map((item: VoiceItem) => {
          const match = products.find(
            p => p.name.toLowerCase() === item.productName.toLowerCase()
          ) || products.find(
            p => p.name.toLowerCase().includes(item.productName.toLowerCase())
          ) || products.find(
            p => item.productName.toLowerCase().includes(p.name.toLowerCase())
          );
          return {
            ...item,
            matchedProductId: match?.id || item.matchedProductId,
          };
        });
        setItems(mappedItems);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
    setProcessing(false);
  }, [products]);

  // Start listening
  const startListening = useCallback(() => {
    if (!isSupported) {
      setError("Tu navegador no soporta reconocimiento de voz");
      return;
    }

    try {
      const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognitionAPI();
      recognition.lang = "es-PE";
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        let interim = "";
        let final = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += t;
          } else {
            interim += t;
          }
        }

        if (final) {
          transcriptBufferRef.current += " " + final;
          setTranscript(transcriptBufferRef.current.trim());

          // Check for stop commands
          const lowerFinal = final.toLowerCase().trim();
          if (lowerFinal.includes("listo") || lowerFinal.includes("confirmar")) {
            recognition.stop();
            setIsListening(false);
            interpretVoice(transcriptBufferRef.current.trim());
            return;
          }
          if (lowerFinal.includes("cancelar")) {
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

        // Mejora 4: Real-time highlight — search as user speaks
        if (interim && onHighlightProduct) {
          const words = interim.toLowerCase().trim();
          const exactMatch = products.find(
            p => p.name.toLowerCase() === words
          );
          const partialMatch = !exactMatch ? products.find(
            p => p.name.toLowerCase().includes(words) || words.includes(p.name.toLowerCase())
          ) : null;
          const match = exactMatch || partialMatch;
          if (match) {
            onHighlightProduct(match.id);
          } else {
            onHighlightProduct(null);
          }
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === "not-allowed") {
          setError("not-allowed");
        } else if (event.error !== "no-speech") {
          setError(`Error de reconocimiento: ${event.error}`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript("");
        onHighlightProduct?.(null);
        // Auto-interpret if there's accumulated transcript
        if (transcriptBufferRef.current.trim()) {
          interpretVoice(transcriptBufferRef.current.trim());
        }
      };

      recognitionRef.current = recognition;
      transcriptBufferRef.current = "";
      setTranscript("");
      setInterimTranscript("");
      setItems([]);
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

  // Stop listening
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, []);

  // Toggle
  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Ctrl+M shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "m") {
        e.preventDefault();
        toggleListening();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleListening]);

  // Add a single item to cart
  const addItem = useCallback((item: VoiceItem) => {
    if (item.matchedProductId) {
      for (let i = 0; i < (item.quantity || 1); i++) {
        onAddToCart(item.matchedProductId);
      }
      setItems(prev => prev.filter(it => it !== item));
    }
  }, [onAddToCart]);

  // Add all matched items
  const addAllItems = useCallback(() => {
    items.forEach(item => {
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

  // Handle clarification answer
  const handleClarificationAnswer = useCallback((option: string) => {
    setClarification(null);
    interpretVoice(option);
  }, [interpretVoice]);

  if (!isSupported) return null;

  return (
    <div className="relative">
      {/* Mic button */}
      <button
        onClick={toggleListening}
        className={cn(
          "relative h-10 w-10 rounded-full flex items-center justify-center transition-all border-2 shrink-0",
          isListening
            ? "bg-[var(--data-error-500)] border-[var(--data-error-500)] text-white animate-pulse"
            : "bg-[var(--surface-raised)] border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:border-primary hover:text-primary"
        )}
        title={isListening ? "Detener (Ctrl+M)" : "Dictar por voz (Ctrl+M)"}
      >
        {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </button>

      {/* Voice panel */}
      {showPanel && (
        <div className="absolute top-12 right-0 z-50 w-80 bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-hidden">
          {/* Panel header */}
          <div className="px-3 py-2.5 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mic className={cn("h-4 w-4", isListening ? "text-[var(--data-error-500)]" : "text-[var(--text-tertiary)]")} />
              <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                {isListening ? "Escuchando..." : "Dictado por voz"}
              </span>
              {isListening && (
                <span className="h-2 w-2 rounded-full bg-[var(--data-error-500)] animate-pulse" />
              )}
            </div>
            <button
              onClick={() => {
                stopListening();
                setShowPanel(false);
                setItems([]);
                setTranscript("");
                transcriptBufferRef.current = "";
                onHighlightProduct?.(null);
              }}
              className="p-1 text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Transcript display */}
          <div className="px-3 py-2 bg-[var(--surface-alt)] dark:bg-surface min-h-[3rem]">
            {transcript || interimTranscript ? (
              <p className="text-xs text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                {transcript}
                {interimTranscript && (
                  <span className="text-[var(--text-tertiary)] italic"> {interimTranscript}</span>
                )}
              </p>
            ) : (
              <p className="text-xs text-[var(--text-tertiary)] dark:text-muted italic">
                Diga los productos... Ej: &quot;2 leches y 3 arroces&quot;
              </p>
            )}
            {isListening && (
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-1">
                Diga &quot;listo&quot; para confirmar o &quot;cancelar&quot; para cancelar
              </p>
            )}
          </div>

          {/* Processing indicator */}
          {processing && (
            <div className="px-3 py-3 flex items-center justify-center gap-2 text-xs text-primary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Interpretando...
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-3 py-2.5 bg-[var(--data-error-50)] dark:bg-red-950/20 border-t border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30">
              {error === "not-allowed" ? (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)] flex items-center gap-1.5">
                    <HelpCircle className="h-3.5 w-3.5" /> Micrófono bloqueado
                  </p>
                  <p className="text-[length:var(--ts-xs)] text-[var(--data-error-500)] dark:text-[var(--data-error-500)] leading-tight">
                    Haz clic en el icono del candado 🔒 en la barra de direcciones superior y selecciona <strong>Permitir</strong> para el micrófono.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{error}</p>
              )}
            </div>
          )}

          {/* Clarification */}
          {clarification && (
            <div className="px-3 py-2.5 bg-[var(--data-warning-50)] dark:bg-amber-950/20 border-t border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30">
              <div className="flex items-start gap-1.5 mb-2">
                <HelpCircle className="h-3.5 w-3.5 text-[var(--data-warning-500)] shrink-0 mt-0.5" />
                <p className="text-xs font-medium text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">
                  {clarification.question}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {clarification.options.map((option) => (
                  <button
                    key={option}
                    onClick={() => handleClarificationAnswer(option)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] hover:bg-[var(--data-warning-100)] dark:hover:bg-[var(--data-warning-500)]/30 transition-colors"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recognized items */}
          {items.length > 0 && (
            <div className="px-3 py-2.5 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] dark:text-muted mb-2">
                Productos reconocidos
              </p>
              <div className="space-y-1.5">
                {items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 p-1.5 rounded-lg bg-[var(--surface-alt)] dark:bg-surface"
                  >
                    {item.matchedProductId ? (
                      <Check className="h-3.5 w-3.5 text-[var(--data-success-500)] shrink-0" />
                    ) : (
                      <HelpCircle className="h-3.5 w-3.5 text-[var(--data-warning-500)] shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">
                        {item.productName}
                      </p>
                      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">
                        Cantidad: {item.quantity}
                        {item.confidence < 0.8 && " · Baja confianza"}
                      </p>
                    </div>
                    {item.matchedProductId && (
                      <button
                        onClick={() => addItem(item)}
                        className="p-1 text-primary hover:bg-primary/10 rounded transition-colors"
                        title="Agregar al carrito"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add all button */}
              {items.some(i => i.matchedProductId) && (
                <button
                  onClick={addAllItems}
                  className="w-full mt-2 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-colors flex items-center justify-center gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Agregar todo al carrito
                </button>
              )}
            </div>
          )}

          {/* Keyboard shortcut hint */}
          <div className="px-3 py-1.5 bg-[var(--surface-alt)] dark:bg-surface border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] text-center">
            <kbd className="text-[length:var(--ts-2xs)] bg-[var(--rule-soft)] dark:bg-gray-700 text-[var(--text-secondary)] px-1.5 py-0.5 rounded font-mono">
              Ctrl+M
            </kbd>
          </div>
        </div>
      )}
    </div>
  );
}
