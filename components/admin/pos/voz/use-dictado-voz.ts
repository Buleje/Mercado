import { useState, useEffect, useCallback, useRef } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { csrfHeaders } from "@/lib/csrf-client";
import { comandoDe, resolverDictado, separarPedidos, type LineaDictada } from "@/lib/pos/voz-parser";
import type { VoiceItem, ClarificationInfo, POSVoiceInputProps } from "@/components/admin/pos/voz/voz-shared";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Estado y reconocimiento del dictado por voz del POS: Web Speech API (es-PE), frases resueltas en vivo
 * contra el catálogo, respaldo con la IA (`/api/pos/voice-interpret`) y el atajo Ctrl+M.
 */
export function useDictadoVoz({ products, onAddToCart, onHighlightProduct }: POSVoiceInputProps) {
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

  const cerrarPanel = useCallback(() => {
    stopListening();
    setShowPanel(false);
    onHighlightProduct?.(null);
  }, [stopListening, onHighlightProduct]);

  const togglePanel = useCallback(() => {
    if (showPanel) {
      cerrarPanel();
    } else {
      startListening();
    }
  }, [showPanel, startListening, cerrarPanel]);

  // Ctrl+M shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === "m" || e.key === "M")) {
        e.preventDefault();
        togglePanel();
      }
      if (e.key === "Escape" && showPanel) {
        cerrarPanel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePanel, showPanel, cerrarPanel]);

  const panelRef = useRef<HTMLDivElement>(null);
  useModalAccesible(panelRef, { onCerrar: cerrarPanel, cerrarConEscape: false, activo: showPanel });

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

  return {
    isSupported, isListening, transcript, interimTranscript, items, clarification, processing, error,
    showPanel, setShowPanel, lineas, setLineas, lineasRef, panelRef,
    startListening, stopListening, cerrarPanel, togglePanel,
    addItem, addAllItems, handleClarificationAnswer, handleQuickPrompt,
  };
}

export type DictadoVoz = ReturnType<typeof useDictadoVoz>;
