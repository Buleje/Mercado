"use client";

import { useState } from "react";
import { Clock, Users, ArrowUpRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import RecipeModal, { type RecipeData } from "@/components/marketplace/RecipeModal";
import { RECIPE_ILLUSTRATIONS } from "@/components/marketplace/RecipeIllustrations";

interface Recipe {
  id: string;
  title: string;
  description: string;
  servings: number;
  time: string;
  timeISO: string;
  tags: string[];
  ingredients: string[];
  cuisine: string;
  category: string;
  steps: { text: string; timerMin?: number }[];
}

const RECIPES: Recipe[] = [
  {
    id: "juane",
    title: "Juane de gallina",
    description:
      "El clásico de la selva. Arroz con cúrcuma, gallina y hoja de bijao.",
    servings: 4,
    time: "90 min",
    timeISO: "PT1H30M",
    tags: ["Típico", "San Juan"],
    cuisine: "Amazónica Peruana",
    category: "Plato principal",
    ingredients: [
      "Arroz",
      "Gallina",
      "Huevo",
      "Cúrcuma palillo",
      "Hojas de bijao",
      "Ajo",
    ],
    steps: [
      { text: "Cociná la gallina con ajo y sal hasta que esté tierna." , timerMin: 30 },
      { text: "Lavá las hojas de bijao con agua tibia y secalas." },
      { text: "Saltea el arroz con cúrcuma y el caldo de la gallina.", timerMin: 15 },
      { text: "Mezclá el arroz con huevo batido, presas de gallina y aceitunas." },
      { text: "Armá los juanes envolviendo con las hojas y atalos bien." },
      { text: "Hervilos en una olla grande tapada.", timerMin: 45 },
    ],
  },
  {
    id: "tacacho",
    title: "Tacacho con cecina",
    description: "Plátano verde asado y machacado, acompañado de cecina crocante.",
    servings: 2,
    time: "45 min",
    timeISO: "PT45M",
    tags: ["Desayuno", "Típico"],
    cuisine: "Amazónica Peruana",
    category: "Desayuno",
    ingredients: ["Plátano verde", "Cecina", "Chorizo regional", "Ajo", "Manteca"],
    steps: [
      { text: "Asá los plátanos verdes directo en la brasa hasta que la cáscara se ennegrezca.", timerMin: 20 },
      { text: "Freí la cecina y el chorizo regional en manteca hasta dorar.", timerMin: 8 },
      { text: "Pelá los plátanos y machacalos en un mortero con ajo y manteca." },
      { text: "Formá bolitas de tacacho y servilas calientes junto a la cecina." },
    ],
  },
  {
    id: "inchicapi",
    title: "Inchicapi de gallina",
    description: "Sopa espesa con maní, yuca y culantro. Reconforta el alma.",
    servings: 6,
    time: "60 min",
    timeISO: "PT1H",
    tags: ["Sopa", "Tradicional"],
    cuisine: "Amazónica Peruana",
    category: "Sopa",
    ingredients: ["Gallina", "Maní tostado", "Yuca", "Culantro", "Ajíes"],
    steps: [
      { text: "Cociná la gallina en olla grande con sal y hojas de culantro.", timerMin: 25 },
      { text: "Licuá el maní tostado con un poco de caldo hasta formar crema." },
      { text: "Pelá la yuca y cortala en trozos medianos." },
      { text: "Agregá el maní licuado y la yuca al caldo hirviendo.", timerMin: 20 },
      { text: "Probá de sal, agregá ají charapita al gusto y servilo bien caliente." },
    ],
  },
  {
    id: "ceviche-paiche",
    title: "Ceviche de paiche",
    description:
      "El pescado amazónico marinado en limón, ají charapita y cebolla roja.",
    servings: 4,
    time: "20 min",
    timeISO: "PT20M",
    tags: ["Frío", "Rápido"],
    cuisine: "Amazónica Peruana",
    category: "Entrada",
    ingredients: [
      "Paiche fresco",
      "Limón",
      "Ají charapita",
      "Cebolla roja",
      "Culantro",
    ],
    steps: [
      { text: "Cortá el paiche en cubitos parejos y salá ligeramente." },
      { text: "Exprimí el jugo de limón fresco y mezclá con el pescado.", timerMin: 5 },
      { text: "Picá fino la cebolla roja, el ají charapita y el culantro." },
      { text: "Mezclá todo, probá de sal, dejá reposar un momento.", timerMin: 3 },
      { text: "Serví bien frío con cancha serrana o yuca hervida." },
    ],
  },
];

// JSON-LD ItemList of Recipe schemas — ayuda a Google a mostrar rich results
const RECIPE_JSONLD = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Recetas de la selva peruana",
  itemListElement: RECIPES.map((r, idx) => ({
    "@type": "ListItem",
    position: idx + 1,
    item: {
      "@type": "Recipe",
      name: r.title,
      description: r.description,
      recipeCuisine: r.cuisine,
      recipeCategory: r.category,
      recipeYield: `${r.servings} porciones`,
      totalTime: r.timeISO,
      keywords: r.tags.join(", "),
      recipeIngredient: r.ingredients,
      inLanguage: "es-PE",
    },
  })),
};

