"use client";

import Link from "next/link";
import { Package, ArrowRight } from "@buleje/design-system/icons";
import { ComparandoTres } from "@/components/ui-system/illustrations";

interface CompareEmptyStateProps {
  onPickStart?: () => void;
}

export default function CompareEmptyState({ onPickStart }: CompareEmptyStateProps) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16">
      <div className="rounded-3xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-10 sm:p-14 text-center">
        {/* Ilustración custom — 3 productos + línea de medida */}
        <div
          className="mx-auto flex justify-center text-[var(--text-secondary)]"
          aria-hidden="true"
        >
          <ComparandoTres size={200} />
        </div>
        <h2 className="mt-4 text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
          Empieza a comparar productos
        </h2>
        <p className="mt-2 text-sm text-[var(--text-tertiary)] max-w-md mx-auto leading-relaxed">
          Agrega hasta 4 productos desde el catálogo o desde la ficha de cada
          producto y los verás en una tabla lado a lado.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-5 py-3 text-sm font-semibold text-[var(--surface-canvas)] hover:opacity-90 transition-opacity"
          >
            <Package className="h-4 w-4" />
            Explorar productos
          </Link>
          {onPickStart && (
            <button
              onClick={onPickStart}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--rule-soft)] px-5 py-3 text-sm font-semibold text-[var(--text-secondary)] hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)] transition-colors"
            >
              Agregar un producto manualmente
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>

        <ul className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left text-sm text-[var(--text-tertiary)] max-w-xl mx-auto">
          <li className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3">
            <span className="font-semibold text-[var(--text-primary)] block mb-0.5">
              Hasta 4 productos
            </span>
            Compará diferentes marcas y tiendas en una sola vista.
          </li>
          <li className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3">
            <span className="font-semibold text-[var(--text-primary)] block mb-0.5">
              Precio destacado
            </span>
            Marcamos automáticamente el de mejor precio.
          </li>
          <li className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3">
            <span className="font-semibold text-[var(--text-primary)] block mb-0.5">
              Agrega al carrito
            </span>
            Directo desde la tabla, sin salir de la comparación.
          </li>
        </ul>
      </div>
    </section>
  );
}
