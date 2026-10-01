"use client";

/**
 * ProductCommentsSection — comentarios públicos de producto estilo Instagram.
 *
 * Brandon 2026-06-06: reemplaza al cross-sell "Combiná con tu pedido" del
 * ProductModifierModal (era muy tedioso).
 *
 * Reglas (Brandon 2026-06-06 v2):
 *   - Solo clientes LOGUEADOS comentan — el nombre sale de la sesión
 *     automáticamente (nunca se pide ni se tipea).
 *   - Sin sesión: puede VER los comentarios; al intentar comentar se abre
 *     el AuthModal (mismo flujo de login del navbar) y al loguearse comenta.
 *   - Se publica al instante y queda visible para todos (optimistic).
 *
 * - GET/POST /api/marketplace/comments (POST requiere customer-session)
 */

import { useEffect, useState } from "react";
import { m as motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Send, Loader2, Lock } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import { useCustomerSafe } from "@/hooks/use-customer-safe";
import { AuthModal, useAuthModal } from "@/components/auth/AuthModal";

interface ProductComment {
  id: string;
  name: string;
  text: string;
  date: string;
}

interface ProductCommentsSectionProps {
  open: boolean;
  productId: number;
  storeSlug: string;
  className?: string;
}

/** "ahora" · "hace 5 min" · "hace 2 h" · "hace 3 d" · "12 may" */
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short" });
}

/** Paleta determinística para el avatar con la inicial (estilo IG). */
const AVATAR_BGS = [
  "bg-[var(--accent)]",
  "bg-[var(--data-success-500)]",
  "bg-[var(--data-warning-500)]",
  "bg-[var(--data-info-500,var(--accent))]",
];
const avatarBgOf = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_BGS[Math.abs(h) % AVATAR_BGS.length];
};

export default function ProductCommentsSection({
  open, productId, storeSlug, className,
}: ProductCommentsSectionProps) {
  const [comments, setComments] = useState<ProductComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sesión del cliente — el customer-context se llena tras el login del
  // AuthModal (UI optimista). El server re-valida la cookie en cada POST:
  // si el context tiene un customer "fantasma" (localStorage viejo sin
  // cookie), el POST devuelve 401 y reabrimos el AuthModal.
  const customer = useCustomerSafe();
  const { authModalOpen, openAuthModal, closeAuthModal } = useAuthModal();

  // Fetch al abrir el modal.
  useEffect(() => {
    if (!open || !productId || !storeSlug) return;
    const ctrl = new AbortController();
    setLoading(true);
    fetch(
      `/api/marketplace/comments?storeSlug=${encodeURIComponent(storeSlug)}&productId=${productId}`,
      { signal: ctrl.signal },
    )
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => setComments((j.data ?? []) as ProductComment[]))
      .catch(() => { /* no crítico — la lista queda vacía */ })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [open, productId, storeSlug]);

  const submit = async () => {
    const trimmedText = text.trim();
    if (!trimmedText || posting) return;
    // Sin sesión → login primero (mismo modal del navbar), después comenta.
    if (!customer) {
      openAuthModal();
      return;
    }

    setPosting(true);
    setError(null);
    try {
      const res = await fetch("/api/marketplace/comments", {
        method: "POST",
        // CSRF: proxy.ts exige x-csrf-token en mutaciones o devuelve 403.
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ storeSlug, productId, text: trimmedText }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 401) {
          // Cookie vencida o customer fantasma de localStorage → re-login.
          openAuthModal();
          return;
        }
        setError(
          res.status === 429
            ? "Muy rápido — esperá un momento antes de comentar de nuevo."
            : (j?.error ?? "No se pudo publicar. Probá de nuevo."),
        );
        return;
      }
      // Optimistic: aparece arriba al instante, como IG.
      setComments((prev) => [j.data as ProductComment, ...prev]);
      setText("");
    } catch {
      setError("Sin conexión. Probá de nuevo.");
    } finally {
      setPosting(false);
    }
  };

  const firstName = customer?.name?.trim() ?? "";

  return (
    <div className={cn("pt-1", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
          <MessageCircle className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </span>
        <p className="text-sm font-black text-[var(--text-primary)]">
          Comentarios
          {comments.length > 0 && (
            <span className="ml-1.5 font-bold text-[var(--text-tertiary)] tabular-nums">
              {comments.length}
            </span>
          )}
        </p>
      </div>

      {/* Composer — logueado: input directo con su avatar.
          Sin sesión: CTA que abre el AuthModal (solo puede ver). */}
      {customer ? (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              title={firstName}
              className={cn(
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black text-white uppercase",
                avatarBgOf(firstName || "?"),
              )}
            >
              {firstName[0] ?? "?"}
            </span>
            <input
              type="text"
              value={text}
              onChange={(e) => { setText(e.target.value.slice(0, 300)); if (error) setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
              placeholder={`Comentá como ${firstName.split(" ")[0] || "vos"}…`}
              aria-label="Escribí tu comentario"
              className="block min-w-0 flex-1 h-12 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!text.trim() || posting}
              aria-label="Publicar comentario"
              className={cn(
                "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-all active:scale-95",
                text.trim() && !posting
                  ? "bg-[var(--accent)] text-white shadow-md hover:brightness-110"
                  : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed",
              )}
            >
              {posting
                ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                : <Send className="h-5 w-5" strokeWidth={2.5} aria-hidden />}
            </button>
          </div>

          {error && (
            <p role="alert" className="text-sm font-bold text-[var(--data-error-500)]">
              {error}
            </p>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={openAuthModal}
          className="group flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 text-left transition-all hover:border-[var(--accent)] hover:bg-primary/10"
        >
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)] transition-colors group-hover:bg-[var(--accent)] group-hover:text-white">
            <Lock className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-sm font-extrabold text-[var(--text-primary)] group-hover:text-[var(--accent)]">
              Iniciá sesión para comentar
            </span>
            <span className="block text-[length:var(--ts-xs)] font-medium text-[var(--text-tertiary)]">
              Tu nombre aparece automático — gratis y en segundos
            </span>
          </span>
        </button>
      )}

      {/* Lista de comentarios — más recientes primero. Visible para TODOS. */}
      <div className="mt-3 space-y-3">
        {loading && comments.length === 0 && (
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-tertiary)] py-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Cargando comentarios…
          </div>
        )}

        {!loading && comments.length === 0 && (
          <p className="text-sm font-medium text-[var(--text-tertiary)] py-1">
            Sé el primero en comentar este producto.
          </p>
        )}

        <AnimatePresence initial={false}>
          {comments.map((c) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-start gap-2.5"
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black text-white uppercase",
                  avatarBgOf(c.name),
                )}
              >
                {c.name[0] ?? "?"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-[var(--text-primary)]">
                  <span className="font-extrabold">{c.name}</span>{" "}
                  <span className="font-medium break-words">{c.text}</span>
                </p>
                <p className="mt-0.5 text-[length:var(--ts-xs)] font-bold text-[var(--text-tertiary)]">
                  {timeAgo(c.date)}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* AuthModal — mismo login del navbar (z-200, abre ENCIMA del modal
          de producto). Al loguearse, el customer-context se llena y el
          composer se desbloquea al instante. */}
      <AuthModal open={authModalOpen} onClose={closeAuthModal} />
    </div>
  );
}
