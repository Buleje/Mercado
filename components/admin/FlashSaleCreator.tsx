"use client";

import { SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback, useRef } from "react";
import { Zap, Search, Clock, Tag, X, Loader2, Eye, EyeOff } from "@buleje/design-system/icons";
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
      <span className="text-[var(--text-secondary)]">:</span>
      <span className="rounded bg-gray-900 px-1.5 py-0.5 text-sm font-bold text-white dark:bg-gray-700">{pad(m)}</span>
      <span className="text-[var(--text-secondary)]">:</span>
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
    <div className="rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--surface-raised)] overflow-hidden">
      {/* Cabecera oferta */}
      <div className="flex items-center justify-between bg-[var(--data-warning-500)] px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-white" aria-hidden="true" />
          <span className="text-sm font-bold text-white">Oferta Relampago</span>
        </div>
        <CountdownDisplay endIso={endIso} />
      </div>

      {/* Cuerpo */}
      <div className="p-3">
        <p className="text-sm font-semibold text-[var(--text-primary)] line-clamp-1">{product.name}</p>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="text-xl font-bold text-primary dark:text-[#3a8a65]">{fmtPrice(salePrice)}</span>
          <span className="text-sm text-[var(--text-tertiary)] line-through">{fmtPrice(product.price)}</span>
          {pct > 0 && (
            <span className="rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-xs font-bold text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30 dark:text-[var(--data-error-500)]">
              -{pct}%
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
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
        "rounded-xl border bg-[var(--surface-raised)]",
        "border-[var(--rule-base)]",
        "p-5 ",
        className
      )}
      role="region"
      aria-label="Crear oferta relampago"
    >
      {/* Encabezado */}
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-lg bg-[var(--data-warning-500)]/10 p-1.5">
          <Zap className="h-5 w-5 text-[var(--data-warning-500)]" aria-hidden="true" />
        </div>
        <SectionTitle className="text-base font-semibold text-[var(--text-primary)]">Oferta Relampago</SectionTitle>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {/* Buscar producto */}
        <div className="mb-4">
          <label htmlFor="flash-product-search" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
            Producto
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden="true" />
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
                "bg-[var(--surface-raised)]",
                "border-[var(--rule-base)] dark:border-gray-600",
                "text-[var(--text-primary)] placeholder-gray-400",
                "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
                selected && "border-primary dark:border-[#3a8a65]"
              )}
            />
            {(searching) && (
              <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--text-tertiary)]" aria-hidden="true" />
            )}
            {selected && !searching && (
              <button
                type="button"
                onClick={clearSelection}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-tertiary)] focus:outline-none"
                aria-label="Limpiar seleccion"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Resultados de busqueda */}
          {products.length > 0 && !selected && (
            <ul
              className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-[var(--rule-base)] bg-white dark:border-[var(--rule-base)] dark:bg-gray-800"
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
                    <span className="font-medium text-[var(--text-primary)]">{p.name}</span>
                    <span className="text-[var(--text-tertiary)]">{fmtPrice(p.price)}</span>
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
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                Precio original
              </label>
              <div className="flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-gray-50 dark:border-[var(--rule-base)] dark:bg-gray-800 px-3 py-2">
                <Tag className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden="true" />
                <span className="text-sm font-medium text-[var(--text-tertiary)] line-through">
                  {fmtPrice(selected.price)}
                </span>
              </div>
            </div>

            <div>
              <label htmlFor="flash-sale-price" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                Precio de oferta
              </label>
              <div className="flex items-center gap-1.5 rounded-lg border border-[var(--data-warning-500)] bg-[var(--surface-raised)] px-3 py-2 focus-within:ring-2 focus-within:ring-[var(--data-warning-500)]">
                <span className="text-sm font-medium text-[var(--text-tertiary)]">S/</span>
                <input
                  id="flash-sale-price"
                  type="number"
                  min="0.10"
                  step="0.10"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  className="w-full bg-transparent text-sm font-semibold text-[var(--data-warning-500)] focus:outline-none"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
        )}

        {/* Descuento calculado */}
        {selected && salePriceNum > 0 && salePriceNum < selected.price && (
          <div className="mb-4 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] px-3 py-2 text-sm text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
            Descuento del{" "}
            <span className="font-bold">{discountPct(selected.price, salePriceNum)}%</span>
            {" "}— ahorro de{" "}
            <span className="font-bold">{fmtPrice(selected.price - salePriceNum)}</span>
          </div>
        )}

        {/* Duracion */}
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">Duracion</p>
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
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  duration.hours === d.hours
                    ? "border-primary bg-primary text-white dark:bg-primary"
                    : "border-[var(--rule-base)] bg-white text-[var(--text-secondary)] hover:border-primary/50 dark:border-[var(--rule-base)] dark:bg-gray-800 dark:text-[var(--text-tertiary)]"
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
          <div className="mb-4 flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
            <span>Terminara en:</span>
            <CountdownDisplay endIso={endIso} />
          </div>
        )}

        {/* Error / Exito */}
        {error && (
          <div role="alert" className="mb-3 rounded-lg border border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:border-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/20 px-3 py-2 text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
            {error}
          </div>
        )}
        {success && (
          <div role="status" className="mb-3 rounded-lg border border-[var(--data-success-500)]/30 bg-[var(--accent-soft)] dark:border-[var(--data-success-500)]/30 dark:bg-[var(--accent-muted)] px-3 py-2 text-sm text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
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
              "transition-colors duration-[var(--dur-fast)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--data-warning-500)]",
              saving || !selected || salePriceNum <= 0
                ? "cursor-not-allowed bg-gray-100 text-[var(--text-tertiary)] dark:bg-gray-800 dark:text-[var(--text-secondary)]"
                : "bg-[var(--data-warning-500)] text-white hover:bg-[#e08c4a]"
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
                "border-[var(--rule-base)] dark:border-gray-600",
                "text-[var(--text-secondary)]",
                "hover:bg-[var(--surface-sunken)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
          <p className="mb-2 text-xs font-medium text-[var(--text-tertiary)]">
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
