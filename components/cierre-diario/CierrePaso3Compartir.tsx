"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Save, Printer, MessageCircle, CheckCircle, Loader2 } from "lucide-react";
import type { PreviewData } from "./useCierreDiario";

type Props = {
  preview: PreviewData;
  totalContado: number;
  diferencia: number;
  skipCaja: boolean;
  notas: string;
  setNotas: (v: string) => void;
  isSaving: boolean;
  saved: boolean;
  error: string | null;
  guardar: () => void;
  generarTextoWhatsApp: () => string;
  onFinish: () => void;
};

function useCountUp(target: number, duration = 1500) {
  const [value, setValue] = useState(0);
  const rafId = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) {
        rafId.current = requestAnimationFrame(animate);
      }
    };
    rafId.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId.current);
  }, [target, duration]);

  return value;
}

export default function CierrePaso3Compartir({
  preview,
  totalContado,
  diferencia,
  skipCaja,
  notas,
  setNotas,
  isSaving,
  saved,
  error,
  guardar,
  generarTextoWhatsApp,
  onFinish,
}: Props) {
  const animatedTotal = useCountUp(preview.ventas.total);

  const handleWhatsApp = () => {
    const text = generarTextoWhatsApp();
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="space-y-6"
    >
      {/* Animated big number */}
      <div className="text-center py-6">
        <motion.p
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
          className="text-5xl sm:text-6xl font-extrabold text-primary"
        >
          S/ {animatedTotal.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </motion.p>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-lg text-gray-500 dark:text-muted mt-2"
        >
          &iexcl;Buen d&iacute;a de trabajo!
        </motion.p>
      </div>

      {/* Printable summary (hidden on screen, shown on print) */}
      <div className="hidden print:block print-summary space-y-3 p-6">
        <h1 className="text-2xl font-bold">Cierre del D&iacute;a &mdash; Buleje</h1>
        <p className="text-sm text-gray-600">Fecha: {preview.fecha}</p>
        <table className="w-full text-sm border-collapse">
          <tbody>
            <tr className="border-b"><td className="py-2 font-semibold">Total ventas</td><td className="py-2 text-right">S/ {preview.ventas.total.toFixed(2)}</td></tr>
            <tr className="border-b"><td className="py-2 font-semibold">Cantidad de ventas</td><td className="py-2 text-right">{preview.ventas.cantidad}</td></tr>
            <tr className="border-b"><td className="py-2 font-semibold">Ticket promedio</td><td className="py-2 text-right">S/ {preview.ventas.ticketPromedio.toFixed(2)}</td></tr>
            <tr className="border-b"><td className="py-2 font-semibold">Efectivo contado</td><td className="py-2 text-right">{skipCaja ? "N/A" : `S/ ${totalContado.toFixed(2)}`}</td></tr>
            <tr className="border-b"><td className="py-2 font-semibold">Efectivo esperado</td><td className="py-2 text-right">S/ {preview.caja.efectivoEsperado.toFixed(2)}</td></tr>
            <tr className="border-b"><td className="py-2 font-semibold">Diferencia</td><td className="py-2 text-right">{skipCaja ? "N/A" : `${diferencia >= 0 ? "+" : ""}S/ ${diferencia.toFixed(2)}`}</td></tr>
            <tr className="border-b"><td className="py-2 font-semibold">Fiados cobrados</td><td className="py-2 text-right">S/ {preview.fiados.cobradosHoy.toFixed(2)}</td></tr>
            <tr className="border-b"><td className="py-2 font-semibold">Fiados nuevos</td><td className="py-2 text-right">S/ {preview.fiados.nuevosHoy.toFixed(2)}</td></tr>
            <tr className="border-b"><td className="py-2 font-semibold">Fiados vencidos</td><td className="py-2 text-right">{preview.fiados.vencidos}</td></tr>
            {preview.ventas.mejorHora && <tr className="border-b"><td className="py-2 font-semibold">Mejor hora</td><td className="py-2 text-right">{preview.ventas.mejorHora}</td></tr>}
            {preview.ventas.productoTop && <tr className="border-b"><td className="py-2 font-semibold">Producto top</td><td className="py-2 text-right">{preview.ventas.productoTop}</td></tr>}
          </tbody>
        </table>
        {notas && <p className="text-sm"><strong>Notas:</strong> {notas}</p>}
      </div>

      {/* Action cards */}
      <div className="space-y-3 print:hidden">
        {/* Save */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={guardar}
          disabled={isSaving || saved}
          className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${
            saved
              ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30"
              : "border-gray-200 dark:border-card-border bg-white dark:bg-card hover:border-primary"
          }`}
        >
          {saved ? (
            <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
          ) : (
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              {isSaving ? <Loader2 className="h-5 w-5 text-primary animate-spin" /> : <Save className="h-5 w-5 text-primary" />}
            </div>
          )}
          <div className="text-left flex-1">
            <p className="font-bold text-gray-900 dark:text-foreground text-sm">
              {saved ? "Reporte guardado" : "Guardar reporte"}
            </p>
            <p className="text-xs text-gray-500 dark:text-muted">
              {saved ? "Se guard\u00f3 exitosamente en el sistema" : "Guarda el cierre del d\u00eda en la base de datos"}
            </p>
          </div>
        </motion.button>

        {/* Print */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={handlePrint}
          className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-card hover:border-emerald-400 transition-all"
        >
          <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
            <Printer className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-left flex-1">
            <p className="font-bold text-gray-900 dark:text-foreground text-sm">Imprimir</p>
            <p className="text-xs text-gray-500 dark:text-muted">Imprime el resumen del d&iacute;a</p>
          </div>
        </motion.button>

        {/* WhatsApp */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleWhatsApp}
          className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-card hover:border-green-400 transition-all"
        >
          <div className="h-10 w-10 rounded-xl bg-green-50 dark:bg-green-950/30 flex items-center justify-center">
            <MessageCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="text-left flex-1">
            <p className="font-bold text-gray-900 dark:text-foreground text-sm">Enviar a WhatsApp</p>
            <p className="text-xs text-gray-500 dark:text-muted">Comparte el resumen por WhatsApp</p>
          </div>
        </motion.button>
      </div>

      {/* Notes */}
      <div className="print:hidden">
        <label className="block text-sm font-semibold text-gray-700 dark:text-foreground mb-2">
          Notas del d&iacute;a (opcional)
        </label>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Ej: Se acab\u00f3 el arroz a las 5pm, falt\u00f3 cambio..."
          rows={3}
          className="w-full rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-card px-4 py-3 text-sm text-gray-900 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary resize-none"
        />
      </div>

      {error && (
        <p className="text-sm text-red-500 font-semibold print:hidden">{error}</p>
      )}

      {/* Final button */}
      <button
        onClick={onFinish}
        className="w-full py-4 rounded-xl text-base font-bold bg-primary text-white hover:bg-primary/90 transition-colors shadow-lg print:hidden"
      >
        Finalizar d&iacute;a &#10003;
      </button>
    </motion.div>
  );
}
