"use client";

import { useState, useEffect, useCallback } from "react";
import { MessageCircle, Loader2, Phone, Clock, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { generateDailyReportText } from "@/lib/daily-report";
import type { DailyReport } from "@/lib/daily-report";

// ── Constants ─────────────────────────────────────────────────────────────────

const LS_PHONE_KEY = "bodega-owner-whatsapp";
const LS_SCHEDULE_KEY = "bodega-report-schedule-hour";

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizePhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(-9);
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  className?: string;
}

export default function DailyReportWhatsApp({ className }: Props) {
  const [phone, setPhone] = useState("");
  const [scheduleHour, setScheduleHour] = useState<string>("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar valores persistidos
  useEffect(() => {
    const savedPhone = localStorage.getItem(LS_PHONE_KEY) ?? "";
    const savedHour = localStorage.getItem(LS_SCHEDULE_KEY) ?? "";
    setPhone(savedPhone);
    setScheduleHour(savedHour);
    if (savedHour) setShowSchedule(true);
  }, []);

  // Persistir teléfono
  function handlePhoneChange(val: string) {
    setPhone(val);
    localStorage.setItem(LS_PHONE_KEY, val);
  }

  // Persistir hora programada
  function handleScheduleHourChange(val: string) {
    setScheduleHour(val);
    if (val) {
      localStorage.setItem(LS_SCHEDULE_KEY, val);
    } else {
      localStorage.removeItem(LS_SCHEDULE_KEY);
    }
  }

  const loadReport = useCallback(async (): Promise<DailyReport | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/daily-report");
      if (!res.ok) throw new Error("Error al obtener reporte");
      return (await res.json()) as DailyReport;
    } catch {
      setError("No se pudo cargar el reporte. Intenta de nuevo.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  async function handlePreview() {
    if (previewText && showPreview) {
      setShowPreview(false);
      return;
    }
    const report = await loadReport();
    if (!report) return;
    setPreviewText(generateDailyReportText(report));
    setShowPreview(true);
  }

  async function handleSend() {
    const clean = sanitizePhone(phone);
    if (clean.length < 9) {
      setError("Ingresa un número de WhatsApp válido (9 dígitos).");
      return;
    }

    let text = previewText;
    if (!text) {
      const report = await loadReport();
      if (!report) return;
      text = generateDailyReportText(report);
      setPreviewText(text);
    }

    const url = `https://wa.me/51${clean}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const isPhoneValid = sanitizePhone(phone).length >= 9;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Número de WhatsApp */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-600 dark:text-muted flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5" />
          Número del dueño
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-500 dark:text-muted select-none">+51</span>
          <input
            type="tel"
            inputMode="numeric"
            placeholder="987 654 321"
            value={phone}
            onChange={e => handlePhoneChange(e.target.value)}
            className={cn(
              "flex-1 px-3 py-2 rounded-xl border text-sm font-medium transition-colors",
              "bg-white dark:bg-card border-gray-200 dark:border-card-border",
              "text-gray-900 dark:text-white placeholder:text-gray-400",
              "focus:outline-none focus:ring-2 focus:ring-primary/40",
            )}
            maxLength={12}
          />
        </div>
      </div>

      {/* Botones de acción */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Preview */}
        <button
          onClick={handlePreview}
          disabled={loading}
          className={cn(
            "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors min-h-[44px]",
            "border border-gray-300 dark:border-card-border",
            "bg-white dark:bg-card text-gray-700 dark:text-white",
            "hover:bg-gray-50 dark:hover:bg-gray-800",
            "disabled:opacity-60",
          )}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : showPreview ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
          {showPreview ? "Ocultar vista previa" : "Ver reporte"}
        </button>

        {/* Enviar */}
        <button
          onClick={handleSend}
          disabled={loading || !isPhoneValid}
          className={cn(
            "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors min-h-[44px]",
            "bg-[#25D366] hover:bg-[#20bd5a] text-white",
            "disabled:opacity-60 disabled:cursor-not-allowed",
          )}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MessageCircle className="h-4 w-4" />
          )}
          Enviar reporte del día por WhatsApp
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-500 font-semibold">{error}</p>
      )}

      {/* Vista previa del mensaje */}
      {showPreview && previewText && (
        <div className="rounded-xl border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface p-4 space-y-2">
          <p className="text-[11px] font-bold text-gray-400">Vista previa del mensaje</p>
          <textarea
            readOnly
            value={previewText}
            rows={20}
            className={cn(
              "w-full text-xs font-mono leading-relaxed resize-none",
              "bg-transparent text-gray-700 dark:text-gray-300",
              "focus:outline-none",
            )}
          />
        </div>
      )}

      {/* Programar envío diario */}
      <div className="pt-1">
        <button
          onClick={() => setShowSchedule(s => !s)}
          className="text-xs text-[#00B4A6] dark:text-emerald-400 font-semibold flex items-center gap-1.5 hover:underline"
        >
          <Clock className="h-3.5 w-3.5" />
          {showSchedule ? "Ocultar programación" : "Programar envío diario"}
        </button>

        {showSchedule && (
          <div className="mt-3 p-4 rounded-xl bg-primary/5 dark:bg-primary/10 border border-primary/20 space-y-2">
            <label className="text-xs font-semibold text-gray-600 dark:text-muted">
              Hora de recordatorio diario
            </label>
            <input
              type="time"
              value={scheduleHour}
              onChange={e => handleScheduleHourChange(e.target.value)}
              className={cn(
                "px-3 py-2 rounded-xl border text-sm font-medium transition-colors",
                "bg-white dark:bg-card border-gray-200 dark:border-card-border",
                "text-gray-900 dark:text-white",
                "focus:outline-none focus:ring-2 focus:ring-primary/40",
              )}
            />
            {scheduleHour && (
              <p className="text-xs text-[#00B4A6] dark:text-emerald-400 font-medium">
                Recuerda enviar el reporte todos los dias a las {scheduleHour} hs.
                La app no envia automaticamente — abre el modulo IA a esa hora para hacerlo.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
