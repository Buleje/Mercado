"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { DENOMINACIONES } from "./useCierreDiario";
import type { PreviewData } from "./useCierreDiario";

type Props = {
  conteo: Record<number, number>;
  totalContado: number;
  efectivoEsperado: number;
  diferencia: number;
  preview: PreviewData | null;
  incrementar: (valor: number) => void;
  setCantidad: (valor: number, cantidad: number) => void;
  onSkip: () => void;
  onNext: () => void;
};

export default function CierrePaso1Caja({
  conteo,
  totalContado,
  efectivoEsperado,
  diferencia,
  preview,
  incrementar,
  setCantidad,
  onSkip,
  onNext,
}: Props) {
  const [editingDenom, setEditingDenom] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleChipClick = (valor: number) => {
    incrementar(valor);
  };

  const handleChipDoubleClick = (valor: number) => {
    setEditingDenom(valor);
    setEditValue(String(conteo[valor] ?? 0));
  };

  const handleEditConfirm = () => {
    if (editingDenom !== null) {
      setCantidad(editingDenom, Math.max(0, parseInt(editValue) || 0));
      setEditingDenom(null);
      setEditValue("");
    }
  };

  const formatDenom = (valor: number) => {
    if (valor >= 1) return `S/${valor}`;
    return `${(valor * 100).toFixed(0)}c`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-foreground">
          Conteo de efectivo
        </h2>
        <p className="text-sm text-gray-500 dark:text-muted mt-1">
          Toca cada denominaci&oacute;n para sumar 1. Doble clic para escribir la cantidad.
        </p>
      </div>

      {/* Denominaciones grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {DENOMINACIONES.map((d) => {
          const cantidad = conteo[d.valor] ?? 0;
          const subtotal = d.valor * cantidad;

          return (
            <motion.button
              key={d.valor}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleChipClick(d.valor)}
              onDoubleClick={() => handleChipDoubleClick(d.valor)}
              className={`relative flex flex-col items-center justify-center rounded-2xl border-2 p-4 min-h-[80px] transition-all select-none ${
                cantidad > 0
                  ? "border-primary bg-primary/5 dark:bg-primary/10 shadow-sm"
                  : "border-gray-200 dark:border-card-border bg-white dark:bg-card hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              <span className={`text-lg font-bold ${
                d.tipo === "billete" ? "text-emerald-700 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
              }`}>
                {formatDenom(d.valor)}
              </span>
              <span className="text-xs text-gray-400 dark:text-muted mt-0.5">
                {d.tipo === "billete" ? "billete" : "moneda"}
              </span>
              {cantidad > 0 && (
                <span className="absolute -top-2 -right-2 bg-primary text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center shadow">
                  {cantidad}
                </span>
              )}
              {cantidad > 0 && (
                <span className="text-[length:var(--ts-2xs)] text-gray-500 dark:text-muted mt-1">
                  = S/{subtotal.toFixed(2)}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Edit modal overlay */}
      {editingDenom !== null && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-card rounded-2xl shadow-2xl border border-gray-200 dark:border-card-border p-6 w-80"
          >
            <p className="text-sm font-semibold text-gray-700 dark:text-foreground mb-3">
              Cantidad de {formatDenom(editingDenom)}
            </p>
            <input
              type="number"
              autoFocus
              min={0}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleEditConfirm()}
              className="w-full border border-gray-300 dark:border-card-border rounded-xl px-4 py-3 text-2xl text-center font-bold bg-gray-50 dark:bg-surface text-gray-900 dark:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { setEditingDenom(null); setEditValue(""); }}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-accent transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleEditConfirm}
                className="flex-1 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 transition-colors"
              >
                Confirmar
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Summary footer */}
      <div className="bg-gray-50 dark:bg-surface rounded-2xl p-4 space-y-3 border border-gray-200 dark:border-card-border">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-600 dark:text-muted">Total contado:</span>
          <span className="text-2xl font-extrabold text-gray-900 dark:text-foreground">
            S/ {totalContado.toFixed(2)}
          </span>
        </div>
        {preview && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-muted">Efectivo esperado (sistema):</span>
              <span className="font-semibold text-gray-700 dark:text-foreground">
                S/ {efectivoEsperado.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-muted">Diferencia:</span>
              <span className={`font-bold text-lg ${
                diferencia > 0 ? "text-emerald-600" : diferencia < 0 ? "text-red-500" : "text-gray-600 dark:text-foreground"
              }`}>
                {diferencia >= 0 ? "+" : ""}S/ {diferencia.toFixed(2)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onSkip}
          className="flex-1 py-3 rounded-xl text-sm font-semibold text-gray-500 dark:text-muted border border-gray-200 dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent transition-colors"
        >
          Sin efectivo
        </button>
        <button
          onClick={onNext}
          className="flex-1 py-3 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 transition-colors shadow-sm"
        >
          Continuar &rarr;
        </button>
      </div>
    </motion.div>
  );
}
