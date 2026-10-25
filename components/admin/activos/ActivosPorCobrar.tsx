"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle, Clock, Loader2, MoreHorizontal } from "@buleje/design-system/icons";
import { DataTable } from "@buleje/design-system";
import { button } from "@/components/ui-system/button-variants";
import ActionMenu from "@/components/admin/shared/action-menu";
import { BarraFiltrosTabla, FiltroEnCabecera, SinCoincidenciasFila, useFiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import { formatDate } from "@/lib/format";
import { fmt, type Receivable } from "./tipos";
import { Center } from "./Centrado";
import { COLUMNAS_POR_COBRAR } from "./columnas-filtro-activos";

const dStr = (s: string) => formatDate(s);

/** Título arriba y embudo abajo, como en Adelantos › Lista. */
function Th({ f, id, children, className }: { f: ReturnType<typeof useFiltrosTabla<Receivable>>; id: string; children: React.ReactNode; className?: string }) {
  return (
    <th className={className}>
      <span className={cn("inline-flex flex-col gap-1 [&>span]:ml-0", className?.includes("text-right") ? "items-end" : "items-start")}>
        {children}
        <FiltroEnCabecera id={id} f={f} compacto />
      </span>
    </th>
  );
}

// ── Cuentas por cobrar ──────────────────────────────────────────────────────
export default function ReceivablesView({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<Receivable[] | null>(null);
  const load = useCallback(() => {
    fetch("/api/admin/assets/receivables", { credentials: "include" }).then(r => r.ok ? r.json() : { data: [] }).then(j => setRows(j.data)).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  const f = useFiltrosTabla(rows ?? [], COLUMNAS_POR_COBRAR);

  const markPaid = async (r: Receivable) => {
    const res = await fetch("/api/admin/assets/receivables", { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify({ incomeId: r.id, paid: true }) });
    if (res.ok) { toast.success("Marcado como cobrado"); load(); onChanged(); } else toast.error("No se pudo");
  };
  const remind = (r: Receivable) => {
    const msg = `Hola${r.client ? ` ${r.client}` : ""}, te recuerdo el pago pendiente del alquiler de *${r.assetName}* por ${fmt(r.amount)}${r.dueDate ? ` (vence ${dStr(r.dueDate)})` : ""}. ¡Gracias!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  if (rows == null) return <Center><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</Center>;
  if (rows.length === 0) return (
    <div className="rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] py-14 text-center">
      <span className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"><CheckCircle className="h-6 w-6" /></span>
      <p className="text-base font-extrabold text-[var(--text-primary)]">Todo cobrado</p>
      <p className="mt-1 text-sm text-[var(--text-tertiary)]">No tienes alquileres pendientes de pago.</p>
    </div>
  );
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const overdue = (r: Receivable) => r.dueDate && new Date(r.dueDate).getTime() < Date.now();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-xl bg-[var(--data-warning-100)] px-4 py-2.5 dark:bg-amber-950/20"><span className="text-sm font-bold text-[var(--text-secondary)]">Total por cobrar ({rows.length})</span><span className="font-mono text-lg font-bold tabular-nums text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]">{fmt(total)}</span></div>
      <BarraFiltrosTabla f={f} />
      <DataTable>
        <thead className="[&_th]:align-top">
          <tr>
            <Th f={f} id="cliente">Cliente</Th>
            <Th f={f} id="maquina" className="hidden sm:table-cell">Máquina</Th>
            <Th f={f} id="fecha">Fecha</Th>
            <Th f={f} id="monto" className="text-right">Monto</Th>
            <th className="w-40 text-right"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {f.filtradas.length === 0 && <SinCoincidenciasFila colSpan={5} />}
          {f.filtradas.map(r => (
            <tr key={r.id}>
              <td className="font-bold">{r.client ?? "Cliente"}</td>
              <td className="hidden sm:table-cell">{r.assetName}</td>
              <td>
                {dStr(r.date)}
                {r.dueDate && <span className={cn("ml-1", overdue(r) ? "font-bold text-[var(--data-error-ink)]" : undefined)}>· vence {dStr(r.dueDate)}{overdue(r) ? " (vencido)" : ""}</span>}
              </td>
              <td className="text-right font-bold tabular-nums">{fmt(r.amount)}</td>
              <td className="text-right">
                <span className="inline-flex items-center gap-2">
                  <button type="button" onClick={() => markPaid(r)} className={button({ variant: "primary", className: "rounded-xl px-4" })}><CheckCircle className="h-4 w-4" aria-hidden /> Cobrado</button>
                  <ActionMenu
                    label={`Más de ${r.client ?? "este alquiler"}`}
                    icon={MoreHorizontal}
                    soloIcono
                    size="md"
                    className="w-12 shrink-0"
                    actions={[{ id: "recordar", label: "Recordar por WhatsApp", hint: "Le escribe el monto y la fecha", icon: Clock, onSelect: () => remind(r) }]}
                  />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
