"use client";

import { CardTitle } from "@buleje/design-system";
import type { Dispatch, SetStateAction } from "react";
import { m } from "@/components/admin/providers";
import {
  X, DollarSign, Calendar, User, FileText,
  Camera, Loader2, Plus,
} from "@buleje/design-system/icons";
import Image from "next/image";
import { cn } from "@/lib/utils";

function formatCurrency(n: number) { return `S/${n.toFixed(2)}`; }

export type FiadoNewForm = {
  customerId: string;
  total: string;
  descripcion: string;
  fechaVence: string;
};

export type FiadoClienteResumen = {
  nombre: string;
  score: number;
  pagados: number;
  total: number;
  deudaActual: number;
  limite: number;
  promedioDias: number;
  bloqueado: boolean;
};

export type FiadoFormModalProps = {
  showNew: boolean;
  setShowNew: Dispatch<SetStateAction<boolean>>;
  newForm: FiadoNewForm;
  setNewForm: Dispatch<SetStateAction<FiadoNewForm>>;
  creating: boolean;
  createError: string | null;
  handleCreate: () => void | Promise<void>;
  setCreateError: Dispatch<SetStateAction<string | null>>;
  dniPhoto: string | null;
  setDniPhoto: Dispatch<SetStateAction<string | null>>;
  clienteResumen: FiadoClienteResumen | null;
  clienteResumenLoading: boolean;
  clienteEsNuevo: boolean;
};

