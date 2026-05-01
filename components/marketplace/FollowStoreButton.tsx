"use client";

/**
 * FollowStoreButton — TS-15 toggle "Seguir tienda".
 *
 * Pone el corazón filled cuando la sigue, outline cuando no. Toast al
 * cambio. Persiste en localStorage via useFollowedStores.
 *
 * Sprint 5 marketplace blueprint.
 */

import { useCallback } from "react";
import { Heart } from "@buleje/design-system/icons";
import { useFollowedStores } from "@/hooks/use-followed-stores";
import { useCustomer } from "@/contexts/customer-context";
import { useToast } from "@/contexts/toast-context";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";

interface Props {
  slug: string;
  storeName?: string;
  variant?: "icon" | "labeled";
  className?: string;
}

export default function FollowStoreButton({
  slug,
  storeName = "tienda",
  variant = "icon",
  className,
}: Props) {
  const { isFollowing, toggle } = useFollowedStores();
  const { customer } = useCustomer();
  const { showToast } = useToast();
  const following = isFollowing(slug);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      toggle(slug);
      const willFollow = !following;
      showToast(
        willFollow ? `Sigues a ${storeName}` : `Dejaste de seguir a ${storeName}`,
        willFollow ? "Te avisaremos cuando tenga ofertas." : "",
      );
      // TS-15-svr fire-and-forget — server registra para analytics + push futuro
      const phone = customer?.phone ?? null;
      fetch(`/api/marketplace/follow/${encodeURIComponent(slug)}`, {
        method: willFollow ? "POST" : "DELETE",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(phone ? { phone } : {}),
        keepalive: true,
      }).catch((err: unknown) => {
        // ignorar — UX no bloqueada por errores de red, localStorage ya guardó
        if (process.env.NODE_ENV === "development") {
          console.warn("[follow-store] sync failed", err);
        }
      });
    },
    [customer?.phone, following, showToast, slug, storeName, toggle],
  );

  if (variant === "labeled") {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={following}
        aria-label={following ? `Dejar de seguir a ${storeName}` : `Seguir a ${storeName}`}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
          following
            ? "border-rose-200 bg-rose-50 text-[var(--data-error)] dark:border-rose-800 dark:bg-rose-950/30 dark:text-[var(--data-error)]"
            : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-rose-200 hover:text-[var(--data-error)]",
          className,
        )}
      >
        <Heart
          className={cn("h-3.5 w-3.5", following && "fill-current")}
          strokeWidth={following ? 2 : 1.75}
          aria-hidden
        />
        {following ? "Siguiendo" : "Seguir"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={following}
      aria-label={following ? `Dejar de seguir a ${storeName}` : `Seguir a ${storeName}`}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full border bg-[var(--surface-raised)] transition-colors",
        following
          ? "border-rose-300 text-[var(--data-error)] hover:bg-rose-50 dark:border-rose-700 dark:text-[var(--data-error)]"
          : "border-[var(--rule-base)] text-[var(--text-tertiary)] hover:border-rose-200 hover:text-[var(--data-error)]",
        className,
      )}
    >
      <Heart
        className={cn("h-4 w-4", following && "fill-current")}
        strokeWidth={following ? 2 : 1.75}
        aria-hidden
      />
    </button>
  );
}
