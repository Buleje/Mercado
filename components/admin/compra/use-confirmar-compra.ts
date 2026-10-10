"use client";

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { buildPurchaseWhatsAppUrl } from "@/lib/whatsapp-client";
import { csrfHeaders } from "@/lib/csrf-client";
import type { CompraCarrito } from "./use-compra-carrito";

function nuevaClave(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `poc-${Math.random().toString(36).slice(2)}`;
}

/** Lo que dice qué falta para crear la orden, o `null` si está lista. */
export function faltaParaOrden(c: Pick<CompraCarrito, "cart" | "selectedSupplier" | "sinCosto" | "invoiceType" | "invoiceNumber">): string | null {
  if (c.cart.length === 0) return null;
  if (!c.selectedSupplier) return "Selecciona un proveedor antes de crear la orden";
  if (c.sinCosto.length > 0) {
    const nombres = c.sinCosto.slice(0, 2).map((i) => i.product.name).join(", ");
    const resto = c.sinCosto.length > 2 ? ` y ${c.sinCosto.length - 2} más` : "";
    return `Falta el costo de ${nombres}${resto}`;
  }
  if (c.invoiceType !== "ninguno" && !c.invoiceNumber.trim()) return "Escribe el número del comprobante (ej. F001-123)";
  return null;
}

/** Crear la orden de compra, mandarla por WhatsApp y guardar el borrador. */
export function useConfirmarCompra(carrito: CompraCarrito, setToastMsg: Dispatch<SetStateAction<string | null>>) {
  const [processing, setProcessing] = useState(false);
  // Bloqueo por trial/plan expirado al crear OC (402): aviso claro con CTA.
  const [planBlockedMsg, setPlanBlockedMsg] = useState<string | null>(null);
  /** Identifica el intento de compra: dos clicks comparten clave, no crean dos OCs. */
  const idempotencyKeyRef = useRef<string>(nuevaClave());

  const confirmarOC = useCallback(async () => {
    const { cart, selectedSupplier, costo, notes, paymentMethod, deliveryDate, discount, invoiceType, invoiceNumber, total } = carrito;
    if (cart.length === 0) return;
    if (!navigator.onLine) {
      setToastMsg("Sin conexión — guarda como borrador e intenta después");
      return;
    }
    const falta = faltaParaOrden(carrito);
    if (falta || !selectedSupplier) {
      setToastMsg(falta ?? "Selecciona un proveedor antes de crear la orden");
      return;
    }
    const items = cart.map((i) => ({
      productId: i.product.id,
      name: i.product.name,
      quantity: i.quantity,
      // Nunca el precio de venta: `faltaParaOrden` ya frenó si falta.
      unitCost: costo(i) ?? 0,
      unit: i.product.unit,
    }));
    setProcessing(true);
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          supplierId: selectedSupplier.id,
          supplierName: selectedSupplier.name,
          items,
          notes: notes || undefined,
          paymentMethod,
          deliveryDate: deliveryDate || undefined,
          discount,
          invoiceType,
          invoiceNumber: invoiceType === "ninguno" ? undefined : invoiceNumber.trim() || undefined,
          // Dos clicks (o un reintento por conexión lenta) creaban dos órdenes iguales.
          idempotencyKey: idempotencyKeyRef.current,
        }),
      });
      if (!res.ok) {
        // 402 = trial/plan expirado: la causa REAL y un CTA, no el genérico.
        if (res.status === 402) {
          const body = await res.json().catch(() => ({} as { detail?: string; error?: string }));
          setPlanBlockedMsg(body.detail ?? body.error ?? "Tu periodo de prueba terminó. Activa un plan para crear órdenes de compra.");
          return;
        }
        throw new Error("Error al crear OC");
      }
      setPlanBlockedMsg(null);
      const oc = await res.json() as { id: string | number };
      const ocId = String(oc.id);
      setToastMsg(`Orden de Compra creada — ID: ${ocId}`);
      carrito.setLastOC({ id: ocId, total, items: cart.length });
      idempotencyKeyRef.current = nuevaClave();
      carrito.vaciarTrasOrden(items);
    } catch {
      setToastMsg("No se pudo crear la Orden de Compra");
    } finally {
      setProcessing(false);
    }
  }, [carrito, setToastMsg]);

  const generateWhatsApp = useCallback(() => {
    const { cart, selectedSupplier, total, deliveryDate, paymentMethod } = carrito;
    if (cart.length === 0) return;
    const url = buildPurchaseWhatsAppUrl({
      phone: selectedSupplier?.phone,
      items: cart.map((i) => ({ name: i.product.name, quantity: i.quantity, unit: i.product.unit })),
      total,
      deliveryDate,
      paymentMethod,
    });
    window.open(url, "_blank");
  }, [carrito]);

  const handleSaveDraft = useCallback(() => {
    carrito.saveDraft(carrito.borrador);
    setToastMsg("Borrador guardado");
  }, [carrito, setToastMsg]);

  return { processing, planBlockedMsg, confirmarOC, generateWhatsApp, handleSaveDraft };
}

export type ConfirmarCompra = ReturnType<typeof useConfirmarCompra>;