export default function FiadoFormModal({
  showNew,
  setShowNew,
  newForm,
  setNewForm,
  creating,
  createError,
  handleCreate,
  setCreateError,
  dniPhoto,
  setDniPhoto,
  clienteResumen,
  clienteResumenLoading,
  clienteEsNuevo,
}: FiadoFormModalProps) {
  if (!showNew) return null;
  return (
    <m.div
      key="new-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="modal-backdrop p-4"
      onClick={e => e.target === e.currentTarget && setShowNew(false)}
    >
      <m.div
        key="new-modal"
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 10 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="w-full max-w-lg bg-white dark:bg-card rounded-2xl shadow-2xl ring-1 ring-[var(--rule-base)] flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[var(--rule-soft)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[var(--data-warning-50)] dark:bg-[var(--data-warning)]/15 flex items-center justify-center shrink-0">
              <Plus className="h-5 w-5 text-[var(--data-warning)]" strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[var(--text-primary)]">Nuevo fiado</h3>
              <p className="text-sm text-[var(--text-tertiary)]">Registra una venta al crédito</p>
            </div>
          </div>
          <button onClick={() => setShowNew(false)} aria-label="Cerrar" className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors">
            <X className="h-5 w-5 text-[var(--text-tertiary)]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">Cliente <span className="text-[var(--text-tertiary)] font-normal">(nombre o teléfono)</span></label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)]" />
                      <input
                        type="text"
                        value={newForm.customerId}
                        onChange={e => setNewForm((p: FiadoNewForm) => ({ ...p, customerId: e.target.value }))}
                        placeholder="Ej: 987654321 o Maria Rodríguez"
                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-[var(--rule-base)] dark:border-white/10 bg-white dark:bg-white/5 text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      />
                    </div>
                  </div>

                  {/* Mejora M1: Resumen visual del cliente */}
                  {newForm.customerId.trim().length >= 6 && (
                    clienteResumenLoading ? (
                      <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-white/5 rounded-xl">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="text-xs text-[var(--text-secondary)]">Buscando historial...</span>
                      </div>
                    ) : clienteResumen ? (
                      clienteResumen.bloqueado ? (
                        <div className="border-2 border-[var(--data-error)] bg-[var(--data-error-50)] dark:bg-red-950/20 rounded-xl p-3 space-y-1">
                          <p className="text-sm font-bold text-[var(--data-error)] dark:text-[var(--data-error)]">Cliente bloqueado por morosidad</p>
                          <p className="text-xs text-[var(--data-error)] dark:text-[var(--data-error)]">
                            {clienteResumen.nombre} tiene deudas vencidas hace más de 60 días. Deuda actual: {formatCurrency(clienteResumen.deudaActual)}
                          </p>
                        </div>
                      ) : (
                        <div className={cn(
                          "border-2 rounded-xl p-3 space-y-1.5",
                          clienteResumen.score >= 4 ? "border-[var(--data-success)]/30 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" :
                          clienteResumen.score === 3 ? "border-[var(--data-warning)] bg-[var(--data-warning-50)] dark:bg-amber-950/20" :
                          "border-[var(--data-error)] bg-[var(--data-error-50)] dark:bg-red-950/20"
                        )}>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[var(--text-primary)]">{clienteResumen.nombre}</span>
                            <span className="text-xs text-[var(--data-warning)]">{clienteResumen.score}/5</span>
                          </div>
                          <p className="text-xs text-[var(--text-secondary)]">
                            Historial: {clienteResumen.pagados} fiados pagados de {clienteResumen.total} total
                          </p>
                          <p className="text-xs text-[var(--text-secondary)]">
                            Deuda actual: <span className="font-bold text-[var(--data-error)]">{formatCurrency(clienteResumen.deudaActual)}</span>
                          </p>
                          <p className="text-xs text-[var(--text-secondary)]">
                            Limite: {formatCurrency(clienteResumen.limite)} · Disponible: <span className="font-bold">{formatCurrency(Math.max(0, clienteResumen.limite - clienteResumen.deudaActual))}</span>
                          </p>
                          {clienteResumen.promedioDias > 0 && (
                            <p className="text-xs text-[var(--text-secondary)]">
                              Promedio de pago: {clienteResumen.promedioDias} dias
                            </p>
                          )}
                        </div>
                      )
                    ) : clienteEsNuevo ? (
                      <div className="border border-[var(--rule-base)] dark:border-white/10 bg-gray-50 dark:bg-white/5 rounded-xl p-3">
                        <p className="text-xs text-[var(--text-tertiary)]">Cliente nuevo — sin historial de fiados</p>
                      </div>
                    ) : null
                  )}

                  <div>
                    <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">Monto total</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-[var(--text-tertiary)]">S/</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={newForm.total}
                        onChange={e => setNewForm((p: FiadoNewForm) => ({ ...p, total: e.target.value }))}
                        placeholder="0.00"
                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-[var(--rule-base)] dark:border-white/10 bg-white dark:bg-white/5 text-2xl font-bold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] placeholder:font-normal text-right font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">Descripción <span className="text-[var(--text-tertiary)] font-normal">(opcional)</span></label>
                    <div className="relative">
                      <FileText className="absolute left-4 top-3.5 h-5 w-5 text-[var(--text-tertiary)]" />
                      <textarea
                        value={newForm.descripcion}
                        onChange={e => setNewForm((p: FiadoNewForm) => ({ ...p, descripcion: e.target.value }))}
                        placeholder="Detalle de lo que se llevó..."
                        rows={2}
                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-[var(--rule-base)] dark:border-white/10 bg-white dark:bg-white/5 text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">Fecha de vencimiento <span className="text-[var(--text-tertiary)] font-normal">(opcional)</span></label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)]" />
                      <input
                        type="date"
                        value={newForm.fechaVence}
                        onChange={e => setNewForm((p: FiadoNewForm) => ({ ...p, fechaVence: e.target.value }))}
                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-[var(--rule-base)] dark:border-white/10 bg-white dark:bg-white/5 text-base text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      />
                    </div>
                  </div>

                  {/* Mejora 17: Foto del DNI (si monto > 100) */}
                  {parseFloat(newForm.total) > 100 && (
                    <div>
                      <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">
                        <Camera className="inline h-3.5 w-3.5 mr-1" />
                        Foto del DNI (opcional, recomendado para montos mayores)
                      </label>
                      {dniPhoto ? (
                        <div className="relative inline-block">
                          <Image
                            src={dniPhoto}
                            alt="DNI del cliente"
                            width={200}
                            height={120}
                            className="object-cover rounded-xl border border-[var(--rule-base)] dark:border-white/10"
                            unoptimized
                          />
                          <button
                            type="button"
                            onClick={() => setDniPhoto(null)}
                            className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-[var(--data-error)] text-white rounded-full flex items-center justify-center text-xs hover:bg-[var(--data-error)] transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex items-center justify-center gap-2 w-full py-6 rounded-lg border-2 border-dashed border-[var(--rule-base)] dark:border-white/20 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
                          <Camera className="h-5 w-5 text-[var(--text-tertiary)]" />
                          <span className="text-xs text-[var(--text-secondary)]">Tomar foto o seleccionar imagen</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.size > 2 * 1024 * 1024) {
                                setCreateError("La imagen no puede pesar más de 2MB");
                                return;
                              }
                              const reader = new FileReader();
                              reader.onload = () => setDniPhoto(reader.result as string);
                              reader.readAsDataURL(file);
                            }}
                          />
                        </label>
                      )}
                    </div>
                  )}

                {createError && (
                  <div className="rounded-xl bg-[var(--data-error-50)] border border-[var(--data-error)]/30 px-4 py-3">
                    <p className="text-sm text-[var(--data-error)] font-semibold">{createError}</p>
                  </div>
                )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--rule-soft)] bg-gray-50/50 flex gap-3">
          <button
            onClick={() => setShowNew(false)}
            className="flex-1 py-3 rounded-xl text-base font-semibold text-[var(--text-secondary)] border border-[var(--rule-base)] bg-white hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-base font-bold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-colors"
          >
            {creating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
            Crear fiado
          </button>
        </div>
      </m.div>
    </m.div>
  );
}
