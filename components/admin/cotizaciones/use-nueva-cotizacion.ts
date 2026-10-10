"use client";

/**
 * El formulario de «Nueva cotización» (tres pasos: cliente, ítems, confirmar).
 *
 * Cerrar la ventana NO borra lo escrito: reabrirla retoma donde quedaste,
 * como cuando era una pestaña. Se vacía sólo al crearla.
 *
 * Lo que se manda al servidor es lo mismo de siempre; el total que se ve acá
 * es una vista previa con la misma cuenta del servidor, que es quien lo fija.
 */
import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { emptyItem, subtotalDeLinea, type DraftItem } from "./tipos";

export type PasoNueva = 1 | 2 | 3;
export interface ProductoSugerido { id: string; name: string; price: number }

export interface Precarga {
  items?: DraftItem[];
  clienteNombre?: string;
  clienteRuc?: string;
  validoHasta?: string;
  notas?: string;
  paso?: PasoNueva;
}

export function useNuevaCotizacion(alCrear: () => void) {
  const [abierta, setAbierta] = useState(false);
  const [step, setStep] = useState<PasoNueva>(1);
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteRuc, setClienteRuc] = useState("");
  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);
  const [validoHasta, setValidoHasta] = useState("");
  const [notas, setNotas] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Autocompletar productos en la descripción de cada línea.
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ProductoSugerido[]>([]);
  const [activeItemIdx, setActiveItemIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!productSearch.trim()) {
      setProductResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(productSearch)}&limit=5`);
        if (res.ok) {
          const data: unknown = await res.json();
          setProductResults(Array.isArray(data) ? (data as ProductoSugerido[]) : []);
        }
      } catch (err) {
        logger.warn("[cotizaciones] buscar productos falló", { error: String(err) });
        setProductResults([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [productSearch]);

  /** Abre la ventana; con `precarga` (duplicar, renovar, plantilla) reemplaza lo que haya. */
  const abrir = useCallback((precarga?: Precarga) => {
    if (precarga) {
      if (precarga.items) setItems(precarga.items.length ? precarga.items : [emptyItem()]);
      if (precarga.clienteNombre !== undefined) setClienteNombre(precarga.clienteNombre);
      if (precarga.clienteRuc !== undefined) setClienteRuc(precarga.clienteRuc);
      if (precarga.validoHasta !== undefined) setValidoHasta(precarga.validoHasta);
      if (precarga.notas !== undefined) setNotas(precarga.notas);
      if (precarga.paso) setStep(precarga.paso);
    }
    setCreateError(null);
    setAbierta(true);
  }, []);
  const cerrar = useCallback(() => setAbierta(false), []);

  const irAPaso = useCallback(
    (p: PasoNueva) => {
      if (p > 1 && !clienteNombre.trim()) {
        setStep(1);
        setCreateError("Escribe el nombre del cliente");
        return;
      }
      setCreateError(null);
      setStep(p);
    },
    [clienteNombre],
  );

  const updateItem = (idx: number, field: keyof DraftItem, value: string) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const selectProduct = (idx: number, p: ProductoSugerido) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, descripcion: p.name, precioUnit: String(p.price) } : it)));
    setProductSearch("");
    setProductResults([]);
    setActiveItemIdx(null);
  };
  const escribirDescripcion = (idx: number, value: string) => {
    updateItem(idx, "descripcion", value);
    setProductSearch(value);
    setActiveItemIdx(idx);
  };

  // Vista previa (el servidor recalcula y guarda el suyo).
  const subtotal = items.reduce((s, i) => s + subtotalDeLinea(i), 0);
  const igv = subtotal * 0.18;
  const total = subtotal + igv;

  const crear = async () => {
    setCreateError(null);
    if (!clienteNombre.trim()) { setCreateError("Escribe el nombre del cliente"); return; }
    if (!validoHasta) { setCreateError("Elige hasta cuándo vale la cotización"); return; }
    const parsedItems = items
      .map((i) => ({
        descripcion: i.descripcion,
        cantidad: parseFloat(i.cantidad) || 0,
        precioUnit: parseFloat(i.precioUnit) || 0,
        descuento: parseFloat(i.descuento) || 0,
      }))
      .filter((i) => i.descripcion.trim() && i.cantidad > 0 && i.precioUnit > 0);
    if (parsedItems.length === 0) { setCreateError("Agrega al menos un ítem con cantidad y precio"); return; }

    setCreating(true);
    try {
      const res = await fetch("/api/cotizaciones", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          clienteNombre: clienteNombre.trim(),
          clienteRuc: clienteRuc.trim() || undefined,
          validoHasta: new Date(validoHasta).toISOString(),
          items: parsedItems,
          notas: notas.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({ error: "Error al crear" }))) as { error?: unknown };
        throw new Error(typeof err.error === "string" ? err.error : "No se pudo crear la cotización");
      }
      setClienteNombre(""); setClienteRuc(""); setItems([emptyItem()]); setValidoHasta(""); setNotas("");
      setStep(1);
      setAbierta(false);
      alCrear();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setCreating(false);
    }
  };

  return {
    abierta, abrir, cerrar, step, irAPaso,
    clienteNombre, setClienteNombre, clienteRuc, setClienteRuc,
    items, setItems, updateItem, removeItem, addItem, escribirDescripcion, selectProduct,
    productResults, activeItemIdx, setActiveItemIdx,
    validoHasta, setValidoHasta, notas, setNotas,
    subtotal, igv, total, creating, createError, crear,
  };
}

export type FormNuevaCotizacion = ReturnType<typeof useNuevaCotizacion>;
