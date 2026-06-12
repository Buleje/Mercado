"use client";

/**
 * ChatPageClient — Brandon 2026-06-12: el chat del cliente como RUTA REAL
 * (/chat), estilo Messenger nativo. A diferencia del overlay del nav, esta es
 * una página: el botón "atrás" del celular y compartir-link funcionan.
 *
 * Render: takeover full-screen (fixed inset-0) → cubre navbar + bottom-nav y se
 * siente "la app de chat". Bandeja (lista + buscador) ↔ hilo (reusa el
 * ChatConversationView con todas las funciones de las Tandas 1-4).
 */

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Search, X, Store as StoreIcon, Loader2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { AuthModal, useAuthModal } from "@/components/auth/AuthModal";
import { useMarketplaceChats, type ChatConversation } from "./use-marketplace-chats";
import ChatConversationView from "./ChatConversationView";

/** "ahora · 5m · 2h · 3d" compacto para el último mensaje. */
function shortAgo(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function ChatPageClient() {
  const { customer, conversations, unreadTotal, loading, refresh, markRead } =
    useMarketplaceChats(true);
  const [active, setActive] = useState<ChatConversation | null>(null);
  const [query, setQuery] = useState("");
  const { authModalOpen, openAuthModal, closeAuthModal } = useAuthModal();

  // ── Hilo activo ──────────────────────────────────────────────────────────
  if (active && customer?.phone) {
    return (
      <div className="fixed inset-0 z-[80] bg-[var(--surface-canvas)]">
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
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const visible = q
    ? conversations.filter((c) => c.storeName.toLowerCase().includes(q))
    : conversations;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[var(--surface-canvas)]">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)] px-2 py-2.5">
        <Link
          href="/"
          aria-label="Volver al inicio"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        </Link>
        <h1 className="flex-1 text-lg font-black tracking-tight text-[var(--text-primary)]">
          Mensajes
          {unreadTotal > 0 && (
            <span className="ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--data-error-500)] px-1.5 align-middle text-[length:var(--ts-2xs)] font-black tabular-nums text-white">
              {unreadTotal}
            </span>
          )}
        </h1>
      </header>

      {!customer ? (
        // ── No logueado ──
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <span className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <StoreIcon className="h-8 w-8" strokeWidth={1.75} aria-hidden />
          </span>
          <p className="text-base font-extrabold text-[var(--text-primary)]">Entrá para chatear</p>
          <p className="mt-1 text-sm font-medium text-[var(--text-tertiary)]">
            Iniciá sesión para hablar con las tiendas y seguir tus pedidos.
          </p>
          <button
            type="button"
            onClick={openAuthModal}
            className="mt-5 inline-flex h-12 items-center justify-center rounded-full bg-[var(--accent)] px-7 text-sm font-bold text-white transition-[filter] hover:brightness-110 active:scale-95"
          >
            Iniciar sesión
          </button>
          <AuthModal open={authModalOpen} onClose={closeAuthModal} />
        </div>
      ) : (
        <>
          {/* Buscador (con >3 chats) */}
          {conversations.length > 3 && (
            <div className="shrink-0 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2">
              <div className="flex h-10 items-center gap-2 rounded-full bg-[var(--surface-sunken)] px-3">
                <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar un chat…"
                  aria-label="Buscar chat por tienda"
                  className="h-full min-w-0 flex-1 bg-transparent text-sm font-medium text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda" className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Lista */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading && conversations.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm font-bold text-[var(--text-tertiary)]">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando chats…
              </div>
            ) : conversations.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <span className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <StoreIcon className="h-8 w-8" strokeWidth={1.75} aria-hidden />
                </span>
                <p className="text-sm font-extrabold text-[var(--text-primary)]">Todavía no tenés chats</p>
                <p className="mt-1 text-sm font-medium text-[var(--text-tertiary)]">
                  Entrá a una tienda y tocá “Mensaje” para empezar a chatear.
                </p>
                <Link href="/tiendas" className="mt-5 inline-flex h-11 items-center justify-center rounded-full border-2 border-[var(--accent)] px-6 text-sm font-bold text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-white">
                  Ver tiendas
                </Link>
              </div>
            ) : visible.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm font-medium text-[var(--text-tertiary)]">
                No hay chats con “{query}”.
              </p>
            ) : (
              <ul className="px-2 py-2">
                {visible.map((c) => (
                  <li key={c.threadId ?? c.storeId}>
                    <button
                      type="button"
                      onClick={() => { setActive(c); if (c.threadId && c.unreadCount > 0) markRead(c.threadId); }}
                      className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors hover:bg-[var(--surface-sunken)]"
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
                          <span className={cn("truncate text-sm text-[var(--text-primary)]", c.unreadCount > 0 ? "font-black" : "font-bold")}>
                            {c.storeName}
                          </span>
                          <span className="shrink-0 text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-tertiary)]">
                            {shortAgo(c.lastAt)}
                          </span>
                        </span>
                        <span className={cn("mt-0.5 block truncate text-sm", c.unreadCount > 0 ? "font-bold text-[var(--text-primary)]" : "font-medium text-[var(--text-tertiary)]")}>
                          {c.lastSenderType === "customer" ? "Tú: " : ""}{c.lastMessage}
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
            )}
          </div>
        </>
      )}
    </div>
  );
}