export default function MarketplaceRecipesWidget() {
  const [activeRecipe, setActiveRecipe] = useState<Recipe | null>(null);

  const handleAddIngredients = (ingredients: string[]) => {
    // Redirect al catálogo con búsqueda del primer ingrediente.
    // Futuro: mapeo real de ingredient → storeProductId y agregar todo al carrito.
    const first = ingredients[0];
    if (first && typeof window !== "undefined") {
      window.location.href = `/marketplace?vista=catalogo&q=${encodeURIComponent(first)}`;
    }
  };

  return (
    <section
      id="recetas"
      aria-label="Recetas con productos del marketplace"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
    >
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(RECIPE_JSONLD) }}
      />
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-gray-200 dark:border-gray-800">
        <div>
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.2em] text-gray-400">
            Cocina amazónica
          </p>
          <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
            Recetas de la selva
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-md">
            Armamos la lista de ingredientes por vos. Un click y al carrito.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {RECIPES.map((r, idx) => {
          const Illustration = RECIPE_ILLUSTRATIONS[r.id];
          return (
            <article
              key={r.id}
              onClick={() => setActiveRecipe(r)}
              className={cn(
                "group relative flex flex-col rounded-2xl overflow-hidden cursor-pointer",
                "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800",
                "transition-all duration-300 hover:border-gray-900 dark:hover:border-gray-500",
              )}
            >
              {/* Hero: illustration line-art sobre off-white con número editorial */}
              <div className="relative aspect-[4/3] bg-gray-50 dark:bg-gray-950 overflow-hidden">
                <span className="absolute top-3 left-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.2em] text-gray-400">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span className="absolute top-3 right-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-gray-400">
                  {r.category}
                </span>
                {Illustration && (
                  <Illustration
                    className="absolute inset-0 m-auto w-[70%] h-[70%] text-gray-800 dark:text-gray-200 transition-transform duration-500 group-hover:scale-105"
                    ariaLabel={r.title}
                  />
                )}
                {/* Corner rule */}
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gray-200 dark:bg-gray-800" />
              </div>

              <div className="flex-1 flex flex-col p-5">
                <h3 className="text-base font-extrabold tracking-tight text-gray-900 dark:text-white">
                  {r.title}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 line-clamp-2 leading-relaxed min-h-[2rem]">
                  {r.description}
                </p>

                <div className="mt-4 flex items-center gap-4 text-[length:var(--ts-2xs)] text-gray-500 border-t border-gray-100 dark:border-gray-800 pt-3">
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Clock className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                    {r.time}
                  </span>
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Users className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                    {r.servings}
                  </span>
                  <span className="ml-auto text-[length:var(--ts-2xs)] font-bold text-gray-400 tabular-nums">
                    {r.ingredients.length} ingr.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveRecipe(r);
                  }}
                  className="mt-4 inline-flex items-center justify-between w-full pt-2 border-t border-gray-100 dark:border-gray-800 text-xs font-bold text-gray-900 dark:text-white transition-colors hover:text-primary"
                >
                  Ver receta
                  <ArrowUpRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    strokeWidth={1.75}
                  />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {/* Modal de receta con checklist + timer */}
      <RecipeModal
        open={activeRecipe !== null}
        onOpenChange={(v) => !v && setActiveRecipe(null)}
        recipe={activeRecipe as RecipeData | null}
        onAddIngredientsToCart={handleAddIngredients}
      />
    </section>
  );
}
