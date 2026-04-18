"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ChefHat, CheckCircle2, Circle, ShoppingCart, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CartItemProp {
  name: string;
}

interface Recipe {
  id: number;
  name: string;
  description: string;
  ingredients: string[];
}

interface Props {
  cartItems: CartItemProp[];
  onAddIngredient?: (name: string) => void;
}

// ── Recipes dictionary ────────────────────────────────────────────────────────

const RECIPES: Recipe[] = [
  {
    id: 1,
    name: "Arroz con Pollo",
    description: "Clasico peruano con culantro y aji amarillo",
    ingredients: ["Arroz", "Pollo", "Culantro", "Aji Amarillo", "Cebolla", "Ajo", "Aceite"],
  },
  {
    id: 2,
    name: "Lomo Saltado",
    description: "Salteado de res con tomate y cebolla",
    ingredients: ["Lomo de Res", "Tomate", "Cebolla", "Sillao", "Vinagre", "Papas", "Arroz"],
  },
  {
    id: 3,
    name: "Ceviche",
    description: "Pescado marinado con limon y aji",
    ingredients: ["Pescado", "Limon", "Cebolla", "Aji Limo", "Culantro", "Choclo"],
  },
  {
    id: 4,
    name: "Sopa Criolla",
    description: "Sopa reconfortante con fideos y leche",
    ingredients: ["Carne Molida", "Fideos", "Leche Evaporada", "Tomate", "Cebolla", "Aji Panca"],
  },
  {
    id: 5,
    name: "Papa a la Huancaina",
    description: "Papa con salsa de aji amarillo y queso",
    ingredients: ["Papa", "Aji Amarillo", "Queso Fresco", "Leche Evaporada", "Galletas de Soda"],
  },
  {
    id: 6,
    name: "Tallarines Rojos",
    description: "Pasta con salsa de tomate criolla",
    ingredients: ["Fideos", "Tomate", "Cebolla", "Ajo", "Aceite", "Carne Molida"],
  },
  {
    id: 7,
    name: "Estofado de Pollo",
    description: "Guiso suave con papas y verduras",
    ingredients: ["Pollo", "Papa", "Zanahoria", "Sillao", "Cebolla", "Tomate", "Aceite"],
  },
  {
    id: 8,
    name: "Causa Limena",
    description: "Pure de papa con relleno de pollo",
    ingredients: ["Papa Amarilla", "Limon", "Aji Amarillo", "Aceite", "Pollo", "Mayonesa"],
  },
  {
    id: 9,
    name: "Frijoles con Seco",
    description: "Frijoles guisados con seco de res",
    ingredients: ["Frijoles", "Lomo de Res", "Culantro", "Aji Amarillo", "Cebolla", "Arroz"],
  },
  {
    id: 10,
    name: "Mazamorra Morada",
    description: "Postre tradicional de maiz morado",
    ingredients: ["Maiz Morado", "Azucar", "Canela", "Maicena", "Membrillo", "Limon"],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function hasIngredient(cartItems: CartItemProp[], ingredient: string): boolean {
  const norm = normalize(ingredient);
  return cartItems.some((ci) => normalize(ci.name).includes(norm) || norm.includes(normalize(ci.name)));
}

// ── Recipe Card ───────────────────────────────────────────────────────────────

interface RecipeCardProps {
  recipe: Recipe;
  cartItems: CartItemProp[];
  onAddIngredient?: (name: string) => void;
}

function RecipeCard({ recipe, cartItems, onAddIngredient }: RecipeCardProps) {
  const [expanded, setExpanded] = useState(false);

  const { have, missing } = useMemo(() => {
    const have = recipe.ingredients.filter((ing) => hasIngredient(cartItems, ing));
    const missing = recipe.ingredients.filter((ing) => !hasIngredient(cartItems, ing));
    return { have, missing };
  }, [recipe.ingredients, cartItems]);

  const matchPct = Math.round((have.length / recipe.ingredients.length) * 100);

  return (
    <div
      className={cn(
        "rounded-2xl border bg-[var(--surface-raised)] overflow-hidden shadow-sm transition-all",
        matchPct === 100
          ? "border-[#00B4A6]"
          : matchPct >= 50
            ? "border-[#f97316]"
            : "border-[var(--rule-base)]"
      )}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <ChefHat className="w-4 h-4 text-[#f97316] flex-shrink-0" />
              <h3 className="font-bold text-[var(--text-primary)] text-sm">
                {recipe.name}
              </h3>
            </div>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5 line-clamp-1">
              {recipe.description}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className={cn(
                "text-xs font-bold px-2 py-1 rounded-full",
                matchPct === 100
                  ? "bg-[#00B4A6]/10 text-[#00B4A6] dark:text-[#2dd4bf]"
                  : matchPct >= 50
                    ? "bg-[#f97316]/10 text-[#f97316]"
                    : "bg-[var(--surface-sunken)] text-gray-500"
              )}
            >
              {have.length}/{recipe.ingredients.length}
            </span>
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </div>
        </div>
        {/* Mini progress */}
        <div className="mt-3 h-1.5 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              matchPct === 100 ? "bg-[#00B4A6]" : matchPct >= 50 ? "bg-[#f97316]" : "bg-gray-300"
            )}
            style={{ width: `${matchPct}%` }}
          />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--rule-base)] p-4 pt-3">
          <div className="space-y-1.5">
            {recipe.ingredients.map((ing) => {
              const present = hasIngredient(cartItems, ing);
              return (
                <div key={ing} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {present ? (
                      <CheckCircle2 className="w-4 h-4 text-[#00B4A6] flex-shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                    )}
                    <span
                      className={cn(
                        "text-sm",
                        present
                          ? "text-[var(--text-primary)]"
                          : "text-[var(--text-tertiary)]"
                      )}
                    >
                      {ing}
                    </span>
                  </div>
                  {!present && onAddIngredient && (
                    <button
                      onClick={() => onAddIngredient(ing)}
                      className="text-xs text-[#00B4A6] dark:text-[#2dd4bf] font-semibold hover:underline"
                    >
                      + Agregar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {missing.length > 0 && onAddIngredient && (
            <button
              onClick={() => missing.forEach((ing) => onAddIngredient(ing))}
              className="mt-4 w-full py-2.5 rounded-xl bg-[#00B4A6] text-white text-sm font-semibold flex items-center justify-center gap-2"
            >
              <ShoppingCart className="w-4 h-4" />
              Agregar {missing.length} ingrediente{missing.length !== 1 ? "s" : ""} faltante{missing.length !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function RecipeSuggestions({ cartItems, onAddIngredient }: Props) {
  const sorted = useMemo(() => {
    return [...RECIPES].sort((a, b) => {
      const aHave = a.ingredients.filter((ing) => hasIngredient(cartItems, ing)).length;
      const bHave = b.ingredients.filter((ing) => hasIngredient(cartItems, ing)).length;
      const aPct = aHave / a.ingredients.length;
      const bPct = bHave / b.ingredients.length;
      return bPct - aPct;
    });
  }, [cartItems]);

  return (
    <div className="bg-[var(--surface-canvas)] rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <ChefHat className="w-5 h-5 text-[#f97316]" />
        <h2 className="text-base font-bold text-[var(--text-primary)]">
          Recetas sugeridas
        </h2>
        {cartItems.length > 0 && (
          <span className="text-xs text-[var(--text-tertiary)]">
            segun tu carrito
          </span>
        )}
      </div>

      {cartItems.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)] text-center py-6">
          Agrega productos al carrito para ver recetas sugeridas
        </p>
      ) : (
        <div className="space-y-3">
          {sorted.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              cartItems={cartItems}
              onAddIngredient={onAddIngredient}
            />
          ))}
        </div>
      )}

      {/* Link al recetario completo */}
      <Link
        href="/recetas"
        className="mt-4 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#00B4A6]/8 hover:bg-[#00B4A6]/15 text-[#00B4A6] dark:text-[#2dd4bf] text-sm font-bold transition-colors"
      >
        Ver todas las recetas <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
