"use client";

import { useState, useCallback } from "react";
import { Share2 } from "@buleje/design-system/icons";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { serializeCart } from "@/lib/marketplace/cart-sharing";

// ---------- helpers ----------

/** Fallback para navegadores sin navigator.clipboard */
function copyFallback(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return copyFallback(text);
  } catch {
    return copyFallback(text);
  }
}

// ---------- componente ----------

export default function ShareCartButton() {
  const { items, itemCount } = useMarketplaceCart();
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  const handleShare = useCallback(async () => {
    if (itemCount === 0) return;

    const token = serializeCart(items);
    const url = `${window.location.origin}/marketplace?cart=${token}`;

    // Intentar Web Share API primero (móvil nativo)
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Mi carrito del marketplace",
          text: `Te comparto mi carrito con ${itemCount} ${itemCount === 1 ? "producto" : "productos"}`,
          url,
        });
        setStatus("copied");
        setTimeout(() => setStatus("idle"), 3000);
        return;
      } catch {
        // El usuario canceló el share nativo — continuar con clipboard
      }
    }

    const ok = await copyToClipboard(url);
    setStatus(ok ? "copied" : "error");
    setTimeout(() => setStatus("idle"), 3000);
  }, [items, itemCount]);

  const isEmpty = itemCount === 0;

  return (
    <div className="relative group/share">
      <button
        onClick={handleShare}
        disabled={isEmpty}
        aria-label={
          isEmpty
            ? "Agregá productos para compartir"
            : "Compartir carrito — copia el link"
        }
        title={isEmpty ? "Agregá productos para compartir" : "Compartir carrito"}
        className={[
          "flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-all",
          isEmpty
            ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-600"
            : status === "copied"
            ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-400"
            : status === "error"
            ? "border-red-200 bg-red-50 text-red-600 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-400"
            : "border-gray-200 bg-white text-gray-600 hover:border-primary/40 hover:text-primary dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-primary/30 dark:hover:text-primary",
        ].join(" ")}
      >
        <Share2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {status === "copied"
          ? "Link copiado — ahora compártelo"
          : status === "error"
          ? "No se pudo copiar"
          : "Compartir carrito"}
      </button>

      {/* Tooltip solo cuando está vacío */}
      {isEmpty && (
        <div
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-[length:var(--ts-2xs)] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover/share:opacity-100 dark:bg-gray-700"
        >
          Agregá productos para compartir
          <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
        </div>
      )}
    </div>
  );
}
