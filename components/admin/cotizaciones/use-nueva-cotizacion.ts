"use client";

/**
 * El formulario de «Nueva cotización» (tres pasos: cliente, ítems, confirmar).
 *
 * Cerrar la ventana NO borra lo escrito: reabrirla retoma donde quedaste,
 * como cuando era una pestaña. Se vacía sólo al crearla.
 *
 * El total que se ve acá es una vista previa con la misma cuenta del
 * servidor, que es quien lo fija. El cliente elegido de tu lista viaja como
 * `customerId` (su celular) y cada línea del catálogo con su `productoId`
 * (para revisar el stock); el servidor descarta los que no son del negocio.
 */
import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { emptyItem, fechaEnDias, nombreDeCliente, subtotalDeLinea, type ClienteDeLista, type DraftItem } from "./tipos";

export type PasoNueva = 1 | 2 | 3;
export interface ProductoSugerido {
  id: string | number;
  name: string;
  price: number;
  stock?: number | null;
  unit?: string;
  type?: string;
}

export interface Precarga {
  items?: DraftItem[];
  clienteNombre?: string;
  clienteRuc?: string;
  cliente?: ClienteDeLista | null;
  validoHasta?: string;
  notas?: string;
  paso?: PasoNueva;
}

export function useNuevaCotizacion(alCrear: () => void) {
  const [abierta, setAbierta] = useState(false);
  const [step, setStep] = useState<PasoNueva>(1);
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteRuc, setClienteRuc] = useState("");
  const [cliente, setCliente] = useState<ClienteDeLista | null>(null);
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
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        // `q`, no `search`: con `search` el catálogo devolvía los 5 primeros
        // productos escribieras lo que escribieras (17-10).
        const res = await fetch(`/api/products?q=${encodeURIComponent(productSearch.trim())}&limit=6`, { signal: ctrl.signal });
        if (res.ok) {
          const data: unknown = await res.json();
          setProductResults(Array.isArray(data) ? (data as ProductoSugerido[]) : []);
        }
      } catch (err) {
        if (ctrl.signal.aborted) return;
        logger.warn("[cotizaciones] buscar productos falló", { error: String(err) });
        setProductResults([]);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [productSearch]);

  /** Abre la ventana; con `precarga` (duplicar, renovar, modelo) reemplaza lo que haya. */
  const abrir = useCallback((precarga?: Precarga) => {
    if (precarga) {
      if (precarga.items) setItems(precarga.items.length ? precarga.items : [emptyItem()]);
      if (precarga.clienteNombre !== undefined) setClienteNombre(precarga.clienteNombre);
      if (precarga.clienteRuc !== undefined) setClienteRuc(precarga.clienteRuc);
      if (precarga.cliente !== undefined) setCliente(precarga.cliente);
      else if (precarga.clienteNombre !== undefined) setCliente(null);
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
        setCreateError("Elige un cliente de tu lista o escribe su nombre");
        return;
      }
      setCreateError(null);
      // Al llegar a Confirmar sin vigencia, se propone la de siempre (15 días); se cambia ahí mismo.
      if (p === 3 && !validoHasta) setValidoHasta(fechaEnDias(15));
      setStep(p);
    },
    [clienteNombre, validoHasta],
  );

  /** Cliente de tu lista: trae nombre y documento (no se vuelven a escribir). */
  const elegirCliente = useCallback((c: ClienteDeLista) => {
    setCliente(c);
    setClienteNombre(nombreDeCliente(c));
    setClienteRuc(c.documento ?? "");
    setCreateError(null);
  }, []);
  /** Suelta el enlace con la lista; lo escrito queda para corregirlo. */
  const soltarCliente = useCallback(() => setCliente(null), []);

  const updateItem = (idx: number, field: keyof DraftItem, value: string) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const selectProduct = (idx: number, p: ProductoSugerido) => {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, descripcion: p.name, precioUnit: String(p.price), productoId: String(p.id) } : it)),
    );
    setProductSearch("");
    setProductResults([]);
    setActiveItemIdx(null);
  };
  /** Escribir encima de un producto lo suelta del catálogo: ya no es ese producto. */
  const escribirDescripcion = (idx: number, value: string) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { descripcion: value, cantidad: it.cantidad, precioUnit: it.precioUnit, descuento: it.descuento } : it)));
    setProductSearch(value);
    setActiveItemIdx(idx);
  };

  // Vista previa (el servidor recalcula y guarda el suyo).
  const subtotal = items.reduce((s, i) => s + subtotalDeLinea(i), 0);
  const igv = subtotal * 0.18;
  const total = subtotal + igv;

  const crear = async () => {
    setCreateError(null);
    if (!clienteNombre.trim()) { setCreateError("Elige un cliente de tu lista o escribe su nombre"); return; }
    if (!validoHasta) { setCreateError("Elige hasta cuándo vale la cotización"); return; }
    const parsedItems = items
      .map((i) => ({
        descripcion: i.descripcion,
        cantidad: parseFloat(i.cantidad) || 0,
        precioUnit: parseFloat(i.precioUnit) || 0,
        descuento: parseFloat(i.descuento) || 0,
        ...(i.productoId && { productoId: i.productoId }),
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
          customerId: cliente?.phone,
          // El DÍA elegido: el servidor lo guarda hasta el final de ese día en Lima.
          validoHasta,
          items: parsedItems,
          notas: notas.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({ error: "Error al crear" }))) as { error?: unknown };
        throw new Error(typeof err.error === "string" ? err.error : "No se pudo crear la cotización");
      }
      setClienteNombre(""); setClienteRuc(""); setCliente(null); setItems([emptyItem()]); setValidoHasta(""); setNotas("");
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
    clienteNombre, setClienteNombre, clienteRuc, setClienteRuc, cliente, elegirCliente, soltarCliente,
    items, setItems, updateItem, removeItem, addItem, escribirDescripcion, selectProduct,
    productResults, activeItemIdx, setActiveItemIdx,
    validoHasta, setValidoHasta, notas, setNotas,
    subtotal, igv, total, creating, createError, crear,
  };
}

export type FormNuevaCotizacion = ReturnType<typeof useNuevaCotizacion>;
