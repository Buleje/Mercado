import { useEffect, useCallback, useMemo } from "react";
import { type SaleDoc, baseDeLosItems } from "@/components/admin/notas-credito/nc-compartido";
import { useNcEstado } from "@/components/admin/notas-credito/hooks/use-nc-estado";

/** Selector de documentos del asistente y monto automático por ítems. Parte de `useNotasCredito`. */
export function useNcSelector(previo: ReturnType<typeof useNcEstado>) {
  const {
    showNew, setForm, pickerDocs, setPickerDocs, setPickerLoading, pickerSearch,
    pickerDocType, selectedVenta, setSelectedVenta,
  } = previo;
  // ── Document Picker Fetch ─────────────────────────────────────────────────
  const fetchPickerDocs = useCallback(async (searchTerm = "") => {
    setPickerLoading(true);
    try {
      const params = new URLSearchParams({ limit: "24" });
      if (searchTerm.trim()) params.set("search", searchTerm.trim());
      const res = await fetch(`/api/sales?${params}`);
      if (res.ok) {
        const data = await res.json();
        const sales = (Array.isArray(data) ? data : data.sales ?? data.data ?? []).slice(0, 24);
        setPickerDocs(sales.map((s: Record<string, unknown>) => ({
          id: String(s.id ?? ""),
          número: String(s.número ?? s.orderNumber ?? s.id ?? ""),
          comprobanteTipo: (["factura", "boleta", "ticket"].includes(String(s.comprobanteTipo ?? "")) ? String(s.comprobanteTipo) : "ticket") as SaleDoc["comprobanteTipo"],
          comprobanteNumero: String(s.comprobanteNumero ?? ""),
          fecha: String(s.createdAt ?? s.fecha ?? ""),
          total: Number(s.total ?? s.grandTotal ?? 0),
          clienteNombre: String(s.customerName ?? s.clienteNombre ?? "Cliente"),
          clienteDocumento: String(s.customerDocument ?? s.clienteDocumento ?? ""),
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
    } catch { /* silent */ }
    finally { setPickerLoading(false); }
  }, [setPickerDocs, setPickerLoading]);

  useEffect(() => { if (showNew) fetchPickerDocs(); }, [showNew, fetchPickerDocs]);

  useEffect(() => {
    if (!showNew) return;
    const timer = setTimeout(() => fetchPickerDocs(pickerSearch), 400);
    return () => clearTimeout(timer);
  }, [pickerSearch, showNew, fetchPickerDocs]);

  const filteredPickerDocs = useMemo(() => {
    if (pickerDocType === "all") return pickerDocs;
    return pickerDocs.filter(d => d.comprobanteTipo === pickerDocType);
  }, [pickerDocs, pickerDocType]);

  const pickerCounts = useMemo(() => ({
    all: pickerDocs.length,
    factura: pickerDocs.filter(d => d.comprobanteTipo === "factura").length,
    boleta: pickerDocs.filter(d => d.comprobanteTipo === "boleta").length,
    ticket: pickerDocs.filter(d => d.comprobanteTipo === "ticket").length,
  }), [pickerDocs]);

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
