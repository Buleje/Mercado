"use client";

import { useEffect, useState } from "react";
import { Calendar, Loader2 } from "@buleje/design-system/icons";
import { DataTable } from "@buleje/design-system";
import { BarraFiltrosTabla, FiltroEnCabecera, SinCoincidenciasFila, useFiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { fmt, type AssetStats, type IncomeMov } from "./tipos";
import { Center } from "./Centrado";
import { COLUMNAS_AGENDA, type AlquilerAgenda } from "./columnas-filtro-activos";

const dStr = (s: string) => formatDate(s);

/** Título arriba y embudo abajo, como en Adelantos › Lista. */
function Th({ f, id, children, className }: { f: ReturnType<typeof useFiltrosTabla<AlquilerAgenda>>; id: string; children: React.ReactNode; className?: string }) {
  return (
    <th className={className}>
      <span className={cn("inline-flex flex-col gap-1 [&>span]:ml-0", className?.includes("text-right") ? "items-end" : "items-start")}>
        {children}
        <FiltroEnCabecera id={id} f={f} compacto />
      </span>
    </th>
  );
}

// ── Calendario (agenda de alquileres) ───────────────────────────────────────
export default function CalendarView({ assets }: { assets: AssetStats[] }) {
  const [items, setItems] = useState<AlquilerAgenda[] | null>(null);
  useEffect(() => {
    if (assets.length === 0) { setItems([]); return; }
    Promise.all(assets.map(a => fetch(`/api/admin/assets/${a.id}/movements`, { credentials: "include" }).then(r => r.ok ? r.json() : { data: { incomes: [] } }).then(j => (j.data.incomes as IncomeMov[]).map(i => ({ ...i, assetName: a.name }))).catch(() => [])))
      .then(arr => setItems(arr.flat().sort((a, b) => ((a.startDate ?? a.date) < (b.startDate ?? b.date) ? 1 : -1))));
  }, [assets]);
  const f = useFiltrosTabla(items ?? [], COLUMNAS_AGENDA);

  if (items == null) return <Center><Loader2 className="h-4 w-4 animate-spin" /> Cargando agenda…</Center>;
  if (items.length === 0) return (
    <div className="rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] py-14 text-center">
      <span className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"><Calendar className="h-6 w-6" /></span>
      <p className="text-base font-extrabold text-[var(--text-primary)]">Sin alquileres aún</p>
      <p className="mt-1 text-sm text-[var(--text-tertiary)]">Registra alquileres con fecha de inicio/fin y aparecerán acá en orden.</p>
    </div>
  );
  const now = Date.now();
  return (
    <div className="space-y-2">
      <BarraFiltrosTabla f={f} />
      <DataTable>
        <thead className="[&_th]:align-top">
          <tr>
            <Th f={f} id="desde">Desde</Th>
            <Th f={f} id="maquina">Máquina</Th>
            <Th f={f} id="cliente" className="hidden sm:table-cell">Cliente</Th>
            <Th f={f} id="hasta" className="hidden sm:table-cell">Hasta</Th>
            <Th f={f} id="monto" className="text-right">Monto</Th>
          </tr>
        </thead>
        <tbody>
          {f.filtradas.length === 0 && <SinCoincidenciasFila colSpan={5} />}
          {f.filtradas.map(i => {
            const start = i.startDate ?? i.date;
            const active = i.startDate && i.endDate && new Date(i.startDate).getTime() <= now && new Date(i.endDate).getTime() >= now;
            return (
              <tr key={i.id}>
                <td className="whitespace-nowrap">{dStr(start)}</td>
                <td className="font-bold">{i.assetName}{active && <span className="ml-2 text-sm font-semibold text-[var(--accent-ink)]">· en uso</span>}</td>
                <td className="hidden sm:table-cell">{i.client ?? "Alquiler"}{!i.paid && <span className="text-[var(--data-warning-ink)]"> · pendiente</span>}</td>
                <td className="hidden whitespace-nowrap sm:table-cell">{i.startDate && i.endDate ? dStr(i.endDate) : "—"}</td>
                <td className="text-right font-bold tabular-nums">{fmt(i.amount)}</td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
    </div>
  );
}
