"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Volume2, X, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Speech Recognition shim types ────────────────────────────────────────────

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionResultEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}

interface WindowWithSpeech extends Window {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
  id: number;
  name: string;
  price: number;
  unit?: string;
  stock?: number;
}

interface VoiceCommandPOSProps {
  onAddProduct: (product: Product, qty: number) => void;
  onCheckout: () => void;
  className?: string;
}

type VoiceState = "idle" | "listening" | "processing" | "success" | "error";

interface ParsedCommand {
  type: "add" | "checkout" | "unknown";
  query?: string;
  quantity?: number;
  raw: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const NUM_WORDS: Record<string, number> = {
  un: 1, uno: 1, una: 1,
  dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50,
};

function parseCommand(text: string): ParsedCommand {
  const lower = text.toLowerCase().trim();

  // Checkout triggers
  if (/\b(cobrar|total|pagar|cerrar|terminar|listo|finalizar)\b/.test(lower)) {
    return { type: "checkout", raw: text };
  }

  // Patterns: "2 kilos de arroz", "dos unidades de aceite", "agregar arroz", "añadir 3 leches"
  const patterns = [
    // "N kilos/unidades/bolsas de PRODUCT"
    /(\d+(?:\.\d+)?|[a-z]+)\s+(?:kilos?|kg|gramos?|gr|unidades?|litros?|bolsas?|cajas?|paquetes?|und|lt)\s+(?:de\s+)?(.+)/,
    // "agregar/añadir N PRODUCT"
    /(?:agregar?|añadir?|poner|pon|dame|quiero|agrega)\s+(\d+(?:\.\d+)?|[a-z]+)\s+(.+)/,
    // "N PRODUCT"
    /^(\d+(?:\.\d+)?|[a-z]+)\s+(?:de\s+)?(.+)/,
    // "agregar PRODUCT" (qty=1)
    /(?:agregar?|añadir?|poner|pon|dame|quiero|agrega)\s+(.+)/,
  ];

  for (let i = 0; i < patterns.length; i++) {
    const match = lower.match(patterns[i]);
    if (!match) continue;

    if (i < 3) {
      const rawQty = match[1];
      const query = match[2].trim().replace(/\.$/, "");
      let quantity = parseFloat(rawQty);
      if (isNaN(quantity)) quantity = NUM_WORDS[rawQty] ?? 1;
      return { type: "add", query, quantity, raw: text };
    } else {
      // Only product name, qty=1
      const query = match[1].trim().replace(/\.$/, "");
      return { type: "add", query, quantity: 1, raw: text };
    }
  }

  return { type: "unknown", raw: text };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function VoiceCommandPOS({ onAddProduct, onCheckout, className }: VoiceCommandPOSProps) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [lastAction, setLastAction] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const w = window as WindowWithSpeech;
    const SpeechRec = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    setSupported(!!SpeechRec);
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleCommand = useCallback(
    async (cmd: ParsedCommand) => {
      if (cmd.type === "checkout") {
        setVoiceState("success");
        setStatusMsg("Procesando cobro...");
        setLastAction("Total solicitado");
        onCheckout();
        setTimeout(() => setVoiceState("idle"), 2000);
        return;
      }

      if (cmd.type === "add" && cmd.query) {
        setVoiceState("processing");
        setStatusMsg(`Buscando "${cmd.query}"...`);
        try {
          const res = await fetch(`/api/products?search=${encodeURIComponent(cmd.query)}&limit=1`);
          if (!res.ok) throw new Error("Sin respuesta");
          const data = await res.json();
          const products: Product[] = Array.isArray(data) ? data : (data.products ?? data.data ?? []);
          const product = products[0];
          if (!product) {
            setVoiceState("error");
            setStatusMsg(`No encontre "${cmd.query}"`);
            setTimeout(() => setVoiceState("idle"), 2500);
            return;
          }
          onAddProduct(product, cmd.quantity ?? 1);
          setVoiceState("success");
          setStatusMsg("Agregado al carrito");
          setLastAction(`${cmd.quantity ?? 1} x ${product.name}`);
          setTimeout(() => setVoiceState("idle"), 2000);
        } catch {
          setVoiceState("error");
          setStatusMsg("Error al buscar producto");
          setTimeout(() => setVoiceState("idle"), 2500);
        }
        return;
      }

      setVoiceState("error");
      setStatusMsg("No entendi el comando");
      setTimeout(() => setVoiceState("idle"), 2000);
    },
    [onAddProduct, onCheckout]
  );

  const startListening = useCallback(() => {
    if (!supported) return;

    const w = window as WindowWithSpeech;
    const SpeechRec = w.SpeechRecognition ?? w.webkitSpeechRecognition;

    if (!SpeechRec) return;

    stopListening();

    const recognition = new SpeechRec();
    recognition.lang = "es-PE";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setVoiceState("listening");
      setTranscript("");
      setStatusMsg("Escuchando...");
    };

    recognition.onresult = (event: SpeechRecognitionResultEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      setTranscript(final || interim);
      if (final) {
        stopListening();
        const cmd = parseCommand(final);
        handleCommand(cmd);
      }
    };

    recognition.onerror = () => {
      setVoiceState("error");
      setStatusMsg("Error de micrófono");
      setTimeout(() => setVoiceState("idle"), 2000);
    };

    recognition.onend = () => {
      if (voiceState === "listening") {
        setVoiceState("idle");
      }
    };

    recognition.start();

    // Auto-stop after 8 seconds
    timeoutRef.current = setTimeout(() => {
      stopListening();
      if (voiceState === "listening") {
        setVoiceState("idle");
        setStatusMsg("Tiempo agotado");
      }
    }, 8000);
  }, [supported, stopListening, handleCommand, voiceState]);

