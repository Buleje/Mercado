"use client";

import { useMemo } from "react";
import { FileText, HardDrive, AlarmClock, Receipt, Tag as TagIcon, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { BulejeDonutChart } from "@/components/ui-system/charts";
import type { DbDocument } from "@/lib/types/documents";

/**
 * Panel resumen del drive: KPIs + dona por categoría + facturado detectado +
 * top etiquetas + tendencia de subidas. Todo derivado en cliente de la data que
 * ya viene en el listado (sin endpoint ni migración).
 */
function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
function money(n: number): string {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : null;
}
const MONTHS_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function DashboardView({ docs }: { docs: DbDocument[] }) {
  const stats = useMemo(() => {
    const now = Date.now();
    const byCategory = new Map<string, number>();
    const tagCount = new Map<string, number>();
    const uploadsByMonth = new Map<string, number>();
    let totalSize = 0;
    let expiring = 0;
    let facturado = 0;
    let facturasCount = 0;

    for (const d of docs) {
      byCategory.set(d.category, (byCategory.get(d.category) ?? 0) + 1);
      totalSize += d.size;
      if (d.expiresAt) {
        const days = Math.ceil((new Date(d.expiresAt).getTime() - now) / 86_400_000);
        if (days <= 30) expiring += 1;
      }
      for (const t of [...d.tags, ...d.aiTags]) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
      const s = d.ocrMetadata?.structured as { docType?: string; total?: number | string } | undefined;
      if (s && /factura|boleta|recibo/i.test(s.docType ?? "")) {
        const t = num(s.total);
        if (t !== null) { facturado += t; facturasCount += 1; }
      }
      const dt = new Date(d.uploadedAt);
      const key = `${dt.getFullYear()}-${String(dt.getMonth()).padStart(2, "0")}`;
      uploadsByMonth.set(key, (uploadsByMonth.get(key) ?? 0) + 1);
    }

    const catData = [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value, cat: name }));

    const topTags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxTag = topTags[0]?.[1] ?? 1;

    // Últimos 6 meses de subidas.
    const months: { label: string; count: number }[] = [];
    const cursor = new Date();
    cursor.setDate(1);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      months.push({ label: MONTHS_SHORT[d.getMonth()], count: uploadsByMonth.get(key) ?? 0 });
    }
    const maxMonth = Math.max(1, ...months.map((m) => m.count));

    return { catData, totalSize, expiring, facturado, facturasCount, topTags, maxTag, months, maxMonth };
  }, [docs]);

  const kpis = [
    { label: "Documentos", value: String(docs.length), icon: FileText, tint: "text-primary" },
    { label: "Espacio usado", value: fmtBytes(stats.totalSize), icon: HardDrive, tint: "text-[var(--accent)]" },
    { label: "Por vencer (30d)", value: String(stats.expiring), icon: AlarmClock, tint: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" },
    { label: `Facturado (${stats.facturasCount} comp.)`, value: money(stats.facturado), icon: Receipt, tint: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" },
  ];

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] p-4">
            <div className="flex items-center gap-2 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              <k.icon className={cn("h-4 w-4", k.tint)} /> {k.label}
            </div>
            <p className={cn("mt-1.5 text-2xl font-extrabold tabular-nums", k.tint)}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Dona por categoría */}
        <section className="rounded-2xl border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] p-4">
          <p className="mb-2 text-sm font-bold text-[var(--text-primary)]">Documentos por categoría</p>
          {stats.catData.length > 0 ? (
            <>
              <BulejeDonutChart data={stats.catData.slice(0, 5)} height={200} label={<span className="text-2xl font-extrabold text-[var(--text-primary)]">{docs.length}</span>} />
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {stats.catData.map((c) => (
                  <span key={c.cat} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                    <span className="capitalize">{c.name}</span>
                    <span className="tabular-nums text-[var(--text-tertiary)]">{c.value}</span>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">Sin documentos aún.</p>
          )}
        </section>

        {/* Tendencia de subidas */}
        <section className="rounded-2xl border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] p-4">
          <p className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
            <TrendingUp className="h-4 w-4 text-primary" /> Subidas por mes
          </p>
          <div className="flex items-end justify-between gap-2 h-[200px] px-1">
            {stats.months.map((m, i) => (
              <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1.5">
                <span className="text-[length:var(--ts-2xs,11px)] font-bold tabular-nums text-[var(--text-tertiary)]">{m.count || ""}</span>
                <div
                  className="w-full max-w-[42px] rounded-t-lg bg-primary/80 transition-all"
                  style={{ height: `${Math.max(4, (m.count / stats.maxMonth) * 150)}px` }}
                  title={`${m.count} en ${m.label}`}
                />
                <span className="text-[length:var(--ts-2xs,11px)] font-semibold text-[var(--text-tertiary)]">{m.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Top etiquetas */}
      <section className="rounded-2xl border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] p-4">
        <p className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
          <TagIcon className="h-4 w-4 text-primary" /> Etiquetas más usadas
        </p>
        {stats.topTags.length > 0 ? (
          <div className="space-y-1.5">
            {stats.topTags.map(([tag, count]) => (
              <div key={tag} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate text-xs font-semibold text-[var(--text-secondary)]">#{tag}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                  <div className="h-full rounded-full bg-primary/70" style={{ width: `${(count / stats.maxTag) * 100}%` }} />
                </div>
                <span className="w-6 shrink-0 text-right text-xs font-bold tabular-nums text-[var(--text-tertiary)]">{count}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-[var(--text-tertiary)]">Todavía no hay etiquetas. Analizá documentos con IA para generarlas.</p>
        )}
      </section>
    </div>
  );
}
