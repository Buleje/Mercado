"use client";

import { CardTitle } from "@buleje/design-system";
import { Field } from "@/components/admin/shared/Field";
import { csrfHeaders } from "@/lib/csrf-client";
import { waLink } from "@/lib/whatsapp-link";
import React, { useCallback, useId, useRef } from "react";
import { toast } from "sonner";
import { m, AnimatePresence } from "@/components/admin/providers";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { formatCurrency, formatDateLong, formatTime } from "@/lib/format";
import { ETIQUETA_METODO, type MetodoCobro } from "@/lib/fiados/cobro-metodo";
import CobroMasivoModal from "./CobroMasivoModal";
import type { DatosCobroMasivo, Reparto } from "./use-cobro-masivo";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import {
  X,
  CheckCircle2, MessageCircle,
  Printer, PenTool, Navigation, MapPin, Phone,
} from "@buleje/design-system/icons";

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

type ReciboData = {
  fecha: string;
  clienteNombre: string;
  clientePhone: string;
  montoPagado: number;
  saldoAnterior: number;
  saldoActual: number;
  /** Medio del pago y si entró a la caja (lo arma la ventana «Cobrar»). */
  metodo?: MetodoCobro;
  caja?: "entro" | "sin-caja";
};

type FiadoModalsProps = {
  selected: Fiado | null;
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
  handleCobroMasivo: (datos: DatosCobroMasivo) => void;
  setCobroError: (v: string | null) => void;
  computeDistribution: (monto: number) => Reparto[];
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

export default function FiadoModals({
  selected,
  selectedIds, selectedFiados, selectedTotal, setSelectedIds, showCobroMasivo, setShowCobroMasivo, cobroMonto, setCobroMonto, cobroPaying, cobroError, handleCobroMasivo, setCobroError, computeDistribution,
  showRecibo, setShowRecibo, reciboData,
  showCompromiso, setShowCompromiso, compromisoMonto, setCompromisoMonto, compromisoFecha, setCompromisoFecha, firmaCanvasRef, isDrawing, setIsDrawing,
  showDebtorsMap, setShowDebtorsMap, fiados,
}: FiadoModalsProps) {
  // El Escape de estos 5 modales ya lo maneja el listener global en
  // FiadosModule (coordina cuál cierra según cuál está abierto) — acá sólo se
  // pide el foco atrapado y la semántica de diálogo.
  // (El «Registrar Pago» que vivía acá pasó a PagoFiadoModal: medio + caja.)

  const cerrarCobro = useCallback(() => setShowCobroMasivo(false), [setShowCobroMasivo]);

  const reciboPanelRef = useRef<HTMLDivElement>(null);
  const reciboTitleId = useId();
  const cerrarRecibo = useCallback(() => setShowRecibo(false), [setShowRecibo]);
  useModalAccesible(reciboPanelRef, { onCerrar: cerrarRecibo, activo: showRecibo && !!reciboData, cerrarConEscape: false });

  const compromisoPanelRef = useRef<HTMLDivElement>(null);
  const compromisoTitleId = useId();
  const cerrarCompromiso = useCallback(() => setShowCompromiso(false), [setShowCompromiso]);
  useModalAccesible(compromisoPanelRef, { onCerrar: cerrarCompromiso, activo: showCompromiso && !!selected, cerrarConEscape: false });
  const ventanaCompromiso = useVentanaDeModal(showCompromiso && !!selected, { ref: compromisoPanelRef, aplicarTranslate: true, claveMemoria: "fiados-compromiso-pago" });

  const debtorsMapPanelRef = useRef<HTMLDivElement>(null);
  const debtorsMapTitleId = useId();
  const cerrarDebtorsMap = useCallback(() => setShowDebtorsMap(false), [setShowDebtorsMap]);
  useModalAccesible(debtorsMapPanelRef, { onCerrar: cerrarDebtorsMap, activo: showDebtorsMap, cerrarConEscape: false });
  const ventanaMapa = useVentanaDeModal(showDebtorsMap, { ref: debtorsMapPanelRef, aplicarTranslate: true, claveMemoria: "fiados-mapa-deudores" });

  return (
    <>

      {/* Mejora 3: Cobro masivo sticky bar.
          Audit 2026-08-26: en mobile quedaba pintada encima del bottom-nav del
          admin (AdminMobileBottomBar, mismo fixed bottom-0 z-30) — mismo
          offset que ya usa ctp-barra-seleccion.tsx para el mismo choque. */}
      {selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] sm:bottom-0 z-40 bg-[var(--surface-raised)] border-t border-[var(--rule-base)] px-4 py-3">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-[var(--text-primary)]">
                {selectedFiados.length} fiado{selectedFiados.length !== 1 ? "s" : ""} seleccionado{selectedFiados.length !== 1 ? "s" : ""}
              </span>
              <span className="text-sm font-extrabold text-primary">
                Total: {formatCurrency(selectedTotal)}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-2 rounded-xl text-xs font-bold text-[var(--text-secondary)] bg-[var(--rule-soft)] hover:bg-[var(--rule-base)] transition-colors"
              >
                Deseleccionar
              </button>
              <button
                onClick={() => { setCobroError(null); setCobroMonto(selectedTotal.toFixed(2)); setShowCobroMasivo(true); }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary-dark transition-colors"
              >
                Cobrar seleccionados
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mejora 3: Cobro masivo — medio y caja (CobroMasivoModal) */}
      <CobroMasivoModal
        abierto={showCobroMasivo}
        onCerrar={cerrarCobro}
        fiados={selectedFiados}
        total={selectedTotal}
        monto={cobroMonto}
        setMonto={setCobroMonto}
        pagando={cobroPaying}
        error={cobroError}
        computeDistribution={computeDistribution}
        onCobrar={handleCobroMasivo}
      />

      {/* Mejora 7: Recibo post-pago modal */}
      <AnimatePresence>
        {showRecibo && reciboData && (
          <>
            <m.div
              key="recibo-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="modal-backdrop"
              style={{ zIndex: 70 }}
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
              <div ref={reciboPanelRef} role="dialog" aria-modal="true" aria-labelledby={reciboTitleId} tabIndex={-1}
                className="w-full max-w-sm bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-5 space-y-4 print:shadow-none print:border-0">
                {/* Mejora 18 (ronda 3): Recibo imprimible mejorado */}
                <div className="text-center print:mb-2">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2 print:hidden">
                    <CheckCircle2 className="h-6 w-6 text-[var(--data-success-500)]" />
                  </div>
                  <CardTitle id={reciboTitleId} className="text-sm font-bold text-[var(--text-primary)] print:text-lg">RECIBO DE PAGO</CardTitle>
                  <p className="text-xs text-[var(--text-tertiary)] print:text-sm print:font-bold">Buleje</p>
                </div>

                {/* Separator */}
                <div className="border-t-2 border-dashed border-[var(--rule-base)] print:border-black" />

                {/* Receipt details */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)] print:text-black">Fecha:</span>
                    <span className="font-bold text-[var(--text-primary)]">{reciboData.fecha} {formatTime(new Date())}</span>
                  </div>
                  <div className="border-t border-[var(--rule-base)] print:border-gray-400" />
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)] print:text-black">Cliente:</span>
                    <span className="font-bold text-[var(--text-primary)]">{reciboData.clienteNombre}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)] print:text-black">Teléfono:</span>
                    <span className="font-bold text-[var(--text-secondary)]">{reciboData.clientePhone}</span>
                  </div>
                  <div className="border-t border-[var(--rule-base)] print:border-gray-400" />
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)] print:text-black">Deuda original:</span>
                    {/* Fix 2026-07-08 (reporte fiado bug 5): "Deuda original" = el
                        total original del fiado (Fiado.total), igual que la línea de
                        detalle (~571). El ternario previo sumaba saldoAnterior +
                        montoPagado (siempre > saldoAnterior) → mostraba S/70 sobre una
                        deuda de S/50 con abono de S/20. */}
                    <span className="font-bold text-[var(--text-secondary)]">{formatCurrency(selected?.total ?? reciboData.saldoAnterior)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)] print:text-black">Monto pagado:</span>
                    <span className="font-extrabold text-[var(--data-success-500)] text-base">{formatCurrency(reciboData.montoPagado)}</span>
                  </div>
                  {reciboData.metodo && (
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)] print:text-black">Pagó con:</span>
                      <span className="font-bold text-[var(--text-primary)]">
                        {ETIQUETA_METODO[reciboData.metodo]}
                        {reciboData.caja === "entro" && <span className="font-semibold text-[var(--text-tertiary)] print:hidden"> · entró a la caja</span>}
                        {reciboData.caja === "sin-caja" && <span className="font-semibold text-[var(--data-warning-700)] print:hidden"> · sin caja abierta</span>}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)] print:text-black">Saldo anterior:</span>
                    <span className="font-bold text-[var(--text-secondary)]">{formatCurrency(reciboData.saldoAnterior)}</span>
                  </div>
                  <div className="flex justify-between bg-[var(--surface-sunken)] rounded-lg px-2 py-1.5 print:bg-gray-100">
                    <span className="font-bold text-[var(--text-primary)] print:text-black">Saldo actual:</span>
                    <span className="font-extrabold text-[var(--data-error-500)] text-base">{formatCurrency(reciboData.saldoActual)}</span>
                  </div>
                  <div className="border-t border-[var(--rule-base)] print:border-gray-400" />
                  <div className="pt-2 print:pt-4">
                    <p className="text-xs text-[var(--text-tertiary)] print:text-black">Firma del cliente: ___________________</p>
                  </div>
                  <div className="border-t border-[var(--rule-base)] print:border-gray-400" />
                  <p className="text-xs text-[var(--text-tertiary)] text-center italic print:text-black">Gracias por tu pago. Vuelve pronto!</p>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 print:hidden">
                  <button
                    onClick={() => window.print()}
                    className="w-full flex items-center justify-center gap-2 px-4 min-h-11 rounded-xl text-sm font-semibold text-[var(--text-primary)] border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] transition-colors"
                  >
                    <Printer className="h-4 w-4" />
                    Imprimir
                  </button>
                  <a
                    href={waLink(
                      reciboData.clientePhone,
                      `*RECIBO DE PAGO*\n${"=".repeat(25)}\nBuleje\nFecha: ${reciboData.fecha}\n${"─".repeat(25)}\nCliente: ${reciboData.clienteNombre}\nMonto pagado: ${formatCurrency(Number(reciboData.montoPagado))}\nSaldo anterior: ${formatCurrency(Number(reciboData.saldoAnterior))}\n*Saldo actual: ${formatCurrency(Number(reciboData.saldoActual))}*\n${"─".repeat(25)}\nGracias por tu pago. Vuelve pronto!`,
                    ) ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-[var(--color-whatsapp)] hover:bg-[var(--color-whatsapp-dark)] transition-colors"
                  >
                    <MessageCircle className="h-4 w-4" />
                    WhatsApp
                  </a>
                  <button
                    onClick={() => setShowRecibo(false)}
                    className="w-full px-4 py-2.5 rounded-xl text-sm font-bold text-[var(--text-secondary)] bg-[var(--rule-soft)] hover:bg-[var(--rule-base)] transition-colors"
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
              className="modal-backdrop"
              style={{ zIndex: 70 }}
              onClick={() => setShowCompromiso(false)}
            />
            <m.div
              key="compromiso-modal"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed inset-0 z-[70] flex items-center justify-center p-4"
              onClick={e => e.target === e.currentTarget && !ventanaCompromiso.fijado && setShowCompromiso(false)}
            >
              <div id="compromiso-printable" ref={compromisoPanelRef} role="dialog" aria-modal="true" aria-labelledby={compromisoTitleId} tabIndex={-1}
                className="relative w-full max-w-md bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto print:shadow-none print:border print:max-h-none">
                <div {...ventanaCompromiso.asaProps} className="flex items-center justify-between print:hidden">
                  <CardTitle id={compromisoTitleId} className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
                    <PenTool className="h-5 w-5 text-primary" /> Compromiso de Pago
                  </CardTitle>
                  <span className="ml-auto flex items-center gap-1">
                    <ControlesDeVentana ventana={ventanaCompromiso} />
                    <button aria-label="Cerrar" onClick={() => setShowCompromiso(false)} className="p-1.5 rounded-xl hover:bg-[var(--rule-soft)]">
                      <X className="h-4 w-4 text-[var(--text-secondary)]" />
                    </button>
                  </span>
                </div>

                {/* Form fields (hidden in print) */}
                <div className="space-y-3 print:hidden">
                  <Field label="Monto a pagar (S/)" labelClassName="block text-xs font-bold text-[var(--text-secondary)] mb-1">
                    <input
                      type="number"
                      step="0.01"
                      value={compromisoMonto}
                      onChange={e => setCompromisoMonto(e.target.value)}
                      className="w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </Field>
                  <Field label="Fecha prometida" labelClassName="block text-xs font-bold text-[var(--text-secondary)] mb-1">
                    <input
                      type="date"
                      value={compromisoFecha}
                      onChange={e => setCompromisoFecha(e.target.value)}
                      className="w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </Field>
                  <div>
                    <span className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Firma del cliente</span>
                    <canvas
                      ref={firmaCanvasRef}
                      width={300}
                      height={150}
                      className="w-full border border-dashed border-[var(--rule-base)] rounded-xl bg-[var(--surface-raised)] cursor-crosshair touch-none"
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
                        ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue("--text-primary").trim() || "rgb(26,26,26)";
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
                        ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue("--text-primary").trim() || "rgb(26,26,26)";
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
                      className="text-xs text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] mt-1 transition-colors"
                    >
                      Limpiar firma
                    </button>
                  </div>
                </div>

                {/* Printable document */}
                <div className="border border-[var(--rule-base)] rounded-xl p-4 text-sm space-y-3">
                  <div className="text-center border-b border-[var(--rule-base)] pb-3">
                    <p className="text-base font-extrabold text-[var(--text-primary)]">Compromiso de Pago</p>
                    <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Buleje — Pucallpa</p>
                  </div>
                  <p className="text-[var(--text-primary)] leading-relaxed">
                    Yo, <strong>{selected.customerName || selected.customerId}</strong>, me comprometo a pagar{" "}
                    <strong>{formatCurrency(parseFloat(compromisoMonto || "0"))}</strong> antes del{" "}
                    <strong>{compromisoFecha ? formatDateLong(compromisoFecha + "T12:00:00") : "---"}</strong>.
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs text-[var(--text-secondary)]">
                    <div>Deuda original: <strong className="text-[var(--text-primary)]">{formatCurrency(selected.total)}</strong></div>
                    <div>Saldo actual: <strong className="text-[var(--text-primary)]">{formatCurrency(selected.saldo)}</strong></div>
                  </div>
                  <div className="pt-3 border-t border-[var(--rule-base)]">
                    <p className="text-xs text-[var(--text-tertiary)] mb-1">Firma:</p>
                    <div className="h-[80px] border-b border-gray-400" />
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] text-right">
                    Fecha: {formatDateLong(new Date())}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-2 print:hidden">
                  <button
                    onClick={() => setShowCompromiso(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-[var(--text-secondary)] bg-[var(--rule-soft)] hover:bg-[var(--rule-base)] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={async () => {
                      // Brandon 2026-06-17: persistir la FIRMA del compromiso. Antes
                      // el canvas se dibujaba pero NUNCA se exportaba (toDataURL) — la
                      // firma se perdía. Ahora exporta → sube a /api/upload → guarda
                      // [FIRMA:url] en descripcion. Best-effort (no bloquea el guardado).
                      let firmaNote = "";
                      const canvas = firmaCanvasRef.current;
                      if (canvas) {
                        try {
                          const dataUrl = canvas.toDataURL("image/png");
                          const blob = await (await fetch(dataUrl)).blob();
                          const file = new File([blob], `firma-${selected.id}.png`, { type: "image/png" });
                          const fd = new FormData();
                          fd.append("file", file);
                          fd.append("folder", "general");
                          const upRes = await fetch("/api/upload", { method: "POST", headers: csrfHeaders(), body: fd });
                          if (upRes.ok) {
                            const up = (await upRes.json()) as { url?: string };
                            if (up.url) firmaNote = ` [FIRMA:${up.url}]`;
                          }
                        } catch {
                          /* firma best-effort: el compromiso se guarda sin la imagen */
                        }
                      }
                      // Audit 2026-08-26: antes NO se revisaba res.ok — el PATCH podía
                      // fallar (400 porque el schema exigía `status`) y el cajero veía
                      // "guardado" porque igual se imprimía. Ahora sólo imprime si el
                      // compromiso realmente quedó en la base.
                      try {
                        const res = await fetch(`/api/fiados/${selected.id}`, {
                          method: "PATCH",
                          headers: csrfHeaders({ "Content-Type": "application/json" }),
                          body: JSON.stringify({
                            descripcion: `${selected.descripcion ?? ""} [COMPROMISO: S/${compromisoMonto} hasta ${compromisoFecha}]${firmaNote}`.trim(),
                          }),
                        });
                        if (!res.ok) {
                          toast.error("No se pudo guardar el compromiso de pago. Intenta de nuevo antes de imprimir.");
                          return;
                        }
                      } catch {
                        toast.error("No se pudo guardar el compromiso de pago. Revisa tu conexión e intenta de nuevo.");
                        return;
                      }
                      window.print();
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-4 min-h-11 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-dark transition-colors"
                  >
                    <Printer className="h-4 w-4" />
                    Confirmar e Imprimir
                  </button>
                </div>
                <TiradorDeVentana ventana={ventanaCompromiso} />
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
              className="modal-backdrop"
              style={{ zIndex: 70 }}
              onClick={() => setShowDebtorsMap(false)}
            />
            <m.div
              key="map-modal"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed inset-0 z-[70] flex items-center justify-center p-4"
              onClick={e => e.target === e.currentTarget && !ventanaMapa.fijado && setShowDebtorsMap(false)}
            >
              <div ref={debtorsMapPanelRef} role="dialog" aria-modal="true" aria-labelledby={debtorsMapTitleId} tabIndex={-1}
                className="relative w-full max-w-lg bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl max-h-[85vh] flex flex-col">
                <div {...ventanaMapa.asaProps} className="px-5 py-4 border-b border-[var(--rule-base)] flex items-center justify-between">
                  <CardTitle id={debtorsMapTitleId} className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-primary" /> Mapa de deudores
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <ControlesDeVentana ventana={ventanaMapa} />
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
                          lines.push("", `${zone} — ${items.length} deudor${items.length !== 1 ? "es" : ""} (${formatCurrency(zoneTotal)})`);
                          for (const f of items) {
                            const phone = f.customerId.replace(/\D/g, "");
                            lines.push(`  -> ${f.customerName || f.customerId} · ${formatCurrency(Number(f.saldo))} · ${phone.slice(0, 3)}XXXXXX [ ]`);
                          }
                        }
                        lines.push("", `Total: ${formatCurrency(deudores.reduce((s, f) => s + f.saldo, 0))} (${deudores.length} clientes)`);

                        const printWin = window.open("", "_blank", "width=420,height=600");
                        if (printWin) {
                          printWin.document.write(`<html><head><title>Ruta de Cobro</title><style>body{font-family:monospace;font-size:12px;white-space:pre-wrap;padding:20px;line-height:1.6;}@media print{body{padding:10px;}}</style></head><body>${lines.join("\n")}</body></html>`);
                          printWin.document.close();
                          printWin.focus();
                          setTimeout(() => printWin.print(), 300);
                        }
                      }}
                      className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      <Printer className="h-3.5 w-3.5" /> Imprimir ruta
                    </button>
                    <button aria-label="Cerrar" onClick={() => setShowDebtorsMap(false)} className="p-1.5 rounded-xl hover:bg-[var(--rule-soft)]">
                      <X className="h-4 w-4 text-[var(--text-secondary)]" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {(() => {
                    const deudores = fiados
                      .filter(f => f.status === "ACTIVO" || f.status === "VENCIDO")
                      .sort((a, b) => b.saldo - a.saldo);
                    if (deudores.length === 0) {
                      return <p className="text-sm text-[var(--text-secondary)] text-center py-8">No hay deudores activos</p>;
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
                          <div className="bg-[var(--data-warning-50)] border border-[var(--data-warning-500)] rounded-xl p-3">
                            <p className="text-xs text-[var(--data-warning-500)] font-bold">Registra direcciones de tus clientes para usar esta funcion al máximo</p>
                            <p className="text-xs text-[var(--data-warning-500)] mt-0.5">Agrega direcciones en la descripcion del fiado (ej: &quot;Jr. Ucayali 123, Centro&quot;)</p>
                          </div>
                        )}
                        {Array.from(zones.entries()).map(([zone, items]) => {
                          const zoneTotal = items.reduce((s, f) => s + f.saldo, 0);
                          return (
                            <div key={zone}>
                              <div className="flex items-center gap-2 mb-2">
                                <MapPin className="h-4 w-4 text-primary" />
                                <span className="text-sm font-bold text-[var(--text-primary)]">{zone}</span>
                                <span className="text-xs text-[var(--text-tertiary)]">— {items.length} deudor{items.length !== 1 ? "es" : ""} ({formatCurrency(zoneTotal)})</span>
                              </div>
                              <div className="space-y-1.5 pl-6">
                                {items.map(f => {
                                  const hasAddr = f.descripcion && f.descripcion.length > 5 && !f.descripcion.startsWith("[");
                                  return (
                                    <div key={f.id} className="flex items-center gap-2 p-2 bg-[var(--surface-sunken)] rounded-lg">
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-[var(--text-primary)] truncate"><EnlacePanel cosa="cliente" id={f.customerId} className="font-bold">{f.customerName || f.customerId}</EnlacePanel></p>
                                        <p className="text-xs text-[var(--text-secondary)]">{formatCurrency(f.saldo)}</p>
                                      </div>
                                      <div className="flex gap-1 shrink-0">
                                        <a
                                          href={waLink(f.customerId, `Hola ${f.customerName || f.customerId}, te recordamos que tienes un pendiente de ${formatCurrency(Number(f.saldo))} en Buleje.`) ?? "#"}
                                          target="_blank" rel="noopener noreferrer"
                                          className="p-1.5 rounded-lg bg-[var(--color-whatsapp)]/10 text-[var(--color-whatsapp)] hover:bg-[var(--color-whatsapp)]/20 transition-colors"
                                          title="WhatsApp"
                                        >
                                          <Phone className="h-3 w-3" />
                                        </a>
                                        {hasAddr && (
                                          <a
                                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.descripcion! + " Pucallpa")}`}
                                            target="_blank" rel="noopener noreferrer"
                                            className="p-1.5 rounded-lg bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] hover:bg-primary/10 transition-colors"
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
                <TiradorDeVentana ventana={ventanaMapa} />
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
