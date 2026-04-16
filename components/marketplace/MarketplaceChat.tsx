"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import * as Sentry from "@sentry/nextjs";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

// ---------- tipos ----------

interface ChatMessage {
  id: string;
  storeId: string;
  customerPhone: string;
  senderType: "store" | "customer";
  message: string;
  read: boolean;
  createdAt: string;
}

interface Props {
  storeId: string;
  storeName: string;
  storeLogo?: string | null;
  storePhone?: string | null;
  customerPhone: string;
  customerName?: string;
}

// ---------- helpers ----------

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "ahora";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.floor(hrs / 24)} d`;
}

const POLL_INTERVAL = 5000;

// ---------- componente ----------

export default function MarketplaceChat({
  storeId,
  storeName,
  storeLogo,
  storePhone,
  customerPhone,
  customerName = "Cliente",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasNewMsg, setHasNewMsg] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCountRef = useRef(0);

  // ---------- fetch mensajes ----------

  const fetchMessages = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        storeId,
        customerPhone,
        limit: "50",
      });
      const res = await fetch(`/api/chat/marketplace?${params}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json: { data: ChatMessage[] } = await res.json();
      const msgs = json.data ?? [];

      // detectar nuevo mensaje entrante
      if (lastCountRef.current > 0 && msgs.length > lastCountRef.current) {
        const newest = msgs[msgs.length - 1];
        if (newest.senderType === "store") {
          setHasNewMsg(true);
          if (!isOpen) {
            playSound();
          }
        }
      }
      lastCountRef.current = msgs.length;
      setMessages(msgs);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Error al cargar mensajes");
    }
  }, [storeId, customerPhone, isOpen]);

  // ---------- polling ----------

  useEffect(() => {
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchMessages]);

  // ---------- scroll al abrir o al recibir mensaje ----------

  useEffect(() => {
    if (isOpen) {
      setHasNewMsg(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [isOpen, messages.length]);

  // ---------- sonido ----------

  function playSound() {
    try {
      if (!audioRef.current) {
        // Genera un beep suave usando Web Audio API para no depender de assets externos
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch {
      // Audio API no disponible — silent fail
    }
  }

  // ---------- enviar mensaje ----------

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isSending) return;

    setInput("");
    setIsSending(true);

    // Optimistic UI
    const optimistic: ChatMessage = {
      id: `temp-${Date.now()}`,
      storeId,
      customerPhone,
      senderType: "customer",
      message: text,
      read: false,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await fetch("/api/chat/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          storePhone: storePhone ?? undefined,
          storeName,
          customerPhone,
          customerName,
          message: text,
          senderType: "customer",
        }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      // Refrescar para obtener el id real
      await fetchMessages();
    } catch (err) {
      // Revertir optimistic
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(text);
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsSending(false);
    }
  }, [input, isSending, storeId, storeName, storePhone, customerPhone, customerName, fetchMessages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ---------- render ----------

  return (
    <>
      {/* Burbuja flotante */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        {/* Preview mensaje nuevo */}
        <AnimatePresence>
          {hasNewMsg && !isOpen && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              className="max-w-[220px] rounded-2xl rounded-br-sm bg-white px-4 py-2.5 text-sm shadow-xl dark:bg-gray-800"
            >
              <p className="font-semibold text-blue-700 dark:text-blue-400">{storeName}</p>
              <p className="text-gray-700 dark:text-gray-300 line-clamp-2">
                {messages[messages.length - 1]?.message}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Botón burbuja */}
        <button
          onClick={() => setIsOpen((v) => !v)}
          aria-label={isOpen ? "Cerrar chat" : `Chatear con ${storeName}`}
          className="relative flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
          style={{ background: "linear-gradient(135deg,var(--color-primary),#134e4a)" }}
        >
          <AnimatePresence mode="wait">
            {isOpen ? (
              <motion.svg
                key="close"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.15 }}
                aria-hidden="true"
                className="h-6 w-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </motion.svg>
            ) : (
              <motion.svg
                key="chat"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                transition={{ duration: 0.15 }}
                aria-hidden="true"
                className="h-6 w-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-4 4v-4z" />
              </motion.svg>
            )}
          </AnimatePresence>
          {/* badge nuevo mensaje */}
          <AnimatePresence>
            {hasNewMsg && !isOpen && (
              <motion.span
                key="dot"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute right-0 top-0 h-4 w-4 rounded-full border-2 border-white bg-orange-500"
                aria-label="Tienes mensajes nuevos"
              />
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Ventana de chat */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="chat-window"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-24 right-6 z-50 flex w-[min(360px,_calc(100vw_-_2rem))] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-gray-900"
            style={{ maxHeight: "min(480px, 60vh)" }}
            role="dialog"
            aria-modal="false"
            aria-label={`Chat con ${storeName}`}
          >
            {/* header */}
            <div
              className="flex items-center gap-3 px-4 py-3"
              style={{ background: "linear-gradient(135deg,var(--color-primary),#134e4a)" }}
            >
              {/* avatar tienda */}
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/30 bg-white/10">
                {storeLogo ? (
                  <Image
                    src={storeLogo}
                    alt={storeName}
                    width={36}
                    height={36}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-black text-white">
                    {storeName.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">{storeName}</p>
                <p className="text-xs text-white/70">Chat en tiempo real</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Cerrar chat"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* mensajes */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {loadError && (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-center text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
                  {loadError}
                </p>
              )}
              {messages.length === 0 && !loadError && (
                <div className="flex h-full flex-col items-center justify-center py-8 text-center">
                  <svg aria-hidden="true" className="h-10 w-10 text-gray-300 dark:text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-4 4v-4z" />
                  </svg>
                  <p className="mt-2 text-xs text-gray-400 dark:text-gray-600">
                    Escribe tu primera pregunta a {storeName}
                  </p>
                </div>
              )}
              {messages.map((msg) => {
                const isCustomer = msg.senderType === "customer";
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                        isCustomer
                          ? "rounded-br-sm bg-blue-700 text-white"
                          : "rounded-bl-sm bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-white"
                      }`}
                    >
                      <p className="leading-snug">{msg.message}</p>
                      <p
                        className={`mt-0.5 text-right text-[10px] ${
                          isCustomer ? "text-white/60" : "text-gray-400 dark:text-gray-500"
                        }`}
                      >
                        {relativeTime(msg.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* input */}
            <div className="border-t border-gray-200 px-3 py-2 dark:border-gray-800">
              <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Escribe un mensaje…"
                  maxLength={500}
                  aria-label="Escribe un mensaje"
                  className="min-h-[36px] flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none dark:text-white dark:placeholder-gray-500"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isSending}
                  aria-label="Enviar mensaje"
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white transition-all hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSending ? (
                    <svg aria-hidden="true" className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
