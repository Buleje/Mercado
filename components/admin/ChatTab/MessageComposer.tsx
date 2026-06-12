"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Send, Paperclip, Smile, X, Plus, Search, Loader2, ShoppingCart, RefreshCw } from "@buleje/design-system/icons";
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
  /** Tanda 2: proponer una sustitución de faltante (producto X → reemplazo Y). */
  onProposeSubstitution?: (originalName: string, replacement: SharedChatProduct) => Promise<void> | void;
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
  onProposeSubstitution,
}: MessageComposerProps) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // Tanda 2: menú "+" (comercio) + picker compartido para producto/sustitución.
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<"product" | "substitution">("product");
  const [originalName, setOriginalName] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function openMode(m: "product" | "substitution") {
    setMode(m);
    setMenuOpen(false);
    setOriginalName("");
    setQuery("");
    setResults([]);
    setPickerOpen(true);
  }

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

  async function handleSubstitute(hit: CatalogHit) {
    if (!onProposeSubstitution || !originalName.trim()) return;
    setSharingId(hit.storeProductId);
    try {
      await onProposeSubstitution(originalName.trim(), {
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
      setOriginalName("");
    } catch (err) {
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
      window.alert("No se pudo proponer la sustitución.");
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

      {/* Menú "+" de comercio (Tanda 2) */}
      {menuOpen && (
        <div className="mb-2 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => openMode("product")}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ShoppingCart className="h-4 w-4 text-primary" aria-hidden /> Compartir producto
          </button>
          <button
            type="button"
            onClick={() => openMode("substitution")}
            className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className="h-4 w-4 text-primary" aria-hidden /> Sustitución de faltante
          </button>
        </div>
      )}

      {/* Picker de comercio (Tanda 2) — producto o sustitución */}
      {pickerOpen && (
        <div className="mb-2 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-[length:var(--ts-xs)] font-bold text-slate-600 dark:text-slate-300">
              {mode === "substitution" ? "Sustitución de faltante" : "Compartir producto"}
            </span>
            <button type="button" onClick={() => setPickerOpen(false)} aria-label="Cerrar" className="rounded-full p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* Sustitución: qué producto falta */}
          {mode === "substitution" && (
            <input
              value={originalName}
              onChange={(e) => setOriginalName(e.target.value)}
              placeholder="¿Qué producto falta? (ej: Inca Kola 1.5L)"
              aria-label="Producto que falta"
              className="mb-2 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-800"
            />
          )}
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-slate-200 px-2 dark:border-slate-700">
            <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={mode === "substitution" ? "Buscar el reemplazo…" : "Buscar producto de tu catálogo…"}
              aria-label="Buscar producto"
              autoFocus
              className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
            {searching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" aria-hidden />}
          </div>
          {mode === "substitution" && !originalName.trim() && (
            <p className="mb-1 px-1 text-[length:var(--ts-2xs)] text-slate-400">Escribí qué falta y elegí el reemplazo.</p>
          )}
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
                  onClick={() => (mode === "substitution" ? handleSubstitute(hit) : handleShare(hit))}
                  disabled={!!sharingId || (mode === "substitution" && !originalName.trim())}
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
          onClick={() => { setMenuOpen((o) => !o); setPickerOpen(false); }}
          aria-label="Acciones de comercio"
          aria-pressed={menuOpen}
          title="Compartir producto · Sustitución"
          className={cn(
            "rounded-full p-2 transition-colors",
            menuOpen || pickerOpen ? "bg-primary/10 text-primary" : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800",
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
