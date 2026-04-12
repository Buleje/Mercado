"use client";

import { useState } from "react";
import { Store, ShoppingCart, Search, Star, ChevronRight, Sparkles, Package } from "lucide-react";
import { cn } from "@/lib/utils";

const COLOR_PRESETS = [
  { name: "Teal", primary: "#00B4A6", secondary: "#f97316" },
  { name: "Azul", primary: "#2563eb", secondary: "#7c3aed" },
  { name: "Rosa", primary: "#e11d48", secondary: "#f59e0b" },
  { name: "Verde", primary: "#16a34a", secondary: "#0ea5e9" },
  { name: "Naranja", primary: "#ea580c", secondary: "#8b5cf6" },
];

const SAMPLE_PRODUCTS = [
  { name: "Arroz Costeno 5kg", price: "S/ 22.50", img: "bg-amber-100" },
  { name: "Aceite Primor 1L", price: "S/ 8.90", img: "bg-yellow-100" },
  { name: "Leche Gloria 1L", price: "S/ 5.20", img: "bg-blue-100" },
  { name: "Azucar Rubia 1kg", price: "S/ 4.50", img: "bg-orange-100" },
];

export default function SaasStorePreview() {
  const [storeName, setStoreName] = useState("");
  const [colorIdx, setColorIdx] = useState(0);
  const color = COLOR_PRESETS[colorIdx];
  const displayName = storeName || "Tu Bodega";

  return (
    <section className="py-20 sm:py-28 bg-gray-50 dark:bg-gray-900/50 overflow-hidden">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-1.5 bg-pink-50 dark:bg-pink-950/30 text-pink-600 dark:text-pink-400 text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full mb-4">
            <Sparkles className="h-3 w-3" /> Preview instantaneo
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white">
            Asi se vera TU tienda
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-2">Escribe el nombre y elige un color. En 3 segundos ves el resultado.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Controles */}
          <div className="lg:col-span-2 space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Nombre de tu tienda</label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Ej: Mi Bodega"
                maxLength={30}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/40 placeholder:text-gray-400"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Color de marca</label>
              <div className="flex gap-2">
                {COLOR_PRESETS.map((c, i) => (
                  <button
                    key={c.name}
                    onClick={() => setColorIdx(i)}
                    className={cn(
                      "h-9 w-9 rounded-full border-2 transition-all",
                      i === colorIdx ? "border-gray-900 dark:border-white scale-110 shadow-lg" : "border-transparent hover:scale-105"
                    )}
                    style={{ backgroundColor: c.primary }}
                    aria-label={c.name}
                  />
                ))}
              </div>
            </div>

            <a
              href="/registro"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 shadow-lg"
              style={{ backgroundColor: color.primary }}
            >
              Crear mi tienda gratis <ChevronRight className="h-4 w-4" />
            </a>
          </div>

          {/* Preview de tienda */}
          <div className="lg:col-span-3">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden">
              {/* Navbar */}
              <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: color.primary }}>
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4 text-white" />
                  <span className="text-sm font-extrabold text-white">{displayName}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Search className="h-4 w-4 text-white/60" />
                  <div className="relative">
                    <ShoppingCart className="h-4 w-4 text-white/60" />
                    <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full text-[8px] font-bold text-white flex items-center justify-center" style={{ backgroundColor: color.secondary }}>2</span>
                  </div>
                </div>
              </div>

              {/* Hero */}
              <div className="px-4 py-6 text-center" style={{ background: `linear-gradient(135deg, ${color.primary}15, ${color.secondary}10)` }}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: color.primary }}>Bienvenido a</p>
                <p className="text-xl font-extrabold text-gray-900 dark:text-white mt-1">{displayName}</p>
                <p className="text-xs text-gray-500 mt-1">Delivery rapido en tu zona</p>
                <button
                  className="mt-3 px-4 py-1.5 rounded-lg text-xs font-bold text-white"
                  style={{ backgroundColor: color.secondary }}
                >
                  Ver productos
                </button>
              </div>

              {/* Products grid */}
              <div className="px-4 py-4">
                <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3">Productos destacados</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {SAMPLE_PRODUCTS.map((p) => (
                    <div key={p.name} className="rounded-xl border border-gray-100 dark:border-gray-700 p-2.5 hover:shadow-sm transition-shadow">
                      <div className={cn("h-16 rounded-lg mb-2 flex items-center justify-center", p.img)}>
                        <Package className="h-6 w-6 text-gray-400/50" />
                      </div>
                      <p className="text-[11px] font-semibold text-gray-800 dark:text-gray-200 truncate">{p.name}</p>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs font-extrabold" style={{ color: color.primary }}>{p.price}</p>
                        <div className="flex items-center gap-0.5">
                          <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
                          <span className="text-[9px] text-gray-400">4.8</span>
                        </div>
                      </div>
                      <button
                        className="mt-1.5 w-full py-1 rounded-md text-[10px] font-bold text-white"
                        style={{ backgroundColor: color.primary }}
                      >
                        Agregar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
