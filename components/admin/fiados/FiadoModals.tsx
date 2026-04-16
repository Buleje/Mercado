"use client";

import React from "react";
import { m, AnimatePresence } from "@/components/admin/providers";
import {
  X, DollarSign,
  Loader2,
  CheckCircle2, MessageCircle,
  Printer, PenTool, Navigation, MapPin, Phone,
} from "lucide-react";

type FiadoStatus = "ACTIVO" | "PAGADO" | "VENCIDO" | "CANCELADO";

type FiadoCuota = {
  id: string;
  fiadoId: string;
  monto: number;
  pagadoEn?: string;
  notas?: string;
  createdAt: string;
};

type Fiado = {
  id: string;
  tenantId: string;
  customerId: string;
  customerName?: string;
  total: number;
  saldo: number;
  descripcion?: string;
  status: FiadoStatus;
  fechaVence?: string;
  cuotas: FiadoCuota[];
  createdAt: string;
  updatedAt: string;
};

type DistributionItem = {
  customerName: string;
  pago: number;
  tipo: string;
};

type ReciboData = {
  fecha: string;
  clienteNombre: string;
  clientePhone: string;
  montoPagado: number;
  saldoAnterior: number;
  saldoActual: number;
};

type FiadoModalsProps = {
  showPago: boolean;
  setShowPago: (v: boolean) => void;
  selected: Fiado | null;
  pagoMonto: string;
  setPagoMonto: (v: string) => void;
  pagoNotas: string;
  setPagoNotas: (v: string) => void;
  paying: boolean;
  pagoError: string | null;
  handlePago: () => void;
  setPagoError: (v: string | null) => void;
  selectedIds: Set<string>;
  selectedFiados: Fiado[];
  selectedTotal: number;
  setSelectedIds: (v: Set<string>) => void;
  showCobroMasivo: boolean;
  setShowCobroMasivo: (v: boolean) => void;
  cobroMonto: string;
  setCobroMonto: (v: string) => void;
  cobroPaying: boolean;
  cobroError: string | null;
  handleCobroMasivo: () => void;
  setCobroError: (v: string | null) => void;
  computeDistribution: (monto: number) => DistributionItem[];
  showRecibo: boolean;
  setShowRecibo: (v: boolean) => void;
  reciboData: ReciboData | null;
  showCompromiso: boolean;
  setShowCompromiso: (v: boolean) => void;
  compromisoMonto: string;
  setCompromisoMonto: (v: string) => void;
  compromisoFecha: string;
  setCompromisoFecha: (v: string) => void;
  firmaCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  isDrawing: boolean;
  setIsDrawing: (v: boolean) => void;
  showDebtorsMap: boolean;
  setShowDebtorsMap: (v: boolean) => void;
  fiados: Fiado[];
};

function formatCurrency(n: number) { return `S/${n.toFixed(2)}`; }

