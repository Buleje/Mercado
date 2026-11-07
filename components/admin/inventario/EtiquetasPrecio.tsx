"use client";

/**
 * Etiquetas de precio para imprimir (A4, 3 por fila). Vivía como botón suelto
 * en la cabecera de Inventario; desde el panel unificado (ola 3, 2026-10-10)
 * se abre desde «Más acciones» de Productos y stock. Mismo pedido
 * (`/api/products`) y misma hoja impresa que antes.
 */

import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@buleje/design-system";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import { Casilla } from "@/components/ui-system/Casilla";
import { button } from "@/components/ui-system/button-variants";
import { Printer, RefreshCw, Tag } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";

interface ProductoEtiqueta {
  id: number;
  name: string;
  price: number;
  barcode?: string | null;
}

/** El nombre del producto va a una hoja HTML aparte: un «<» en el nombre no puede volverse una etiqueta. */
const escaparHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export default function EtiquetasPrecio({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [productos, setProductos] = useState<ProductoEtiqueta[]>([]);
  const [elegidos, setElegidos] = useState<Set<number>>(new Set());
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: unknown = await res.json();
      if (Array.isArray(data)) setProductos(data.filter((p: { active?: boolean }) => p.active));
    } catch (err) {
      console.warn("[EtiquetasPrecio] no cargaron los productos", err);
      setError("No se pudieron cargar tus productos.");
    } finally {
      setCargando(false);
    }
  }, []);

  // Cada vez que se abre, la lista al día (antes se pedía al hacer clic en el botón).
  useEffect(() => {
    if (open) void cargar();
  }, [open, cargar]);

  const alternar = (id: number) => {
    setElegidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const imprimir = () => {
    const seleccion = productos.filter((p) => elegidos.has(p.id));
    if (seleccion.length === 0) return;
    const ventana = window.open("", "_blank");
    if (!ventana) return;
    const etiquetas = seleccion
      .map(
        (p) => `
      <div class="label">
        <div class="label-name">${escaparHtml(p.name)}</div>
        <div class="label-price">${formatCurrency(Number(p.price))}</div>
        ${p.barcode ? `<div class="label-barcode">${escaparHtml(p.barcode)}</div>` : ""}
      </div>
    `,
      )
      .join("");
    // Hoja de impresión en blanco y negro: la ventana nueva no tiene las variables del panel.
    ventana.document.write(`<!DOCTYPE html><html><head><title>Etiquetas de Precio</title><style>
      @page { size: A4; margin: 10mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
      .label { width: 60mm; height: 40mm; border: 1px dashed silver; padding: 3mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; page-break-inside: avoid; }
      .label-name { font-weight: bold; font-size: 14px; margin-bottom: 4px; overflow: hidden; max-height: 2.4em; line-height: 1.2em; }
      .label-price { font-weight: bold; font-size: 18px; }
      .label-barcode { font-family: monospace; font-size: 10px; color: dimgray; margin-top: 4px; }
    </style></head><body><div class="grid">${etiquetas}</div><script>window.print();window.onafterprint=()=>window.close();</script></body></html>`);
    ventana.document.close();
  };

  const todos = productos.length > 0 && elegidos.size === productos.length;

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Imprimir etiquetas de precio"
      icon={Printer}
      footer={
        <button
          type="button"
          onClick={imprimir}
          disabled={elegidos.size === 0}
          className={button({ variant: "primary", fullWidth: true, className: "rounded-xl" })}
        >
          <Printer className="h-4 w-4" aria-hidden />
          Generar etiquetas ({elegidos.size})
        </button>
      }
    >
      <div className={MODAL_BODY}>
        {cargando ? (
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm text-[var(--data-error-ink)]">
            <span>{error}</span>
            <button type="button" onClick={() => void cargar()} className={button({ variant: "secondary", className: "rounded-xl" })}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              Reintentar
            </button>
          </div>
        ) : productos.length === 0 ? (
          <EmptyState icon={Tag} title="No tienes productos activos." />
        ) : (
          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <Casilla
                etiqueta={todos ? "Quitar todos" : "Elegir todos"}
                checked={todos}
                indeterminada={elegidos.size > 0 && !todos}
                onChange={() => setElegidos(todos ? new Set() : new Set(productos.map((p) => p.id)))}
              />
              <span className="text-xs text-[var(--text-tertiary)] tabular-nums">{elegidos.size} elegidos</span>
            </div>
            {productos.map((p) => (
              <label
                key={p.id}
                className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-2 transition-colors hover:bg-[var(--surface-alt)]"
              >
                <Casilla checked={elegidos.has(p.id)} onChange={() => alternar(p.id)} />
                <span className="flex-1 truncate text-sm text-[var(--text-primary)]">{p.name}</span>
                <span className="text-sm font-bold text-[var(--accent-ink)] tabular-nums">{formatCurrency(Number(p.price))}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </AdminModal>
  );
}
