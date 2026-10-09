"use client";

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { PurchaseProduct as Product } from "@/lib/types/purchases";
import { emparejarProveedor, emparejarRenglones, type Pendiente, type RenglonFactura } from "./emparejar-factura";
import type { CompraCarrito } from "./use-compra-carrito";
import type { CompraCatalogo } from "./use-compra-catalogo";

/** Todo lo que lee el escáner (antes llegaban sólo proveedor e ítems sin precio). */
export interface FacturaLeida {
  proveedor: { nombre: string; ruc?: string };
  fecha?: string;
  comprobante?: { tipo?: "factura" | "boleta" | "guia"; numero?: string };
  items: RenglonFactura[];
  total: number;
}

export interface ResumenFactura {
  proveedor: { nombre: string; ruc?: string };
  /** El proveedor de tu lista con el que se emparejó (por RUC o nombre). */
  proveedorElegido: string | null;
  fecha?: string;
  comprobante?: FacturaLeida["comprobante"];
  total: number;
  agregados: number;
  renglones: number;
}

/** Renglón sin par con una identidad propia: se quita por id, no por posición
 *  (si mientras se crea un producto eliges o quitas otra fila, la posición cambia). */
export type PendienteFactura = Pendiente<Product> & { id: string };

type Opciones = {
  carrito: CompraCarrito;
  catalogo: CompraCatalogo;
  setToastMsg: Dispatch<SetStateAction<string | null>>;
};

function precioDe(r: RenglonFactura): number | undefined {
  return Number.isFinite(r.precioUnitario) && r.precioUnitario > 0 ? r.precioUnitario : undefined;
}

/** Pasa la factura escaneada a la canasta: productos con su costo, proveedor y comprobante. */
export function useFacturaEscaneada({ carrito, catalogo, setToastMsg }: Opciones) {
  const [resumen, setResumen] = useState<ResumenFactura | null>(null);
  const [pendientes, setPendientes] = useState<PendienteFactura[]>([]);
  /** Filas cuyo producto se está creando (pueden ser varias a la vez). */
  const [creando, setCreando] = useState<string[]>([]);
  const lectura = useRef(0);

  const aplicarFactura = useCallback((data: FacturaLeida) => {
    const { encontrados, pendientes: sinPar } = emparejarRenglones(data.items, catalogo.products);
    for (const e of encontrados) carrito.addToCart(e.producto, e.renglon.cantidad, precioDe(e.renglon));
    const proveedor = emparejarProveedor(data.proveedor, catalogo.suppliers);
    if (proveedor) carrito.setSelectedSupplier(proveedor);
    if (data.comprobante?.tipo) carrito.setInvoiceType(data.comprobante.tipo);
    if (data.comprobante?.numero?.trim()) carrito.setInvoiceNumber(data.comprobante.numero.trim().slice(0, 60));
    lectura.current += 1;
    const n = lectura.current;
    setPendientes(sinPar.map((p, i) => ({ ...p, id: `f${n}-${i}` })));
    setResumen({
      proveedor: data.proveedor,
      proveedorElegido: proveedor?.name ?? null,
      fecha: data.fecha,
      comprobante: data.comprobante,
      total: data.total,
      agregados: encontrados.length,
      renglones: data.items.length,
    });
  }, [carrito, catalogo.products, catalogo.suppliers]);

  const quitarPendiente = useCallback((id: string) => {
    setPendientes((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const elegir = useCallback((id: string, productId: number) => {
    const p = pendientes.find((x) => x.id === id);
    const product = catalogo.products.find((x) => x.id === productId);
    // Si su producto se está creando, al terminar ya entra a la canasta: elegirlo lo duplicaría.
    if (!p || !product || creando.includes(id)) return;
    carrito.addToCart(product, p.renglon.cantidad, precioDe(p.renglon));
    setResumen((r) => (r ? { ...r, agregados: r.agregados + 1 } : r));
    quitarPendiente(id);
  }, [pendientes, creando, catalogo.products, carrito, quitarPendiente]);

  /** Alta del producto que no estaba en tu catálogo, con el costo de la factura. */
  const crearProducto = useCallback(async (id: string, datos: { category: string; price: number }) => {
    const p = pendientes.find((x) => x.id === id);
    if (!p) return;
    setCreando((prev) => (prev.includes(id) ? prev : [...prev, id]));
    try {
      const costo = precioDe(p.renglon);
      const res = await fetch("/api/v1/products", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          name: p.renglon.nombre.trim().slice(0, 150),
          category: datos.category,
          price: datos.price,
          ...(costo !== undefined && { costPrice: costo }),
          stock: 0,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err?.error === "string" ? err.error : `Error ${res.status}`);
      }
      const c = await res.json() as Partial<Product> & { id: number | string };
      const nuevo: Product = {
        id: Number(c.id),
        name: c.name ?? p.renglon.nombre,
        category: c.category ?? datos.category,
        costPrice: c.costPrice != null ? Number(c.costPrice) : costo ?? null,
        price: Number(c.price ?? datos.price),
        image: c.image ?? "",
        stock: c.stock != null ? Number(c.stock) : 0,
        stockMin: c.stockMin ?? null,
        unit: c.unit ?? "und",
        barcode: c.barcode ?? null,
      };
      catalogo.agregarProducto(nuevo);
      carrito.addToCart(nuevo, p.renglon.cantidad, costo);
      setResumen((r) => (r ? { ...r, agregados: r.agregados + 1 } : r));
      quitarPendiente(id);
      setToastMsg(`Producto "${nuevo.name}" creado y agregado`);
    } catch (e) {
      setToastMsg(e instanceof Error ? `No se pudo crear: ${e.message}` : "No se pudo crear el producto");
    } finally {
      setCreando((prev) => prev.filter((x) => x !== id));
    }
  }, [pendientes, catalogo, carrito, quitarPendiente, setToastMsg]);

  const cerrar = useCallback(() => { setResumen(null); setPendientes([]); }, []);

  return { resumen, pendientes, creando, aplicarFactura, elegir, quitarPendiente, crearProducto, cerrar };
}

export type FacturaEscaneada = ReturnType<typeof useFacturaEscaneada>;
