"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { calculateSuggestedQty } from "@/lib/types/purchases";
import type { CompraCatalogo } from "./use-compra-catalogo";
import type { CompraCarrito } from "./use-compra-carrito";

interface Props {
  catalogo: CompraCatalogo;
  carrito: CompraCarrito;
  showScanner: boolean;
  setShowScanner: Dispatch<SetStateAction<boolean>>;
  setToastMsg: Dispatch<SetStateAction<string | null>>;
}

/** Interruptor del inventario, categorías, lector de código de barras y aviso sin conexión. */
export default function CompraInventarioFiltros({ catalogo, carrito, showScanner, setShowScanner, setToastMsg }: Props) {
  const { showInventario, setShowInventario, categories, categoryCounts, category, setCategory, products } = catalogo;
  const { addToCart, isOnline } = carrito;
  const [barcodeInput, setBarcodeInput] = useState("");
  return (
    <>
      {/* Toggle "Mostrar inventario" */}
      <div className="flex items-center justify-between mb-3 p-3 rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-soft)]">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-bold text-[var(--text-primary)]">
            Usar artículos de mi inventario
          </p>
          <InfoTip
            title="Artículos del inventario"
            what={
              <span>
                {showInventario
                  ? "Mostrando los productos del inventario abajo. Apaga para enfocarte sólo en gastos."
                  : "Los productos están ocultos. Enciende para hacer compra de reposición."}
              </span>
            }
          />
        </div>
        <button
          role="switch"
          aria-checked={showInventario}
          aria-label="Usar artículos de mi inventario"
          onClick={() => setShowInventario(!showInventario)}
          className={cn(
            "relative w-12 h-6 rounded-full transition-colors shrink-0",
            showInventario ? "bg-primary" : "bg-[var(--rule-base)]",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-[var(--surface-raised)] transition-transform",
              showInventario ? "translate-x-6" : "translate-x-0",
            )}
          />
        </button>
      </div>

      {/* Pills de categorías — solo cuando se muestra inventario */}
      {showInventario && <div
        className="flex gap-1.5 overflow-x-auto scrollbar-none mb-3 pb-1"
        role="tablist"
        aria-label="Filtrar por categoría"
      >
        {categories.map((cat) => {
          const count = categoryCounts[cat] ?? 0;
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={category === cat}
              onClick={() => setCategory(cat)}
              className={cn(
                "shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                category === cat
                  ? "bg-primary text-white"
                  : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              {cat} <span className="opacity-60">({count})</span>
            </button>
          );
        })}
      </div>}

      {/* Input de código de barras */}
      {showScanner && (
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={barcodeInput}
            onChange={e => setBarcodeInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && barcodeInput.trim()) {
                const found = products.find(p => p.barcode === barcodeInput.trim());
                if (found) {
                  addToCart(found, calculateSuggestedQty(found));
                  setBarcodeInput("");
                  setToastMsg(found.name + " agregado");
                } else {
                  setToastMsg("Producto no encontrado: " + barcodeInput);
                }
              }
            }}
            placeholder="Escanea o escribe el código de barras..."
            // eslint-disable-next-line jsx-a11y/no-autofocus -- único campo al abrir el escáner, foco intencional para escanear de inmediato
            autoFocus
            className="flex-1 px-3 h-10 border border-primary rounded-xl text-sm bg-[var(--surface-raised)] text-[var(--text-primary)] focus:ring-2 focus:ring-primary"
          />
          <button
            type="button"
            onClick={() => { setShowScanner(false); setBarcodeInput(""); }}
            className="px-3 py-2 bg-[var(--surface-sunken)] rounded-xl text-xs"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Banner offline */}
      {!isOnline && (
        <div className="bg-[var(--data-error-50)] border border-[var(--data-error-500)] rounded-xl px-3 py-2 text-xs text-[var(--data-error-500)] flex items-center gap-2 mb-3">
          <span className="h-2 w-2 rounded-full bg-[var(--data-error-500)] animate-pulse shrink-0" />
          Sin conexion — tu canasta se guardo automaticamente. Se enviara cuando vuelva el internet.
        </div>
      )}
    </>
  );
}
