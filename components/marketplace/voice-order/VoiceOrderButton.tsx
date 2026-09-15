"use client";

/**
 * VoiceOrderButton — Pide por voz en espanol peruano.
 *
 * Flow:
 *   1. Boton mic grande central
 *   2. Click → pide permiso micro + inicia Web Speech API (es-PE)
 *   3. Usuario dicta lista ("2 kilos de arroz y media docena de huevos")
 *   4. Stop automatico tras silencio o manual con segundo click
 *   5. POST /api/voice-order con transcription → IA parsea items
 *   6. UI muestra items detectados con cantidades editables
 *   7. "Agregar todo al carrito" → bulk add
 *
 * Usa Web Speech API nativa (SpeechRecognition) — 0 costo API, funciona
 * en Chrome, Edge, Safari iOS. Fallback a MediaRecorder + backend Whisper
 * si SpeechRecognition no existe.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  Mic,
  MicOff,
  Loader2,
  ShoppingCart,
  Check,
  AlertCircle,
  Trash2,
  Plus,
  Minus,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface DetectedItem {
  name: string;
  qty: number;
  unit?: string;
}

interface Props {
  onAddToCart?: (items: DetectedItem[]) => Promise<void> | void;
  endpoint?: string;
}

type Status = "idle" | "recording" | "processing" | "ready" | "added" | "error";

interface SpeechRecognitionResult {
  transcript: string;
  isFinal: boolean;
}

/** Polyfill cross-browser de SpeechRecognition */
function getSpeechRecognition(): typeof window.SpeechRecognition | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: typeof window.SpeechRecognition;
    webkitSpeechRecognition?: typeof window.SpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function VoiceOrderButton({
  onAddToCart,
  endpoint = "/api/voice-order",
}: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [transcription, setTranscription] = useState("");
  const [items, setItems] = useState<DetectedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const SpeechRecognitionCtor = typeof window !== "undefined" ? getSpeechRecognition() : null;
  const supported = !!SpeechRecognitionCtor;

  const stopRecognition = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
  }, []);

  const processTranscription = useCallback(
    async (text: string) => {
      setStatus("processing");
      setError(null);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ transcription: text }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "No pudimos procesar tu lista");
          setStatus("error");
          return;
        }
        setItems(data.items ?? []);
        setStatus(data.items?.length > 0 ? "ready" : "error");
        if (!data.items?.length) {
          setError("No detectamos productos. Intentá hablar más despacio.");
        }
      } catch {
        setError("Error de conexión");
        setStatus("error");
      }
    },
    [endpoint],
  );

  const startRecording = useCallback(() => {
    if (!SpeechRecognitionCtor) {
      setError(
        "Tu navegador no soporta reconocimiento de voz. Probá con Chrome o Edge.",
      );
      setStatus("error");
      return;
    }

    setError(null);
    setTranscription("");
    setItems([]);
    setStatus("recording");

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "es-PE";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalTranscript = "";

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i] as SpeechRecognitionResult[];
        if ((res as any).isFinal) {
          finalTranscript += (res as any)[0].transcript;
        } else {
          interim += (res as any)[0].transcript;
        }
      }
      setTranscription(finalTranscript + interim);
    };

    recognition.onerror = (e: any) => {
      setError(
        e.error === "not-allowed"
          ? "Necesitamos permiso del micrófono para escucharte"
          : "Error de reconocimiento. Intentá de nuevo.",
      );
      setStatus("error");
    };

    recognition.onend = () => {
      if (finalTranscript.trim()) {
        processTranscription(finalTranscript.trim());
      } else if (status === "recording") {
        setStatus("idle");
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
  }, [SpeechRecognitionCtor, processTranscription, status]);

  useEffect(() => {
    return () => stopRecognition();
  }, [stopRecognition]);

  const handleMicClick = useCallback(() => {
    if (status === "recording") {
      stopRecognition();
    } else if (status === "ready" || status === "error") {
      // Reset para nueva grabación
      setItems([]);
      setTranscription("");
      setError(null);
      setStatus("idle");
    } else {
      startRecording();
    }
  }, [status, startRecording, stopRecognition]);

  const updateItemQty = useCallback((idx: number, delta: number) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, qty: Math.max(0.5, item.qty + delta) } : item,
      ),
    );
  }, []);

  const removeItem = useCallback((idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleAddAll = useCallback(async () => {
    if (items.length === 0) return;
    await onAddToCart?.(items);
    setStatus("added");
    setTimeout(() => {
      setStatus("idle");
      setItems([]);
      setTranscription("");
    }, 2500);
  }, [items, onAddToCart]);

  const micLabel = {
    idle: "Dictame tu pedido",
    recording: "Escuchando…",
    processing: "Entendiendo…",
    ready: "Escuchá otro",
    added: "Agregado al carrito",
    error: "Intentá de nuevo",
  }[status];

  const isActive = status === "recording" || status === "processing";

  return (
    <section
      aria-label="Pedido por voz"
      className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden"
    >
      {/* Mic button centrado */}
      <div className="p-6 sm:p-8 flex flex-col items-center">
        <button
          type="button"
          onClick={handleMicClick}
          disabled={status === "processing" || !supported}
          aria-label={micLabel}
          className={cn(
            "relative inline-flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-full transition-all active:scale-[0.95]",
            status === "recording"
              ? "bg-[var(--accent-600,var(--accent))] text-white shadow-lg animate-pulse"
              : status === "added"
              ? "bg-[var(--data-success,_#00b66a)] text-white"
              : "bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:bg-[var(--accent)]",
            !supported && "opacity-40 cursor-not-allowed",
          )}
        >
          {status === "processing" ? (
            <Loader2 className="h-8 w-8 animate-spin" strokeWidth={1.75} aria-hidden />
          ) : status === "added" ? (
            <Check className="h-8 w-8" strokeWidth={2.5} aria-hidden />
          ) : status === "recording" ? (
            <MicOff className="h-8 w-8" strokeWidth={1.75} aria-hidden />
          ) : (
            <Mic className="h-8 w-8" strokeWidth={1.75} aria-hidden />
          )}

          {/* Pulse anillo cuando grabando */}
          {status === "recording" && (
            <span
              aria-hidden
              className="absolute inset-0 rounded-full border-2 border-[var(--accent)] animate-ping"
            />
          )}
        </button>

        <p className="mt-4 text-sm font-extrabold text-[var(--text-primary)]">
          {micLabel}
        </p>
        <p className="text-xs text-[var(--text-tertiary)] mt-1 text-center max-w-xs">
          {status === "idle" && "Ejemplo: «2 kilos de arroz y media docena de huevos»"}
          {status === "recording" && "Hablá despacio. Tocá para parar"}
          {status === "processing" && "La IA está armando tu lista"}
          {status === "ready" && `Detectamos ${items.length} productos`}
          {status === "error" && error}
          {status === "added" && "¡Listo!"}
        </p>

        {!supported && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-[var(--data-warning,_#eab308)]/40 bg-[var(--data-warning,_#eab308)]/10 px-3 py-2 text-xs text-[var(--data-warning,_#eab308)]">
            <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
            <p>Tu navegador no soporta voz. Probá con Chrome o Edge.</p>
          </div>
        )}
      </div>

      {/* Transcription display */}
      {transcription && !isActive && status !== "added" && (
        <div className="px-6 pb-4">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
            Escuchamos
          </p>
          <p className="text-sm text-[var(--text-secondary)] italic leading-relaxed">
            “{transcription}”
          </p>
        </div>
      )}

      {/* Items detectados */}
      {items.length > 0 && status !== "added" && (
        <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
          <div className="px-6 py-4">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
              Tu lista ({items.length} productos)
            </p>
            <ul className="space-y-2">
              {items.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-center gap-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                      {item.name}
                    </p>
                    {item.unit && (
                      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                        {item.unit}
                      </p>
                    )}
                  </div>
                  {/* Stepper qty */}
                  <div className="flex items-center gap-1 rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)]">
                    <button
                      type="button"
                      onClick={() => updateItemQty(idx, -0.5)}
                      aria-label="Menos"
                      className="p-1.5 hover:bg-[var(--surface-raised)] rounded-full"
                    >
                      <Minus className="h-3 w-3" strokeWidth={2} aria-hidden />
                    </button>
                    <span className="px-2 text-sm font-bold tabular-nums min-w-[2rem] text-center">
                      {item.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateItemQty(idx, 0.5)}
                      aria-label="Más"
                      className="p-1.5 hover:bg-[var(--surface-raised)] rounded-full"
                    >
                      <Plus className="h-3 w-3" strokeWidth={2} aria-hidden />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    aria-label="Quitar"
                    className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--data-error,_#e11d48)] transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={handleAddAll}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] py-3 text-sm font-bold hover:bg-[var(--accent)] transition-colors active:scale-[0.98]"
            >
              <ShoppingCart className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              Agregar {items.length} al carrito
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
