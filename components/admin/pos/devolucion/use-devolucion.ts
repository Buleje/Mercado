import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { quedaPorLinea } from "@/lib/pos/reembolso";
import { sinDato } from "@/lib/errores/sin-dato";
import {
  type SaleRecord,
  type ReturnItem,
  MOTIVOS,
  VENTAS_A_REVISAR,
  coincideVenta,
  cuerpoNotaCredito,
  huboDevolucionAntes,
  previaReembolso,
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
  /** Lo ya devuelto de la venta elegida (GET /api/sales/devolucion): tope de cada línea y de la plata. */
  const [yaDevuelto, setYaDevuelto] = useState<{ unidades: Map<number, number>; plata: number }>({ unidades: new Map(), plata: 0 });
  /**
   * Clave de idempotencia: nace al elegir la venta y viaja en cada intento. Si la red se corta
   * después de que el servidor la guardó, el reintento responde lo mismo en vez de devolver dos veces.
   */
  const claveRef = useRef<string | null>(null);

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
    claveRef.current = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setSelectedSale(sale);
    setYaDevuelto({ unidades: new Map(), plata: 0 });
    setReturnItems(
      (sale.items || []).map(item => ({
        productId: item.productId,
        name: item.name,
        price: Number(item.price),
        maxQty: item.quantity,
        returnQty: 0,
        selected: false,
      }))
    );
    setStep(2);
    // Lo ya devuelto: sin esto el paso 2 ofrecía devolver otra vez lo que ya volvió (el servidor daba 400).
    const clave = claveRef.current;
    fetch(`/api/sales/devolucion?saleId=${encodeURIComponent(sale.id)}`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: { yaReembolsado?: number; yaDevuelto?: Record<string, number> } | null) => {
        // Llegó tarde y ya se eligió otra venta (o se cerró): no pisar.
        if (!d || claveRef.current !== clave) return;
        const unidades = new Map(Object.entries(d.yaDevuelto ?? {}).map(([k, v]) => [Number(k), Number(v)]));
        setYaDevuelto({ unidades, plata: Number(d.yaReembolsado) || 0 });
        const queda = quedaPorLinea(
          (sale.items || []).map(i => ({ productId: i.productId, price: Number(i.price), quantity: i.quantity })),
          unidades,
        );
        setReturnItems(prev => prev.map((it, i) => {
          const max = queda[i] ?? it.maxQty;
          return { ...it, maxQty: max, returnQty: Math.min(it.returnQty, max), selected: it.selected && max > 0 };
        }));
      })
      // Sin el dato, el servidor sigue poniendo el tope.
      .catch(sinDato("POS devolución GET /api/sales/devolucion"));
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

  /**
   * Vista previa con la MISMA cuenta que el servidor (`lib/pos/reembolso.ts`): lo cobrado de verdad
   * (descuento global y trueque prorrateados) y nunca más que lo que queda de la venta.
   * Antes `price × cantidad`: una venta de S/ 0,10 con trueque mostraba S/ 24,90.
   */
  const returnTotal = useMemo(
    () => (selectedSale ? previaReembolso(selectedSale, returnItems, yaDevuelto) : 0),
    [returnItems, selectedSale, yaDevuelto],
  );

  const selectedCount = returnItems.filter(i => i.selected && i.returnQty > 0).length;

  // Confirm return
  const handleConfirm = async () => {
    if (!selectedSale || processing) return;
    setProcessing(true);
    try {
      const items = returnItems
        .filter(i => i.selected && i.returnQty > 0)
        .map(i => ({ productId: i.productId, qty: i.returnQty, motivo }));

      const cuerpo = JSON.stringify({
        saleId: selectedSale.id,
        items,
        refundType,
        idempotencyKey: claveRef.current ?? undefined,
      });
      const enviar = () => fetch("/api/sales/devolucion", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: cuerpo,
      });
      // Con la clave, repetir es seguro: si la red se cortó o el servidor dio 5xx, un reintento.
      let res = await enviar().catch(() => null);
      if (!res || res.status >= 500) {
        await new Promise(r => setTimeout(r, 800));
        res = await enviar();
      }

      if (res.ok) {
        const data = await res.json().catch(() => null);
        const devuelto = typeof data?.totalRefund === "number" ? data.totalRefund : returnTotal;
        const bruto = typeof data?.brutoSinDescuento === "number" ? data.brutoSinDescuento : devuelto;
        setMontoDevuelto(devuelto);
        // Si hubo descuento o trueque, se dice por qué vuelve menos que el precio de lista.
        const nota = bruto - devuelto >= 0.01 ? ` (de ${fmt(bruto)}: lo demás fue descuento o trueque)` : "";
        setResult({ success: true, message: `Devolución registrada: ${fmt(devuelto)}${nota}` });
        claveRef.current = null;
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
    setYaDevuelto({ unidades: new Map(), plata: 0 });
    claveRef.current = null;
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
    const devuelto = montoDevuelto ?? returnTotal;
    if (devuelto < 0.01) {
      setNcResult({ ok: false, texto: "No hay plata que acreditar: esa venta no cobró nada por lo devuelto." });
      return;
    }
    setCreatingNC(true);
    try {
      // `totalConIgv` manda en el servidor: la NC suma exactamente lo devuelto, al céntimo y con el IGV del negocio.
      const res = await fetch("/api/notas-credito", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          ...cuerpoNotaCredito(selectedSale.id, returnItems, devuelto, huboDevolucionAntes(yaDevuelto)),
          totalConIgv: devuelto,
        }),
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
