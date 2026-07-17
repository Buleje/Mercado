"use client";

import { useEffect, useState } from "react";
import { ShoppingBag, X, Search, Loader2 } from "@buleje/design-system/icons";
import { tenantFetch } from "@/lib/tenant-fetch";

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
    const caption = `${p.name} — S/ ${Number(p.price).toFixed(2)}${p.unit ? ` x ${p.unit}` : ""}`;
    if (p.imageUrl) {
      const ok = await onSendImage(p.imageUrl, caption);
      if (ok) onClose();
    } else {
      onInsertText(`🛒 ${caption}`);
      onClose();
    }
  }

  return (
    <div className="border-t border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between px-4 pt-3">
        <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
          <ShoppingBag className="h-4 w-4 text-primary" />
          Compartir producto
        </p>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Cerrar productos"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-3">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar producto…"
            className="h-11 w-full rounded-2xl border-2 border-slate-200 bg-white pl-9 pr-3 text-base text-slate-900 outline-none transition focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </div>
        <div className="max-h-56 space-y-1.5 overflow-y-auto">
          {loading && (
            <p className="flex items-center gap-2 p-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
            </p>
          )}
          {!loading && products.length === 0 && (
            <p className="p-2 text-sm text-slate-500">Sin resultados en tu catálogo.</p>
          )}
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={sending}
              onClick={() => void share(p)}
              className="flex w-full items-center gap-3 rounded-xl border-2 border-slate-200 p-2 text-left transition hover:border-primary/60 disabled:opacity-50 dark:border-slate-700"
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
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                  <ShoppingBag className="h-4 w-4 text-slate-400" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">
                  {p.name}
                </span>
                <span className="text-[length:var(--ts-xs)] text-slate-500">
                  {p.imageUrl ? "envía la foto con precio" : "inserta el texto (sin foto)"}
                </span>
              </span>
              <span className="shrink-0 text-sm font-black tabular-nums text-primary">
                S/ {Number(p.price).toFixed(2)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
