import { useCallback, useState } from "react";
import {
  BookOpen, Copy, LineChart, Pencil, QrCode, RefreshCw, Sliders, Trash2,
} from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import type { DbProduct } from "@/lib/jsondb";
import { stockMinimoDe } from "@/lib/inventario/stock-minimo";
import { useStockMinimoGlobal } from "@/lib/inventario/use-stock-minimo-global";
import type { useInventarioEstado } from "@/components/admin/inventario/hooks/use-inventario-estado";
import type { useInventarioCarga } from "@/components/admin/inventario/hooks/use-inventario-carga";
import type { useInventarioImagenes } from "@/components/admin/inventario/hooks/use-inventario-imagenes";
import type { useInventarioPedidos } from "@/components/admin/inventario/hooks/use-inventario-pedidos";

type Previo = ReturnType<typeof useInventarioEstado> &
  ReturnType<typeof useInventarioCarga> &
  ReturnType<typeof useInventarioImagenes> &
  ReturnType<typeof useInventarioPedidos>;

/**
 * Lo que se hace con UN producto, en un solo lugar (10-10).
 *
 * Antes la fila de la tabla tenía seis íconos de 32 px (editar, duplicar,
 * eliminar, adicionales, QR, auto-reorden), la tarjeta otros cuatro distintos
 * (con «kardex», que la tabla no tenía) y el clic derecho cuatro más; el
 * «duplicar» estaba copiado entero en dos archivos. Ahora: Editar a la vista
 * y el resto en el «⋯» de la fila — la tabla, la tarjeta y el clic derecho
 * leen ESTA lista, así que ninguna acción se pierde ni se repite.
 *
 * El pronóstico de demanda existía (`DemandForecast` + `/api/inventory/forecast`)
 * pero nadie llamaba a `window.__openForecast`: quedaba inalcanzable. Vive acá.
 */
export function useAccionesProducto(previo: Previo) {
  const {
    EMPTY_ADD, setAddForm, setShowAdd, openEditModal, deleteProduct, setModifiersProduct,
    setShowQRProduct, setKardexProduct, autoReorderConfigs, removeAutoReorder, setArThreshold,
    setArQty, setShowAutoReorder,
  } = previo;
  const [pronostico, setPronostico] = useState<{ id: number; name: string } | null>(null);
  // El mínimo del negocio para los productos sin mínimo propio (un solo lugar, 09-10).
  const minimoGlobal = useStockMinimoGlobal();

  /** El alta con los datos del producto: mismo nombre + «(Copia)», sin código ni stock. */
  const duplicarProducto = useCallback((p: DbProduct) => {
    setAddForm({
      ...EMPTY_ADD,
      type: p.type ?? "product",
      brand: p.brand ?? "",
      taxType: p.taxType ?? "gravado",
      weightKg: p.weightKg != null ? String(p.weightKg) : "",
      dimensions: p.dimensions ?? "",
      durationLabel: p.durationLabel ?? "",
      pricingUnit: p.pricingUnit ?? "fijo",
      notes: p.notes ?? "",
      description: p.description ?? "",
      name: `${p.name} (Copia)`,
      category: p.category,
      price: String(p.price),
      unit: p.unit,
      badge: p.badge ?? "",
      image: p.image ?? "",
      barcode: "",
      costPrice: p.costPrice != null ? String(p.costPrice) : "",
      stock: "0",
      stockMin: p.stockMin != null ? String(p.stockMin) : "",
      stockMax: p.stockMax != null ? String(p.stockMax) : "",
      expiryDate: "",
      isVariant: false,
      variantOf: "",
      variantAttr: "",
    });
    setShowAdd(true);
  }, [EMPTY_ADD, setAddForm, setShowAdd]);

  const alternarAutoReorden = useCallback((p: DbProduct) => {
    if (autoReorderConfigs[p.id]) {
      removeAutoReorder(p.id);
      return;
    }
    const minimo = stockMinimoDe(p, minimoGlobal);
    setArThreshold(String(minimo));
    setArQty(String((p.stockMax ?? minimo * 2) - (p.stock ?? 0)));
    setShowAutoReorder(p.id);
  }, [autoReorderConfigs, removeAutoReorder, setArThreshold, setArQty, setShowAutoReorder, minimoGlobal]);

  /** El «⋯» de un producto (fila, tarjeta y clic derecho). Editar va aparte, a la vista. */
  const accionesDeProducto = (p: DbProduct, { conEditar = false }: { conEditar?: boolean } = {}): MenuAccion[] => [
    ...(conEditar ? [{ id: "editar", label: "Editar producto", icon: Pencil, onSelect: () => openEditModal(p) }] : []),
    { id: "kardex", label: "Entradas y salidas", hint: "Su kardex: cada entrada, venta y ajuste", icon: BookOpen, onSelect: () => setKardexProduct({ id: p.id, name: p.name }) },
    { id: "duplicar", label: "Duplicar", hint: "Un producto nuevo con estos datos, sin código ni stock", icon: Copy, onSelect: () => duplicarProducto(p) },
    { id: "adicionales", label: "Adicionales", hint: "Cremas, salsas, extras o tallas que se suman al venderlo", icon: Sliders, onSelect: () => setModifiersProduct({ id: p.id, name: p.name }) },
    { id: "qr", label: "Código QR", hint: "Para imprimir y pegar en el anaquel", icon: QrCode, onSelect: () => setShowQRProduct(p) },
    {
      id: "auto-reorden",
      label: autoReorderConfigs[p.id] ? "Quitar el pedido automático" : "Pedido automático",
      hint: autoReorderConfigs[p.id] ? "Hoy se pide solo al bajar del mínimo" : "Que se pida solo al bajar del mínimo",
      icon: RefreshCw,
      activo: Boolean(autoReorderConfigs[p.id]),
      onSelect: () => alternarAutoReorden(p),
    },
    { id: "pronostico", label: "Pronóstico de demanda", hint: "Ventas de 30 días y cuánto te alcanza", icon: LineChart, onSelect: () => setPronostico({ id: p.id, name: p.name }) },
    { id: "eliminar", label: "Eliminar", icon: Trash2, tone: "danger", onSelect: () => { void deleteProduct(p.id); } },
  ];

  return { duplicarProducto, accionesDeProducto, pronostico, setPronostico };
}
