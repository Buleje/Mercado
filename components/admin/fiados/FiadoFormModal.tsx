"use client";

import type { Dispatch, SetStateAction } from "react";
import { m } from "@/components/admin/providers";
import {
  X, DollarSign, Calendar, User, FileText,
  Camera, Loader2, Plus,
} from "lucide-react";
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
    <>
        {showNew && (
          <>
            <m.div
              key="new-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowNew(false)}
            />
            <m.div
              key="new-modal"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={e => e.target === e.currentTarget && setShowNew(false)}
            >
              <div className="w-full max-w-xl bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
                {/* UX Mejora 12: Sticky header */}
                <div className="sticky top-0 z-10 bg-white dark:bg-card border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-2xl">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Nuevo Fíado</h3>
                  <button onClick={() => setShowNew(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors">
                    <X className="h-5 w-5 text-gray-500" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Cliente (nombre o teléfono)</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={newForm.customerId}
                        onChange={e => setNewForm((p: FiadoNewForm) => ({ ...p, customerId: e.target.value }))}
                        placeholder="Ej: 987654321"
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30"
                      />
                    </div>
                  </div>

                  {/* Mejora M1: Resumen visual del cliente */}
                  {newForm.customerId.trim().length >= 6 && (
                    clienteResumenLoading ? (
                      <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-white/5 rounded-xl">
                        <Loader2 className="h-4 w-4 animate-spin text-[#00B4A6]" />
                        <span className="text-xs text-gray-500">Buscando historial...</span>
                      </div>
                    ) : clienteResumen ? (
                      clienteResumen.bloqueado ? (
                        <div className="border-2 border-red-500 bg-red-50 dark:bg-red-950/20 rounded-xl p-3 space-y-1">
                          <p className="text-sm font-bold text-red-700 dark:text-red-400">Cliente bloqueado por morosidad</p>
                          <p className="text-xs text-red-600 dark:text-red-400">
                            {clienteResumen.nombre} tiene deudas vencidas hace mas de 60 dias. Deuda actual: {formatCurrency(clienteResumen.deudaActual)}
                          </p>
                        </div>
                      ) : (
                        <div className={cn(
                          "border-2 rounded-xl p-3 space-y-1.5",
                          clienteResumen.score >= 4 ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20" :
                          clienteResumen.score === 3 ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" :
                          "border-red-400 bg-red-50 dark:bg-red-950/20"
                        )}>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-900 dark:text-white">{clienteResumen.nombre}</span>
                            <span className="text-xs text-amber-500">{clienteResumen.score}/5</span>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            Historial: {clienteResumen.pagados} fiados pagados de {clienteResumen.total} total
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            Deuda actual: <span className="font-bold text-red-600">{formatCurrency(clienteResumen.deudaActual)}</span>
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            Limite: {formatCurrency(clienteResumen.limite)} · Disponible: <span className="font-bold">{formatCurrency(Math.max(0, clienteResumen.limite - clienteResumen.deudaActual))}</span>
                          </p>
                          {clienteResumen.promedioDias > 0 && (
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              Promedio de pago: {clienteResumen.promedioDias} dias
                            </p>
                          )}
                        </div>
                      )
                    ) : clienteEsNuevo ? (
                      <div className="border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 rounded-xl p-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400">Cliente nuevo — sin historial de fiados</p>
                      </div>
                    ) : null
                  )}

                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Monto total (S/)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={newForm.total}
                        onChange={e => setNewForm((p: FiadoNewForm) => ({ ...p, total: e.target.value }))}
                        placeholder="0.00"
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Descripción (opcional)</label>
                    <div className="relative">
                      <FileText className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <textarea
                        value={newForm.descripcion}
                        onChange={e => setNewForm((p: FiadoNewForm) => ({ ...p, descripcion: e.target.value }))}
                        placeholder="Detalle de lo que se llevó..."
                        rows={2}
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30 resize-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Fecha de vencimiento (opcional)</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="date"
                        value={newForm.fechaVence}
                        onChange={e => setNewForm((p: FiadoNewForm) => ({ ...p, fechaVence: e.target.value }))}
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30"
                      />
                    </div>
                  </div>

                  {/* Mejora 17: Foto del DNI (si monto > 100) */}
                  {parseFloat(newForm.total) > 100 && (
                    <div>
                      <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">
                        <Camera className="inline h-3.5 w-3.5 mr-1" />
                        Foto del DNI (opcional, recomendado para montos mayores)
                      </label>
                      {dniPhoto ? (
                        <div className="relative inline-block">
                          <img
                            src={dniPhoto}
                            alt="DNI del cliente"
                            className="w-[200px] h-[120px] object-cover rounded-xl border border-gray-200 dark:border-white/10"
                          />
                          <button
                            type="button"
                            onClick={() => setDniPhoto(null)}
                            className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex items-center justify-center gap-2 w-full py-6 rounded-xl border-2 border-dashed border-gray-300 dark:border-white/20 cursor-pointer hover:border-[#00B4A6] hover:bg-[#00B4A6]/5 transition-colors">
                          <Camera className="h-5 w-5 text-gray-400" />
                          <span className="text-xs text-gray-500">Tomar foto o seleccionar imagen</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.size > 2 * 1024 * 1024) {
                                setCreateError("La imagen no puede pesar mas de 2MB");
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
                </div>

                {createError && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-semibold">{createError}</p>
                )}
                </div>
                {/* UX Mejora 12: Sticky footer */}
                <div className="sticky bottom-0 bg-white dark:bg-card border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
                  <button
                    onClick={() => setShowNew(false)}
                    className="px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={creating}
                    className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold text-white bg-[#00B4A6] hover:bg-[#009690] disabled:opacity-50 rounded-lg shadow-sm transition-colors"
                  >
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Crear Fíado
                  </button>
                </div>
              </div>
            </m.div>
          </>
        )}
    </>
  );
}
