"use client";

import { useState } from "react";
import {
  FileText,
  Download,
  Play,
  AlertCircle,
  CheckCircle,
  Loader2,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ReportResult {
  ok:        boolean;
  period:    string;
  ingresos:  number;
  gastos:    number;
  utilidad:  number;
  emailSent: boolean;
  pdfSize:   number;
  error?:    string;
}

interface ReportHistoryEntry {
  id:        string;
  period:    string;
  year:      number;
  month:     number;
  ingresos:  number;
  utilidad:  number;
  generatedAt: string;
}

const MONTH_NAMES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

function fmt(n: number): string {
  return `S/ ${n.toFixed(2)}`;
}

// ── Subcomponente: tarjeta KPI ────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon:  React.ElementType;
  color: "green" | "red" | "blue";
}) {
  const colors = {
    green: "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800",
    red:   "bg-red-50   dark:bg-red-900/20   text-red-700   dark:text-red-400   border-red-200   dark:border-red-800",
    blue:  "bg-emerald-50  dark:bg-emerald-900/20  text-emerald-700  dark:text-emerald-400  border-emerald-200  dark:border-emerald-800",
  };
  return (
    <div className={cn("rounded-xl border p-4 flex items-center gap-3", colors[color])}>
      <Icon className="h-6 w-6 shrink-0" />
      <div>
        <p className="text-xs opacity-70">{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ReporteMensualTab() {
  const now          = new Date();
  // Mes anterior por defecto
  const defaultYear  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const defaultMonth = now.getMonth() === 0 ? 12 : now.getMonth(); // getMonth() es 0-indexed

  const [year,      setYear]      = useState(defaultYear);
  const [month,     setMonth]     = useState(defaultMonth);
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState<ReportResult | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const [history,   setHistory]   = useState<ReportHistoryEntry[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);

  // ── Generar reporte manualmente ──────────────────────────────────────────

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const cronSecret = process.env.NEXT_PUBLIC_CRON_SECRET_PREVIEW ?? "";
      const res = await fetch(
        `/api/cron/monthly-report?year=${year}&month=${month}`,
        {
          headers: {
            Authorization: `Bearer ${cronSecret}`,
          },
        },
      );
      const json: ReportResult = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Error al generar el reporte");
      }

      setResult(json);

      // Agregar al historial local
      setHistory((prev) => [
        {
          id:          `${year}-${month}-${Date.now()}`,
          period:      json.period,
          year,
          month,
          ingresos:    json.ingresos,
          utilidad:    json.utilidad,
          generatedAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  // ── Descargar PDF (re-genera y descarga) ─────────────────────────────────

  async function handleDownload(y: number, m: number) {
    setLoadingHist(true);
    try {
      // El endpoint retorna JSON con ok:true. Para descargar el PDF directamente,
      // hacemos fetch y redirigimos al URL con los params — en producción se
      // puede extender el endpoint para devolver Content-Type: application/pdf
      const url = `/api/cron/monthly-report?year=${y}&month=${m}&download=1`;
      window.open(url, "_blank");
    } finally {
      setLoadingHist(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-1">
      {/* Título */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-[#00B4A6]/10">
          <FileText className="h-5 w-5 text-[#00B4A6]" />
        </div>
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white">Reporte Mensual</h2>
          <p className="text-xs text-gray-500">
            Genera el reporte PDF con ingresos, gastos, top productos y fiados.
            Se envía automáticamente el día 1 de cada mes.
          </p>
        </div>
      </div>

      {/* Selector de período + botón */}
      <div className="flex flex-wrap items-end gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-[var(--rule-base)]">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Mes
          </label>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="px-3 py-2 text-sm rounded-lg border border-[var(--rule-base)] dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00B4A6]"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i + 1} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Año
          </label>
          <input
            type="number"
            min={2023}
            max={2030}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-24 px-3 py-2 text-sm rounded-lg border border-[var(--rule-base)] dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00B4A6]"
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading}
          className={cn(
            "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white transition-colors",
            loading
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-[#00B4A6] hover:bg-[#1e4d38]",
          )}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {loading ? "Generando..." : "Generar reporte"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Resultado / Preview */}
      {result && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="font-semibold text-gray-900 dark:text-white">
              Reporte {result.period} generado
            </span>
            {result.emailSent && (
              <span className="text-xs text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full border border-green-200 dark:border-green-800">
                Email enviado
              </span>
            )}
          </div>

          {/* KPIs del reporte */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiCard
              label="Ingresos"
              value={fmt(result.ingresos)}
              icon={TrendingUp}
              color="green"
            />
            <KpiCard
              label="Gastos"
              value={fmt(result.gastos)}
              icon={TrendingDown}
              color="red"
            />
            <KpiCard
              label="Utilidad"
              value={fmt(result.utilidad)}
              icon={BarChart3}
              color={result.utilidad >= 0 ? "blue" : "red"}
            />
          </div>

          {/* Info PDF */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-400">
            <FileText className="h-4 w-4 shrink-0" />
            <span>
              PDF generado ({(result.pdfSize / 1024).toFixed(1)} KB) con top 10 productos,
              top 5 clientes y resumen de fiados.
            </span>
          </div>
        </div>
      )}

      {/* Historial de reportes generados en esta sesión */}
      {history.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
            <Users className="h-4 w-4" />
            Reportes generados en esta sesión
          </h3>
          <div className="space-y-2">
            {history.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-4 p-3 rounded-lg bg-white dark:bg-gray-900 border border-[var(--rule-base)]"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {entry.period}
                  </p>
                  <p className="text-xs text-gray-500">
                    Ingresos: {fmt(entry.ingresos)} · Utilidad: {fmt(entry.utilidad)}
                  </p>
                  <p className="text-[length:var(--ts-2xs)] text-gray-400">
                    Generado: {new Date(entry.generatedAt).toLocaleString("es-PE")}
                  </p>
                </div>
                <button
                  onClick={() => handleDownload(entry.year, entry.month)}
                  disabled={loadingHist}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-[#00B4A6] border border-[#00B4A6] hover:bg-[#00B4A6]/10 transition-colors disabled:opacity-50"
                  title="Descargar PDF"
                >
                  <Download className="h-3.5 w-3.5" />
                  Descargar PDF
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nota sobre automatización */}
      <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-[var(--rule-base)] text-xs text-gray-500 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          El reporte se genera automáticamente el{" "}
          <strong>día 1 de cada mes a las 6:00 AM</strong> y se envía por email
          al propietario configurado en el tenant. Puedes forzar la generación manualmente desde aquí.
        </span>
      </div>
    </div>
  );
}
