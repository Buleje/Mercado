"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  Share2,
  Heart,
  HeartHandshake,
  Store,
  ArrowRight,
} from "@buleje/design-system/icons";
import type { LiveSession } from "@/lib/mocks/lives.mock";

export interface LiveDescriptionProps {
  live: LiveSession;
}

export function LiveDescription({ live }: LiveDescriptionProps) {
  const [copied, setCopied] = useState(false);
  const [following, setFollowing] = useState(false);

  const handleShare = useCallback(async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: live.title, url });
      } catch {
        /* cancelled */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* silent */
    }
  }, [live.title]);

  const handleFollow = useCallback(() => {
    setFollowing((prev) => !prev);
  }, []);

  return (
    <div className="rounded-2xl border border-[var(--rule-muted)] bg-[var(--surface-raised)] p-5 space-y-4">
      <h1 className="text-[length:var(--ts-xl)] sm:text-[length:var(--ts-2xl)] font-bold leading-tight text-[var(--text-primary)]">
        {live.title}
      </h1>

      <p className="text-[length:var(--ts-sm)] text-[var(--text-secondary)] leading-relaxed">
        {live.description}
      </p>

      <div className="flex items-center gap-3 flex-wrap pt-3 border-t border-[var(--rule-muted)]">
        <Link
          href={`/marketplace/${live.storeSlug}`}
          className="inline-flex items-center gap-2 text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)] hover:text-[var(--accent)]"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
            <Store className="h-4 w-4" aria-hidden />
          </span>
          {live.storeName}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleFollow}
            aria-pressed={following}
            className={
              following
                ? "inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)]/10 px-3 py-2 text-[length:var(--ts-sm)] font-semibold text-[var(--accent)]"
                : "inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
            }
          >
            {following ? (
              <>
                <HeartHandshake className="h-4 w-4" aria-hidden />
                Siguiendo
              </>
            ) : (
              <>
                <Heart className="h-4 w-4" aria-hidden />
                Seguir tienda
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleShare}
            aria-label="Compartir transmisión"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
          >
            <Share2 className="h-4 w-4" aria-hidden />
            {copied ? "Link copiado" : "Compartir"}
          </button>
        </div>
      </div>
    </div>
  );
}
