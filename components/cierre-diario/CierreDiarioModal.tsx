"use client";
import { useEffect, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "@buleje/design-system/icons";
import { useCierreDiario } from "./useCierreDiario";
import CierrePaso1Caja from "./CierrePaso1Caja";
import CierrePaso2Resumen from "./CierrePaso2Resumen";
import CierrePaso3Compartir from "./CierrePaso3Compartir";

type Props = {
  open: boolean;
  onClose: () => void;
};

const PASO_LABELS = ["Caja", "Resumen", "Compartir"];

export default function CierreDiarioModal({ open, onClose }: Props) {
  const cierre = useCierreDiario();
  const [confirmClose, setConfirmClose] = useState(false);

  // Fetch preview on mount
  useEffect(() => {
    if (open && !cierre.preview && !cierre.isLoading) {
      cierre.fetchPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cierre.totalContado, cierre.notas]);

  const handleClose = useCallback(() => {
    // If user has data, confirm before closing
    const hasData = cierre.totalContado > 0 || cierre.notas.trim().length > 0;
    if (hasData && !cierre.saved) {
      setConfirmClose(true);
    } else {
      cierre.reset();
      onClose();
    }
  }, [cierre, onClose]);

  const confirmAndClose = useCallback(() => {
    setConfirmClose(false);
    cierre.reset();
    onClose();
  }, [cierre, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] print:static print:z-auto">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm print:hidden"
        onClick={handleClose}
      />

      {/* Slide-over panel */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed right-0 top-0 bottom-0 w-full sm:w-[500px] md:w-[560px] bg-gray-50 dark:bg-background shadow-2xl flex flex-col print:static print:w-full print:shadow-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-card-border bg-white dark:bg-card print:hidden">
          <div>
            <h1 className="text-lg font-extrabold text-gray-900 dark:text-foreground">
              Cierre del D&iacute;a
            </h1>
            <p className="text-xs text-gray-400 dark:text-muted">
              {cierre.preview?.fecha ?? "Cargando..."}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-3 py-3 bg-white dark:bg-card border-b border-gray-100 dark:border-card-border print:hidden">
          {PASO_LABELS.map((label, i) => {
            const step = (i + 1) as 1 | 2 | 3;
            const isActive = cierre.paso === step;
            const isDone = cierre.paso > step;
            return (
              <div key={label} className="flex items-center gap-2">
                {i > 0 && (
                  <div className={`h-px w-8 ${isDone ? "bg-primary" : "bg-gray-200 dark:bg-card-border"}`} />
                )}
                <div className="flex items-center gap-1.5">
                  <div className={`h-3 w-3 rounded-full transition-all ${
                    isActive ? "bg-primary scale-125 ring-4 ring-primary/20" :
                    isDone ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"
                  }`} />
                  <span className={`text-xs font-semibold ${
                    isActive ? "text-primary" : isDone ? "text-gray-600 dark:text-foreground" : "text-gray-400 dark:text-muted"
                  }`}>{label}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <AnimatePresence mode="wait">
            {cierre.paso === 1 && (
              <CierrePaso1Caja
                key="paso1"
                conteo={cierre.conteo}
                totalContado={cierre.totalContado}
                efectivoEsperado={cierre.efectivoEsperado}
                diferencia={cierre.diferencia}
                preview={cierre.preview}
                incrementar={cierre.incrementar}
                setCantidad={cierre.setCantidad}
                onSkip={() => {
                  cierre.setSkipCaja(true);
                  cierre.setPaso(2);
                }}
                onNext={() => {
                  cierre.setSkipCaja(false);
                  cierre.setPaso(2);
                }}
              />
            )}
            {cierre.paso === 2 && (
              <CierrePaso2Resumen
                key="paso2"
                preview={cierre.preview}
                isLoading={cierre.isLoading}
                efectivoContado={cierre.totalContado}
                efectivoEsperado={cierre.efectivoEsperado}
                diferencia={cierre.diferencia}
                skipCaja={cierre.skipCaja}
                fetchPreview={cierre.fetchPreview}
                onBack={() => cierre.setPaso(1)}
                onNext={() => cierre.setPaso(3)}
              />
            )}
            {cierre.paso === 3 && cierre.preview && (
              <CierrePaso3Compartir
                key="paso3"
                preview={cierre.preview}
                totalContado={cierre.totalContado}
                diferencia={cierre.diferencia}
                skipCaja={cierre.skipCaja}
                notas={cierre.notas}
                setNotas={cierre.setNotas}
                isSaving={cierre.isSaving}
                saved={cierre.saved}
                error={cierre.error}
                guardar={cierre.guardar}
                generarTextoWhatsApp={cierre.generarTextoWhatsApp}
                onFinish={() => {
                  cierre.reset();
                  onClose();
                }}
              />
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Confirm close dialog */}
      {confirmClose && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center print:hidden">
          <div className="fixed inset-0 bg-black/30" onClick={() => setConfirmClose(false)} />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative bg-white dark:bg-card rounded-2xl shadow-2xl border border-gray-200 dark:border-card-border p-6 w-80 z-10"
          >
            <h3 className="text-base font-bold text-gray-900 dark:text-foreground">
              &iquest;Cerrar sin guardar?
            </h3>
            <p className="text-sm text-gray-500 dark:text-muted mt-2">
              Tienes datos sin guardar. Si cierras, se perder&aacute;n.
            </p>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setConfirmClose(false)}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-accent transition-colors"
              >
                Volver
              </button>
              <button
                onClick={confirmAndClose}
                className="flex-1 py-2 rounded-xl text-sm font-bold bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
