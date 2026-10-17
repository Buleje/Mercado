"use client";

/**
 * Precio por producto (Compras › Proveedores › Comparar): eliges un producto y
 * ves el último precio que te cobró cada proveedor (`SupplierPriceComparison`,
 * `GET /api/compras/precio-comparativo`). Antes esa tabla sólo aparecía dentro
 * del detalle de una orden de compra.
 */

import { useEffect, useState } from "react";
import { ErrorAlert, LoadingState } from "@buleje/design-system";
import ProductCombobox, { type ProductOption } from "@/components/admin/shared/ProductCombobox";
import SupplierPriceComparison from "./SupplierPriceComparison";

type ProductoCrudo = { id?: number | string; name?: string; stock?: number | null; unit?: string; barcode?: string };

/** `GET /api/products` responde un array o `{ products }`: sólo los que tienen id numérico (el comparativo lo pide). */
function aOpciones(data: unknown): ProductOption[] {
  const lista = (Array.isArray(data) ? data : (data as { products?: unknown[] } | null)?.products ?? []) as ProductoCrudo[];
  return lista
    .filter((p): p is ProductoCrudo & { id: number; name: string } => typeof p.id === "number" && !!p.name)
    .map((p) => ({ id: p.id, name: p.name, stock: p.stock ?? null, unit: p.unit, barcode: p.barcode }));
}

export default function PrecioPorProducto() {
  const [productos, setProductos] = useState<ProductOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [elegido, setElegido] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/products")
      .then(async (r) => {
        if (!r.ok) throw new Error(`No se pudieron traer tus productos (${r.status})`);
        return r.json();
      })
      .then((data) => { if (vivo) setProductos(aOpciones(data)); })
      .catch((err: unknown) => { if (vivo) setError(err instanceof Error ? err.message : String(err)); });
    return () => { vivo = false; };
  }, []);

  if (error) return <ErrorAlert title="No se pudo abrir el comparativo" description={error} />;
  if (!productos) return <LoadingState message="Cargando productos..." />;

  return (
    <div className="space-y-4">
      <ProductCombobox
        id="comparar-precio-producto"
        products={productos}
        value={texto}
        placeholder="Busca un producto por nombre o código"
        inputClassName="h-12 text-base"
        onChange={(t) => {
          setTexto(t);
          if (elegido && t !== elegido.name) setElegido(null);
        }}
        onSelect={(p) => {
          setTexto(p.name);
          if (typeof p.id === "number") setElegido({ id: p.id, name: p.name });
        }}
      />
      {elegido ? (
        <SupplierPriceComparison key={elegido.id} productId={elegido.id} productName={elegido.name} />
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">Elige un producto para ver cuánto te cobró cada proveedor.</p>
      )}
    </div>
  );
}
