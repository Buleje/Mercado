"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, X as XIcon } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";
import type { PurchaseProduct as Product } from "@/lib/types/purchases";
import type { Pendiente } from "./emparejar-factura";

interface Props {
  pendiente: Pendiente<Product>;
  products: Product[];
  categorias: string[];
  creando: boolean;
  onElegir: (productId: number) => void;
  onCrear: (datos: { category: string; price: number }) => void;
  onQuitar: () => void;
}

const CAMPO = "h-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary";

/** Un renglón de la factura sin producto claro: elegir uno de tu catálogo o crearlo. */
export default function CompraPendienteFactura({ pendiente, products, categorias, creando, onElegir, onCrear, onQuitar }: Props) {
  const { renglon, sugeridos } = pendiente;
  const [abierto, setAbierto] = useState(false);
  const [categoria, setCategoria] = useState(categorias[0] ?? "");
  const [precio, setPrecio] = useState("");
  const todos = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);
  const precioNum = Number(precio);
  const listo = categoria.trim().length > 0 && Number.isFinite(precioNum) && precioNum > 0;

  return (
    <li className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-2.5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)] break-words">{renglon.nombre}</p>
          <p className="text-xs text-[var(--text-tertiary)] tabular-nums">
            {renglon.cantidad} × {renglon.precioUnitario > 0 ? formatCurrency(renglon.precioUnitario) : "sin precio"}
          </p>
        </div>
        <button type="button" onClick={onQuitar} aria-label={`No agregar ${renglon.nombre}`} className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)]">
          <XIcon className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value=""
          onChange={(e) => { if (e.target.value) onElegir(Number(e.target.value)); }}
          aria-label={`Elegir producto para ${renglon.nombre}`}
          className={`${CAMPO} flex-1 min-w-[12rem]`}
        >
          <option value="">Elegir de mi catálogo…</option>
          {sugeridos.length > 0 && (
            <optgroup label="Parecidos">
              {sugeridos.map((s) => (
                <option key={`s-${s.producto.id}`} value={s.producto.id}>
                  {s.producto.name} · {Math.round(s.puntaje * 100)} %
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Todo el catálogo">
            {todos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </optgroup>
        </select>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <Plus className="h-4 w-4" aria-hidden /> Crear
        </button>
      </div>

      {abierto && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-0.5 text-xs text-[var(--text-secondary)]">
            Categoría
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={CAMPO}>
              {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-xs text-[var(--text-secondary)]">
            Precio de venta
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.10"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              placeholder="S/"
              className={`${CAMPO} w-24 text-right font-mono`}
            />
          </label>
          <button
            type="button"
            onClick={() => onCrear({ category: categoria, price: precioNum })}
            disabled={!listo || creando}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-50"
          >
            {creando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Crear y agregar
          </button>
        </div>
      )}
    </li>
  );
}
