"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { LoadingState } from "@buleje/design-system";
import { Mic, MicOff, Volume2, X, CheckCircle, AlertCircle, ShieldAlert } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Speech Recognition shim types ────────────────────────────────────────────
// Uses global types declared in types/speech-recognition.d.ts

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

type VoiceState = "idle" | "listening" | "processing" | "success" | "error" | "blocked";

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

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const SpeechRec = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setSupported(!!SpeechRec);

    // Chequeo proactivo del estado de permiso. Si el navegador ya negó el
    // permiso de micrófono en una sesión anterior, marcamos "blocked" para
    // mostrar la UI de instrucciones de inmediato (en vez de fallar al
    // hacer click). navigator.permissions no está en todos los navegadores
    // viejos — si falla, queda en idle hasta que el usuario intente.
    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      navigator.permissions.query({ name: "microphone" as PermissionName })
        .then((status) => {
          if (status.state === "denied") {
            setVoiceState("blocked");
            setStatusMsg("Microfono bloqueado por el navegador");
          }
          // Re-evalua si cambia (usuario desbloquea desde el icono de URL)
          status.onchange = () => {
            if (status.state === "granted") {
              setVoiceState("idle");
              setStatusMsg("");
            } else if (status.state === "denied") {
              setVoiceState("blocked");
              setStatusMsg("Microfono bloqueado por el navegador");
            }
          };
        })
        // Permissions API es opcional; si falla queda idle hasta que el usuario
        // intente y getUserMedia maneja el error real. Log solo para diagnóstico.
        .catch((err) => {
          if (typeof console !== "undefined") {
            console.debug("[VoiceCommandPOS] Permissions.query mic fallback", err);
          }
        });
    }
  }, []);

  /**
   * Solicita permiso explícito de micrófono ANTES de iniciar SpeechRecognition.
   * Por qué: SpeechRecognition pide permiso pero el navegador puede silenciar
   * el prompt si fue denegado previamente, dejando al usuario sin saber qué
   * pasó. getUserMedia dispara el prompt nativo de Chrome de manera visible.
   * Soltamos el stream de inmediato (no usamos el audio crudo — recognition
   * lo captura internamente).
   */
  const requestMicPermission = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      // Sin API de mediaDevices intentamos directamente con recognition
      return true;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch (err) {
      const name = (err as { name?: string })?.name ?? "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setVoiceState("blocked");
        setStatusMsg("Microfono bloqueado por el navegador");
        return false;
      }
      if (name === "NotFoundError" || name === "OverconstrainedError") {
        setVoiceState("error");
        setStatusMsg("No se detecto microfono en este equipo");
        setTimeout(() => setVoiceState("idle"), 3500);
        return false;
      }
      setVoiceState("error");
      setStatusMsg("No se pudo acceder al microfono");
      setTimeout(() => setVoiceState("idle"), 3500);
      return false;
    }
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

  const startListening = useCallback(async () => {
    if (!supported) return;

    const SpeechRec = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRec) return;

    // Permiso explícito primero — si está bloqueado, dejamos la UI en
    // "blocked" con instrucciones (no intentamos arrancar recognition).
    const allowed = await requestMicPermission();
    if (!allowed) return;

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

    recognition.onresult = (event: SpeechRecognitionEvent) => {
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

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const errKind = event?.error ?? "";
      if (errKind === "not-allowed" || errKind === "service-not-allowed") {
        setVoiceState("blocked");
        setStatusMsg("Microfono bloqueado por el navegador");
        return;
      }
      if (errKind === "no-speech") {
        setVoiceState("error");
        setStatusMsg("No escuche nada — intenta de nuevo");
        setTimeout(() => setVoiceState("idle"), 2500);
        return;
      }
      if (errKind === "audio-capture") {
        setVoiceState("error");
        setStatusMsg("No se detecto microfono en este equipo");
        setTimeout(() => setVoiceState("idle"), 3500);
        return;
      }
      if (errKind === "network") {
        setVoiceState("error");
        setStatusMsg("Sin internet — el reconocimiento de voz requiere conexion");
        setTimeout(() => setVoiceState("idle"), 3500);
        return;
      }
      setVoiceState("error");
      setStatusMsg("Error de microfono");
      setTimeout(() => setVoiceState("idle"), 2500);
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
  }, [supported, stopListening, handleCommand, voiceState, requestMicPermission]);

  useEffect(() => () => stopListening(), [stopListening]);

  if (supported === false) {
    return (
      <div className={cn("flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--surface-sunken)] text-sm text-[var(--text-tertiary)]", className)}>
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
            : voiceState === "blocked"
            ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/10 border-[var(--data-warning-500)]/40 text-[var(--data-warning-500)]"
            : "bg-[var(--surface-raised)] border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:border-primary"
        )}
        aria-label={voiceState === "blocked" ? "Microfono bloqueado — abrir instrucciones" : "Venta por voz"}
        title={voiceState === "blocked" ? "Microfono bloqueado — click para ver como desbloquear" : undefined}
      >
        {voiceState === "blocked" ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        <span className="hidden sm:inline">{voiceState === "blocked" ? "Voz bloqueada" : "Voz"}</span>
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-canvas)]/50">
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Venta por voz</span>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-tertiary)]">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 space-y-4">
            {/* Blocked instructions — solo se muestra si el navegador denegó
                el permiso. Es el aviso que Brandon estaba viendo: ahora con
                pasos claros para desbloquearlo en Chrome. */}
            {voiceState === "blocked" && (
              <div className="rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/10 p-3">
                <div className="flex items-start gap-2 mb-2">
                  <ShieldAlert className="h-5 w-5 text-[var(--data-warning-500)] shrink-0 mt-0.5" strokeWidth={2} />
                  <div>
                    <p className="text-sm font-bold text-[var(--data-warning-500)]">Microfono bloqueado</p>
                    <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-0.5">
                      Tu navegador no esta dejando que la pagina use el microfono.
                    </p>
                  </div>
                </div>
                <ol className="text-xs text-[var(--text-secondary)] dark:text-muted space-y-1.5 ml-1 list-decimal list-inside">
                  <li>Click en el <strong>icono de candado</strong> (o tune) a la izquierda de la URL</li>
                  <li>Buscar <strong>Microfono</strong> y cambiar a <strong>Permitir</strong></li>
                  <li>Recargar la pagina (F5 o Ctrl+R)</li>
                </ol>
                <button
                  type="button"
                  onClick={() => { void requestMicPermission(); }}
                  className="mt-3 w-full py-2 rounded-lg text-xs font-bold text-white bg-[var(--data-warning-500)] hover:opacity-90 transition-opacity"
                >
                  Reintentar permiso
                </button>
              </div>
            )}

            {/* Mic button */}
            <div className={cn("flex flex-col items-center gap-3", voiceState === "blocked" && "opacity-40 pointer-events-none")}>
              <button
                type="button"
                onClick={voiceState === "listening" ? stopListening : startListening}
                disabled={voiceState === "processing"}
                className={cn(
                  "w-20 h-20 rounded-full flex items-center justify-center transition-all focus:outline-none focus:ring-4",
                  voiceState === "listening"
                    ? "bg-primary text-white animate-pulse focus:ring-primary/30"
                    : voiceState === "processing"
                    ? "bg-[var(--data-warning-500)] text-white cursor-not-allowed"
                    : voiceState === "success"
                    ? "bg-[var(--accent-soft)] text-white focus:ring-[var(--data-success-500)]/40"
                    : voiceState === "error"
                    ? "bg-[var(--data-error-500)] text-white focus:ring-[var(--data-error-500)]"
                    : "bg-primary/10 text-primary hover:bg-primary hover:text-white focus:ring-primary/30"
                )}
                aria-label={voiceState === "listening" ? "Detener" : "Hablar"}
              >
                {voiceState === "processing" ? (
                  <LoadingState variant="inline" size="md" />
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
                <p className="text-xs font-medium text-[var(--text-secondary)] dark:text-muted">
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
              <div className="px-3 py-2 rounded-xl bg-[var(--surface-canvas)]/50 border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted mb-0.5">Escuche:</p>
                <p className="text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] italic">&ldquo;{transcript}&rdquo;</p>
              </div>
            )}

            {/* Last action */}
            {lastAction && voiceState === "success" && (
              <div className="px-3 py-2 rounded-xl bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
                <p className="text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-medium">{lastAction}</p>
              </div>
            )}

            {/* Commands hint */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">Ejemplos de comandos</p>
              {[
                '"2 kilos de arroz"',
                '"agregar aceite"',
                '"3 unidades de leche"',
                '"cobrar" o "total"',
              ].map((ex) => (
                <div key={ex} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" />
                  <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{ex}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
