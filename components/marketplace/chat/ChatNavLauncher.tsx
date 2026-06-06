"use client";

/**
 * ChatNavLauncher — chat del marketplace estilo Facebook Messenger.
 *
 * v2 (Brandon 2026-06-06):
 *   - Sistema D2 (threads) — el mismo que lee la tienda en su ChatTab
 *   - Ícono propio (doble burbuja con rayo, gradiente accent)
 *   - Toast estilo FB cuando llega un mensaje (clic → abre esa conversación)
 *   - Badge en título de pestaña + vibración mobile (en el hook)
 *   - Evento global `buleje:open-chat` — cualquier botón "Mensaje" del
 *     storefront abre el panel directo en la conversación con esa tienda
 *   - ✓✓ de leído en la conversación (ChatConversationView)
 *
 * Sin sesión: el click abre el AuthModal (mismo login del navbar).
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { X, Store as StoreIcon, ChevronRight, Loader2, MessageCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { AuthModal, useAuthModal } from "@/components/auth/AuthModal";
import {
  useMarketplaceChats,
  type ChatConversation,
  type ChatIncomingDetail,
} from "./use-marketplace-chats";
import ChatConversationView from "./ChatConversationView";

interface StoreLite {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
}

/** Detail del evento global `buleje:open-chat`. */
export interface OpenChatDetail {
  storeId: string;
  storeName: string;
  storeSlug: string | null;
  storeLogo?: string | null;
}

/** "ahora" · "5 min" · "2 h" · "3 d" — corto, estilo Messenger. */
function shortAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

/** Ícono propio del chat — doble burbuja superpuesta estilo Messenger.
 *  La burbuja trasera hereda el color del texto; la delantera lleva
 *  gradiente accent con un rayo (respuesta "en vivo"). */
function ChatGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="bsm-chat-grad" x1="4" y1="8" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--data-success-500, var(--accent))" />
        </linearGradient>
      </defs>
      {/* Burbuja trasera (contorno) */}
      <path
        d="M8.5 3.5h7A4.5 4.5 0 0 1 20 8v3a4.5 4.5 0 0 1-4.5 4.5H14l-2.4 2.2a.6.6 0 0 1-1-.44V15.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
      />
      {/* Burbuja delantera (rellena con gradiente) */}
      <path
        d="M4 12.25A3.75 3.75 0 0 1 7.75 8.5h4.5A3.75 3.75 0 0 1 16 12.25v.5a3.75 3.75 0 0 1-3.75 3.75h-1.4l-2.8 2.6a.6.6 0 0 1-1-.44V16.2A3.75 3.75 0 0 1 4 12.75v-.5Z"
        fill="url(#bsm-chat-grad)"
      />
      {/* Rayo "en vivo" */}
      <path
        d="m10.6 10.4-1.8 2.3h1.4l-.7 1.9 1.9-2.3h-1.4l.6-1.9Z"
        fill="white"
        stroke="white"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ChatNavLauncher({
  variant = "default",
}: {
  /** "default": círculo con borde (desktop) · "bare": h-9 sin borde (fila mobile del nav) */
  variant?: "default" | "bare";
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<ChatConversation | null>(null);
  const [allStores, setAllStores] = useState<StoreLite[] | null>(null);
  const [toast, setToast] = useState<ChatIncomingDetail | null>(null);
  // ── Chat heads estilo Facebook (Brandon 2026-06-06 v3) ──────────────
  // Burbuja con el logo del negocio cuando ESTE te escribe; click → ventana
  // de chat FLOTANTE anclada abajo-derecha (desktop). En mobile abre el
  // bottom-sheet (las ventanas flotantes no caben).
  const [floating, setFloating] = useState<ChatConversation | null>(null);
  // Conversaciones MINIMIZADAS (Brandon 2026-06-06 v4): cerrar la ventana
  // flotante NO la mata — vuelve a globo aunque no tenga no-leídos. Solo la
  // X del hover lo quita de verdad.
  const [minimized, setMinimized] = useState<ChatConversation[]>([]);
  const [dismissedHeads, setDismissedHeads] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = sessionStorage.getItem("bsm-chat-heads-dismissed");
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch { return new Set(); }
  });
  const { authModalOpen, openAuthModal, closeAuthModal } = useAuthModal();

  const dismissHead = (threadId: string) => {
    setDismissedHeads((prev) => {
      const next = new Set(prev).add(threadId);
      try { sessionStorage.setItem("bsm-chat-heads-dismissed", JSON.stringify([...next])); } catch { /* noop */ }
      return next;
    });
    setMinimized((prev) => prev.filter((c) => c.threadId !== threadId));
  };

  /** Cerrar la ventana flotante = minimizar al globo (estilo FB). */
  const minimizeFloating = () => {
    if (floating?.threadId) {
      const conv = floating;
      setMinimized((prev) =>
        prev.some((c) => c.threadId === conv.threadId) ? prev : [conv, ...prev].slice(0, 4),
      );
      // Si estaba descartado antes, revivirlo (el usuario lo re-abrió a propósito)
      setDismissedHeads((prev) => {
        if (!conv.threadId || !prev.has(conv.threadId)) return prev;
        const next = new Set(prev);
        next.delete(conv.threadId);
        try { sessionStorage.setItem("bsm-chat-heads-dismissed", JSON.stringify([...next])); } catch { /* noop */ }
        return next;
      });
    }
    setFloating(null);
  };

  const { customer, conversations, unreadTotal, loading, refresh, markRead } =
    useMarketplaceChats(open);

  // Tiendas publicadas para "iniciar chat" (lazy: solo al abrir el panel).
  useEffect(() => {
    if (!open || allStores !== null) return;
    fetch("/api/marketplace/stores?limit=20")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => {
        const list = (j.data ?? []) as Array<Record<string, unknown>>;
        setAllStores(
          list.map((s) => ({
            id: String(s.id),
            slug: String(s.slug),
            name: String(s.name),
            logo: (s.logo as string | null) ?? null,
          })),
        );
      })
      .catch(() => setAllStores([]));
  }, [open, allStores]);

  // Cerrar con Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (active) setActive(null);
        else setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, active]);

  // ── Evento global "buleje:open-chat" — botón "Mensaje" del storefront ──
  // Solo el launcher "default" (desktop) responde para no abrir 2 paneles
  // (el bare del nav mobile coexiste en el mismo DOM).
  useEffect(() => {
    if (variant !== "default") return;
    const handler = (e: Event) => {
      const d = (e as CustomEvent<OpenChatDetail>).detail;
      if (!d?.storeId) return;
      if (!customer) {
        openAuthModal();
        return;
      }
      const existing = conversations.find((c) => c.storeId === d.storeId);
      const conv: ChatConversation = existing ?? {
        threadId: null,
        storeId: d.storeId,
        storeName: d.storeName,
        storeSlug: d.storeSlug,
        storeLogo: d.storeLogo ?? null,
        lastMessage: "",
        lastSenderType: "customer",
        lastAt: new Date().toISOString(),
        unreadCount: 0,
      };
      // Desktop: ventana flotante estilo FB · mobile: bottom-sheet
      openFloating(conv);
    };
    window.addEventListener("buleje:open-chat", handler);
    return () => window.removeEventListener("buleje:open-chat", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, customer, conversations, markRead, openAuthModal]);

  // ── Toast de mensaje entrante (estilo FB) — solo si el panel está cerrado ──
  useEffect(() => {
    if (variant !== "default") return;
    const handler = (e: Event) => {
      const d = (e as CustomEvent<ChatIncomingDetail>).detail;
      if (!d || open) return;
      setToast(d);
    };
    window.addEventListener("buleje:chat-incoming", handler);
    return () => window.removeEventListener("buleje:chat-incoming", handler);
  }, [variant, open]);

  // Auto-dismiss del toast a los 6s.
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const handleToggle = () => {
    if (!customer) {
      openAuthModal();
      return;
    }
    setOpen((o) => !o);
    setActive(null);
  };

  const openConversation = (conv: ChatConversation) => {
    setActive(conv);
    if (conv.threadId && conv.unreadCount > 0) markRead(conv.threadId);
  };

  /** Abre un chat como ventana FLOTANTE (desktop) o panel (mobile). */
  const openFloating = (conv: ChatConversation) => {
    if (conv.threadId && conv.unreadCount > 0) markRead(conv.threadId);
    // El globo deja de estar minimizado mientras la ventana está abierta.
    setMinimized((prev) => prev.filter((c) => c.threadId !== conv.threadId));
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      setActive(conv);
      setOpen(true);
      return;
    }
    setOpen(false);
    setFloating(conv);
  };

  // Heads visibles: AUTO (el negocio te escribió, unread > 0) ∪ MINIMIZADAS
  // (cerraste la ventana → el globo queda). Dedupe por thread, máx 4.
  const autoHeads =
    variant === "default" && customer && !open
      ? conversations.filter(
          (c) =>
            c.threadId &&
            c.unreadCount > 0 &&
            !dismissedHeads.has(c.threadId) &&
            floating?.threadId !== c.threadId,
        )
      : [];
  const minimizedHeads =
    variant === "default" && customer && !open
      ? minimized
          .filter(
            (m) =>
              m.threadId &&
              !dismissedHeads.has(m.threadId) &&
              floating?.threadId !== m.threadId &&
              !autoHeads.some((a) => a.threadId === m.threadId),
          )
          // Refresca datos (unread/último msj) desde la bandeja si existe
          .map((m) => conversations.find((c) => c.threadId === m.threadId) ?? m)
      : [];
  const heads = [...autoHeads, ...minimizedHeads].slice(0, 4);

  // Tiendas sin conversación aún (para "Iniciar chat").
  const knownIds = new Set(conversations.map((c) => c.storeId));
  const newChatStores = (allStores ?? []).filter((s) => !knownIds.has(s.id)).slice(0, 8);

  return (
    <>
      {/* ── Botón nav — ícono propio + badge ── */}
      <button
        type="button"
        onClick={handleToggle}
        aria-label={`Chats con tiendas${unreadTotal > 0 ? ` — ${unreadTotal} sin leer` : ""}`}
        aria-expanded={open}
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center rounded-full text-[var(--text-primary)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent)]",
          variant === "bare"
            ? "h-9 w-9 hover:bg-[var(--surface-sunken)] active:scale-95"
            : "h-11 w-11 border border-[var(--rule-soft)] bg-[var(--surface-raised)] shadow-sm hover:border-[var(--accent)]",
        )}
      >
        <ChatGlyph className={variant === "bare" ? "h-5.5 w-5.5" : "h-6 w-6"} />
        {unreadTotal > 0 && (
          <span
            className={cn(
              "absolute inline-flex items-center justify-center rounded-full bg-[var(--data-error-500)] px-1 font-black tabular-nums text-white",
              variant === "bare"
                ? "top-0.5 right-0.5 h-[16px] min-w-[16px] text-[10px] leading-none ring-2 ring-[var(--surface-raised)]"
                : "-top-1 -right-1 h-5 min-w-[1.25rem] text-[length:var(--ts-2xs)] ring-2 ring-[var(--surface-canvas)]",
            )}
          >
            {unreadTotal > 99 ? "99+" : unreadTotal}
          </span>
        )}
      </button>

      {/* ── Toast de mensaje entrante (estilo FB, abajo a la derecha) ── */}
      {variant === "default" && toast && typeof document !== "undefined" &&
        createPortal(
          <button
            type="button"
            onClick={() => {
              const conv = conversations.find((c) => c.threadId === toast.threadId);
              setToast(null);
              if (!customer) return;
              // Desktop: ventana flotante estilo FB; mobile: panel.
              if (conv) openFloating(conv);
              else setOpen(true);
            }}
            aria-label={`Mensaje nuevo de ${toast.storeName} — abrir chat`}
            className="fixed bottom-6 right-4 z-[95] flex w-[320px] max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border-2 border-[var(--accent)]/30 bg-[var(--surface-raised)] p-3 text-left shadow-2xl shadow-black/20 transition-all hover:border-[var(--accent)] hover:-translate-y-0.5 motion-safe:animate-[slideUp_0.25s_ease-out]"
          >
            <span className="relative inline-flex h-11 w-11 shrink-0 overflow-hidden rounded-full border border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
              {toast.storeLogo ? (
                <Image src={toast.storeLogo} alt="" fill sizes="44px" className="object-cover" />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-[var(--accent)]">
                  <StoreIcon className="h-5 w-5" strokeWidth={2} aria-hidden />
                </span>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] ring-2 ring-[var(--surface-raised)]">
                <MessageCircle className="h-2.5 w-2.5 text-white" strokeWidth={3} aria-hidden />
              </span>
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-extrabold text-[var(--text-primary)]">
                {toast.storeName}
              </span>
              <span className="mt-0.5 block truncate text-sm font-medium text-[var(--text-secondary)]">
                {toast.preview}
              </span>
            </span>
            <span
              role="button"
              tabIndex={0}
              aria-label="Descartar"
              onClick={(e) => { e.stopPropagation(); setToast(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setToast(null); } }}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            </span>
          </button>,
          document.body,
        )}

      {/* ── Panel Messenger ── */}
      {open && customer && typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label="Chats con tiendas">
            {/* Backdrop — en desktop es transparente (dropdown), en mobile oscurece */}
            <button
              type="button"
              aria-label="Cerrar chats"
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-[var(--text-primary)]/45 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-none"
            />

            <div
              className={cn(
                "absolute flex flex-col overflow-hidden bg-[var(--surface-canvas)] shadow-2xl shadow-black/25",
                // Mobile: bottom sheet alto
                "inset-x-0 bottom-0 h-[82vh] rounded-t-3xl",
                "motion-safe:animate-[slideUp_0.25s_cubic-bezier(0.32,0.72,0,1)]",
                // Desktop: dropdown anclado arriba a la derecha (como FB)
                "sm:inset-auto sm:right-4 sm:top-16 sm:h-[560px] sm:max-h-[78vh] sm:w-[380px] sm:rounded-2xl sm:border sm:border-[var(--rule-base)]",
                "sm:motion-safe:animate-[fadeIn_0.15s_ease-out]",
              )}
            >
              {active && customer.phone ? (
                <ChatConversationView
                  threadId={active.threadId}
                  storeId={active.storeId}
                  storeName={active.storeName}
                  storeSlug={active.storeSlug}
                  storeLogo={active.storeLogo}
                  customerPhone={customer.phone}
                  customerName={customer.name ?? "Cliente"}
                  onBack={() => { setActive(null); void refresh(); }}
                  onActivity={() => { if (active.threadId) markRead(active.threadId); }}
                  onThreadCreated={(tid) => {
                    setActive((prev) => (prev ? { ...prev, threadId: tid } : prev));
                    void refresh();
                  }}
                />
              ) : (
                <>
                  {/* Header bandeja */}
                  <div className="flex shrink-0 items-center justify-between border-b border-[var(--rule-soft)] bg-[var(--surface-raised)] px-4 py-3">
                    <h2 className="text-lg font-black tracking-tight text-[var(--text-primary)]">
                      Chats
                      {unreadTotal > 0 && (
                        <span className="ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--data-error-500)] px-1.5 align-middle text-[length:var(--ts-2xs)] font-black tabular-nums text-white">
                          {unreadTotal}
                        </span>
                      )}
                    </h2>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      aria-label="Cerrar"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] active:scale-95"
                    >
                      <X className="h-4.5 w-4.5" strokeWidth={2.5} aria-hidden />
                    </button>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto">
                    {/* Conversaciones */}
                    {loading && conversations.length === 0 ? (
                      <div className="flex items-center justify-center gap-2 py-10 text-sm font-bold text-[var(--text-tertiary)]">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Cargando chats…
                      </div>
                    ) : conversations.length > 0 ? (
                      <ul className="px-2 py-2">
                        {conversations.map((c) => (
                          <li key={c.threadId ?? c.storeId}>
                            <button
                              type="button"
                              onClick={() => openConversation(c)}
                              className="group flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors hover:bg-[var(--surface-sunken)]"
                            >
                              <span className="relative inline-flex h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
                                {c.storeLogo ? (
                                  <Image src={c.storeLogo} alt="" fill sizes="48px" className="object-cover" />
                                ) : (
                                  <span className="absolute inset-0 flex items-center justify-center text-[var(--accent)]">
                                    <StoreIcon className="h-5 w-5" strokeWidth={2} aria-hidden />
                                  </span>
                                )}
                              </span>
                              <span className="min-w-0 flex-1 leading-tight">
                                <span className="flex items-baseline justify-between gap-2">
                                  <span className={cn(
                                    "truncate text-sm text-[var(--text-primary)]",
                                    c.unreadCount > 0 ? "font-black" : "font-bold",
                                  )}>
                                    {c.storeName}
                                  </span>
                                  <span className="shrink-0 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] tabular-nums">
                                    {shortAgo(c.lastAt)}
                                  </span>
                                </span>
                                <span className={cn(
                                  "mt-0.5 block truncate text-sm",
                                  c.unreadCount > 0
                                    ? "font-bold text-[var(--text-primary)]"
                                    : "font-medium text-[var(--text-tertiary)]",
                                )}>
                                  {c.lastSenderType === "customer" ? "Tú: " : ""}
                                  {c.lastMessage}
                                </span>
                              </span>
                              {c.unreadCount > 0 && (
                                <span className="inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[length:var(--ts-2xs)] font-black tabular-nums text-white">
                                  {c.unreadCount}
                                </span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="px-5 py-8 text-center">
                        <span className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                          <ChatGlyph className="h-8 w-8" />
                        </span>
                        <p className="text-sm font-extrabold text-[var(--text-primary)]">
                          Hablá directo con las tiendas
                        </p>
                        <p className="mt-1 text-sm font-medium text-[var(--text-tertiary)]">
                          Preguntá precios, pedí recomendaciones o seguí tu pedido en vivo.
                        </p>
                      </div>
                    )}

                    {/* Iniciar chat con tiendas nuevas */}
                    {newChatStores.length > 0 && (
                      <div className="border-t border-[var(--rule-soft)] px-4 pb-4 pt-3">
                        <p className="mb-2 text-[length:var(--ts-2xs)] font-black uppercase tracking-wider text-[var(--text-tertiary)]">
                          Iniciar chat
                        </p>
                        <ul className="space-y-0.5">
                          {newChatStores.map((s) => (
                            <li key={s.id}>
                              <button
                                type="button"
                                onClick={() =>
                                  openConversation({
                                    threadId: null,
                                    storeId: s.id,
                                    storeName: s.name,
                                    storeSlug: s.slug,
                                    storeLogo: s.logo,
                                    lastMessage: "",
                                    lastSenderType: "customer",
                                    lastAt: new Date().toISOString(),
                                    unreadCount: 0,
                                  })
                                }
                                className="group flex w-full items-center gap-2.5 rounded-xl px-1.5 py-2 text-left transition-colors hover:bg-[var(--surface-sunken)]"
                              >
                                <span className="relative inline-flex h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
                                  {s.logo ? (
                                    <Image src={s.logo} alt="" fill sizes="36px" className="object-cover" />
                                  ) : (
                                    <span className="absolute inset-0 flex items-center justify-center text-[var(--accent)]">
                                      <StoreIcon className="h-4 w-4" strokeWidth={2} aria-hidden />
                                    </span>
                                  )}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)]">
                                  {s.name}
                                </span>
                                <ChevronRight
                                  className="h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--accent)]"
                                  strokeWidth={2.5}
                                  aria-hidden
                                />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}

      {/* ── Chat heads estilo Facebook — burbujas con el logo del negocio ──
           Aparecen cuando una tienda te escribe; click abre la ventana
           flotante. X al hover para descartar (vuelve si llega otro msj). */}
      {heads.length > 0 && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed bottom-44 right-4 z-[85] flex flex-col items-end gap-2.5"
            aria-label="Chats pendientes"
          >
            {heads.map((c) => (
              <div key={c.threadId} className="group relative motion-safe:animate-[slideUp_0.3s_ease-out]">
                <button
                  type="button"
                  onClick={() => openFloating(c)}
                  aria-label={`Mensaje nuevo de ${c.storeName} — abrir chat`}
                  title={`${c.storeName}: ${c.lastMessage}`}
                  className="relative block h-14 w-14 overflow-hidden rounded-full border-2 border-[var(--surface-canvas)] bg-[var(--surface-sunken)] shadow-xl shadow-black/25 transition-transform hover:scale-110 active:scale-95"
                >
                  {c.storeLogo ? (
                    <Image src={c.storeLogo} alt="" fill sizes="56px" className="object-cover" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-[var(--accent)]">
                      <StoreIcon className="h-6 w-6" strokeWidth={2} aria-hidden />
                    </span>
                  )}
                </button>
                {/* Badge count — solo si hay no-leídos (los minimizados sin
                    novedades quedan limpios) */}
                {c.unreadCount > 0 && (
                  <span className="pointer-events-none absolute -top-1 -right-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--data-error-500)] px-1 text-[length:var(--ts-2xs)] font-black tabular-nums text-white ring-2 ring-[var(--surface-canvas)]">
                    {c.unreadCount > 9 ? "9+" : c.unreadCount}
                  </span>
                )}
                {/* Descartar (hover, como FB) */}
                <button
                  type="button"
                  onClick={() => c.threadId && dismissHead(c.threadId)}
                  aria-label={`Descartar burbuja de ${c.storeName}`}
                  className="absolute -top-1.5 -left-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] opacity-0 shadow transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <X className="h-3 w-3" strokeWidth={3} aria-hidden />
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}

      {/* ── Ventana de chat FLOTANTE (desktop, estilo Facebook) ── */}
      {floating && customer?.phone && typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-label={`Chat con ${floating.storeName}`}
            className="fixed bottom-4 right-4 z-[88] hidden h-[460px] w-[330px] flex-col overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] shadow-2xl shadow-black/30 sm:flex motion-safe:animate-[slideUp_0.25s_cubic-bezier(0.32,0.72,0,1)]"
          >
            <ChatConversationView
              threadId={floating.threadId}
              storeId={floating.storeId}
              storeName={floating.storeName}
              storeSlug={floating.storeSlug}
              storeLogo={floating.storeLogo}
              customerPhone={customer.phone}
              customerName={customer.name ?? "Cliente"}
              onBack={() => { minimizeFloating(); void refresh(); }}
              onActivity={() => { if (floating.threadId) markRead(floating.threadId); }}
              onThreadCreated={(tid) => {
                setFloating((prev) => (prev ? { ...prev, threadId: tid } : prev));
                void refresh();
              }}
            />
          </div>,
          document.body,
        )}

      {/* Login — mismo modal del navbar */}
      <AuthModal open={authModalOpen} onClose={closeAuthModal} />
    </>
  );
}
