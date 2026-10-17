import { toast } from "sonner";
import { exportToCSV } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import { useInventarioEstado } from "@/components/admin/inventario/hooks/use-inventario-estado";
import { useInventarioCarga } from "@/components/admin/inventario/hooks/use-inventario-carga";
import { useInventarioImagenes } from "@/components/admin/inventario/hooks/use-inventario-imagenes";

/** Acciones sobre varios productos a la vez. Parte de `useInventario`. */
export function useInventarioMasivo(previo: ReturnType<typeof useInventarioEstado> & ReturnType<typeof useInventarioCarga> & ReturnType<typeof useInventarioImagenes>) {
  const {
    products, setProducts, selectedIds, setSelectedIds, setBulkModal, bulkField, bulkValue,
    setBulkSaving, setBulkDeleteConfirm, setBulkDeleting, setBulkClearImagesConfirm,
    setBulkClearingImages, load,
  } = previo;

  // ── Bulk operations  ─────────────────────────────────────────────────────

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const executeBulk = async () => {
    if (selectedIds.size === 0) return;
    setBulkSaving(true);
    const ids = Array.from(selectedIds);
    const fields: Record<string, unknown> = {};
    if (bulkField === "active") fields.active = bulkValue === "true";
    if (bulkField === "category") fields.category = bulkValue;
    // Precio: fijar (absoluto), ajustar en soles (delta) o en porcentaje.
    // FIX 2026-06-11: antes "priceAdjust" (etiquetado S/) se aplicaba como % y
    // "pricePercent" se enviaba a un campo inexistente → no hacía nada. Ahora
    // cada modo mapea al campo correcto del endpoint (/api/products/bulk).
    if (bulkField === "price") fields.price = Number(bulkValue);
    if (bulkField === "priceDelta") fields.priceDelta = Number(bulkValue);
    if (bulkField === "pricePercent") fields.priceAdjust = Number(bulkValue);
    if (bulkField === "stock") fields.stock = Number(bulkValue);
    if (bulkField === "stockMin") fields.stockMin = Number(bulkValue);
    if (bulkField === "stockMax") fields.stockMax = Number(bulkValue);
    // Etiqueta: string vacío → null = quitar la etiqueta.
    if (bulkField === "badge") fields.badge = bulkValue.trim() || null;

    try {
      // Una edición masiva toca el precio o el stock de decenas de productos:
      // que falle sin decir nada es la peor combinación posible. Antes el
      // modal se cerraba y la selección se limpiaba igual, así que ni siquiera
      // quedaba a mano para reintentar.
      const res = await fetch("/api/products/bulk", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ids, fields }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(
          typeof body?.error === "string"
            ? body.error
            : `No se pudo aplicar el cambio a ${ids.length} producto${ids.length === 1 ? "" : "s"} (error ${res.status})`,
        );
        return;
      }
      toast.success(`${ids.length} producto${ids.length === 1 ? "" : "s"} actualizado${ids.length === 1 ? "" : "s"}`);
      setBulkModal(false);
      clearSelection();
      load();
    } catch (err) {
      console.warn("[InventoryTab] edición masiva falló", err);
      toast.error("Sin conexión — no se aplicó ningún cambio.");
    } finally {
      setBulkSaving(false);
    }
  };

  const executeBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      await fetch("/api/products/bulk", {
        method: "DELETE",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ids }),
      });
    } catch { /* ignore */ }
    setBulkDeleting(false);
    setBulkDeleteConfirm(false);
    clearSelection();
    load();
  };

  /**
   * Bulk clear images — limpia el campo `image` de los productos seleccionados.
   * El producto en si NO se elimina, solo se quita la URL de la imagen para
   * que el admin pueda re-subirla con los requisitos correctos.
   *
   * Nota técnica 2026-04-20: el endpoint /api/products/bulk acepta
   * `fields.image: ""` desde el extender del schema. Si recibis 400, revisar
   * que el dev server haya recargado el schema. El load() usa cache:no-store
   * para forzar refetch.
   */
  const executeBulkClearImages = async () => {
    if (selectedIds.size === 0) return;
    setBulkClearingImages(true);
    let success = false;
    try {
      const ids = Array.from(selectedIds);
      const res = await fetch("/api/products/bulk", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ids, fields: { image: "" } }),
      });
      success = res.ok;
      if (!res.ok) {
        const err = await res.text();
        console.error("[bulk-clear-images] failed", res.status, err);
      }
    } catch (e) {
      console.error("[bulk-clear-images] network error", e);
    }
    setBulkClearingImages(false);
    setBulkClearImagesConfirm(false);
    if (success) {
      // Optimistic UI: marcar localmente como sin imagen mientras llega el reload
      setProducts((prev) =>
        prev.map((p) => (selectedIds.has(p.id) ? { ...p, image: "" } : p)),
      );
    }
    clearSelection();
    await load();
  };

  /**
   * Exporta a CSV solo los productos seleccionados (acción masiva client-side,
   * sin endpoint). Útil para revisar/editar en Excel o pasar a un proveedor.
   */
  const exportSelectedCSV = () => {
    const rows = products
      .filter((p) => selectedIds.has(p.id))
      .map((p) => ({
        id: p.id,
        nombre: p.name,
        categoria: p.category ?? "",
        precio: Number(p.price ?? 0),
        stock: p.stock ?? "",
        stock_min: p.stockMin ?? "",
        stock_max: p.stockMax ?? "",
        unidad: p.unit ?? "",
        sku: p.sku ?? "",
        codigo_barras: p.barcode ?? "",
        etiqueta: p.badge ?? "",
        activo: p.active ? "Sí" : "No",
      }));
    if (rows.length === 0) return;
    exportToCSV(rows, `productos-seleccion-${rows.length}`);
    toast.success(`${rows.length} producto${rows.length > 1 ? "s" : ""} exportado${rows.length > 1 ? "s" : ""} a CSV`);
  };

  // ── Purchase Order Auto-Suggestion ──────────────────────────────────────

  const lowStockProducts = products.filter(p => {
    const minStock = p.stockMin ?? 5;
    return p.stock != null && p.stock <= minStock && p.active;
  });

  /**
   * Activar o desactivar productos en lote, avisando si no entró.
   * Devuelve `true` sólo si el servidor lo aceptó.
   */
  const bulkEstado = async (ids: number[], active: boolean): Promise<boolean> => {
    try {
      const res = await fetch("/api/products/bulk", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ids, fields: { active } }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(
          typeof body?.error === "string"
            ? body.error
            : `No se pudo ${active ? "activar" : "desactivar"} ${ids.length} producto${ids.length === 1 ? "" : "s"} (error ${res.status})`,
        );
        return false;
      }
      toast.success(`${ids.length} producto${ids.length === 1 ? "" : "s"} ${active ? "activado" : "desactivado"}${ids.length === 1 ? "" : "s"}`);
      return true;
    } catch (err) {
      console.warn("[InventoryTab] bulk activar/desactivar falló", err);
      toast.error("Sin conexión — no cambió ningún producto.");
      return false;
    }
  };
  return {
    toggleSelect, clearSelection, executeBulk, executeBulkDelete, executeBulkClearImages,
    exportSelectedCSV, lowStockProducts, bulkEstado,
  };
}
