"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Loader2, Check, RotateCcw, Package, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface SaleItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  unit: string;
}

interface SaleRecord {
  id: string;
  createdAt: string;
  total: number;
  payment: string;
  customerPhone?: string;
  customerName?: string;
  items: SaleItem[];
}

interface ReturnItem {
  productId: number;
  name: string;
  price: number;
  maxQty: number;
  returnQty: number;
  selected: boolean;
}

const MOTIVOS = [
  "Defectuoso",
  "Error de cobro",
  "Cliente cambio de opinion",
  "Producto equivocado",
  "Otro",
];

function fmt(n: number) { return `S/${n.toFixed(2)}`; }
function fmtDate(s: string) {
  try { return new Date(s).toLocaleDateString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return s; }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function POSReturnModal({
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
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [creatingNC, setCreatingNC] = useState(false);
  const [ncResult, setNcResult] = useState<string | null>(null);

  // Fetch recent sales on mount
  useEffect(() => {
    if (isOpen && step === 1 && !searchQuery.trim()) {
      setLoading(true);
      fetch("/api/sales?today=1&limit=20")
        .then(r => r.json())
        .then(data => setSales(Array.isArray(data) ? data : []))
        .catch(() => setSales([]))
        .finally(() => setLoading(false));
    }
  }, [isOpen, step, searchQuery]);

  // Search sales
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sales?search=${encodeURIComponent(searchQuery.trim())}&limit=20`);
      const data = await res.json();
      setSales(Array.isArray(data) ? data : []);
    } catch {
      setSales([]);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId: selectedSale.id,
          items,
          refundType,
        }),
      });

      if (res.ok) {
        setResult({ success: true, message: `Devolucion registrada: ${fmt(returnTotal)}` });
        setStep(3);
        onReturnComplete?.();
      } else {
        const err = await res.json().catch(() => ({ error: "Error" }));
        setResult({ success: false, message: err.error || "Error al procesar devolucion" });
        setStep(3);
      }
    } catch {
      setResult({ success: false, message: "Error de conexion" });
      setStep(3);
    }
    setProcessing(false);
  };

  const resetAndClose = () => {
    setStep(1);
    setSearchQuery("");
    setSales([]);
    setSelectedSale(null);
    setReturnItems([]);
    setMotivo(MOTIVOS[0]);
    setRefundType("efectivo");
    setResult(null);
    setNcResult(null);
    onClose();
  };

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

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="return-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={resetAndClose}
      />
      <motion.div
        key="return-modal"
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={e => e.target === e.currentTarget && resetAndClose()}
      >
        <div className="w-full max-w-xl bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-card-border">
            <h3 className="text-base font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-[#f97316]" />
              Devolucion
              {step < 3 && <span className="text-xs font-normal text-gray-400 dark:text-muted">Paso {step}/2</span>}
            </h3>
            <button onClick={resetAndClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>

          {/* Step 1: Search sale */}
          {step === 1 && (
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSearch()}
                    placeholder="Buscar por ID de boleta..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm focus:outline-none focus:ring-2 focus:ring-[#0f766e]/30 dark:text-foreground"
                    autoFocus
                  />
                </div>
                <button
                  onClick={handleSearch}
                  className="px-3 py-2 rounded-xl bg-[#0f766e] text-white text-xs font-bold hover:bg-[#0d5f58] transition-colors"
                >
                  Buscar
                </button>
              </div>

              <p className="text-[10px] font-bold text-gray-400 dark:text-muted uppercase tracking-wide">
                {searchQuery ? "Resultados" : "Ventas recientes de hoy"}
              </p>

              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-[#0f766e]" />
                </div>
              ) : sales.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No se encontraron ventas</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {sales.map(sale => (
                    <button
                      key={sale.id}
                      onClick={() => selectSale(sale)}
                      className="w-full text-left p-3 rounded-xl border border-gray-100 dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-gray-900 dark:text-foreground">
                            #{sale.id.slice(0, 8)}
                          </p>
                          <p className="text-[10px] text-gray-400">{fmtDate(sale.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-extrabold text-[#0f766e]">{fmt(sale.total)}</p>
                          <p className="text-[10px] text-gray-400 capitalize">{sale.payment}</p>
                        </div>
                      </div>
                      {sale.items && sale.items.length > 0 && (
                        <p className="text-[10px] text-gray-400 mt-1 truncate">
                          {sale.items.map(i => `${i.quantity}x ${i.name}`).join(", ")}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Select items to return */}
          {step === 2 && selectedSale && (
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="bg-gray-50 dark:bg-accent rounded-xl p-3">
                <p className="text-xs font-bold text-gray-900 dark:text-foreground">
                  Venta #{selectedSale.id.slice(0, 8)} - {fmtDate(selectedSale.createdAt)}
                </p>
                <p className="text-[10px] text-gray-400">Total original: {fmt(selectedSale.total)}</p>
              </div>

              <p className="text-[10px] font-bold text-gray-400 dark:text-muted uppercase tracking-wide">
                Seleccionar items a devolver
              </p>

              <div className="space-y-2">
                {returnItems.map((item, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "p-3 rounded-xl border transition-colors",
                      item.selected
                        ? "border-[#0f766e] bg-[#0f766e]/5"
                        : "border-gray-100 dark:border-card-border"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleItem(idx)}
                        className="h-4 w-4 rounded border-gray-300 text-[#0f766e] focus:ring-[#0f766e]"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-900 dark:text-foreground truncate">{item.name}</p>
                        <p className="text-[10px] text-gray-400">{fmt(item.price)} x {item.maxQty} = {fmt(item.price * item.maxQty)}</p>
                      </div>
                      {item.selected && (
                        <div className="flex items-center gap-1.5">
                          <label className="text-[10px] text-gray-500">Cant:</label>
                          <input
                            type="number"
                            min={1}
                            max={item.maxQty}
                            value={item.returnQty}
                            onChange={e => updateReturnQty(idx, parseInt(e.target.value) || 0)}
                            className="w-14 px-2 py-1 rounded-lg border border-gray-200 dark:border-card-border text-xs text-center text-gray-900 dark:text-foreground bg-white dark:bg-card outline-none focus:border-[#0f766e]"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Motivo */}
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-muted mb-1">Motivo</label>
                <select
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm text-gray-900 dark:text-foreground focus:outline-none focus:ring-2 focus:ring-[#0f766e]/30"
                >
                  {MOTIVOS.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* Refund type */}
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-muted mb-1">Devolver como</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setRefundType("efectivo")}
                    className={cn(
                      "flex-1 py-2 rounded-xl text-xs font-bold transition-colors",
                      refundType === "efectivo"
                        ? "bg-[#0f766e] text-white"
                        : "bg-gray-100 dark:bg-accent text-gray-600 dark:text-muted hover:bg-gray-200"
                    )}
                  >
                    Efectivo
                  </button>
                  <button
                    onClick={() => setRefundType("credito")}
                    className={cn(
                      "flex-1 py-2 rounded-xl text-xs font-bold transition-colors",
                      refundType === "credito"
                        ? "bg-[#f97316] text-white"
                        : "bg-gray-100 dark:bg-accent text-gray-600 dark:text-muted hover:bg-gray-200"
                    )}
                  >
                    Credito en tienda
                  </button>
                </div>
              </div>

              {/* Summary */}
              {selectedCount > 0 && (
                <div className="bg-[#0f766e]/5 rounded-xl p-3 border border-[#0f766e]/20">
                  <p className="text-xs text-gray-500">
                    {selectedCount} item{selectedCount !== 1 ? "s" : ""} a devolver
                  </p>
                  <p className="text-lg font-extrabold text-[#0f766e]">{fmt(returnTotal)}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Atras
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={selectedCount === 0 || processing}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#0f766e] hover:bg-[#0d5f58] disabled:opacity-50 transition-colors"
                >
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Confirmar devolucion
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Result */}
          {step === 3 && result && (
            <div className="flex-1 p-6 flex flex-col items-center justify-center text-center gap-3">
              <div className={cn(
                "h-14 w-14 rounded-full flex items-center justify-center",
                result.success ? "bg-emerald-50" : "bg-red-50"
              )}>
                {result.success ? (
                  <Check className="h-7 w-7 text-emerald-600" />
                ) : (
                  <X className="h-7 w-7 text-red-500" />
                )}
              </div>
              <p className={cn(
                "text-sm font-bold",
                result.success ? "text-emerald-600" : "text-red-600"
              )}>
                {result.message}
              </p>

              {/* Mejora 9: Crear Nota de Crédito desde devolución */}
              {result.success && selectedSale && !ncResult && (
                <button
                  onClick={async () => {
                    setCreatingNC(true);
                    try {
                      const devueltos = returnItems.filter(i => i.selected && i.returnQty > 0);
                      const desc = devueltos.map(i => `${i.returnQty}x ${i.name}`).join(", ");
                      const res = await fetch("/api/notas-credito", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          orderId: selectedSale.id,
                          codigoMotivo: "06",
                          descripcionMotivo: `Devolución de mercadería: ${desc}`,
                          monto: returnTotal,
                        }),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setNcResult(`NC ${data.numero || ""} creada`);
                      } else {
                        setNcResult("Error al crear NC");
                      }
                    } catch {
                      setNcResult("Error de conexión");
                    }
                    setCreatingNC(false);
                  }}
                  disabled={creatingNC}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-[#0f766e] bg-[#0f766e]/10 hover:bg-[#0f766e]/20 disabled:opacity-50 transition-colors"
                >
                  {creatingNC ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                  Crear Nota de Crédito
                </button>
              )}
              {ncResult && (
                <p className={cn("text-xs font-bold", ncResult.startsWith("Error") ? "text-red-500" : "text-emerald-600")}>
                  {ncResult}
                </p>
              )}

              <button
                onClick={resetAndClose}
                className="px-6 py-2.5 rounded-xl bg-[#0f766e] text-white text-sm font-bold hover:bg-[#0d5f58] transition-colors"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
