"use client";

/**
 * StorePublicationsManager — el DUEÑO crea/fija/borra publicaciones del feed de
 * su tienda (ADR-130). Consume /api/admin/store-posts (resuelve la tienda por
 * auth). Lo que publica acá aparece en /marketplace/[slug] (Novedades).
 */

import { useCallback, useEffect, useState } from "react";
import { Megaphone, Pin, Trash2, Send, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

interface OwnerPost {
  id: string;
  body: string;
  imageUrl: string | null;
  pinned: boolean;
  commentCount: number;
  createdAt: string;
}

const MAX = 1000;

export default function StorePublicationsManager() {
  const [posts, setPosts] = useState<OwnerPost[] | null>(null);
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/store-posts", { cache: "no-store" });
      const j = await res.json().catch(() => ({ data: [] }));
      setPosts((j.data ?? []) as OwnerPost[]);
    } catch {
      setPosts([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const publish = async () => {
    const text = body.trim();
    if (!text || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/store-posts", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          body: text,
          imageUrl: imageUrl.trim() || undefined,
          pinned,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setError(j?.error ?? "No se pudo publicar.");
        return;
      }
      setBody("");
      setImageUrl("");
      setPinned(false);
      await load();
    } catch {
      setError("Sin conexión. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setPosts((prev) => (prev ?? []).filter((p) => p.id !== id));
    try {
      await fetch(`/api/admin/store-posts?postId=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: csrfHeaders(),
      });
    } catch {
      void load();
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
          <Megaphone className="h-6 w-6" strokeWidth={2} aria-hidden />
        </span>
        <div>
          <h1 className="text-xl font-black text-[var(--text-primary)]">Publicaciones</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Contales a tus vecinos las novedades. Aparece en tu tienda del marketplace.
          </p>
        </div>
      </header>

      {/* Form de nueva publicación */}
      <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:p-5">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX))}
          rows={3}
          placeholder="Ej: Hoy pollo a la brasa con papas a S/20 🔥 Pedí antes de las 8pm."
          className="w-full resize-none rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]"
        />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="URL de imagen (opcional)"
            className="h-11 flex-1 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]"
          />
          <button
            type="button"
            onClick={() => setPinned((v) => !v)}
            aria-pressed={pinned}
            className={cn(
              "inline-flex h-11 items-center gap-2 rounded-xl border-2 px-3 text-sm font-bold transition-colors",
              pinned
                ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]",
            )}
          >
            <Pin className="h-4 w-4" aria-hidden /> {pinned ? "Fijada" : "Fijar"}
          </button>
          <button
            type="button"
            onClick={publish}
            disabled={saving || !body.trim()}
            className={cn(
              "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition-all",
              body.trim() && !saving
                ? "bg-[var(--accent)] text-white hover:opacity-90 active:scale-95"
                : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed",
            )}
          >
            <Send className="h-4 w-4" aria-hidden /> {saving ? "Publicando…" : "Publicar"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-[var(--data-error-600)]">{error}</p>}
      </div>

      {/* Lista de publicaciones */}
      <div className="space-y-3">
        {posts === null && <p className="text-sm text-[var(--text-tertiary)]">Cargando…</p>}
        {posts?.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[var(--rule-base)] px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
            Todavía no publicaste nada. Tu primera novedad aparece arriba de tu tienda.
          </p>
        )}
        {posts?.map((p) => (
          <article
            key={p.id}
            className="flex items-start gap-3 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4"
          >
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                {p.pinned && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-bold text-[var(--accent)]">
                    <Pin className="h-3 w-3" aria-hidden /> Fijada
                  </span>
                )}
                <span>{new Date(p.createdAt).toLocaleDateString("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="inline-flex items-center gap-1">
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden /> {p.commentCount}
                </span>
              </div>
              <p className="whitespace-pre-line text-sm text-[var(--text-primary)]">{p.body}</p>
            </div>
            <button
              type="button"
              onClick={() => remove(p.id)}
              aria-label="Borrar publicación"
              className="shrink-0 rounded-lg p-2 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-600)]"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
