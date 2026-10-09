"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import type { DbRecurringPurchase, ItemRecurrente } from "@/lib/db/recurring-purchases.db";
import type { PurchaseProduct as Product, PurchaseSupplier as Supplier } from "@/lib/types/purchases";
import { costoSugerido } from "./costo-compra";
import type { CompraCarrito } from "./use-compra-carrito";

/** Las de antes, guardadas sólo en este navegador (`poc-templates`). */
export type PlantillaLocal = { name: string; items: Array<{ productId: number; name: string; quantity: number }> };

const CLAVE_LOCAL = "poc-templates";

function leerLocales(): PlantillaLocal[] {
  try {
    const raw = localStorage.getItem(CLAVE_LOCAL);
    const lista: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(lista) ? (lista as PlantillaLocal[]).filter((t) => t && typeof t.name === "string" && Array.isArray(t.items)) : [];
  } catch {
    return [];
  }
}

export function nombrePlantilla(p: DbRecurringPurchase): string {
  return p.notes?.trim() || `${p.supplierName} · ${p.items.length} productos`;
}

type Opciones = {
  carrito: CompraCarrito;
  products: Product[];
  suppliers: Supplier[];
  confirm: ReturnType<typeof useConfirm>["confirm"];
  prompt: ReturnType<typeof useConfirm>["prompt"];
  setToastMsg: Dispatch<SetStateAction<string | null>>;
};

/**
 * Plantillas de pedido en la BASE (pedidos recurrentes, ADR-377). Antes vivían
 * en el localStorage: se perdían al cambiar de equipo y nadie más del negocio
 * las veía. Una plantilla nueva se guarda PAUSADA (no se repite ni avisa):
 * se pide sólo cuando la cargas a la canasta. Órdenes › Recurrentes lista
 * sólo las activas, así que desde allí no se ve ni se activa una pausada.
 */
