"use client";

import { useEffect, useState } from "react";
import { ShoppingBag, X, Search, Loader2 } from "@buleje/design-system/icons";
import { tenantFetch } from "@/lib/tenant-fetch";
import { formatCurrency } from "@/lib/format";

interface WaProduct {
  id: number;
  name: string;
  price: number;
  unit: string;
  imageUrl: string | null;
}

interface Props {
  sending: boolean;
  /** Con imagen pública: se envía la foto con precio de caption. */
  onSendImage: (link: string, caption: string) => Promise<boolean>;
  /** Sin imagen: el texto queda en el composer para completar. */
  onInsertText: (text: string) => void;
  onClose: () => void;
}

/**
 * WaProductPicker — compartir un producto del catálogo en el chat 🛒.
 * Busca en los productos activos del tenant; con foto pública manda la imagen
 * con "nombre — S/ precio" de caption; sin foto inserta el texto en el composer.
 */
export default function WaProductPicker({ sending, onSendImage, onInsertText, onClose }: Props) {
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<WaProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await tenantFetch(
          `/api/admin/whatsapp/products?q=${encodeURIComponent(q)}`,
        );
        const json = (await res.json().catch(() => ({}))) as { products?: WaProduct[] };
        if (!cancelled) setProducts(json.products ?? []);
      } catch {
        /* lista vacía */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250); // debounce de tipeo
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  async function share(p: WaProduct) {
    const caption = `${p.name} — ${formatCurrency(Number(p.price))}${p.unit ? ` x ${p.unit}` : ""}`;
    if (p.imageUrl) {
      const ok = await onSendImage(p.imageUrl, caption);
      if (ok) onClose();
    } else {
      onInsertText(`🛒 ${caption}`);
      onClose();
    }
  }

  return (
    <div className="border-t border-[var(--rule-base)] bg-[var(--surface-raised)] ">
      <div className="flex items-center justify-between px-4 pt-3">
        <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)] ">
          <ShoppingBag className="h-4 w-4 text-primary" />
          Compartir producto
        </p>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)] transition hover:bg-[var(--rule-soft)] "
          aria-label="Cerrar productos"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-3">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar producto…"
            className="h-11 w-full rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-base text-[var(--text-primary)] outline-none transition focus:border-primary "
          />
        </div>
        <div className="max-h-56 space-y-1.5 overflow-y-auto">
          {loading && (
            <p className="flex items-center gap-2 p-2 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
            </p>
          )}
          {!loading && products.length === 0 && (
            <p className="p-2 text-sm text-[var(--text-secondary)]">Sin resultados en tu catálogo.</p>
          )}
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={sending}
              onClick={() => void share(p)}
              className="flex w-full items-center gap-3 rounded-xl border border-[var(--rule-base)] p-2 text-left transition hover:border-primary/60 disabled:opacity-50 "
            >
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.imageUrl}
                  alt=""
                  loading="lazy"
                  className="h-10 w-10 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--rule-soft)] ">
                  <ShoppingBag className="h-4 w-4 text-[var(--text-tertiary)]" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-[var(--text-primary)] ">
                  {p.name}
                </span>
                <span className="text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
                  {p.imageUrl ? "envía la foto con precio" : "inserta el texto (sin foto)"}
                </span>
              </span>
              <span className="shrink-0 text-sm font-black tabular-nums text-primary">
                {formatCurrency(Number(p.price))}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