  useEffect(() => () => stopListening(), [stopListening]);

  if (supported === false) {
    return (
      <div className={cn("flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm text-gray-500 dark:text-gray-400", className)}>
        <MicOff className="h-4 w-4 shrink-0" />
        <span>Tu navegador no soporta voz</span>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all",
          "border focus:outline-none focus:ring-2 focus:ring-primary/40",
          voiceState === "listening"
            ? "bg-primary text-white border-primary animate-pulse"
            : "bg-white dark:bg-card border-gray-200 dark:border-card-border text-gray-700 dark:text-foreground hover:border-primary"
        )}
        aria-label="Venta por voz"
      >
        <Mic className="h-4 w-4" />
        <span className="hidden sm:inline">Voz</span>
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-card-border bg-gray-50 dark:bg-gray-900/50">
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-gray-900 dark:text-foreground">Venta por voz</span>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 space-y-4">
            {/* Mic button */}
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={voiceState === "listening" ? stopListening : startListening}
                disabled={voiceState === "processing"}
                className={cn(
                  "w-20 h-20 rounded-full flex items-center justify-center transition-all focus:outline-none focus:ring-4",
                  voiceState === "listening"
                    ? "bg-primary text-white shadow-lg shadow-primary/40 animate-pulse focus:ring-primary/30"
                    : voiceState === "processing"
                    ? "bg-amber-400 text-white cursor-not-allowed"
                    : voiceState === "success"
                    ? "bg-emerald-500 text-white focus:ring-emerald-300"
                    : voiceState === "error"
                    ? "bg-red-500 text-white focus:ring-red-300"
                    : "bg-primary/10 text-primary hover:bg-primary hover:text-white focus:ring-primary/30"
                )}
                aria-label={voiceState === "listening" ? "Detener" : "Hablar"}
              >
                {voiceState === "processing" ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : voiceState === "success" ? (
                  <CheckCircle className="h-8 w-8" />
                ) : voiceState === "error" ? (
                  <AlertCircle className="h-8 w-8" />
                ) : voiceState === "listening" ? (
                  <MicOff className="h-8 w-8" />
                ) : (
                  <Mic className="h-8 w-8" />
                )}
              </button>

              <div className="text-center">
                <p className="text-xs font-medium text-gray-500 dark:text-muted">
                  {statusMsg || (voiceState === "idle" ? "Presiona para hablar" : "")}
                </p>
                {voiceState === "listening" && (
                  <div className="flex gap-1 mt-2 justify-center">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="w-1 bg-primary rounded-full animate-bounce"
                        style={{ height: `${8 + (i % 3) * 6}px`, animationDelay: `${i * 100}ms` }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Transcript */}
            {transcript && (
              <div className="px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-card-border">
                <p className="text-xs text-gray-500 dark:text-muted mb-0.5">Escuche:</p>
                <p className="text-sm text-gray-800 dark:text-foreground italic">&ldquo;{transcript}&rdquo;</p>
              </div>
            )}

            {/* Last action */}
            {lastAction && voiceState === "success" && (
              <div className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{lastAction}</p>
              </div>
            )}

            {/* Commands hint */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase tracking-wide">Ejemplos de comandos</p>
              {[
                '"2 kilos de arroz"',
                '"agregar aceite"',
                '"3 unidades de leche"',
                '"cobrar" o "total"',
              ].map((ex) => (
                <div key={ex} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" />
                  <p className="text-xs text-gray-500 dark:text-muted">{ex}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
