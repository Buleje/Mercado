"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ShoppingCart, Clock, Users, Sparkles, Package, Minus, Plus, ArrowRight } from "lucide-react";
import { products, type Product } from "@/data/products";
import { useCart } from "@/contexts/cart-context";
import { useInView } from "@/hooks/use-in-view";

type Recipe = {
  name: string;
  emoji: string;
  time: string;
  servings: number;
  gradient: string;
  ingredients: string[];
};

const RECIPES: Recipe[] = [
  {
    name: "Ceviche Clásico",
    emoji: "🐟",
    time: "20 min",
    servings: 4,
    gradient: "linear-gradient(135deg, #06b6d4, #2563eb)",
    ingredients: ["limón", "cebolla", "pescado", "ají", "camote"],
  },
  {
    name: "Lomo Saltado",
    emoji: "🥩",
    time: "30 min",
    servings: 4,
    gradient: "linear-gradient(135deg, #ef4444, #ea580c)",
    ingredients: ["carne", "tomate", "cebolla", "arroz", "aceite"],
  },
  {
    name: "Ensalada Fresca",
    emoji: "🥗",
    time: "10 min",
    servings: 2,
    gradient: "linear-gradient(135deg, #0f766e, #0d5f58)",
    ingredients: ["lechuga", "tomate", "palta", "limón", "aceite"],
  },
  {
    name: "Arroz con Pollo",
    emoji: "🍗",
    time: "45 min",
    servings: 6,
    gradient: "linear-gradient(135deg, #f59e0b, #ca8a04)",
    ingredients: ["arroz", "pollo", "arveja", "zanahoria", "cerveza"],
  },
];

function findProducts(ingredientNames: string[]): Product[] {
  const found: Product[] = [];
  for (const name of ingredientNames) {
    const match = products.find((p) =>
      p.name.toLowerCase().includes(name.toLowerCase())
    );
    if (match && !found.some((f) => f.id === match.id)) found.push(match);
  }
  return found;
}

export default function RecipeSuggestions() {
  const { addItem } = useCart();
  const [ref, inView] = useInView({ threshold: 0.1 });
  /* V4: Portion multipliers per recipe */
  const [portions, setPortions] = useState<Record<string, number>>({});

  const addAllIngredients = (ingredientNames: string[], multiplier: number) => {
    const matched = findProducts(ingredientNames);
    matched.forEach((p) => {
      for (let i = 0; i < Math.ceil(multiplier); i++) addItem(p);
    });
  };

  return (
    <section ref={ref} className="py-14 sm:py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className={`text-center mb-10 sm:mb-14 transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <span className="inline-flex items-center gap-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            Inspiración
          </span>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-foreground">
            Ideas para{" "}
            <span className="relative inline-block text-primary">
              cocinar
              <svg className="absolute -bottom-1.5 left-0 w-full h-2.5" viewBox="0 0 120 10" preserveAspectRatio="none">
                <path d="M2 8 Q30 2 60 6 Q90 10 118 3" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
              </svg>
            </span>
          </h2>
          <p className="text-muted mt-2 text-sm sm:text-base max-w-lg mx-auto">
            Recetas peruanas con ingredientes que encuentras en la bodega
          </p>
        </div>

        {/* Recipe cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-7">
          {RECIPES.map((recipe, i) => {
            const matched = findProducts(recipe.ingredients);
            const multiplier = (portions[recipe.name] ?? recipe.servings) / recipe.servings;
            const currentServings = portions[recipe.name] ?? recipe.servings;
            const totalPrice = matched.reduce((sum, p) => sum + p.price * multiplier, 0);

            return (
              <div
                key={recipe.name}
                className={`group bg-card rounded-2xl shadow-sm ring-1 ring-black/5 dark:ring-white/5 overflow-hidden hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 flex flex-col ${
                  inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
                style={{ transitionDelay: inView ? `${i * 120}ms` : "0ms" }}
              >
                {/* Gradient header */}
                <div
                  className="relative px-5 pt-5 pb-4 text-white overflow-hidden"
                  style={{ background: recipe.gradient }}
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-bl-full" />
                  <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 rounded-tr-full" />

                  <span className="text-4xl block mb-2 drop-shadow-md relative">{recipe.emoji}</span>
                  <h3 className="text-lg font-extrabold leading-tight relative">{recipe.name}</h3>

                  {/* Meta info row */}
                  <div className="flex items-center gap-4 mt-2.5 relative">
                    <span className="flex items-center gap-1.5 bg-white/15 rounded-full px-2.5 py-1 text-xs font-semibold">
                      <Clock className="w-3 h-3" /> {recipe.time}
                    </span>
                    {/* Adjustable portions */}
                    <span className="flex items-center gap-1 bg-white/15 rounded-full px-2 py-1 text-xs font-semibold">
                      <Users className="w-3 h-3" />
                      <button onClick={(e) => { e.stopPropagation(); setPortions(p => ({ ...p, [recipe.name]: Math.max(1, currentServings - 1) })); }} className="h-5 w-5 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"><Minus className="w-3 h-3" /></button>
                      <span className="font-bold text-white min-w-5 text-center">{currentServings}</span>
                      <button onClick={(e) => { e.stopPropagation(); setPortions(p => ({ ...p, [recipe.name]: Math.min(20, currentServings + 1) })); }} className="h-5 w-5 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"><Plus className="w-3 h-3" /></button>
                    </span>
                  </div>
                </div>

                {/* Ingredients */}
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-muted uppercase tracking-wider font-bold">
                      Ingredientes ({matched.length})
                    </p>
                    {matched.length > 0 && (
                      <p className="text-xs font-bold text-primary">
                        Total: S/{totalPrice.toFixed(2)}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2 flex-1">
                    {matched.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 p-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-gray-50 dark:bg-white/5 ring-1 ring-black/5 dark:ring-white/5 shrink-0">
                          {p.image
                            ? <Image src={p.image} alt={p.name} fill sizes="40px" className="object-cover" />
                            : <div className="h-full w-full flex items-center justify-center text-gray-300"><Package className="h-5 w-5" /></div>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                          <p className="text-xs text-muted font-medium">S/{(p.price * multiplier).toFixed(2)}</p>
                        </div>
                      </div>
                    ))}
                    {matched.length === 0 && (
                      <p className="text-xs text-muted italic py-2">Ingredientes no disponibles</p>
                    )}
                  </div>

                  {matched.length > 0 && (
                    <button
                      type="button"
                      onClick={() => addAllIngredients(recipe.ingredients, multiplier)}
                      className="w-full flex items-center justify-center gap-2 bg-primary text-white font-bold text-sm py-3 rounded-xl hover:bg-primary-dark active:scale-[0.97] transition-all shadow-md shadow-primary/20 mt-4"
                    >
                      <ShoppingCart className="w-4 h-4" />
                      Agregar todo{multiplier > 1 ? ` (×${multiplier.toFixed(1)})` : ""}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Link al recetario completo */}
        <div className="text-center mt-10">
          <Link
            href="/recetas"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-primary/10 hover:bg-primary/15 text-primary font-bold text-base transition-all hover:gap-3"
          >
            Ver todas las recetas <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
