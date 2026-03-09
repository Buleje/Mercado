"use client";

import { useState, useEffect, startTransition } from "react";
import Image from "next/image";
import { Flame, Plus, Package, Zap } from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { products } from "@/data/products";
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
function pickDeals(): Array<Product & { originalPrice: number; discount: number }> {
  const shuffled = [...products].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 4).map((p) => {
    const discount = [10, 15, 20, 25, 30][Math.floor(Math.random() * 5)];
    return {
      ...p,
      originalPrice: +(p.price / (1 - discount / 100)).toFixed(2),
      discount,
    };
  });
}

const DEALS_KEY = "bsm-flash-deals";
const DEALS_DATE_KEY = "bsm-flash-deals-date";

function loadOrCreateDeals() {
  if (typeof window === "undefined") return pickDeals();
  const today = new Date().toDateString();
  const savedDate = localStorage.getItem(DEALS_DATE_KEY);
  if (savedDate === today) {
    try {
      const saved = JSON.parse(localStorage.getItem(DEALS_KEY) || "[]");
      if (saved.length > 0) return saved;
    } catch {}
  }
  const deals = pickDeals();
  localStorage.setItem(DEALS_KEY, JSON.stringify(deals));
  localStorage.setItem(DEALS_DATE_KEY, today);
  return deals;
}

export default function FlashDeals() {
  const [deals, setDeals] = useState<Array<Product & { originalPrice: number; discount: number }>>([]);
  const [endTime] = useState(getEndOfDay);
  const [time, setTime] = useState(getTimeLeft(endTime));
  const { addItem } = useCart();
  const { showToast } = useToast();

  useEffect(() => {
    startTransition(() => setDeals(loadOrCreateDeals()));
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTime(getTimeLeft(endTime)), 1000);
    return () => clearInterval(t);
  }, [endTime]);

  if (deals.length === 0) return null;

  return (
    <section className="py-10 sm:py-14 bg-orange-50/70 dark:bg-surface">
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} onAdd={() => { addItem(deal); showToast(deal.name, deal.image); }} />
          ))}
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

function DealCard({ deal, onAdd }: { deal: Product & { originalPrice: number; discount: number }; onAdd: () => void }) {
  return (
    <div
      className="group relative bg-white dark:bg-card rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
    >
      {/* Discount badge */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1 bg-red-500 text-white rounded-full px-2.5 py-1 text-xs font-extrabold shadow-lg">
        -{deal.discount}%
      </div>

      {/* Image */}
      <div className="relative aspect-square bg-gray-50 dark:bg-surface overflow-hidden">
        {deal.image ? (
          <Image
            src={deal.image}
            alt={deal.name}
            fill
            loading="lazy"
            className="object-cover group-hover:scale-110 transition-transform duration-500"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-gray-300">
            <Package className="h-10 w-10" />
          </div>
        )}
        {/* Urgency ribbon */}
        <div className="absolute bottom-0 left-0 right-0 p-3 pt-8" style={{ background: "linear-gradient(to top, rgba(239,68,68,0.82), transparent)" }}>
          <p className="text-white text-[10px] font-bold uppercase tracking-wide">
            ¡Solo por hoy!
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="p-3 sm:p-4">
        <h3 className="font-semibold text-foreground text-sm leading-tight line-clamp-2 mb-2">
          {deal.name}
        </h3>
        <div className="flex items-end justify-between gap-2">
          <div>
            <span className="text-base sm:text-lg font-extrabold text-red-500">
              S/{deal.price.toFixed(2)}
            </span>
            <span className="block text-xs text-muted line-through">
              S/{deal.originalPrice.toFixed(2)}
            </span>
          </div>
          <button
            onClick={onAdd}
            className="flex items-center justify-center h-10 w-10 rounded-xl bg-red-500 text-white shadow-md hover:bg-red-600 hover:scale-110 active:scale-95 transition-all duration-200"
            aria-label={`Agregar ${deal.name}`}
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
