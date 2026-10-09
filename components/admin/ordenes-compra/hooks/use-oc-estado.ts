import { useState, useCallback, useRef } from "react";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import type { DbPurchaseOrder, DbSupplier, DbProduct } from "@/lib/jsondb";
import type { FormaDePago, TipoComprobante } from "@/lib/compras/estados-oc";
import { useFiltrosOrdenesCompra } from "@/hooks/use-filtros-ordenes-compra";
import { nuevaIdempotencyKey, type ItemDraft } from "@/components/admin/ordenes-compra/oc-compartido";

/** Estado de Órdenes de compra: lista, filtros, formulario de la orden nueva y aviso. Parte de `useOrdenesCompra`. */
export function useOcEstado() {
  const { confirm } = useConfirm();
  const [orders, setOrders] = useState<DbPurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [suppliers, setSuppliers] = useState<DbSupplier[]>([]);
  const [products, setProducts] = useState<DbProduct[]>([]);
  
  // Supplier history
  const [showSupplierHistory, setShowSupplierHistory] = useState(false);
  const [expandedHistorySupplier, setExpandedHistorySupplier] = useState<string | null>(null);

  // Buscar / acotar por fecha / ordenar / paginar viven en su propio hook.
  const f = useFiltrosOrdenesCompra(orders);
  const selectedSupplierId = f.proveedorId;
  const setSelectedSupplierId = f.setProveedorId;
  const statusFilter = f.estado;
  const setStatusFilter = f.setEstado;

  // Create form
  const [supplierId, setSupplierId] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  // Campos que la DB y el endpoint ya soportaban y el formulario nunca mandaba:
  // toda OC salía como "contado" sin fecha de entrega ni descuento.
  const [paymentMethod, setPaymentMethod] = useState<FormaDePago>("contado");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [discount, setDiscount] = useState(0);
  const idempotencyKeyRef = useRef<string>(nuevaIdempotencyKey());
  // ADR-377 — el papel del proveedor y lo que costó traer la mercadería.
  const [invoiceType, setInvoiceType] = useState<TipoComprobante>("ninguno");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [flete, setFlete] = useState(0);
  const [otrosCostos, setOtrosCostos] = useState(0);
  const [igvIncluded, setIgvIncluded] = useState(true);

  // Per-item search
  const [itemQueries, setItemQueries] = useState<string[]>([]);
  const [openSearchIdx, setOpenSearchIdx] = useState<number | null>(null);

  // Barcode scanner
  const [showScanner, setShowScanner] = useState(false);

  // Add item modal
  const [showAddItemModal, setShowAddItemModal] = useState(false);

  // Reception modal
  const [recepcionOC, setRecepcionOC] = useState<DbPurchaseOrder | null>(null);

  // Aviso flotante. Nace como toast de "OC duplicada" pero ahora también
  // reporta los rechazos del servidor: antes un cambio de estado fallido no
  // decía nada y la pantalla mostraba el estado nuevo igual.
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "error" } | null>(null);
  // Un aviso nuevo reinicia la cuenta: con un temporizador por aviso, el del anterior borraba al
  // nuevo antes de tiempo (activar y enseguida pausar dejaba «Pausado…» medio segundo).
  const timerAviso = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avisar = useCallback((msg: string, tone: "ok" | "error" = "ok") => {
    setToast({ msg, tone });
    if (timerAviso.current) clearTimeout(timerAviso.current);
    timerAviso.current = setTimeout(() => setToast(null), tone === "error" ? 6000 : 4000);
  }, []);
  return {
    timerAviso,
    confirm, orders, setOrders, loading, setLoading, expanded, setExpanded, showCreate, setShowCreate,
    suppliers, setSuppliers, products, setProducts, showSupplierHistory, setShowSupplierHistory,
    expandedHistorySupplier, setExpandedHistorySupplier, f, selectedSupplierId, setSelectedSupplierId,
    statusFilter, setStatusFilter, supplierId, setSupplierId, items, setItems, notes, setNotes, saving,
    setSaving, paymentMethod, setPaymentMethod, deliveryDate, setDeliveryDate, discount, setDiscount,
    idempotencyKeyRef, invoiceType, setInvoiceType, invoiceNumber, setInvoiceNumber, flete, setFlete,
    otrosCostos, setOtrosCostos, igvIncluded, setIgvIncluded, itemQueries, setItemQueries,
    openSearchIdx, setOpenSearchIdx, showScanner, setShowScanner, showAddItemModal,
    setShowAddItemModal, recepcionOC, setRecepcionOC, toast, setToast, avisar,
  };
}
