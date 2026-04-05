"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Zap, Search, Clock, Tag, X, Loader2, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Product = {
  id: string;
  name: string;
  price: number;
  category?: string;
  imageUrl?: string;
  stock?: number;
};

type Duration = { label: string; hours: number };

const DURATIONS: Duration[] = [
  { label: "1 hora", hours: 1 },
  { label: "2 horas", hours: 2 },
  { label: "4 horas", hours: 4 },
  { label: "8 horas", hours: 8 },
  { label: "24 horas", hours: 24 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcEndDate(hours: number): string {
  const end = new Date(Date.now() + hours * 60 * 60 * 1000);
  return end.toISOString();
}

function fmtPrice(n: number) {
  return `S/ ${n.toFixed(2)}`;
}

function discountPct(original: number, sale: number): number {
  if (original <= 0) return 0;
  return Math.round(((original - sale) / original) * 100);
}

// ── Countdown ─────────────────────────────────────────────────────────────────

function useCountdown(endIso: string | null) {
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    if (!endIso) { setRemaining(0); return; }
    const tick = () => setRemaining(Math.max(0, new Date(endIso).getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endIso]);

  const totalSec = Math.floor(remaining / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return { h, m, s, done: remaining === 0 };
}

function CountdownDisplay({ endIso }: { endIso: string | null }) {
  const { h, m, s } = useCountdown(endIso);
  if (!endIso) return null;

  function pad(n: number) { return n.toString().padStart(2, "0"); }

  return (
    <div className="flex items-center gap-1 font-mono" aria-live="polite" aria-atomic="true">
      <span className="rounded bg-gray-900 px-1.5 py-0.5 text-sm font-bold text-white dark:bg-gray-700">{pad(h)}</span>
      <span className="text-gray-500">:</span>
      <span className="rounded bg-gray-900 px-1.5 py-0.5 text-sm font-bold text-white dark:bg-gray-700">{pad(m)}</span>
      <span className="text-gray-500">:</span>
      <span className="rounded bg-gray-900 px-1.5 py-0.5 text-sm font-bold text-white dark:bg-gray-700">{pad(s)}</span>
    </div>
  );
}

// ── Preview de oferta ─────────────────────────────────────────────────────────

type PreviewProps = {
  product: Product;
  salePrice: number;
  duration: Duration;
  endIso: string;
};

function FlashSalePreview({ product, salePrice, duration, endIso }: PreviewProps) {
  const pct = discountPct(product.price, salePrice);

  return (
    <div className="rounded-xl border-2 border-[#f97316] bg-white dark:bg-gray-900 overflow-hidden shadow-md">
      {/* Cabecera oferta */}
      <div className="flex items-center justify-between bg-[#f97316] px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-white" aria-hidden="true" />
          <span className="text-sm font-bold text-white uppercase tracking-wide">Oferta Relampago</span>
        </div>
        <CountdownDisplay endIso={endIso} />
      </div>

      {/* Cuerpo */}
      <div className="p-3">
        <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-1">{product.name}</p>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="text-xl font-bold text-[#00B4A6] dark:text-[#3a8a65]">{fmtPrice(salePrice)}</span>
          <span className="text-sm text-gray-400 line-through">{fmtPrice(product.price)}</span>
          {pct > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600 dark:bg-red-900/30 dark:text-red-400">
              -{pct}%
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Dura {duration.label} — solo en Buleje
        </p>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function FlashSaleCreator({ className }: { className?: string }) {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [salePrice, setSalePrice] = useState("");
  const [duration, setDuration] = useState<Duration>(DURATIONS[0]);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Buscar productos con debounce
  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setProducts([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(q)}&limit=8`);
        if (!res.ok) throw new Error("Error buscando productos");
        const data = await res.json() as Product[];
        setProducts(data);
      } catch {
        setProducts([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  useEffect(() => {
    search(query);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  function selectProduct(p: Product) {
    setSelected(p);
    setSalePrice(p.price.toFixed(2));
    setQuery(p.name);
    setProducts([]);
    setError(null);
    setSuccess(false);
  }

  function clearSelection() {
    setSelected(null);
    setQuery("");
    setSalePrice("");
    setProducts([]);
    setError(null);
    setSuccess(false);
    setShowPreview(false);
  }

  const salePriceNum = parseFloat(salePrice) || 0;
  const endIso = calcEndDate(duration.hours);

  const canPreview = selected !== null && salePriceNum > 0 && salePriceNum < selected.price;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) { setError("Selecciona un producto"); return; }
    if (salePriceNum <= 0) { setError("Ingresa un precio de oferta valido"); return; }
    if (salePriceNum >= selected.price) { setError("El precio de oferta debe ser menor al precio original"); return; }

    setSaving(true);
    setError(null);

    try {
      const body = {
        name: `Oferta Relampago: ${selected.name}`,
        description: `Oferta especial por ${duration.label} — de ${fmtPrice(selected.price)} a ${fmtPrice(salePriceNum)}`,
        discountPercent: discountPct(selected.price, salePriceNum),
        type: "flash_sale",
        productId: selected.id,
        salePrice: salePriceNum,
        endDate: calcEndDate(duration.hours),
        expiresAt: calcEndDate(duration.hours),
        active: true,
        targetType: "all",
      };

      const res = await fetch("/api/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Error al crear la oferta");
      }

      setSuccess(true);
      clearSelection();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-white dark:bg-gray-900",
        "border-gray-200 dark:border-gray-700",
        "p-5 shadow-sm",
        className
      )}
      role="region"
      aria-label="Crear oferta relampago"
    >
      {/* Encabezado */}
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-lg bg-[#f97316]/10 p-1.5">
          <Zap className="h-5 w-5 text-[#f97316]" aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Oferta Relampago</h2>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {/* Buscar producto */}
        <div className="mb-4">
          <label htmlFor="flash-product-search" className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
            Producto
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input
              id="flash-product-search"
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (selected) clearSelection();
              }}
              placeholder="Buscar producto por nombre..."
              autoComplete="off"
              className={cn(
                "w-full rounded-lg border py-2 pl-9 pr-9 text-sm",
                "bg-white dark:bg-gray-800",
                "border-gray-300 dark:border-gray-600",
                "text-gray-900 dark:text-white placeholder-gray-400",
                "focus:outline-none focus:ring-2 focus:ring-[#00B4A6] focus:border-transparent",
                selected && "border-[#00B4A6] dark:border-[#3a8a65]"
              )}
            />
            {(searching) && (
              <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" aria-hidden="true" />
            )}
            {selected && !searching && (
              <button
                type="button"
                onClick={clearSelection}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
                aria-label="Limpiar seleccion"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Resultados de busqueda */}
          {products.length > 0 && !selected && (
            <ul
              className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
              role="listbox"
              aria-label="Resultados de busqueda"
            >
              {products.map((p) => (
                <li key={p.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onClick={() => selectProduct(p)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:bg-gray-50 dark:focus:bg-gray-700"
                  >
                    <span className="font-medium text-gray-900 dark:text-white">{p.name}</span>
                    <span className="text-gray-500 dark:text-gray-400">{fmtPrice(p.price)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Precios */}
        {selected && (
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Precio original
              </label>
              <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800 px-3 py-2">
                <Tag className="h-4 w-4 text-gray-400" aria-hidden="true" />
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400 line-through">
                  {fmtPrice(selected.price)}
                </span>
              </div>
            </div>

            <div>
              <label htmlFor="flash-sale-price" className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Precio de oferta
              </label>
              <div className="flex items-center gap-1.5 rounded-lg border border-[#f97316] bg-white dark:bg-gray-800 px-3 py-2 focus-within:ring-2 focus-within:ring-[#f97316]">
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">S/</span>
                <input
                  id="flash-sale-price"
                  type="number"
                  min="0.10"
                  step="0.10"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  className="w-full bg-transparent text-sm font-semibold text-[#f97316] focus:outline-none"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
        )}

        {/* Descuento calculado */}
        {selected && salePriceNum > 0 && salePriceNum < selected.price && (
          <div className="mb-4 rounded-lg bg-green-50 dark:bg-green-900/20 px-3 py-2 text-sm text-green-700 dark:text-green-400">
            Descuento del{" "}
            <span className="font-bold">{discountPct(selected.price, salePriceNum)}%</span>
            {" "}— ahorro de{" "}
            <span className="font-bold">{fmtPrice(selected.price - salePriceNum)}</span>
          </div>
        )}

        {/* Duracion */}
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-400">Duracion</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Duracion de la oferta">
            {DURATIONS.map((d) => (
              <button
                key={d.hours}
                type="button"
                role="radio"
                aria-checked={duration.hours === d.hours}
                onClick={() => setDuration(d)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00B4A6]",
                  duration.hours === d.hours
                    ? "border-[#00B4A6] bg-[#00B4A6] text-white dark:bg-[#00B4A6]"
                    : "border-gray-200 bg-white text-gray-600 hover:border-[#00B4A6]/50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                )}
              >
                <Clock className="h-3 w-3" aria-hidden="true" />
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Countdown preview */}
        {selected && (
          <div className="mb-4 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span>Terminara en:</span>
            <CountdownDisplay endIso={endIso} />
          </div>
        )}

        {/* Error / Exito */}
        {error && (
          <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}
        {success && (
          <div role="status" className="mb-3 rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20 px-3 py-2 text-sm text-green-700 dark:text-green-400">
            Oferta creada correctamente
          </div>
        )}

        {/* Acciones */}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={saving || !selected || salePriceNum <= 0}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold",
              "transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316]",
              saving || !selected || salePriceNum <= 0
                ? "cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600"
                : "bg-[#f97316] text-white hover:bg-[#e08c4a]"
            )}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Zap className="h-4 w-4" aria-hidden="true" />
            )}
            {saving ? "Creando oferta..." : "Activar oferta"}
          </button>

          {canPreview && (
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium",
                "border-gray-300 dark:border-gray-600",
                "text-gray-600 dark:text-gray-400",
                "hover:bg-gray-50 dark:hover:bg-gray-800",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00B4A6]"
              )}
              aria-pressed={showPreview}
              aria-label={showPreview ? "Ocultar preview" : "Ver preview"}
            >
              {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              Preview
            </button>
          )}
        </div>
      </form>

      {/* Preview */}
      {showPreview && canPreview && selected && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Asi se vera la oferta
          </p>
          <FlashSalePreview
            product={selected}
            salePrice={salePriceNum}
            duration={duration}
            endIso={endIso}
          />
        </div>
      )}
    </div>
  );
}

export default FlashSaleCreator;
