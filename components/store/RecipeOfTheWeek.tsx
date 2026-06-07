'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { m as motion } from "framer-motion";
import { Clock, Users, ShoppingCart, Star, ArrowRight, ChefHat } from "@buleje/design-system/icons";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";

type Ingrediente = {
  id?: string;
  productoId?: number | null;
  nombre: string;
  cantidad: number;
  unidad: string;
  precio: number;
  imagen?: string | null;
  stock: number;
  categoria?: string;
};

type Receta = {
  id: string;
  nombre: string;
  descripcion: string | null;
  emoji?: string;
  tiempoMinutos?: number;
  porciones?: number;
  dificultad?: string;
  categoria?: string;
  colorFrom?: string;
  colorTo?: string;
  ingredientes: Ingrediente[];
  totalIngredientes: number;
};

const CATEGORIA_GRADIENTS: Record<string, { from: string; to: string }> = {
  "Entradas": { from: "#60a5fa", to: "#06b6d4" },
  "Platos de fondo": { from: "#f97316", to: "#ef4444" },
  "Postres": { from: "#f472b6", to: "#a855f7" },
  "Bebidas": { from: "#facc15", to: "#f59e0b" },
  "Sopas": { from: "#4ade80", to: "#14C2C2" },
};

function getWeekSeed(): number {
  return Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
}

export default function RecipeOfTheWeek() {
  const [receta, setReceta] = useState<Receta | null>(null);
  const [loading, setLoading] = useState(true);
  const { addItem } = useCart();
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/recetas/publicas")
      .then(r => r.json())
      .then((data: Receta[]) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        if (list.length === 0) { setLoading(false); return; }

        // Select recipe based on week seed
        const seed = getWeekSeed();
        const idx = seed % list.length;
        setReceta(list[idx]);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleAddIngredients = () => {
    if (!receta) return;
    let addedCount = 0;
    for (const ing of receta.ingredientes) {
      if (ing.stock > 0 && ing.productoId) {
        addItem({
          id: ing.productoId,
          name: ing.nombre,
          price: ing.precio,
          image: ing.imagen || "",
          unit: ing.unidad,
          category: ing.categoria || "Receta",
        });
        addedCount++;
      }
    }
    if (addedCount === 0) addedCount = receta.ingredientes.filter(i => i.stock > 0).length;
    showToast(`${addedCount} ingredientes de "${receta.nombre}" agregados`, "");
  };

  if (loading || !receta) return null;

  const colors = receta.colorFrom && receta.colorTo
    ? { from: receta.colorFrom, to: receta.colorTo }
    : CATEGORIA_GRADIENTS[receta.categoria || ""] || { from: "var(--accent)", to: "#007A72" };

  return (
    <section className="py-10 sm:py-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="rounded-3xl overflow-hidden shadow-xl border border-[var(--rule-base)]"
          style={{
            background: `linear-gradient(135deg, ${colors.from}12, ${colors.to}12)`,
          }}
        >
          <div className="flex flex-col md:flex-row">
            {/* Left: Visual */}
            <div
              className="md:w-2/5 h-48 md:h-auto min-h-[220px] relative flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`,
              }}
            >
              {/* Pattern */}
              <div
                className="absolute inset-0 opacity-[0.06]"
                style={{
                  backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
                  backgroundSize: "24px 24px",
                }}
              />

              {/* Badge */}
              <div className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-sm border border-white/15">
                <Star className="h-3.5 w-3.5 text-yellow-300 fill-yellow-300" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Receta de la semana
                </span>
              </div>

              {/* Large emoji */}
              <motion.span
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
                className="text-[100px] sm:text-[120px] drop-shadow-2xl"
                style={{ filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.3))" }}
              >
                {receta.emoji || "\uD83C\uDF73"}
              </motion.span>
            </div>

            {/* Right: Info */}
            <div className="md:w-3/5 p-6 sm:p-8 flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-2">
                <ChefHat className="h-4 w-4 text-[#f97316]" />
                <span className="text-xs font-bold text-[#f97316] uppercase tracking-wider">
                  Receta destacada
                </span>
              </div>

              <h3 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] leading-tight">
                {receta.nombre}
              </h3>

              {receta.descripcion && (
                <p className="text-sm text-[var(--text-secondary)] mt-2 line-clamp-2 leading-relaxed">
                  {receta.descripcion}
                </p>
              )}

              {/* Badges */}
              <div className="flex items-center gap-3 mt-4 flex-wrap">
                {receta.tiempoMinutos && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] text-xs font-medium">
                    <Clock className="h-3.5 w-3.5" /> {receta.tiempoMinutos} min
                  </span>
                )}
                {receta.porciones && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] text-xs font-medium">
                    <Users className="h-3.5 w-3.5" /> {receta.porciones} porciones
                  </span>
                )}
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] text-xs font-medium">
                  {receta.ingredientes.length} ingredientes
                </span>
              </div>

              {/* Price + actions */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mt-6">
                <span className="text-2xl font-extrabold text-[var(--accent)] dark:text-[#14C2C2]">
                  S/ {Number(receta.totalIngredientes).toFixed(2)}
                </span>
                <div className="flex gap-2">
                  <Link
                    href={`/recetas/${receta.id}`}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold text-sm hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors shadow-lg"
                  >
                    Ver receta <ArrowRight className="h-4 w-4" />
                  </Link>
                  <button
                    onClick={handleAddIngredients}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-dark)] text-white font-bold text-sm transition-all shadow-lg active:scale-[0.98]"
                  >
                    <ShoppingCart className="h-5 w-5" />
                    Comprar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
