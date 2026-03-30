"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { emoji: "\u{1F96B}", name: "Abarrotes",          id: "abarrotes",         count: 80 },
  { emoji: "\u{1F964}", name: "Bebidas",             id: "bebidas",            count: 45 },
  { emoji: "\u{1F9F9}", name: "Limpieza",            id: "limpieza",           count: 30 },
  { emoji: "\u{1F95B}", name: "L\u00e1cteos",        id: "lacteos",            count: 25 },
  { emoji: "\u{1F969}", name: "Carnes",              id: "carnes",             count: 20 },
  { emoji: "\u{1F96C}", name: "Frutas y Verduras",   id: "frutas-verduras",    count: 35 },
];

export default function PopularCategories() {
  return (
    <section className="py-14 sm:py-20 bg-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8 sm:mb-12">
          <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full mb-4">
            Categor\u00edas
          </span>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-foreground">
            Explora por categor\u00eda
          </h2>
          <p className="text-muted mt-2 text-sm sm:text-base max-w-lg mx-auto">
            Encuentra r\u00e1pidamente lo que necesitas
          </p>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 sm:gap-4">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.id}
              href={`/tienda?categoria=${cat.id}`}
              className={cn(
                "group flex flex-col items-center gap-2 sm:gap-3 p-4 sm:p-6 rounded-2xl",
                "bg-white dark:bg-card border border-gray-100 dark:border-card-border",
                "hover:shadow-xl hover:shadow-primary/10 hover:border-primary/20",
                "hover:scale-105 transition-all duration-300 cursor-pointer"
              )}
            >
              <span className="text-4xl sm:text-5xl group-hover:scale-110 transition-transform duration-300">
                {cat.emoji}
              </span>
              <div className="text-center">
                <p className="text-xs sm:text-sm font-bold text-foreground leading-tight">
                  {cat.name}
                </p>
                <p className="text-[10px] sm:text-xs text-muted mt-0.5">
                  {cat.count} productos
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