export default function FiadoModals({
  showPago, setShowPago, selected, pagoMonto, setPagoMonto, pagoNotas, setPagoNotas, paying, pagoError, handlePago, setPagoError: _setPagoError,
  selectedIds, selectedFiados, selectedTotal, setSelectedIds, showCobroMasivo, setShowCobroMasivo, cobroMonto, setCobroMonto, cobroPaying, cobroError, handleCobroMasivo, setCobroError, computeDistribution,
  showRecibo, setShowRecibo, reciboData,
  showCompromiso, setShowCompromiso, compromisoMonto, setCompromisoMonto, compromisoFecha, setCompromisoFecha, firmaCanvasRef, isDrawing, setIsDrawing,
  showDebtorsMap, setShowDebtorsMap, fiados,
}: FiadoModalsProps) {
  return (
    <>
      <AnimatePresence>
        {showPago && selected && (
          <>
            <m.div
              key="pago-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
              onClick={() => setShowPago(false)}
            />
            <m.div
              key="pago-modal"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed inset-0 z-[60] flex items-center justify-center p-4"
              onClick={e => e.target === e.currentTarget && setShowPago(false)}
            >
              <div className="w-full max-w-sm bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-5 space-y-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Registrar Pago</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Saldo pendiente: <span className="font-bold text-red-600 dark:text-red-400">{formatCurrency(selected.saldo)}</span>
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Monto del pago (S/)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={selected.saldo}
                      value={pagoMonto}
                      onChange={e => setPagoMonto(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Notas (opcional)</label>
                    <input
                      type="text"
                      value={pagoNotas}
                      onChange={e => setPagoNotas(e.target.value)}
                      placeholder="Ej: Pagó con Yape"
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30"
                    />
                  </div>
                </div>

                {pagoError && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-semibold">{pagoError}</p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowPago(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handlePago}
                    disabled={paying}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#00B4A6] hover:bg-[#009690] disabled:opacity-50 shadow-sm transition-colors"
                  >
                    {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                    Pagar
                  </button>
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* Mejora 3: Cobro masivo sticky bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-card border-t border-gray-200 dark:border-card-border shadow-lg px-4 py-3">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-gray-900 dark:text-foreground">
                {selectedFiados.length} fiado{selectedFiados.length !== 1 ? "s" : ""} seleccionado{selectedFiados.length !== 1 ? "s" : ""}
              </span>
              <span className="text-sm font-extrabold text-[#00B4A6]">
                Total: {formatCurrency(selectedTotal)}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-2 rounded-xl text-xs font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Deseleccionar
              </button>
              <button
                onClick={() => { setCobroError(null); setCobroMonto(selectedTotal.toFixed(2)); setShowCobroMasivo(true); }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#00B4A6] hover:bg-[#009690] transition-colors"
              >
                Cobrar seleccionados
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mejora 3: Cobro masivo modal */}
      <AnimatePresence>
        {showCobroMasivo && (
          <>
            <m.div
              key="cobro-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
              onClick={() => setShowCobroMasivo(false)}
            />
            <m.div
              key="cobro-modal"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed inset-0 z-[60] flex items-center justify-center p-4"
              onClick={e => e.target === e.currentTarget && setShowCobroMasivo(false)}
            >
              <div className="w-full max-w-md bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-5 space-y-4 max-h-[80vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Cobro Masivo</h3>
                  <button onClick={() => setShowCobroMasivo(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5">
                    <X className="h-4 w-4 text-gray-500" />
                  </button>
                </div>

                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {selectedFiados.length} fiado{selectedFiados.length !== 1 ? "s" : ""} — Total: <span className="font-bold text-[#00B4A6]">{formatCurrency(selectedTotal)}</span>
                </p>

                {/* Fiados list */}
                <div className="space-y-1.5">
                  {selectedFiados.map(f => (
                    <div key={f.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-white/5 rounded-lg text-xs">
                      <span className="font-medium text-gray-900 dark:text-white">{f.customerName || f.customerId}</span>
                      <span className="font-bold text-gray-600 dark:text-gray-400">{formatCurrency(f.saldo)}</span>
                    </div>
                  ))}
                </div>

                {/* Amount input */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Monto a abonar (S/)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={cobroMonto}
                    onChange={e => setCobroMonto(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30"
                  />
                </div>

                {/* Distribution preview */}
                {cobroMonto && parseFloat(cobroMonto) > 0 && (
                  <div className="bg-[#00B4A6]/5 rounded-xl p-3 space-y-1.5">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Distribucion (antiguo primero)</p>
                    {computeDistribution(parseFloat(cobroMonto)).map((d, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-gray-700 dark:text-gray-300">{d.customerName}</span>
                        <span className="font-bold">
                          {formatCurrency(d.pago)}
                          <span className="ml-1 text-[10px] text-gray-400">({d.tipo})</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {cobroError && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-semibold">{cobroError}</p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCobroMasivo(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCobroMasivo}
                    disabled={cobroPaying || !cobroMonto || parseFloat(cobroMonto) <= 0}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#00B4A6] hover:bg-[#009690] disabled:opacity-50 shadow-sm transition-colors"
                  >
                    {cobroPaying ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                    Confirmar cobro
                  </button>
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* Mejora 7: Recibo post-pago modal */}
      <AnimatePresence>
        {showRecibo && reciboData && (
          <>
            <m.div
              key="recibo-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm"
              onClick={() => setShowRecibo(false)}
            />
            <m.div
              key="recibo-modal"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed inset-0 z-[70] flex items-center justify-center p-4"
              onClick={e => e.target === e.currentTarget && setShowRecibo(false)}
            >
              <div className="w-full max-w-sm bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-5 space-y-4 print:shadow-none print:border-0">
                {/* Mejora 18 (ronda 3): Recibo imprimible mejorado */}
                <div className="text-center print:mb-2">
                  <div className="h-12 w-12 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mx-auto mb-2 print:hidden">
                    <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  </div>
                  <h3 className="text-base font-extrabold text-gray-900 dark:text-white print:text-lg">RECIBO DE PAGO</h3>
                  <p className="text-xs text-gray-400 print:text-sm print:font-bold">Buleje</p>
                </div>

                {/* Separator */}
                <div className="border-t-2 border-dashed border-gray-300 dark:border-white/20 print:border-black" />

                {/* Receipt details */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 print:text-black">Fecha:</span>
                    <span className="font-bold text-gray-900 dark:text-white">{reciboData.fecha} {new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="border-t border-gray-200 dark:border-white/10 print:border-gray-400" />
                  <div className="flex justify-between">
                    <span className="text-gray-500 print:text-black">Cliente:</span>
                    <span className="font-bold text-gray-900 dark:text-white">{reciboData.clienteNombre}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 print:text-black">Telefono:</span>
                    <span className="font-bold text-gray-600 dark:text-gray-300">{reciboData.clientePhone}</span>
                  </div>
                  <div className="border-t border-gray-200 dark:border-white/10 print:border-gray-400" />
                  <div className="flex justify-between">
                    <span className="text-gray-500 print:text-black">Deuda original:</span>
                    <span className="font-bold text-gray-600">{formatCurrency(reciboData.saldoAnterior + reciboData.montoPagado > reciboData.saldoAnterior ? reciboData.saldoAnterior + reciboData.montoPagado : selected?.total ?? 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 print:text-black">Monto pagado:</span>
                    <span className="font-extrabold text-emerald-600 text-base">{formatCurrency(reciboData.montoPagado)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 print:text-black">Saldo anterior:</span>
                    <span className="font-bold text-gray-600">{formatCurrency(reciboData.saldoAnterior)}</span>
                  </div>
                  <div className="flex justify-between bg-gray-50 dark:bg-white/5 rounded-lg px-2 py-1.5 print:bg-gray-100">
                    <span className="font-bold text-gray-700 dark:text-white print:text-black">Saldo actual:</span>
                    <span className="font-extrabold text-red-600 text-base">{formatCurrency(reciboData.saldoActual)}</span>
                  </div>
                  <div className="border-t border-gray-200 dark:border-white/10 print:border-gray-400" />
                  <div className="pt-2 print:pt-4">
                    <p className="text-xs text-gray-400 print:text-black">Firma del cliente: ___________________</p>
                  </div>
                  <div className="border-t border-gray-200 dark:border-white/10 print:border-gray-400" />
                  <p className="text-xs text-gray-400 dark:text-muted text-center italic print:text-black">Gracias por tu pago. Vuelve pronto!</p>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 print:hidden">
                  <button
                    onClick={() => window.print()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-gray-700 dark:text-foreground border border-gray-200 dark:border-card-border hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <Printer className="h-4 w-4" />
                    Imprimir
                  </button>
                  <a
                    href={`https://wa.me/${reciboData.clientePhone.replace(/\D/g, "").startsWith("51") ? reciboData.clientePhone.replace(/\D/g, "") : "51" + reciboData.clientePhone.replace(/\D/g, "")}?text=${encodeURIComponent(
                      `*RECIBO DE PAGO*\n${"=".repeat(25)}\nBuleje\nFecha: ${reciboData.fecha}\n${"─".repeat(25)}\nCliente: ${reciboData.clienteNombre}\nMonto pagado: S/${reciboData.montoPagado.toFixed(2)}\nSaldo anterior: S/${reciboData.saldoAnterior.toFixed(2)}\n*Saldo actual: S/${reciboData.saldoActual.toFixed(2)}*\n${"─".repeat(25)}\nGracias por tu pago. Vuelve pronto!`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#25D366] hover:bg-[#1da851] transition-colors"
                  >
                    <MessageCircle className="h-4 w-4" />
                    WhatsApp
                  </a>
                  <button
                    onClick={() => setShowRecibo(false)}
                    className="w-full px-4 py-2.5 rounded-xl text-sm font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* Mejora 18: Compromiso de pago con firma digital */}
      <AnimatePresence>
        {showCompromiso && selected && (
          <>
            <m.div
              key="compromiso-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm"
              onClick={() => setShowCompromiso(false)}
            />
            <m.div
              key="compromiso-modal"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed inset-0 z-[70] flex items-center justify-center p-4"
              onClick={e => e.target === e.currentTarget && setShowCompromiso(false)}
            >
              <div id="compromiso-printable" className="w-full max-w-md bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto print:shadow-none print:border print:max-h-none">
                <div className="flex items-center justify-between print:hidden">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <PenTool className="h-5 w-5 text-[#00B4A6]" /> Compromiso de Pago
                  </h3>
                  <button onClick={() => setShowCompromiso(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5">
                    <X className="h-4 w-4 text-gray-500" />
                  </button>
                </div>

                {/* Form fields (hidden in print) */}
                <div className="space-y-3 print:hidden">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Monto a pagar (S/)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={compromisoMonto}
                      onChange={e => setCompromisoMonto(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Fecha prometida</label>
                    <input
                      type="date"
                      value={compromisoFecha}
                      onChange={e => setCompromisoFecha(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Firma del cliente</label>
                    <canvas
                      ref={firmaCanvasRef}
                      width={300}
                      height={150}
                      className="w-full border-2 border-dashed border-gray-300 dark:border-white/20 rounded-xl bg-white cursor-crosshair touch-none"
                      onMouseDown={e => {
                        setIsDrawing(true);
                        const canvas = firmaCanvasRef.current;
                        if (!canvas) return;
                        const ctx = canvas.getContext("2d");
                        if (!ctx) return;
                        const rect = canvas.getBoundingClientRect();
                        ctx.beginPath();
                        ctx.moveTo(
                          (e.clientX - rect.left) * (canvas.width / rect.width),
                          (e.clientY - rect.top) * (canvas.height / rect.height)
                        );
                      }}
                      onMouseMove={e => {
                        if (!isDrawing) return;
                        const canvas = firmaCanvasRef.current;
                        if (!canvas) return;
                        const ctx = canvas.getContext("2d");
                        if (!ctx) return;
                        const rect = canvas.getBoundingClientRect();
                        ctx.lineWidth = 2;
                        ctx.lineCap = "round";
                        ctx.strokeStyle = "#1a1a1a";
                        ctx.lineTo(
                          (e.clientX - rect.left) * (canvas.width / rect.width),
                          (e.clientY - rect.top) * (canvas.height / rect.height)
                        );
                        ctx.stroke();
                      }}
                      onMouseUp={() => setIsDrawing(false)}
                      onMouseLeave={() => setIsDrawing(false)}
                      onTouchStart={e => {
                        e.preventDefault();
                        setIsDrawing(true);
                        const canvas = firmaCanvasRef.current;
                        if (!canvas) return;
                        const ctx = canvas.getContext("2d");
                        if (!ctx) return;
                        const rect = canvas.getBoundingClientRect();
                        const touch = e.touches[0];
                        ctx.beginPath();
                        ctx.moveTo(
                          (touch.clientX - rect.left) * (canvas.width / rect.width),
                          (touch.clientY - rect.top) * (canvas.height / rect.height)
                        );
                      }}
                      onTouchMove={e => {
                        e.preventDefault();
                        if (!isDrawing) return;
                        const canvas = firmaCanvasRef.current;
                        if (!canvas) return;
                        const ctx = canvas.getContext("2d");
                        if (!ctx) return;
                        const rect = canvas.getBoundingClientRect();
                        const touch = e.touches[0];
                        ctx.lineWidth = 2;
                        ctx.lineCap = "round";
                        ctx.strokeStyle = "#1a1a1a";
                        ctx.lineTo(
                          (touch.clientX - rect.left) * (canvas.width / rect.width),
                          (touch.clientY - rect.top) * (canvas.height / rect.height)
                        );
                        ctx.stroke();
                      }}
                      onTouchEnd={() => setIsDrawing(false)}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const canvas = firmaCanvasRef.current;
                        if (!canvas) return;
                        const ctx = canvas.getContext("2d");
                        if (!ctx) return;
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                      }}
                      className="text-xs text-gray-400 hover:text-red-500 mt-1 transition-colors"
                    >
                      Limpiar firma
                    </button>
                  </div>
                </div>

                {/* Printable document */}
                <div className="border border-gray-200 dark:border-white/10 rounded-xl p-4 text-sm space-y-3">
                  <div className="text-center border-b border-gray-200 dark:border-white/10 pb-3">
                    <p className="text-base font-extrabold text-gray-900 dark:text-white uppercase tracking-wider">Compromiso de Pago</p>
                    <p className="text-xs text-gray-400 mt-0.5">Buleje — Pucallpa</p>
                  </div>
                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                    Yo, <strong>{selected.customerName || selected.customerId}</strong>, me comprometo a pagar{" "}
                    <strong>S/{parseFloat(compromisoMonto || "0").toFixed(2)}</strong> antes del{" "}
                    <strong>{compromisoFecha ? new Date(compromisoFecha + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" }) : "---"}</strong>.
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                    <div>Deuda original: <strong className="text-gray-800 dark:text-white">{formatCurrency(selected.total)}</strong></div>
                    <div>Saldo actual: <strong className="text-gray-800 dark:text-white">{formatCurrency(selected.saldo)}</strong></div>
                  </div>
                  <div className="pt-3 border-t border-gray-200 dark:border-white/10">
                    <p className="text-xs text-gray-400 mb-1">Firma:</p>
                    <div className="h-[80px] border-b border-gray-400" />
                  </div>
                  <p className="text-[10px] text-gray-400 text-right">
                    Fecha: {new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-2 print:hidden">
                  <button
                    onClick={() => setShowCompromiso(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={async () => {
                      // Save promise date in fiado notes
                      try {
                        await fetch(`/api/fiados/${selected.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            descripcion: `${selected.descripcion ?? ""} [COMPROMISO: S/${compromisoMonto} hasta ${compromisoFecha}]`.trim(),
                          }),
                        });
                      } catch { /* ignore */ }
                      window.print();
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#00B4A6] hover:bg-[#009690] transition-colors"
                  >
                    <Printer className="h-4 w-4" />
                    Confirmar e Imprimir
                  </button>
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* Mejora 20 (ronda 3): Mapa de deudores */}
      <AnimatePresence>
        {showDebtorsMap && (
          <>
            <m.div
              key="map-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm"
              onClick={() => setShowDebtorsMap(false)}
            />
            <m.div
              key="map-modal"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed inset-0 z-[70] flex items-center justify-center p-4"
              onClick={e => e.target === e.currentTarget && setShowDebtorsMap(false)}
            >
              <div className="w-full max-w-lg bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl max-h-[85vh] flex flex-col">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-card-border flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-[#00B4A6]" /> Mapa de deudores
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const deudores = fiados
                          .filter(f => f.status === "ACTIVO" || f.status === "VENCIDO")
                          .sort((a, b) => b.saldo - a.saldo);
                        if (deudores.length === 0) return;
                        // Group by zone (first word of description or name)
                        const zones = new Map<string, typeof deudores>();
                        for (const f of deudores) {
                          const desc = f.descripcion?.toLowerCase() || "";
                          const name = (f.customerName || "").toLowerCase();
                          let zone = "Otros";
                          if (desc.includes("centro")) zone = "Centro";
                          else if (desc.includes("san juan")) zone = "San Juan";
                          else if (name.length > 0) {
                            const words = (f.customerName || "").split(" ");
                            zone = words.length > 1 ? words[words.length - 1] : "General";
                          }
                          if (!zones.has(zone)) zones.set(zone, []);
                          zones.get(zone)!.push(f);
                        }

                        const lines: string[] = [
                          "RUTA DE COBRO",
                          `Fecha: ${new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}`,
                          "═══════════════════════════════",
                        ];
                        for (const [zone, items] of zones) {
                          const zoneTotal = items.reduce((s, f) => s + f.saldo, 0);
                          lines.push("", `${zone} — ${items.length} deudor${items.length !== 1 ? "es" : ""} (S/${zoneTotal.toFixed(2)})`);
                          for (const f of items) {
                            const phone = f.customerId.replace(/\D/g, "");
                            lines.push(`  -> ${f.customerName || f.customerId} · S/${f.saldo.toFixed(2)} · ${phone.slice(0, 3)}XXXXXX [ ]`);
                          }
                        }
                        lines.push("", `Total: S/${deudores.reduce((s, f) => s + f.saldo, 0).toFixed(2)} (${deudores.length} clientes)`);

                        const printWin = window.open("", "_blank", "width=420,height=600");
                        if (printWin) {
                          printWin.document.write(`<html><head><title>Ruta de Cobro</title><style>body{font-family:monospace;font-size:12px;white-space:pre-wrap;padding:20px;line-height:1.6;}@media print{body{padding:10px;}}</style></head><body>${lines.join("\n")}</body></html>`);
                          printWin.document.close();
                          printWin.focus();
                          setTimeout(() => printWin.print(), 300);
                        }
                      }}
                      className="text-xs font-bold text-[#00B4A6] hover:underline flex items-center gap-1"
                    >
                      <Printer className="h-3.5 w-3.5" /> Imprimir ruta
                    </button>
                    <button onClick={() => setShowDebtorsMap(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5">
                      <X className="h-4 w-4 text-gray-500" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {(() => {
                    const deudores = fiados
                      .filter(f => f.status === "ACTIVO" || f.status === "VENCIDO")
                      .sort((a, b) => b.saldo - a.saldo);
                    if (deudores.length === 0) {
                      return <p className="text-sm text-gray-500 text-center py-8">No hay deudores activos</p>;
                    }

                    // Group by zone
                    const zones = new Map<string, typeof deudores>();
                    for (const f of deudores) {
                      const desc = f.descripcion?.toLowerCase() || "";
                      const name = (f.customerName || "").toLowerCase();
                      let zone = "Otros";
                      if (desc.includes("centro")) zone = "Centro";
                      else if (desc.includes("san juan")) zone = "San Juan";
                      else if (desc.includes("manantay")) zone = "Manantay";
                      else if (desc.includes("calleria")) zone = "Calleria";
                      else if (desc.includes("yarina")) zone = "Yarinacocha";
                      else if (name.length > 0) {
                        zone = "General";
                      }
                      if (!zones.has(zone)) zones.set(zone, []);
                      zones.get(zone)!.push(f);
                    }

                    const hasAddresses = deudores.some(f => f.descripcion && f.descripcion.length > 5);

                    return (
                      <>
                        {!hasAddresses && (
                          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
                            <p className="text-xs text-amber-700 dark:text-amber-400 font-bold">Registra direcciones de tus clientes para usar esta funcion al maximo</p>
                            <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-0.5">Agrega direcciones en la descripcion del fiado (ej: &quot;Jr. Ucayali 123, Centro&quot;)</p>
                          </div>
                        )}
                        {Array.from(zones.entries()).map(([zone, items]) => {
                          const zoneTotal = items.reduce((s, f) => s + f.saldo, 0);
                          return (
                            <div key={zone}>
                              <div className="flex items-center gap-2 mb-2">
                                <MapPin className="h-4 w-4 text-[#00B4A6]" />
                                <span className="text-sm font-bold text-gray-800 dark:text-white">{zone}</span>
                                <span className="text-xs text-gray-400">— {items.length} deudor{items.length !== 1 ? "es" : ""} ({formatCurrency(zoneTotal)})</span>
                              </div>
                              <div className="space-y-1.5 pl-6">
                                {items.map(f => {
                                  const cleanPhone = f.customerId.replace(/\D/g, "");
                                  const hasAddr = f.descripcion && f.descripcion.length > 5 && !f.descripcion.startsWith("[");
                                  return (
                                    <div key={f.id} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-white/5 rounded-lg">
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{f.customerName || f.customerId}</p>
                                        <p className="text-[10px] text-gray-500 dark:text-gray-400">{formatCurrency(f.saldo)}</p>
                                      </div>
                                      <div className="flex gap-1 shrink-0">
                                        <a
                                          href={`https://wa.me/${cleanPhone.startsWith("51") ? cleanPhone : "51" + cleanPhone}?text=${encodeURIComponent(`Hola ${f.customerName || f.customerId}, te recordamos que tienes un pendiente de S/${f.saldo.toFixed(2)} en Buleje.`)}`}
                                          target="_blank" rel="noopener noreferrer"
                                          className="p-1.5 rounded-lg bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-colors"
                                          title="WhatsApp"
                                        >
                                          <Phone className="h-3 w-3" />
                                        </a>
                                        {hasAddr && (
                                          <a
                                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.descripcion! + " Pucallpa")}`}
                                            target="_blank" rel="noopener noreferrer"
                                            className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 hover:bg-emerald-200 transition-colors"
                                            title="Google Maps"
                                          >
                                            <Navigation className="h-3 w-3" />
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
