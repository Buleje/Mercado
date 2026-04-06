"use client";

import { useState, useEffect, startTransition } from "react";
import Image from "next/image";
import { Flame, ShoppingCart, Package, Zap, Minus, Plus } from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { useSettings } from "@/contexts/settings-context";
import { useStoreProducts } from "@/hooks/use-store-products";
import type { Product } from "@/data/products";

// compute flash deal defaults – daily deals that reset every day at midnight
function getEndOfDay(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function getTimeLeft(end: Date) {
  const diff = Math.max(0, end.getTime() - Date.now());
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { h, m, s, total: diff };
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

// Pick 4 random products as daily "flash deals" with fake discounts
function pickDeals(allProducts: Product[], discount: number): Array<Product & { originalPrice: number; discount: number }> {
  const shuffled = [...allProducts].filter((p) => !(p.stock != null && p.stock <= 0)).sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 6).map((p) => ({
    ...p,
    originalPrice: +(p.price / (1 - discount / 100)).toFixed(2),
    discount,
  }));
}

// Build deals from admin-selected IDs, or fall back to random
function buildAdminDeals(allProducts: Product[], ids: number[], discount: number): Array<Product & { originalPrice: number; discount: number }> {
  const selected = ids
    .map(id => allProducts.find(p => p.id === id))
    .filter((p): p is Product => Boolean(p) && !(p!.stock != null && p!.stock <= 0));
  if (selected.length === 0) return [];
  return selected.slice(0, 8).map(p => ({
    ...p,
    originalPrice: +(p.price / (1 - discount / 100)).toFixed(2),
    discount,
  }));
}

const DEALS_KEY = "bsm-flash-deals";
const DEALS_DATE_KEY = "bsm-flash-deals-date";

function loadOrCreateDeals(allProducts: Product[], discount: number) {
  if (typeof window === "undefined") return pickDeals(allProducts, discount);
  const today = new Date().toDateString();
  const savedDate = localStorage.getItem(DEALS_DATE_KEY);
  if (savedDate === today) {
    try {
      const saved = JSON.parse(localStorage.getItem(DEALS_KEY) || "[]");
      // Validate that ALL saved deals still exist in current products
      const currentIds = new Set(allProducts.map(p => p.id));
      const validDeals = saved.filter((d: Product) => currentIds.has(d.id));
      if (validDeals.length > 0) return validDeals;
    } catch {}
  }
  // Clear stale localStorage and create fresh deals from current products
  localStorage.removeItem(DEALS_KEY);
  localStorage.removeItem(DEALS_DATE_KEY);
  const deals = pickDeals(allProducts, discount);
  localStorage.setItem(DEALS_KEY, JSON.stringify(deals));
  localStorage.setItem(DEALS_DATE_KEY, today);
  return deals;
}

export default function FlashDeals() {
  const { homepage: hp } = useSettings();
  const [deals, setDeals] = useState<Array<Product & { originalPrice: number; discount: number }>>([]);
  const [endTime] = useState(getEndOfDay);
  const [time, setTime] = useState(getTimeLeft(endTime));
  const { addItem, items, updateQty } = useCart();
  const { showToast } = useToast();
  const { products, isLoading } = useStoreProducts();
  const discount = hp.flashDealDiscount ?? 20;

  useEffect(() => {
    // Solo construir deals cuando los productos ya cargaron
    if (isLoading || products.length === 0) return;
    // Prefer admin-selected deals, fall back to random daily picks
    const adminIds = hp.flashDealIds ?? [];
    const adminDeals = adminIds.length > 0 ? buildAdminDeals(products, adminIds, discount) : [];
    startTransition(() => setDeals(adminDeals.length > 0 ? adminDeals : loadOrCreateDeals(products, discount)));
  }, [products, isLoading, hp.flashDealIds, discount]);

  useEffect(() => {
    const t = setInterval(() => setTime(getTimeLeft(endTime)), 1000);
    return () => clearInterval(t);
  }, [endTime]);

  // No render while loading or if no deals — prevents blank gaps
  if (isLoading || deals.length === 0) return null;

  /* JSON-LD Offer schema for flash deals */
  const flashOffersSchema = {
    "@context": "https://schema.org",
    "@type": "OfferCatalog",
    name: "Ofertas Relámpago — Buleje",
    itemListElement: deals.map((d) => ({
      "@type": "Offer",
      name: d.name,
      price: (d.originalPrice - d.originalPrice * d.discount / 100).toFixed(2),
      priceCurrency: "PEN",
      availability: "https://schema.org/InStock",
      priceValidUntil: endTime.toISOString().split("T")[0],
      eligibleRegion: { "@type": "Place", name: "Ucayali, Perú" },
    })),
  };

  return (
    <section className="py-10 sm:py-14 bg-orange-50/70 dark:bg-surface">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(flashOffersSchema) }}
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-red-500 text-white">
                <Flame className="h-5 w-5" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground">
                Ofertas <span className="text-red-500">Relámpago</span>
              </h2>
              <Zap className="h-5 w-5 text-amber-500 fill-amber-500 animate-pulse" />
            </div>
            <p className="text-sm text-muted">¡Aprovecha antes de que se acaben! Precios especiales solo por hoy.</p>
          </div>

          {/* Countdown */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-muted uppercase tracking-wide mr-2">Termina en:</span>
            <TimeBox value={pad(time.h)} label="Hrs" />
            <span className="text-xl font-bold text-red-500 animate-pulse">:</span>
            <TimeBox value={pad(time.m)} label="Min" />
            <span className="text-xl font-bold text-red-500 animate-pulse">:</span>
            <TimeBox value={pad(time.s)} label="Seg" />
          </div>
        </div>

        {/* Deal Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {deals.map((deal) => {
            const qty = items.find(i => i.id === deal.id)?.quantity ?? 0;
            return <DealCard key={deal.id} deal={deal} qty={qty} onAdd={() => { addItem(deal); showToast(deal.name, deal.image); }} onDec={() => updateQty(deal.id, qty - 1)} onInc={() => updateQty(deal.id, qty + 1)} />;
          })}
        </div>
      </div>
    </section>
  );
}

function TimeBox({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="bg-foreground text-background font-mono text-lg sm:text-xl font-extrabold px-2.5 py-1.5 rounded-lg shadow-md min-w-10 text-center">
        {value}
      </span>
      <span className="text-[9px] uppercase tracking-wider text-muted mt-1 font-semibold">{label}</span>
    </div>
  );
}

function DealCard({ deal, qty, onAdd, onDec, onInc }: { deal: Product & { originalPrice: number; discount: number }; qty: number; onAdd: () => void; onDec: () => void; onInc: () => void }) {
  return (
    <div className="group relative bg-white dark:bg-card rounded-xl overflow-hidden border border-gray-100 dark:border-card-border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      {/* Discount badge */}
      {deal.discount > 0 && (
        <div className="absolute top-1.5 left-1.5 z-10 bg-red-500 text-white rounded px-1.5 py-0.5 text-[10px] font-extrabold">
          -{deal.discount}%
        </div>
      )}

      {/* Image */}
      <div className="relative aspect-square bg-gray-50 dark:bg-surface overflow-hidden">
        {deal.image ? (
          <Image
            src={deal.image}
            alt={deal.name}
            fill
            loading="lazy"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-gray-300">
            <Package className="h-8 w-8" />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-3">
        <h3 className="font-semibold text-foreground text-sm leading-tight line-clamp-2 mb-2">
          {deal.name}
        </h3>
        <div className="flex items-center justify-between gap-1">
          <div>
            <span className="text-base font-extrabold text-red-500">S/{deal.price.toFixed(2)}</span>
            <span className="block text-xs text-muted line-through">S/{deal.originalPrice.toFixed(2)}</span>
          </div>
          {qty > 0 ? (
            <div className="flex items-center gap-0.5 bg-red-500 rounded-full px-1 py-1 shrink-0 sm:px-1.5">
              <button onClick={onDec} className="h-6 w-6 sm:h-7 sm:w-7 flex items-center justify-center rounded-full text-white hover:bg-white/20 transition-colors" aria-label="Disminuir">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="text-white font-extrabold text-xs sm:text-sm min-w-4 sm:min-w-5 text-center">{qty}</span>
              <button onClick={onInc} className="h-6 w-6 sm:h-7 sm:w-7 flex items-center justify-center rounded-full text-white hover:bg-white/20 transition-colors" aria-label="Aumentar">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onAdd}
              className="flex items-center justify-center h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-red-500 text-white hover:bg-red-600 active:scale-95 shrink-0"
              aria-label={`Agregar ${deal.name}`}
            >
              <ShoppingCart className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
