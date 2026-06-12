"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Send, Paperclip, Smile, X, Plus, Search, Loader2 } from "@buleje/design-system/icons";
import * as Sentry from "@sentry/nextjs";
import { cn } from "@/lib/utils";
import { getActiveTenantSlug } from "@/lib/tenant-fetch";
import { fmtSoles, type SharedChatProduct } from "@/lib/chat/shared-product";
import type { MsgReplySnapshot } from "./hooks";

interface MessageComposerProps {
  onSend: (body: string, replyTo?: MsgReplySnapshot) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  /** Increment 2b: cita activa + cancelar + ping de typing. */
  replyTo?: MsgReplySnapshot | null;
  onCancelReply?: () => void;
  onTyping?: () => void;
  /** Tanda 2: compartir un producto del catálogo en el hilo. */
  onShareProduct?: (product: SharedChatProduct) => Promise<void> | void;
}

interface CatalogHit {
  storeProductId: string;
  productId: number;
  name: string;
  /** El catálogo serializa el precio como string (Decimal) — se coerciona. */
  price: number | string;
  image: string | null;
  unit: string | null;
  storeId: string;
  storeName: string;
  storeSlug: string;
}

const COMPOSER_EMOJIS = [
  "😀", "😅", "😂", "😍", "😘", "🤔", "😎", "🥳",
  "👍", "🙏", "🔥", "🎉", "❤️", "😮", "😢", "👏",
  "🙌", "🛵", "💰", "✅", "📦", "🍗", "🍕", "🥤",
];

export function MessageComposer({
  onSend,
  disabled = false,
  placeholder = "Escribí tu respuesta…",
  replyTo = null,
  onCancelReply,
  onTyping,
  onShareProduct,
}: MessageComposerProps) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // Tanda 2: picker de "Compartir producto".
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Búsqueda en el catálogo de la tienda (debounce 300ms) cuando el picker abre.
  useEffect(() => {
    if (!pickerOpen) return;
    const slug = getActiveTenantSlug();
    if (!slug) { setResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ storeSlug: slug, limit: "12" });
        if (query.trim()) params.set("q", query.trim());
        const res = await fetch(`/api/marketplace/catalog?${params}`);
        const j = await res.json();
        if (!cancelled) setResults((j.data ?? []) as CatalogHit[]);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [pickerOpen, query]);

  async function handleShare(hit: CatalogHit) {
    if (!onShareProduct) return;
    setSharingId(hit.storeProductId);
    try {
      await onShareProduct({
        storeId: hit.storeId,
        storeName: hit.storeName,
        storeSlug: hit.storeSlug,
        storeProductId: hit.storeProductId,
        productId: hit.productId,
        name: hit.name,
        price: Number(hit.price),
        image: hit.image,
        unit: hit.unit,
      });
      setPickerOpen(false);
      setQuery("");
      setResults([]);
    } catch (err) {
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
      window.alert("No se pudo compartir el producto.");
    } finally {
      setSharingId(null);
    }
  }

  async function handleSend() {
    const trimmed = body.trim();
    if (!trimmed || sending || disabled) return;
    setSending(true);
    try {
      await onSend(trimmed, replyTo ?? undefined);
      setBody("");
      setEmojiOpen(false);
      onCancelReply?.();
      textareaRef.current?.focus();
    } catch (err) {
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
      window.alert("No se pudo enviar el mensaje. Reintentá.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      {/* Cita activa (Increment 2b) */}
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border-l-[3px] border-primary bg-primary/10 px-2.5 py-1.5">
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[length:var(--ts-2xs)] font-bold text-primary">
              Respondiendo a {replyTo.senderType === "seller" ? "vos" : replyTo.senderName}
            </div>
            <div className="truncate text-[length:var(--ts-xs)] text-slate-600 dark:text-slate-300">
              {replyTo.body}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Cancelar respuesta"
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Picker "Compartir producto" (Tanda 2) */}
      {pickerOpen && (
        <div className="mb-2 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-slate-200 px-2 dark:border-slate-700">
            <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar producto de tu catálogo…"
              aria-label="Buscar producto para compartir"
              autoFocus
              className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
            {searching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" aria-hidden />}
          </div>
          <div className="max-h-56 overflow-y-auto">
            {results.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">
                {searching ? "Buscando…" : "Escribí para buscar en tu catálogo"}
              </p>
            ) : (
              results.map((hit) => (
                <button
                  key={hit.storeProductId}
                  type="button"
                  onClick={() => handleShare(hit)}
                  disabled={!!sharingId}
                  className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left hover:bg-slate-50 disabled:opacity-60 dark:hover:bg-slate-800"
                >
                  <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-white">
                    {hit.image && (
                      <Image src={hit.image} alt="" fill sizes="36px" className="object-contain p-0.5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{hit.name}</span>
                    <span className="text-xs font-bold text-primary">{fmtSoles(Number(hit.price))}</span>
                  </span>
                  {sharingId === hit.storeProductId ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
                  ) : (
                    <Plus className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Selector de emoji */}
      {emojiOpen && (
        <div className="mb-2 grid grid-cols-8 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800">
          {COMPOSER_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setBody((t) => (t + e).slice(0, 4000))}
              aria-label={`Insertar ${e}`}
              className="inline-flex h-9 items-center justify-center rounded-lg text-xl transition-transform hover:scale-110 hover:bg-white dark:hover:bg-slate-900"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          aria-label="Compartir producto"
          aria-pressed={pickerOpen}
          title="Compartir producto"
          className={cn(
            "rounded-full p-2 transition-colors",
            pickerOpen ? "bg-primary/10 text-primary" : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800",
          )}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setEmojiOpen((o) => !o)}
          aria-label="Emojis"
          aria-pressed={emojiOpen}
          className={cn(
            "rounded-full p-2 transition-colors",
            emojiOpen ? "bg-primary/10 text-primary" : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800",
          )}
        >
          <Smile className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          disabled
          title="Adjuntos (próximamente)"
          className="rounded-full p-2 text-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-800"
        >
          <Paperclip className="h-4 w-4" aria-hidden />
          <span className="sr-only">Adjuntar archivo</span>
        </button>

        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => { setBody(e.target.value); onTyping?.(); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || sending}
          rows={1}
          maxLength={4000}
          className={cn(
            "flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm",
            "focus:border-primary focus:bg-white dark:bg-[var(--color-card)] focus:outline-none focus:ring-2 focus:ring-primary/20",
            "dark:border-slate-700 dark:bg-slate-800 dark:focus:bg-slate-900",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
          style={{ minHeight: "40px", maxHeight: "140px" }}
          aria-label="Escribir mensaje"
        />

        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || sending || !body.trim()}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full transition",
            "bg-primary text-white hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40",
            "disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700",
          )}
          aria-label="Enviar mensaje"
        >
          <Send className={cn("h-4 w-4", sending && "animate-pulse")} />
        </button>
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[length:var(--ts-2xs)] text-slate-400">
        <span>Enter para enviar · Shift+Enter para salto de línea</span>
        <span>{body.length}/4000</span>
      </div>
    </div>
  );
}