export function usePlantillasCompra({ carrito, products, suppliers, confirm, prompt, setToastMsg }: Opciones) {
  const [plantillas, setPlantillas] = useState<DbRecurringPurchase[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(false);
  const [locales, setLocales] = useState<PlantillaLocal[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    setLocales(leerLocales());
    fetch("/api/compras/recurrentes", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: unknown) => { if (vivo) { setPlantillas(Array.isArray(d) ? (d as DbRecurringPurchase[]) : []); setErrorCarga(false); } })
      .catch((err) => { console.warn("[PuntoCompraView] plantillas fetch failed", err); if (vivo) setErrorCarga(true); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);

  const crearEnBase = useCallback(async (nombre: string, proveedor: Supplier, items: ItemRecurrente[]) => {
    const res = await fetch("/api/compras/recurrentes", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        supplierId: proveedor.id,
        supplierName: proveedor.name,
        items,
        notes: nombre.slice(0, 500),
        paymentMethod: carrito.paymentMethod,
        active: false,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as DbRecurringPurchase;
  }, [carrito.paymentMethod]);

  const saveAsTemplate = useCallback(async () => {
    const { cart, selectedSupplier, costo } = carrito;
    if (cart.length === 0) return;
    if (!selectedSupplier) { setToastMsg("Elige el proveedor para guardar la plantilla"); return; }
    const name = await prompt({ title: "Guardar como plantilla", label: "Nombre para esta plantilla", placeholder: "Ej: Pedido semanal", inputType: "text" });
    if (!name?.trim()) return;
    setGuardando(true);
    try {
      const creada = await crearEnBase(name.trim(), selectedSupplier, cart.map((i) => ({
        productId: i.product.id, name: i.product.name, quantity: i.quantity, unitCost: costo(i) ?? 0, unit: i.product.unit || "und",
      })));
      setPlantillas((prev) => [...prev, creada]);
      setToastMsg(`Plantilla "${name.trim()}" guardada para todo el negocio`);
    } catch (err) {
      console.warn("[PuntoCompraView] guardar plantilla failed", err);
      setToastMsg("No se pudo guardar la plantilla");
    } finally {
      setGuardando(false);
    }
  }, [carrito, prompt, setToastMsg, crearEnBase]);

  /** Pone los productos en la canasta: costo = el de la última compra; si no hay, el de la plantilla. */
  const loadTemplate = useCallback((p: { nombre: string; supplierId?: string; items: Array<{ productId: number; quantity: number; unitCost?: number }> }) => {
    let faltan = 0;
    for (const it of p.items) {
      const product = products.find((x) => x.id === it.productId);
      if (!product) { faltan++; continue; }
      const sugerido = costoSugerido(product, carrito.priceHistory);
      carrito.addToCart(product, it.quantity, sugerido == null && (it.unitCost ?? 0) > 0 ? it.unitCost : undefined);
    }
    const proveedor = p.supplierId ? suppliers.find((s) => s.id === p.supplierId) : undefined;
    if (proveedor) carrito.setSelectedSupplier(proveedor);
    setToastMsg(`Plantilla "${p.nombre}" cargada${faltan ? ` · ${faltan} producto${faltan === 1 ? "" : "s"} ya no está${faltan === 1 ? "" : "n"} en tu catálogo` : ""}`);
  }, [products, suppliers, carrito, setToastMsg]);

  const deleteTemplate = useCallback(async (p: DbRecurringPurchase) => {
    if (!(await confirm({
      title: `¿Eliminar la plantilla "${nombrePlantilla(p)}"?`,
      description: p.active ? `Además deja de repetirse cada ${p.intervalDays} días.` : "Las órdenes ya creadas no se tocan.",
      intent: "danger",
      confirmLabel: "Sí, eliminar",
    }))) return;
    const res = await fetch(`/api/compras/recurrentes/${encodeURIComponent(p.id)}`, { method: "DELETE", headers: csrfHeaders({}) })
      .catch((err) => { console.warn("[PuntoCompraView] borrar plantilla failed", err); return null; });
    if (!res?.ok) { setToastMsg("No se pudo eliminar la plantilla"); return; }
    setPlantillas((prev) => prev.filter((x) => x.id !== p.id));
  }, [confirm, setToastMsg]);

  /** Saca una plantilla del navegador (ya subida, o sin productos de tu catálogo). */
  const quitarLocal = useCallback((tpl: PlantillaLocal) => {
    setLocales((prev) => {
      const quedan = prev.filter((t) => t !== tpl);
      try {
        if (quedan.length) localStorage.setItem(CLAVE_LOCAL, JSON.stringify(quedan));
        else localStorage.removeItem(CLAVE_LOCAL);
      } catch { /* quota */ }
      return quedan;
    });
  }, []);

  /**
   * Sube UNA plantilla del navegador a la base con el proveedor elegido. De a
   * una: si se subían todas juntas, todas quedaban con el mismo proveedor y al
   * cargar cualquiera la canasta se pasaba a ése.
   */
  const subirLocal = useCallback(async (tpl: PlantillaLocal) => {
    const proveedor = carrito.selectedSupplier;
    if (!proveedor) { setToastMsg(`Elige arriba el proveedor de «${tpl.name}» y vuelve a tocar subir`); return; }
    const items: ItemRecurrente[] = tpl.items.flatMap((it) => {
      const product = products.find((x) => x.id === it.productId);
      if (!product || !(it.quantity > 0)) return [];
      return [{ productId: product.id, name: product.name, quantity: it.quantity, unitCost: costoSugerido(product, carrito.priceHistory) ?? 0, unit: product.unit || "und" }];
    });
    if (items.length === 0) {
      quitarLocal(tpl);
      setToastMsg(`«${tpl.name}» no tenía productos de tu catálogo: se quitó de este equipo`);
      return;
    }
    if (!(await confirm({
      title: `¿Subir «${tpl.name}» con ${proveedor.name}?`,
      description: `Queda en el negocio con ese proveedor: al cargarla, la canasta pasa a ${proveedor.name}. Si es de otro, elígelo arriba antes.`,
      confirmLabel: "Sí, subir",
    }))) return;
    setGuardando(true);
    try {
      const creada = await crearEnBase(tpl.name, proveedor, items);
      setPlantillas((prev) => [...prev, creada]);
      quitarLocal(tpl);
      setToastMsg(`Plantilla «${tpl.name}» guardada con ${proveedor.name}`);
    } catch (err) {
      console.warn("[PuntoCompraView] subir plantilla local failed", err);
      setToastMsg(`No se pudo subir «${tpl.name}»`);
    } finally {
      setGuardando(false);
    }
  }, [carrito.selectedSupplier, carrito.priceHistory, products, confirm, crearEnBase, quitarLocal, setToastMsg]);

  return { plantillas, cargando, errorCarga, locales, guardando, saveAsTemplate, loadTemplate, deleteTemplate, subirLocal };
}

export type PlantillasCompra = ReturnType<typeof usePlantillasCompra>;
