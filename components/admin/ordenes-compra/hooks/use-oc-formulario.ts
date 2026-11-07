import { csrfHeaders } from "@/lib/csrf-client";
import type { FormEvent } from "react";
import type { DbProduct } from "@/lib/jsondb";
import { generaCuentaPorPagar } from "@/lib/compras/estados-oc";
import { nuevaIdempotencyKey, type ItemDraft } from "@/components/admin/ordenes-compra/oc-compartido";
import { useOcEstado } from "@/components/admin/ordenes-compra/hooks/use-oc-estado";
import { useOcRecurrentes } from "@/components/admin/ordenes-compra/hooks/use-oc-recurrentes";
import { useOcModales } from "@/components/admin/ordenes-compra/hooks/use-oc-modales";
import { useOcCarga } from "@/components/admin/ordenes-compra/hooks/use-oc-carga";

/** Ítems de la orden nueva y crearla. Parte de `useOrdenesCompra`. */
export function useOcFormulario(previo: ReturnType<typeof useOcEstado> & ReturnType<typeof useOcRecurrentes> & ReturnType<typeof useOcModales> & ReturnType<typeof useOcCarga>) {
  const {
    setShowCreate, suppliers, products, supplierId, setSupplierId, items, setItems, notes, setNotes,
    saving, setSaving, paymentMethod, setPaymentMethod, deliveryDate, setDeliveryDate, discount,
    setDiscount, idempotencyKeyRef, invoiceType, setInvoiceType, invoiceNumber, setInvoiceNumber,
    flete, setFlete, otrosCostos, setOtrosCostos, igvIncluded, setIgvIncluded, setItemQueries,
    setOpenSearchIdx, setShowScanner, avisar, load,
  } = previo;
  const addItemFromProduct = (p: DbProduct) => {
    setItems(prev => [...prev, { productId: p.id, name: p.name, quantity: 1, unitCost: p.costPrice ?? p.price, unit: p.unit }]);
    setItemQueries(prev => [...prev, p.name]);
    setOpenSearchIdx(null);
  };

  const handleScan = (code: string) => {
    setShowScanner(false);
    const p = products.find(x => x.barcode === code);
    if (p) addItemFromProduct(p);
  };

  const updateItem = (idx: number, patch: Partial<ItemDraft>) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
    setItemQueries(prev => prev.filter((_, i) => i !== idx));
  };

  const changeProduct = (idx: number, productId: number) => {
    const p = products.find(x => x.id === productId);
    if (!p) return;
    updateItem(idx, { productId: p.id, name: p.name, unitCost: p.costPrice ?? p.price, unit: p.unit });
  };

  const createOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!supplierId || items.length === 0 || saving) return;
    const sup = suppliers.find(s => s.id === supplierId);
    setSaving(true);
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          supplierId,
          supplierName: sup?.name || "",
          items,
          notes: notes || undefined,
          paymentMethod,
          deliveryDate: deliveryDate || undefined,
          discount,
          // ADR-377
          invoiceType,
          invoiceNumber: invoiceType === "ninguno" ? undefined : (invoiceNumber || undefined),
          flete,
          otrosCostos,
          igvIncluded,
          // Dos clicks al botón ya no crean dos órdenes.
          idempotencyKey: idempotencyKeyRef.current,
        }),
      });
      if (!res.ok) {
        avisar("No se pudo crear la orden de compra", "error");
        return;
      }
      // La cuenta por pagar la abre el endpoint, y sólo si la compra es a
      // crédito. Antes la creaba acá SIEMPRE, a 30 días: cada compra pagada en
      // efectivo dejaba una deuda que nadie debía.
      avisar(
        generaCuentaPorPagar(paymentMethod)
          ? "Orden creada — se abrió la cuenta por pagar con su vencimiento"
          : "Orden de compra creada",
      );
      setShowCreate(false);
      setSupplierId("");
      setItems([]);
      setItemQueries([]);
      setNotes("");
      setPaymentMethod("contado");
      setDeliveryDate("");
      setDiscount(0);
      setInvoiceType("ninguno");
      setInvoiceNumber("");
      setFlete(0);
      setOtrosCostos(0);
      setIgvIncluded(true);
      idempotencyKeyRef.current = nuevaIdempotencyKey();
      load();
    } catch {
      avisar("Sin conexión con el servidor — la orden no se creó", "error");
    } finally {
      setSaving(false);
    }
  };
  return {
    addItemFromProduct, handleScan, updateItem, removeItem, changeProduct, createOrder,
  };
}
