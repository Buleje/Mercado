import { useEffect, useCallback, useMemo } from "react";
import { type SaleDoc, baseDeLosItems, buscarVentas } from "@/components/admin/notas-credito/nc-compartido";
import { logger } from "@/lib/logger";
import { useNcEstado } from "@/components/admin/notas-credito/hooks/use-nc-estado";

/** Selector de documentos del asistente y monto automático por ítems. Parte de `useNotasCredito`. */
export function useNcSelector(previo: ReturnType<typeof useNcEstado>) {
  const {
    showNew, setForm, pickerDocs, setPickerDocs, setPickerLoading, pickerSearch,
    pickerDocType, selectedVenta, setSelectedVenta,
  } = previo;
  // ── Document Picker Fetch ─────────────────────────────────────────────────
  // `/api/sales` no lee `search` (B5, 17-10): se traen las últimas 200 ventas una vez
  // al abrir y el buscador filtra en el navegador (`buscarVentas`).
  const fetchPickerDocs = useCallback(async () => {
    setPickerLoading(true);
    try {
      const res = await fetch("/api/sales?limit=200");
      if (res.ok) {
        const data = await res.json();
        const sales = (Array.isArray(data) ? data : data.sales ?? data.data ?? []) as Array<Record<string, unknown>>;
        setPickerDocs(sales.map((s) => ({
          id: String(s.id ?? ""),
          // El código corto que el panel usa para una venta, no el id técnico entero.
          número: String(s.número ?? s.orderNumber ?? String(s.id ?? "").slice(-6)),
          comprobanteTipo: (["factura", "boleta", "ticket"].includes(String(s.comprobanteTipo ?? "")) ? String(s.comprobanteTipo) : "ticket") as SaleDoc["comprobanteTipo"],
          comprobanteNumero: String(s.comprobanteNumero ?? ""),
          fecha: String(s.createdAt ?? s.fecha ?? ""),
          total: Number(s.total ?? s.grandTotal ?? 0),
          clienteNombre: String(s.customerName ?? s.clienteNombre ?? "Cliente"),
          clienteDocumento: String(s.customerDocument ?? s.clienteDocumento ?? s.comprobanteRuc ?? ""),
          telefono: String(s.customerPhone ?? ""),
          items: (Array.isArray(s.items) ? s.items : []).map((it: Record<string, unknown>) => ({
            id: String(it.productId ?? it.id ?? ""),
            nombre: String(it.name ?? it.productName ?? it.nombre ?? ""),
            cantidad: Number(it.quantity ?? it.cantidad ?? 0),
            precio: Number(it.price ?? it.precio ?? 0),
            cantidadDevolver: Number(it.quantity ?? it.cantidad ?? 0),
            selected: true,
          })),
        })));
      }
    } catch (err) {
      logger.warn("[notas-credito] ventas para la nota", { error: String(err) });
    } finally { setPickerLoading(false); }
  }, [setPickerDocs, setPickerLoading]);

  useEffect(() => { if (showNew) fetchPickerDocs(); }, [showNew, fetchPickerDocs]);

  const coincidentes = useMemo(() => buscarVentas(pickerDocs, pickerSearch), [pickerDocs, pickerSearch]);

  const filteredPickerDocs = useMemo(() => {
    const porTipo = pickerDocType === "all" ? coincidentes : coincidentes.filter(d => d.comprobanteTipo === pickerDocType);
    return porTipo.slice(0, 40);
  }, [coincidentes, pickerDocType]);

  const pickerCounts = useMemo(() => ({
    all: coincidentes.length,
    factura: coincidentes.filter(d => d.comprobanteTipo === "factura").length,
    boleta: coincidentes.filter(d => d.comprobanteTipo === "boleta").length,
    ticket: coincidentes.filter(d => d.comprobanteTipo === "ticket").length,
  }), [coincidentes]);

  // ── Auto-monto from selected items ────────────────────────────────────────
  const autoMonto = useMemo(() => {
    if (!selectedVenta) return 0;
    return selectedVenta.items.filter(it => it.selected).reduce((sum, it) => sum + it.cantidadDevolver * it.precio, 0);
  }, [selectedVenta]);

  useEffect(() => {
    if (selectedVenta && autoMonto > 0) {
      // Los precios de la venta ya traen IGV y `monto` es la BASE: sin esto la nota sumaba el 18 % encima
      // y, con el tope del servidor (base contra base), la devolución total daba 400 (09-10).
      setForm(prev => ({ ...prev, monto: baseDeLosItems(autoMonto) }));
    }
  }, [autoMonto, selectedVenta, setForm]);

  const handleItemToggle = (idx: number) => {
    setSelectedVenta(prev => {
      if (!prev) return prev;
      return { ...prev, items: prev.items.map((item, i) => i === idx ? { ...item, selected: !item.selected } : item) };
    });
  };

  const handleItemQty = (idx: number, qty: number) => {
    setSelectedVenta(prev => {
      if (!prev) return prev;
      return { ...prev, items: prev.items.map((item, i) => i === idx ? { ...item, cantidadDevolver: Math.max(1, Math.min(item.cantidad, qty)) } : item) };
    });
  };

  return {
    fetchPickerDocs, filteredPickerDocs, pickerCounts, autoMonto, handleItemToggle, handleItemQty,
  };
}
