"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { ShoppingCart, Package, Star, Clock } from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";

interface DealProduct {
  id: number;
  name: string;
  price: number;
  image: string;
  unit: string;
  category: string;
}

function useCountdown() {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const calc = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(23, 59, 59, 0);
      const diff = midnight.getTime() - now.getTime();
      if (diff <= 0) {
        setTimeLeft("00h 00m 00s");
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(
        `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`
      );
    };
    calc();
    const timer = setInterval(calc, 1000);
    return () => clearInterval(timer);
  }, []);

  return timeLeft;
}

export default function DailyDeal() {
  const [product, setProduct] = useState<DealProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const { addItem } = useCart();
  const { showToast } = useToast();
  const countdown = useCountdown();

  useEffect(() => {
    let cancelled = false;
    // Timeout: collapse loading skeleton after 4s if fetch is slow
    const timeout = setTimeout(() => { if (!cancelled) setLoading(false); }, 4000);
    async function fetchDeal() {
      try {
        const res = await fetch("/api/products?limit=1&sort=popular");
        if (res.ok && !cancelled) {
          const data = await res.json();
          const items = Array.isArray(data) ? data : data.products || [];
          if (items.length > 0) {
            setProduct(items[0]);
          }
        }
      } catch {
        // No deal available
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchDeal();
    return () => { cancelled = true; clearTimeout(timeout); };
  }, []);

  const handleAdd = useCallback(() => {
    if (!product) return;
    addItem(product as import("@/data/products").Product);
    showToast(product.name, product.image || "");
  }, [product, addItem, showToast]);

  if (loading) {
    return (
      <section className="py-10 sm:py-16 bg-white dark:bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border-2 border-gray-100 dark:border-card-border bg-gray-50 dark:bg-surface p-6 sm:p-10 animate-pulse">
            <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
              <div className="w-40 h-40 sm:w-56 sm:h-56 rounded-2xl bg-gray-200 dark:bg-gray-700 shrink-0" />
              <div className="flex-1 space-y-4 w-full">
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-lg w-3/4 mx-auto sm:mx-0" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mx-auto sm:mx-0" />
                <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg w-32 mx-auto sm:mx-0" />
                <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded-xl w-48 mx-auto sm:mx-0" />
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!product) return null;

  return (
    <section className="py-10 sm:py-16 bg-white dark:bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border-2 border-secondary/30 bg-gradient-to-br from-secondary/8 via-white to-primary/8 dark:from-secondary/15 dark:via-card dark:to-primary/15 p-6 sm:p-10 shadow-lg shadow-secondary/5">
          {/* Badge */}
          <div className="absolute top-4 left-4 sm:top-6 sm:left-6">
            <span className="inline-flex items-center gap-1.5 bg-secondary text-white text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full shadow-md">
              <Star className="w-3.5 h-3.5 fill-current" />
              Pedido del d\u00eda
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10 pt-8 sm:pt-4">
            {/* Image */}
            <div className="relative w-40 h-40 sm:w-56 sm:h-56 rounded-2xl overflow-hidden bg-gray-50 dark:bg-surface shrink-0 shadow-xl">
              {product.image ? (
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 160px, 224px"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-gray-300">
                  <Package className="h-16 w-16" />
                </div>
              )}
            </div>

            {/* Details */}
            <div className="flex-1 text-center sm:text-left">
              <h3 className="text-xl sm:text-2xl font-extrabold text-foreground mb-2">
                {product.name}
              </h3>
              <p className="text-sm text-muted mb-3">
                El producto m\u00e1s pedido de hoy. Aprovecha antes que se acabe.
              </p>

              {/* Price */}
              <div className="flex items-center gap-3 justify-center sm:justify-start mb-4">
                <span className="text-3xl sm:text-4xl font-extrabold text-primary">
                  S/{product.price.toFixed(2)}
                </span>
                <span className="text-sm text-muted">/{product.unit}</span>
              </div>

              {/* Countdown */}
              <div className="flex items-center gap-2 justify-center sm:justify-start mb-5">
                <Clock className="w-4 h-4 text-secondary" />
                <span className="text-sm font-semibold text-foreground">
                  Oferta v\u00e1lida por{" "}
                  <span className="text-secondary font-bold tabular-nums">{countdown}</span>
                </span>
              </div>

              {/* CTA */}
              <button
                onClick={handleAdd}
                className="inline-flex items-center gap-2 bg-primary text-white font-bold px-8 py-3.5 rounded-xl hover:bg-primary/90 active:scale-95 transition-all shadow-lg hover:shadow-xl text-base"
              >
                <ShoppingCart className="w-5 h-5" />
                Agregar al carrito
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
