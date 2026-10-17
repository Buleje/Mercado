"use client";

/**
 * Datos y acciones de Compras › Sugerencias: la lectura de
 * `/api/compras/sugerencias`, filtros, selección y las órdenes por proveedor.
 * Movido tal cual desde SugerenciasCompraTab (10-10): ninguna cuenta ni lo que
 * se manda a `/api/purchases` cambió.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { FilterKey, Resumen, SinRotacion, Sugerencia, Urgency } from "./tipos";

export function useSugerenciasCompra() {
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [sinRotacion, setSinRotacion] = useState<SinRotacion[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  // Presente sólo cuando NO se analizó ningún producto porque ninguno tiene
  // stock mínimo cargado — distinto de "analicé todo y está abastecido".
  const [sinStockMinimo, setSinStockMinimo] = useState<{ productosActivos: number } | null>(null);
  const [verSinRotacion, setVerSinRotacion] = useState(false);
  const [ventanaDias, setVentanaDias] = useState(30);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [collapsed, setCollapsed] = useState<Record<Urgency, boolean>>({
    CRITICO: false, URGENTE: false, PLANIFICAR: true,
  });
  const [creating, setCreating] = useState(false);
  // productId de la sugerencia cuya OC se está creando (botón "Crear OC" por fila).
  const [creatingItemId, setCreatingItemId] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch(`/api/compras/sugerencias?dias=${ventanaDias}`);
      if (res.ok) {
        const data = await res.json();
        setSugerencias(data.sugerencias ?? []);
        setSinRotacion(data.sinRotacion ?? []);
        setResumen(data.resumen ?? null);
        setAvisos(data.avisos ?? []);
        setSinStockMinimo(data.sinStockMinimo ?? null);
        setError(null);
      } else {
        // Antes un 403/500 dejaba la pantalla en «Nada que reponer»: un error
        // leído como «está todo abastecido».
        setError(res.status === 403 ? "Tu rol no puede ver las sugerencias de compra." : "No se pudieron calcular las sugerencias.");
      }
    } catch (err) {
      logger.warn("[compras/sugerencias] no se pudo leer", { error: String(err) });
      setError("No se pudieron calcular las sugerencias. Revisa tu conexión.");
    }
    setLoading(false);
    setRefreshing(false);
  }, [ventanaDias]);

  useEffect(() => { void load(); }, [load]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const counts: Record<Urgency, number> = { CRITICO: 0, URGENTE: 0, PLANIFICAR: 0 };
    let totalSuggested = 0;
    let totalCost = 0;
    let withoutSupplier = 0;
    for (const s of sugerencias) {
      counts[s.urgency] += 1;
      totalSuggested += s.suggestedQty;
      if (s.lastPrice != null) totalCost += s.lastPrice * s.suggestedQty;
      if (!s.suggestedSupplier) withoutSupplier += 1;
    }
    return { counts, totalSuggested, totalCost, withoutSupplier, total: sugerencias.length };
  }, [sugerencias]);

  // ── Visible (filter + search) ─────────────────────────────────────────────
  const visible = useMemo(() => {
    return sugerencias.filter((s) => {
      if (filter === "sin-proveedor") {
        if (s.suggestedSupplier) return false;
      } else if (filter !== "todos" && s.urgency !== filter) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!s.productName.toLowerCase().includes(q) && !s.category.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [sugerencias, filter, search]);

  // ── Selection ─────────────────────────────────────────────────────────────
  const toggleSelect = (productId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId); else next.add(productId);
      return next;
    });
  };

  const selectAllVisible = () => {
    const ids = visible.map((s) => s.productId);
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const selectAllUrgency = (urgency: Urgency) => {
    const ids = sugerencias.filter((s) => s.urgency === urgency).map((s) => s.productId);
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleCollapse = (urgency: Urgency) => {
    setCollapsed((prev) => ({ ...prev, [urgency]: !prev[urgency] }));
  };

  // ── Selected stats ────────────────────────────────────────────────────────
  const selectedStats = useMemo(() => {
    let qty = 0;
    let cost = 0;
    const supplierGroups = new Map<string, number>();
    for (const s of sugerencias) {
      if (!selected.has(s.productId)) continue;
      qty += s.suggestedQty;
      if (s.lastPrice != null) cost += s.lastPrice * s.suggestedQty;
      const key = s.suggestedSupplier?.id ?? "sin-proveedor";
      supplierGroups.set(key, (supplierGroups.get(key) ?? 0) + 1);
    }
    return { qty, cost, supplierGroups: supplierGroups.size };
  }, [selected, sugerencias]);

  // ── Crear OCs por proveedor ──────────────────────────────────────────────

  /**
   * Crea OCs a partir de una lista de sugerencias, agrupando por proveedor
   * (un POST /api/purchases por proveedor) + payable fire-and-forget. Es el
   * núcleo reutilizado tanto por la creación masiva (seleccionados) como por
   * el botón "Crear OC" de una sola fila. Devuelve cuántas OCs se crearon vs
   * cuántos grupos se intentaron.
   */
  const createOCForItems = async (
    items: Sugerencia[],
  ): Promise<{ createdCount: number; groupCount: number; sinPrecio: number; aCredito: number }> => {
    const groups = new Map<string, Sugerencia[]>();
    for (const item of items) {
      const key = item.suggestedSupplier?.id ?? "sin-proveedor";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }

    let createdCount = 0;
    let sinPrecio = 0;
    let aCredito = 0;
    for (const [supplierId, groupItems] of groups) {
      const supplierName =
        supplierId !== "sin-proveedor"
          ? groupItems[0].suggestedSupplier?.name ?? "Proveedor por definir"
          : "Proveedor por definir";
      // Lo pactado con este proveedor en su ficha. Sin condición declarada se
      // asume contado: es lo que hace la bodega cuando no hay acuerdo.
      const condicionPago = groupItems[0].suggestedSupplier?.condicionPago || "contado";

      // Los productos sin precio de referencia entraban con `unitCost: 0`, así
      // que la orden se creaba por S/0,00 y ese cero viajaba al Historial de
      // Gastos y al P&L como una compra real. Se cuentan para avisarlo: la
      // orden se crea igual (hay que poder pedir), pero el usuario se entera de
      // que le falta ponerle precio antes de recibirla.
      sinPrecio += groupItems.filter((i) => i.lastPrice == null).length;

      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          supplierId: supplierId !== "sin-proveedor" ? supplierId : "",
          supplierName,
          items: groupItems.map((i) => ({
            productId: i.productId,
            name: i.productName,
            quantity: i.suggestedQty,
            unitCost: i.lastPrice ?? 0,
            unit: "und",
          })),
          notes: `OC generada automaticamente por sugerencias de compra`,
          // ADR-377: la forma de pago pactada con ESE proveedor. El endpoint
          // abre la cuenta por pagar sólo si es a crédito, y con el
          // vencimiento correcto.
          paymentMethod: condicionPago,
        }),
      });

      if (res.ok) {
        createdCount++;
        if (condicionPago.startsWith("credito_")) aCredito++;
        // La cuenta por pagar la abre POST /api/purchases, y SÓLO si la
        // compra es a crédito. Antes se creaba acá una a 30 días para toda
        // orden, incluso las que se pagan en efectivo al recibir: eso llenaba
        // las cuentas por pagar con deuda que nadie debía.
      }
    }
    return { createdCount, groupCount: groups.size, sinPrecio, aCredito };
  };

  // Creación masiva de los seleccionados.
  const createOCs = async () => {
    if (selected.size === 0) return;
    setCreating(true);
    try {
      const selectedItems = sugerencias.filter((s) => selected.has(s.productId));
      const { createdCount, groupCount, sinPrecio, aCredito } = await createOCForItems(selectedItems);

      if (createdCount === groupCount) {
        const detalles = [
          `${selected.size} productos repartidos en ${groupCount} ${groupCount === 1 ? "proveedor" : "proveedores"}.`,
          sinPrecio > 0 ? `${sinPrecio} ${sinPrecio === 1 ? "producto va" : "productos van"} sin precio: pónselo antes de recibir la orden o entrará como S/0.` : "",
          aCredito > 0 ? `${aCredito} ${aCredito === 1 ? "va" : "van"} a crédito: se ${aCredito === 1 ? "abrió su cuenta" : "abrieron sus cuentas"} por pagar.` : "",
        ].filter(Boolean).join(" ");
        toast.success(
          `${createdCount} ${createdCount === 1 ? "orden creada" : "órdenes creadas"}`,
          { description: detalles },
        );
      } else if (createdCount > 0) {
        toast(`Creadas ${createdCount}/${groupCount} órdenes`, { description: "Algunas fallaron. Reintenta." });
      } else {
        toast.error("No se pudo crear ninguna orden");
      }
      setSelected(new Set());
      void load(true);
    } catch {
      toast.error("Error al crear órdenes de compra");
    }
    setCreating(false);
  };

  // Creación de UNA sola OC desde la fila de una sugerencia (1 clic). Reusa el
  // mismo núcleo; estado de carga por-item para no duplicar.
  const createOCForOne = async (item: Sugerencia) => {
    setCreatingItemId(item.productId);
    try {
      const { createdCount, sinPrecio, aCredito } = await createOCForItems([item]);
      if (createdCount > 0) {
        toast.success("Orden de compra creada", {
          description: [
            item.productName,
            sinPrecio > 0 ? "Va sin precio: pónselo antes de recibirla o entrará como S/0." : "",
            aCredito > 0 ? "Va a crédito: se abrió su cuenta por pagar." : "",
          ].filter(Boolean).join(" · "),
        });
        void load(true);
      } else {
        toast.error("No se pudo crear la orden");
      }
    } catch {
      toast.error("Error al crear la orden");
    }
    setCreatingItemId(null);
  };

  return {
    sugerencias, sinRotacion, resumen, avisos, sinStockMinimo, verSinRotacion, setVerSinRotacion,
    ventanaDias, setVentanaDias, loading, refreshing, error, load, selected, setSelected, collapsed,
    creating, creatingItemId, filter, setFilter, search, setSearch, stats, visible, toggleSelect,
    selectAllVisible, selectAllUrgency, toggleCollapse, selectedStats, createOCs, createOCForOne,
  };
}

export type SugerenciasCompra = ReturnType<typeof useSugerenciasCompra>;
