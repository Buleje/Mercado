"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
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

/**
 * Lector de código de barras y aviso sin conexión. El interruptor del
 * inventario y la categoría se mudaron a la fila de filtros (CompraBarraControles).
 */
export default function CompraInventarioFiltros({ catalogo, carrito, showScanner, setShowScanner, setToastMsg }: Props) {
  const { products } = catalogo;
  const { addToCart, isOnline } = carrito;
  const [barcodeInput, setBarcodeInput] = useState("");
  return (
    <>
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
            className="flex-1 px-3 h-12 border border-primary rounded-xl text-sm bg-[var(--surface-raised)] text-[var(--text-primary)] focus:ring-2 focus:ring-primary"
          />
          <button
            type="button"
            onClick={() => { setShowScanner(false); setBarcodeInput(""); }}
            className="h-12 px-4 bg-[var(--surface-sunken)] rounded-xl text-sm font-semibold text-[var(--text-primary)]"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Banner offline */}
      {!isOnline && (
        <div className="bg-[var(--data-error-50)] border border-[var(--data-error-500)] rounded-xl px-3 py-2 text-sm text-[var(--data-error-ink)] flex items-center gap-2 mb-3">
          <span className="h-2 w-2 rounded-full bg-[var(--data-error-500)] animate-pulse shrink-0" />
          Sin conexión: tu canasta se guardó y se enviará cuando vuelva el internet.
        </div>
      )}
    </>
  );
}
