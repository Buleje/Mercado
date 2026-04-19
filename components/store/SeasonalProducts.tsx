'use client';

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { ShoppingCart, ChevronLeft, ChevronRight } from "@buleje/design-system/icons";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { cn } from "@/lib/utils";

type MatchedProduct = {
  id: number;
  name: string;
  price: number;
  image: string;
  unit: string;
  category: string;
};

type Temporada = {
  nombre: string;
  emoji: string;
  keywords: string[];
  color: { from: string; to: string };
};

function getTemporada(): Temporada {
  const month = new Date().getMonth();
  if (month >= 11 || month <= 2) return {
    nombre: "Temporada de lluvias",
    emoji: "\uD83C\uDF27\uFE0F",
    keywords: ["chocolate", "sopa", "te", "cafe", "galleta", "avena", "manzanilla"],
    color: { from: "#4361ee", to: "#3a0ca3" },
  };
  if (month >= 3 && month <= 5) return {
    nombre: "Cosecha de frutas",
    emoji: "\uD83C\uDF4A",
    keywords: ["camu", "aguaje", "cocona", "platano", "naranja", "mango", "fruta", "jugo"],
    color: { from: "#f77f00", to: "#d62828" },
  };
  if (month >= 6 && month <= 8) return {
    nombre: "Temporada seca",
    emoji: "\u2600\uFE0F",
    keywords: ["bebida", "refresco", "agua", "jugo", "helado", "gaseosa", "bloqueador"],
    color: { from: "#06d6a0", to: "#118ab2" },
  };
  return {
    nombre: "Fiestas de fin de ano",
    emoji: "\uD83C\uDF84",
    keywords: ["paneton", "chocolate", "turron", "sidra", "champagne", "galleta", "turrón"],
    color: { from: "#e63946", to: "#a8dadc" },
  };
}

export default function SeasonalProducts() {
  const [products, setProducts] = useState<MatchedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { addItem } = useCart();
  const { showToast } = useToast();
  const temporada = getTemporada();

  useEffect(() => {
    let cancelled = false;
    async function fetchProducts() {
      const allProducts: MatchedProduct[] = [];
      const seen = new Set<number>();

      for (const kw of temporada.keywords.slice(0, 5)) {
        try {
          const res = await fetch(`/api/products?search=${encodeURIComponent(kw)}&limit=3`);
          if (res.ok) {
            const data = await res.json();
            const items = Array.isArray(data) ? data : data.products || [];
            for (const p of items) {
              if (!seen.has(p.id)) {
                seen.add(p.id);
                allProducts.push({
                  id: p.id,
                  name: p.name,
                  price: p.price,
                  image: p.image || "",
                  unit: p.unit || "unidad",
                  category: p.category || "",
                });
              }
            }
          }
        } catch { /* ignore */ }
      }

      if (!cancelled) {
        setProducts(allProducts.slice(0, 10));
        setLoading(false);
      }
    }
    fetchProducts();
    return () => { cancelled = true; };
  }, [temporada.keywords]);

  const scroll = (dir: "left" | "right") => {
    if (scrollRef.current) {
      const amount = 220;
      scrollRef.current.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
    }
  };

  const handleAdd = (p: MatchedProduct) => {
    addItem(p);
    showToast(p.name, p.image);
  };

  if (loading || products.length === 0) return null;

  return (
    <section className="py-10 sm:py-14 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="text-3xl"
            >
              {temporada.emoji}
            </motion.span>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-[var(--text-primary)]">
                {temporada.nombre}
              </h2>
              <p className="text-xs text-[var(--text-tertiary)]">
                Productos de temporada en Pucallpa
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => scroll("left")}
              className="h-8 w-8 rounded-lg bg-[var(--surface-sunken)] flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              aria-label="Anterior"
            >
              <ChevronLeft className="h-4 w-4 text-[var(--text-secondary)]" />
            </button>
            <button
              onClick={() => scroll("right")}
              className="h-8 w-8 rounded-lg bg-[var(--surface-sunken)] flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              aria-label="Siguiente"
            >
              <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />
            </button>
          </div>
        </div>

        {/* Scrollable products */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory"
        >
          {products.map((p, idx) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="flex-shrink-0 w-44 sm:w-48 snap-start"
            >
              <div className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] overflow-hidden shadow-sm hover:shadow-lg transition-all group">
                {/* Image placeholder */}
                <div
                  className="h-28 flex items-center justify-center relative"
                  style={{ background: `linear-gradient(135deg, ${temporada.color.from}20, ${temporada.color.to}20)` }}
                >
                  {p.image ? (
                    <Image src={p.image} alt={p.name} fill className="object-cover" sizes="(max-width: 768px) 176px, 192px" />
                  ) : (
                    <span className="text-4xl opacity-50">{temporada.emoji}</span>
                  )}
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold text-white"
                    style={{ background: `linear-gradient(135deg, ${temporada.color.from}, ${temporada.color.to})` }}
                  >
                    De temporada
                  </span>
                </div>
                <div className="p-3">
                  <h4 className="text-sm font-bold text-[var(--text-primary)] truncate">{p.name}</h4>
                  <p className="text-xs text-[var(--text-tertiary)]">{p.unit}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-extrabold text-[#00B4A6] dark:text-[#2dd4bf]">
                      S/ {p.price.toFixed(2)}
                    </span>
                    <button
                      onClick={() => handleAdd(p)}
                      className={cn(
                        "h-10 w-10 rounded-2xl flex items-center justify-center transition-all",
                        "bg-[#00B4A6] hover:bg-[#009690] text-white shadow-md active:scale-95"
                      )}
                      aria-label={`Agregar ${p.name}`}
                    >
                      <ShoppingCart className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
