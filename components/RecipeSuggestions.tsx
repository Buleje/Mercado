"use client";

import Image from "next/image";
import { ShoppingCart, Clock, Users, Sparkles, Package } from "lucide-react";
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
    gradient: "linear-gradient(135deg, #6366f1, #4f46e5)",
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

  const addAllIngredients = (ingredientNames: string[]) => {
    const matched = findProducts(ingredientNames);
    matched.forEach((p) => addItem(p));
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
          {RECIPES.map((recipe, i) => {
            const matched = findProducts(recipe.ingredients);

            return (
              <div
                key={recipe.name}
                className={`group bg-card rounded-2xl shadow-sm ring-1 ring-black/5 dark:ring-white/5 overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ${
                  inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
                style={{ transitionDelay: inView ? `${i * 100}ms` : "0ms" }}
              >
                {/* Gradient header — inline style avoids Tailwind purge */}
                <div
                  className="relative px-5 py-5 text-white overflow-hidden"
                  style={{ background: recipe.gradient }}
                >
                  <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-bl-full" />
                  <div className="absolute bottom-0 left-0 w-12 h-12 bg-white/5 rounded-tr-full" />
                  <span className="text-3xl block mb-2 drop-shadow-sm">{recipe.emoji}</span>
                  <h3 className="text-base font-extrabold leading-tight relative">{recipe.name}</h3>
                  <div className="flex items-center gap-3 text-xs text-white/80 mt-1.5 relative">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {recipe.time}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" /> {recipe.servings} pers.
                    </span>
                  </div>
                </div>

                {/* Ingredients */}
                <div className="p-4 sm:p-5 space-y-3">
                  <p className="text-xs text-muted uppercase tracking-wider font-semibold">
                    Ingredientes ({matched.length})
                  </p>
                  <div className="space-y-2.5">
                    {matched.slice(0, 3).map((p) => (
                      <div key={p.id} className="flex items-center gap-2.5">
                        <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-gray-50 dark:bg-white/5 ring-1 ring-black/5 dark:ring-white/5 shrink-0">
                          {p.image
                            ? <Image src={p.image} alt={p.name} fill sizes="36px" className="object-cover" />
                            : <div className="h-full w-full flex items-center justify-center text-gray-300"><Package className="h-5 w-5" /></div>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                          <p className="text-xs text-muted">S/{p.price.toFixed(2)}</p>
                        </div>
                      </div>
                    ))}
                    {matched.length > 3 && (
                      <p className="text-xs text-muted">+{matched.length - 3} más</p>
                    )}
                    {matched.length === 0 && (
                      <p className="text-xs text-muted italic">Ingredientes no disponibles</p>
                    )}
                  </div>

                  {matched.length > 0 && (
                    <button
                      type="button"
                      onClick={() => addAllIngredients(recipe.ingredients)}
                      className="w-full flex items-center justify-center gap-2 bg-primary text-white font-bold text-sm py-2.5 rounded-xl hover:bg-primary-dark active:scale-[0.97] transition-all shadow-sm"
                    >
                      <ShoppingCart className="w-4 h-4" />
                      Agregar todo
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
