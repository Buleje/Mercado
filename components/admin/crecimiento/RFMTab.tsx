"use client";

import { CardTitle, DataTable } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { Target, Loader2, TrendingUp } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Análisis RFM (Recencia · Frecuencia · Monto) ────────────────────────────────
// Consume /api/analytics/rfm (existía sin UI). Segmenta a los clientes por
// comportamiento real de compra y sugiere la acción para cada grupo.

type RFMCustomer = {
  phone: string;
  name: string;
  recencyDays: number;
  frequency: number;
  monetary: number;
  rScore: number;
  fScore: number;
  mScore: number;
  segment: string;
};

type RFMSegment = {
  segment: string;
  count: number;
  avgMonetary: number;
  avgFrequency: number;
  color: string;
  action: string;
};

const SEGMENT_LABELS: Record<string, string> = {
  Champions: "Campeones",
  Loyal: "Leales",
  New: "Nuevos",
  AtRisk: "En riesgo",
  Lost: "Perdidos",
  Regular: "Regulares",
};

const PERIODS = [
  { days: 30, label: "30 días" },
  { days: 90, label: "90 días" },
  { days: 180, label: "6 meses" },
  { days: 365, label: "1 año" },
];

const fmt = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2 });
const segLabel = (s: string) => SEGMENT_LABELS[s] ?? s;

export default function RFMTab() {
  const [days, setDays] = useState(90);
  const [segments, setSegments] = useState<RFMSegment[]>([]);
  const [customers, setCustomers] = useState<RFMCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [activeSeg, setActiveSeg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/analytics/rfm?days=${days}`);
      if (!res.ok) throw new Error("fetch fail");
      const data = await res.json();
      setSegments(data.segments ?? []);
      setCustomers(data.customers ?? []);
      if (data.message) setMessage(data.message);
    } catch {
      setSegments([]);
      setCustomers([]);
      setMessage("No se pudo cargar el análisis.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const shown = activeSeg ? customers.filter((c) => c.segment === activeSeg) : customers;

  return (
    <div className="space-y-3 sm:space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <CardTitle className="text-lg font-extrabold text-[var(--text-primary)] flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" /> Análisis RFM
          </CardTitle>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Agrupa a tus clientes por qué tan reciente, seguido y cuánto compran. Cada grupo necesita un trato distinto.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-[var(--surface-sunken)] rounded-xl p-1 shrink-0">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                days === p.days ? "bg-[var(--surface-raised)] text-primary shadow-[var(--shadow-xs)]" : "text-[var(--text-secondary)]",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="p-10 flex items-center justify-center text-[var(--text-tertiary)] text-sm gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Calculando…
        </div>
      ) : segments.length === 0 ? (
        <div className="p-10 text-center">
          <Target className="h-10 w-10 text-[var(--text-tertiary)] mx-auto mb-3" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">Sin datos para el período</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">{message ?? "Aún no hay compras con cliente identificado."}</p>
        </div>
      ) : (
        <>
          {/* Tarjetas de segmento */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {segments.map((s) => {
              const isActive = activeSeg === s.segment;
              return (
                <button
                  key={s.segment}
                  onClick={() => setActiveSeg(isActive ? null : s.segment)}
                  className={cn(
                    "text-left bg-[var(--surface-raised)] border rounded-2xl p-4 transition-colors",
                    isActive ? "border-primary ring-1 ring-primary" : "border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]",
                  )}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <p className="font-bold text-sm text-[var(--text-primary)]">{segLabel(s.segment)}</p>
                  </div>
                  <p className="text-2xl font-extrabold text-[var(--text-primary)] leading-none">{s.count}</p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-1">
                    {fmt(s.avgMonetary)} prom · {s.avgFrequency} compras
                  </p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] mt-2 inline-flex items-start gap-1">
                    <TrendingUp className="h-3 w-3 shrink-0 mt-0.5 text-primary" /> {s.action}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Tabla de clientes */}
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--rule-base)]">
              <p className="text-xs font-bold text-[var(--text-secondary)] uppercase">
                {activeSeg ? `${segLabel(activeSeg)} · ${shown.length}` : `Todos · ${shown.length}`}
              </p>
              {activeSeg && (
                <button onClick={() => setActiveSeg(null)} className="text-xs font-semibold text-primary hover:underline">
                  Ver todos
                </button>
              )}
            </div>
            <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
              <DataTable className="w-full min-w-[520px] text-sm">
                <thead className="bg-[var(--surface-sunken)] sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] uppercase">Cliente</th>
                    <th className="px-3 py-2 text-left text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] uppercase">Segmento</th>
                    <th className="px-3 py-2 text-right text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] uppercase">Última (d)</th>
                    <th className="px-3 py-2 text-right text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] uppercase">Compras</th>
                    <th className="px-3 py-2 text-right text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] uppercase">Gasto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule-soft)]">
                  {shown.slice(0, 200).map((c) => (
                    <tr key={c.phone} className="hover:bg-[var(--surface-sunken)]/50">
                      <td className="px-3 py-2">
                        <p className="font-semibold text-[var(--text-primary)] text-xs truncate max-w-[160px]">{c.name}</p>
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{c.phone}</p>
                      </td>
                      <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">{segLabel(c.segment)}</td>
                      <td className="px-3 py-2 text-right text-xs text-[var(--text-secondary)]">{c.recencyDays}</td>
                      <td className="px-3 py-2 text-right text-xs text-[var(--text-secondary)]">{c.frequency}</td>
                      <td className="px-3 py-2 text-right text-xs font-bold text-[var(--text-primary)]">{fmt(c.monetary)}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
