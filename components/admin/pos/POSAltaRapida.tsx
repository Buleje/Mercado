"use client";

import { useMemo } from "react";
import AltaRapidaProducto, { type ProductoCreado } from "@/components/admin/inventario/AltaRapidaProducto";
import { guardarAltaPendiente } from "@/components/admin/inventario/hooks/use-alta-pendiente";
import { prettyCategory, type Product } from "@/components/admin/pos/pos-shared";

interface Props {
  /** null = cerrada; el texto es lo que se buscó o el código leído. */
  texto: string | null;
  onClose: () => void;
  products: Product[];
  /** Vuelve a pedir el catálogo (el nuevo ya existe en el servidor). */
  fetchProducts: () => Promise<void>;
  addToCart: (p: Product) => void;
}

/**
 * Mostrador: el producto que no existe se crea sin salir de la venta (18-10) y queda en el carrito.
 * Usa el alta de siempre (`POST /api/products`); «Ir al formulario completo» lleva a Productos con lo escrito.
 */
export default function POSAltaRapida({ texto, onClose, products, fetchProducts, addToCart }: Props) {
  const categorias = useMemo(() => {
    const ids = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));
    const lista = ids.map((id) => ({ id, label: prettyCategory(id) }));
    return lista.length ? lista : [{ id: "General", label: "General" }];
  }, [products]);

  return (
    <AltaRapidaProducto
      open={texto !== null}
      onClose={onClose}
      textoBuscado={texto ?? ""}
      categorias={categorias}
      onCreado={async (creado: ProductoCreado) => {
        await fetchProducts();
        addToCart(creado as unknown as Product);
      }}
      onFormularioCompleto={(d) => {
        guardarAltaPendiente(d);
        onClose();
        window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { tab: "productos" } }));
      }}
    />
  );
}
