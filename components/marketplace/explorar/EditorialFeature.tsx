"use client";

/**
 * EditorialFeature — storytelling: receta destacada + 4 ingredientes comprables.
 * Mock interno (no hay endpoint de recetas todavia).
 *
 * Patron Buleje: 0 emojis, 0 colores hardcoded, iconos del DS.
 */

import Link from "next/link";
import {
  ChefHat,
  Clock,
  Users,
  ArrowRight,
  Package,
} from "@buleje/design-system/icons";

// ── Mock ──────────────────────────────────────────────────────────────────────

const RECETA = {
  titulo: "Juane de Gallina",
  subtitulo: "El plato que hizo famosa a Pucallpa",
  descripcion:
    "Arroz con gallina envuelto en hoja de bijao. Cocina amazonica autentica, lista en 2 horas.",
  duracion: "2h",
  porciones: 6,
  href: "/recetas/juane-de-gallina",
  ingredientes: [
    { name: "Arroz", productId: 1, image: null, price: 8.5 },
    { name: "Gallina entera", productId: 2, image: null, price: 28.0 },
    { name: "Aceitunas", productId: 3, image: null, price: 6.0 },
    { name: "Comino", productId: 4, image: null, price: 3.5 },
  ],
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

const pen = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });

// ── Sub-componentes ───────────────────────────────────────────────────────────

function IngredientCard({
  ingredient,
}: {
  ingredient: { name: string; productId: number; image: string | null; price: number };
}) {
  return (
    <div className="border border-[var(--rule-soft)] bg-[var(--surface-raised)] rounded-xl overflow-hidden hover:border-[var(--accent)]/40 transition-colors">
      {/* Imagen / Placeholder */}
      <div className="relative aspect-square bg-[var(--surface-canvas)] flex items-center justify-center">
        {ingredient.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ingredient.image}
            alt={ingredient.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <Package className="h-7 w-7 text-[var(--text-tertiary)]" aria-hidden />
        )}
      </div>

      {/* Info */}
      <div className="p-2.5">
        <p className="text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)] line-clamp-1">
          {ingredient.name}
        </p>
        <p className="text-[length:var(--ts-xs)] font-bold tabular-nums text-[var(--text-secondary)] mt-0.5">
          {pen.format(ingredient.price)}
        </p>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function EditorialFeature() {
  return (
    <section className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4 items-stretch">

        {/* ── Left: card editorial (compacta) ── */}
        <div className="relative overflow-hidden rounded-2xl border border-[var(--rule-soft)] p-4 sm:p-5 bg-[var(--surface-raised)]">

          {/* Contenido */}
          <div className="relative z-10">
            {/* Kicker */}
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)] mb-3">
              <ChefHat className="h-4 w-4" aria-hidden />
              Receta destacada
            </p>

            {/* Titulo compacto */}
            <h2 className="text-lg sm:text-xl font-black tracking-[-0.02em] text-[var(--text-primary)] leading-tight">
              {RECETA.titulo}
            </h2>

            {/* Subtitulo */}
            <p className="mt-1.5 text-sm font-semibold text-[var(--text-secondary)] leading-snug">
              {RECETA.subtitulo}
            </p>

            {/* Descripcion */}
            <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed max-w-xl line-clamp-2">
              {RECETA.descripcion}
            </p>

            {/* Stats inline */}
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-1.5">
                <Clock className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden />
                <span className="text-xs font-bold text-[var(--text-primary)]">
                  {RECETA.duracion}
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-1.5">
                <Users className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden />
                <span className="text-xs font-bold text-[var(--text-primary)]">
                  {RECETA.porciones} porciones
                </span>
              </div>
            </div>

            {/* CTA */}
            <Link
              href={RECETA.href}
              className="group mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] text-sm font-bold shadow-md hover:bg-[var(--accent)] hover:gap-3 transition-all"
            >
              Ver receta
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </div>
        </div>

        {/* ── Right: ingredientes ── */}
        <div className="flex flex-col">
          {/* Header */}
          <div className="flex items-baseline justify-between mb-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
              Ingredientes
            </p>
            <span className="text-sm font-bold text-[var(--text-primary)]">
              {RECETA.ingredientes.length} items
            </span>
          </div>

          {/* Grid 4x1 horizontal compacto */}
          <div className="grid grid-cols-4 gap-2 flex-1">
            {RECETA.ingredientes.map((ing) => (
              <IngredientCard key={ing.productId} ingredient={ing} />
            ))}
          </div>

          {/* CTA agregar al carrito — compacto */}
          <button
            type="button"
            onClick={() => {
              console.log(
                "Agregar todos al carrito",
                RECETA.ingredientes.map((i) => i.productId),
              );
            }}
            className="group mt-3 w-full py-2.5 px-4 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] transition-all text-xs font-bold text-[var(--text-primary)]"
          >
            Agregar todos al carrito
          </button>
        </div>
      </div>
    </section>
  );
}
