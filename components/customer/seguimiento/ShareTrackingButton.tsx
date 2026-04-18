"use client";

/**
 * ShareTrackingButton — Botón "Compartir por WhatsApp" que:
 *  1. POSTea a /api/orders/[id]/tracking/share → recibe token + url pública
 *  2. Copia url al clipboard + abre WhatsApp Web con el link pre-cargado
 *
 * El link es /t/[tenant]/seguimiento/[token] — funciona sin login.
 */
import { useState } from "react";
import { Share2, Check, Loader2, MessageCircle, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  orderId: string;
  storeName?: string;
  className?: string;
}

type Status = "idle" | "loading" | "ready" | "error";

interface ShareResponse {
  token: string;
  url: string;
  expiresAt: string;
}

export function ShareTrackingButton({ orderId, storeName, className }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const handleShare = async () => {
    if (status === "loading") return;
    setStatus("loading");
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/tracking/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const data = (await res.json()) as ShareResponse;
      setShareUrl(data.url);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  const waText = shareUrl
    ? encodeURIComponent(
        `Hola, te comparto el seguimiento de mi pedido${storeName ? ` en ${storeName}` : ""}: ${shareUrl}`,
      )
    : "";

  return (
    <section
      aria-labelledby="tracking-share-heading"
      className={cn(
        "rounded-2xl border border-gray-100 dark:border-card-border bg-white dark:bg-card p-5 sm:p-6",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted">
            Compartir
          </span>
          <h2
            id="tracking-share-heading"
            className="text-base font-extrabold tracking-tight text-foreground mt-0.5"
          >
            Enviar el link del seguimiento
          </h2>
        </div>
      </div>
      <p className="text-[13px] text-muted leading-relaxed">
        Envíale a quien quieras un link sin login para que vea el estado en tiempo real.
        Vive 72 horas.
      </p>

      {status !== "ready" && (
        <button
          type="button"
          onClick={handleShare}
          disabled={status === "loading"}
          className={cn(
            "mt-4 inline-flex items-center justify-center gap-2 h-11 w-full rounded-xl bg-foreground text-white dark:text-background text-sm font-bold transition-opacity",
            status === "loading" ? "opacity-70 cursor-wait" : "hover:opacity-90",
          )}
        >
          {status === "loading" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generando link…
            </>
          ) : (
            <>
              <Share2 className="h-4 w-4" strokeWidth={1.75} />
              Generar link para compartir
            </>
          )}
        </button>
      )}

      {status === "error" && (
        <p className="mt-3 text-xs text-red-600 dark:text-red-400">
          No pudimos generar el link. Vuelve a intentarlo.
        </p>
      )}

      {status === "ready" && shareUrl && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface px-3 py-2">
            <code className="text-[11px] text-foreground truncate flex-1 tabular-nums">
              {shareUrl}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copiar link"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card hover:border-gray-300 dark:hover:border-card-border/80 text-muted hover:text-foreground transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-teal-600" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <a
              href={`https://wa.me/?text=${waText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-[#25D366] hover:bg-[#1ebe5a] text-sm font-bold text-white transition-colors"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={1.75} />
              WhatsApp
            </a>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-gray-200 dark:border-card-border hover:border-gray-300 dark:hover:border-card-border/80 text-sm font-bold text-foreground transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-teal-600" strokeWidth={2} />
                  Copiado
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" strokeWidth={1.75} />
                  Copiar
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
