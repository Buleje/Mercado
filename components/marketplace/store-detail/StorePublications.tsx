"use client";

/**
 * StorePublications — feed de Novedades de la tienda (ADR-130). El dueño publica
 * desde el seller-central; acá los vecinos lo VEN y COMENTAN. Self-hide si la
 * tienda no publicó nada (no ensuciar el storefront con un bloque vacío).
 */

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Megaphone, Send, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import { useCustomerSafe } from "@/hooks/use-customer-safe";
import { AuthModal, useAuthModal } from "@/components/auth/AuthModal";

interface PostComment {
  id: string;
  authorName: string;
  body: string;
  createdAt?: string;
}
interface Post {
  id: string;
  body: string;
  imageUrl: string | null;
  pinned: boolean;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  comments: PostComment[];
}

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short" });
}

export default function StorePublications({
  storeSlug,
  storeName,
}: {
  storeSlug: string;
  storeName: string;
}) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [posting, setPosting] = useState<string | null>(null);
  const customer = useCustomerSafe();
  const { authModalOpen, openAuthModal, closeAuthModal } = useAuthModal();

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/marketplace/stores/${encodeURIComponent(storeSlug)}/posts`, {
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => setPosts((j.data ?? []) as Post[]))
      .catch(() => setPosts([]));
    return () => ctrl.abort();
  }, [storeSlug]);

  const submitComment = useCallback(
    async (postId: string) => {
      const body = (drafts[postId] ?? "").trim();
      if (!body || posting) return;
      if (!customer) {
        openAuthModal();
        return;
      }
      setPosting(postId);
      try {
        const res = await fetch(
          `/api/marketplace/stores/${encodeURIComponent(storeSlug)}/posts/${postId}/comments`,
          {
            method: "POST",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ body }),
          },
        );
        const j = await res.json().catch(() => null);
        if (!res.ok) {
          if (res.status === 401) openAuthModal();
          return;
        }
        // Optimista: aparece al instante.
        setPosts((prev) =>
          (prev ?? []).map((p) =>
            p.id === postId
              ? {
                  ...p,
                  commentCount: p.commentCount + 1,
                  comments: [
                    ...p.comments,
                    { id: j.data.id, authorName: j.data.authorName, body: j.data.body },
                  ],
                }
              : p,
          ),
        );
        setDrafts((d) => ({ ...d, [postId]: "" }));
      } catch {
        /* sin conexión — silencioso */
      } finally {
        setPosting(null);
      }
    },
    [drafts, posting, customer, openAuthModal, storeSlug],
  );

  // Self-hide: cargando o sin publicaciones → nada.
  if (!posts || posts.length === 0) return null;

  return (
    <section aria-label={`Novedades de ${storeName}`} className="mt-8">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
          <Megaphone className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <div>
          <h2 className="text-lg font-black text-[var(--text-primary)] leading-tight">
            Novedades de {storeName}
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Lo último de la tienda — comentá y enterate primero.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {posts.map((post) => (
          <article
            key={post.id}
            className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 sm:p-5"
          >
            <header className="mb-2 flex items-center gap-2 text-sm">
              <span className="font-extrabold text-[var(--text-primary)]">{storeName}</span>
              {post.pinned && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[length:var(--ts-2xs,0.6875rem)] font-bold text-[var(--accent)]">
                  <Pin className="h-3 w-3" aria-hidden /> Fijado
                </span>
              )}
              <span className="text-[var(--text-tertiary)]">· {timeAgo(post.createdAt)}</span>
            </header>

            <p className="whitespace-pre-line text-base leading-relaxed text-[var(--text-primary)]">
              {post.body}
            </p>

            {post.imageUrl && (
              <div className="relative mt-3 aspect-video overflow-hidden rounded-xl bg-[var(--surface-sunken)]">
                <Image
                  src={post.imageUrl}
                  alt={`Publicación de ${storeName}`}
                  fill
                  sizes="(max-width: 768px) 100vw, 640px"
                  className="object-cover"
                />
              </div>
            )}

            {/* Comentarios */}
            {post.comments.length > 0 && (
              <ul className="mt-4 space-y-2 border-t border-[var(--rule-soft)] pt-3">
                {post.comments.map((c) => (
                  <li key={c.id} className="flex gap-2 text-sm">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[length:var(--ts-2xs,0.6875rem)] font-bold text-[var(--text-secondary)]">
                      {c.authorName.slice(0, 1).toUpperCase()}
                    </span>
                    <p className="text-[var(--text-secondary)]">
                      <span className="font-bold text-[var(--text-primary)]">{c.authorName}</span>{" "}
                      {c.body}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {/* Caja de comentario */}
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={drafts[post.id] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [post.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitComment(post.id);
                }}
                placeholder={customer ? "Escribí un comentario…" : "Iniciá sesión para comentar"}
                maxLength={500}
                className="h-11 flex-1 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]"
              />
              <button
                type="button"
                onClick={() => submitComment(post.id)}
                disabled={posting === post.id || !(drafts[post.id] ?? "").trim()}
                aria-label="Enviar comentario"
                className={cn(
                  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all",
                  (drafts[post.id] ?? "").trim()
                    ? "bg-[var(--accent)] text-white hover:opacity-90 active:scale-95"
                    : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed",
                )}
              >
                <Send className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              </button>
            </div>
          </article>
        ))}
      </div>

      {authModalOpen && <AuthModal open={authModalOpen} onClose={closeAuthModal} />}
    </section>
  );
}
