import { useState, useCallback, useEffect } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  type SaleRecord,
  type ReturnItem,
  MOTIVOS,
  VENTAS_A_REVISAR,
  coincideVenta,
  cuerpoNotaCredito,
  mensajeErrorNc,
  fallaSeguraDeRepetir,
  DEVOLUCION_INCIERTA,
  fmt,
} from "@/components/admin/pos/devolucion/devolucion-shared";

/** Estado y pedidos de la devolución del POS: ventas de hoy, búsqueda, ítems, confirmación y cierre con Escape. */
export function useDevolucion({
  isOpen,
  onClose,
  onReturnComplete,
}: {
  isOpen: boolean;
  onClose: () => void;
  onReturnComplete?: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [refundType, setRefundType] = useState<"efectivo" | "credito">("efectivo");
  const [processing, setProcessing] = useState(false);
  /** `puedeCorregir`: sólo si el servidor la rechazó (4xx); sin red o con 5xx no se sabe si quedó. */
  const [result, setResult] = useState<{ success: boolean; message: string; puedeCorregir?: boolean } | null>(null);
  const [creatingNC, setCreatingNC] = useState(false);
  const [ncResult, setNcResult] = useState<{ ok: boolean; texto: string } | null>(null);
  const [errorVentas, setErrorVentas] = useState(false);
  const [intento, setIntento] = useState(0);
  /** Lo que el servidor dice que se devolvió: la cifra del paso 2 es sólo una vista previa. */
  const [montoDevuelto, setMontoDevuelto] = useState<number | null>(null);

  // Fetch recent sales on mount
  useEffect(() => {
    if (isOpen && step === 1 && !searchQuery.trim()) {
      setLoading(true);
      setErrorVentas(false);
      fetch("/api/sales?today=1&limit=20")
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then(data => setSales(Array.isArray(data) ? data : []))
        .catch(() => {
          setSales([]);
          setErrorVentas(true);
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, step, searchQuery, intento]);

  const reintentarVentas = useCallback(() => setIntento(n => n + 1), []);

  // Search sales
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      // `search` viaja para cuando el GET lo soporte; hoy lo ignora, así que se filtra acá.
      const res = await fetch(`/api/sales?search=${encodeURIComponent(searchQuery.trim())}&limit=${VENTAS_A_REVISAR}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const todas: SaleRecord[] = Array.isArray(data) ? data : [];
      setSales(todas.filter(s => coincideVenta(s, searchQuery)).slice(0, 20));
      setErrorVentas(false);
    } catch {
      setSales([]);
      setErrorVentas(true);
    }
    setLoading(false);
  }, [searchQuery]);

  // Select a sale and go to step 2
  const selectSale = useCallback((sale: SaleRecord) => {
    setSelectedSale(sale);
    setReturnItems(
      (sale.items || []).map(item => ({
        productId: item.productId,
        name: item.name,
        price: item.price,
        maxQty: item.quantity,
        returnQty: 0,
        selected: false,
      }))
    );
    setStep(2);
  }, []);

  // Toggle item selection
  const toggleItem = useCallback((idx: number) => {
    setReturnItems(prev => prev.map((item, i) =>
      i === idx
        ? { ...item, selected: !item.selected, returnQty: !item.selected ? item.maxQty : 0 }
        : item
    ));
  }, []);

  // Update return quantity
  const updateReturnQty = useCallback((idx: number, qty: number) => {
    setReturnItems(prev => prev.map((item, i) =>
      i === idx
        ? { ...item, returnQty: Math.max(0, Math.min(qty, item.maxQty)) }
        : item
    ));
  }, []);

  // Calculate return total
  const returnTotal = returnItems
    .filter(i => i.selected && i.returnQty > 0)
    .reduce((s, i) => s + i.price * i.returnQty, 0);

  const selectedCount = returnItems.filter(i => i.selected && i.returnQty > 0).length;

  // Confirm return
  const handleConfirm = async () => {
    if (!selectedSale || processing) return;
    setProcessing(true);
    try {
      const items = returnItems
        .filter(i => i.selected && i.returnQty > 0)
        .map(i => ({ productId: i.productId, qty: i.returnQty, motivo }));

      const res = await fetch("/api/sales/devolucion", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          saleId: selectedSale.id,
          items,
          refundType,
        }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => null);
        const devuelto = typeof data?.totalRefund === "number" ? data.totalRefund : returnTotal;
        setMontoDevuelto(devuelto);
        setResult({ success: true, message: `Devolución registrada: ${fmt(devuelto)}` });
        setStep(3);
        onReturnComplete?.();
      } else {
        const err = await res.json().catch(() => null);
        const segura = fallaSeguraDeRepetir(res.status);
        setResult({
          success: false,
          puedeCorregir: segura,
          message: !segura
            ? DEVOLUCION_INCIERTA
            : res.status === 403 && refundType === "efectivo"
              ? "Devolver en efectivo lo autoriza el dueño o un admin. Elige «Crédito en tienda» o pídeselo a ellos."
              : typeof err?.error === "string" && err.error ? err.error : "No se pudo registrar la devolución",
        });
        setStep(3);
      }
    } catch {
      // Sin respuesta no se sabe si el servidor la guardó: nada de «no se registró» ni de repetir.
      setResult({ success: false, puedeCorregir: false, message: DEVOLUCION_INCIERTA });
      setStep(3);
    }
    setProcessing(false);
  };

  const resetAndClose = useCallback(() => {
    setStep(1);
    setSearchQuery("");
    setSales([]);
    setSelectedSale(null);
    setReturnItems([]);
    setMotivo(MOTIVOS[0]);
    setRefundType("efectivo");
    setResult(null);
    setNcResult(null);
    setMontoDevuelto(null);
    setErrorVentas(false);
    onClose();
  }, [onClose]);

  // UX Mejora 13: Cerrar modal con Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") resetAndClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /** Si falló, vuelve al paso 2 con la selección intacta (antes sólo quedaba «Cerrar» y se perdía todo). */
  const volverAlPaso2 = useCallback(() => {
    setResult(null);
    setStep(2);
  }, []);

  /** Nota de Crédito por lo devuelto: el monto es el que confirmó el servidor (con IGV; la base la saca el cuerpo). */
  const crearNotaCredito = async () => {
    if (!selectedSale || creatingNC) return;
    setCreatingNC(true);
    try {
      const res = await fetch("/api/notas-credito", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(cuerpoNotaCredito(selectedSale.id, returnItems, montoDevuelto ?? returnTotal)),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        // El número lo pone el servidor (`<prefijo>-NC-0001`); el total ya trae el IGV.
        const total = typeof data?.total === "number" ? ` por ${fmt(data.total)}` : "";
        setNcResult({ ok: true, texto: `Nota de Crédito ${data?.numero ?? ""} creada${total}` });
      } else {
        setNcResult({ ok: false, texto: mensajeErrorNc(res.status, data) });
      }
    } catch {
      setNcResult({ ok: false, texto: "Sin conexión: revisa en Notas de crédito si se creó antes de repetirla." });
    }
    setCreatingNC(false);
  };

  return {
    step, setStep, searchQuery, setSearchQuery, sales, loading, selectedSale, returnItems,
    motivo, setMotivo, refundType, setRefundType, processing, result,
    creatingNC, ncResult, errorVentas, reintentarVentas, volverAlPaso2, crearNotaCredito,
    handleSearch, selectSale, toggleItem, updateReturnQty, returnTotal, selectedCount, handleConfirm, resetAndClose,
  };
}

export type Devolucion = ReturnType<typeof useDevolucion>;
