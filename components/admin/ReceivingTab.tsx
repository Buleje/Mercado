"use client";

import { useState, useMemo } from "react";
import {
  PackageCheck, Download, Search, Eye, X,
  Camera, AlertTriangle, CheckCircle2, XCircle,
  ScanLine, ClipboardList,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ReceptionStatus = "programada" | "en-proceso" | "aceptada" | "parcial" | "rechazada";

type ReceptionItem = {
  product: string;
  expectedQty: number;
  receivedQty: number;
  condition: "ok" | "dañado" | "vencido" | "faltante";
  notes: string;
};

type Reception = {
  id: string;
  ref: string;
  orderRef: string;
  supplier: string;
  scheduledDate: string;
  receivedDate?: string;
  status: ReceptionStatus;
  inspector: string;
  items: ReceptionItem[];
  photos: number;
  nonConformities: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<ReceptionStatus, { label: string; color: string; bg: string }> = {
  programada:  { label: "Programada",  color: "text-blue-600",    bg: "bg-blue-100 dark:bg-blue-900/30" },
  "en-proceso":{ label: "En proceso",  color: "text-amber-600",   bg: "bg-amber-100 dark:bg-amber-900/30" },
  aceptada:    { label: "Aceptada",    color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  parcial:     { label: "Parcial",     color: "text-orange-600",  bg: "bg-orange-100 dark:bg-orange-900/30" },
  rechazada:   { label: "Rechazada",   color: "text-red-600",     bg: "bg-red-100 dark:bg-red-900/30" },
};

const COND_MAP: Record<string, { label: string; color: string }> = {
  ok:       { label: "OK",       color: "text-emerald-600" },
  "dañado": { label: "Dañado",   color: "text-red-600" },
  vencido:  { label: "Vencido",  color: "text-orange-600" },
  faltante: { label: "Faltante", color: "text-amber-600" },
};

// ── Seed Data ─────────────────────────────────────────────────────────────────

const RECEPTIONS: Reception[] = [];

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReceivingTab() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<ReceptionStatus | "todos">("todos");
  const [detail, setDetail] = useState<Reception | null>(null);

  const stats = useMemo(() => {
    const scheduled = RECEPTIONS.filter(r => r.status === "programada").length;
    const inProgress = RECEPTIONS.filter(r => r.status === "en-proceso").length;
    const accepted = RECEPTIONS.filter(r => r.status === "aceptada").length;
    const totalNonConf = RECEPTIONS.reduce((s, r) => s + r.nonConformities, 0);
    return { scheduled, inProgress, accepted, totalNonConf };
  }, []);

  const filtered = useMemo(() => {
    let list = RECEPTIONS;
    if (filterStatus !== "todos") list = list.filter(r => r.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => r.supplier.toLowerCase().includes(q) || r.ref.toLowerCase().includes(q) || r.orderRef.toLowerCase().includes(q));
    }
    return list;
  }, [search, filterStatus]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
            <PackageCheck className="h-6 w-6 text-primary" /> Recepción & Verificación
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Control de calidad en recepción de mercadería</p>
        </div>
        <button onClick={() => exportToCSV(RECEPTIONS.map(r => ({ ref: r.ref, oc: r.orderRef, proveedor: r.supplier, programada: r.scheduledDate, recibida: r.receivedDate || "-", estado: STATUS_MAP[r.status].label, inspector: r.inspector, items: r.items.length, fotos: r.photos, no_conformidades: r.nonConformities })), "recepciones")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Programadas", value: String(stats.scheduled), color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30", icon: ClipboardList },
          { label: "En proceso", value: String(stats.inProgress), color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30", icon: ScanLine },
          { label: "Aceptadas", value: String(stats.accepted), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30", icon: CheckCircle2 },
          { label: "No conformidades", value: String(stats.totalNonConf), color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30", icon: AlertTriangle },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} className={cn("rounded-2xl p-4 flex items-start gap-3", bg)}>
            <Icon className={cn("h-5 w-5 mt-0.5", color)} />
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-muted">{label}</p>
              <p className={cn("text-xl font-extrabold", color)}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar proveedor, ref, OC..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)} className="px-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todos</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs font-bold text-gray-400 bg-gray-50 dark:bg-surface"><th className="px-4 py-3">Ref</th><th className="px-4 py-3">OC</th><th className="px-4 py-3">Proveedor</th><th className="px-4 py-3">Programada</th><th className="px-4 py-3">Recibida</th><th className="px-4 py-3">Inspector</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">📷</th><th className="px-4 py-3">NC</th><th className="px-4 py-3"></th></tr></thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-t border-gray-100 dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent/20">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-gray-700 dark:text-foreground">{r.ref}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.orderRef}</td>
                  <td className="px-4 py-3 font-bold text-gray-800 dark:text-foreground">{r.supplier}</td>
                  <td className="px-4 py-3 text-gray-500">{r.scheduledDate}</td>
                  <td className="px-4 py-3 text-gray-500">{r.receivedDate || "-"}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-muted">{r.inspector}</td>
                  <td className="px-4 py-3"><span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", STATUS_MAP[r.status].bg, STATUS_MAP[r.status].color)}>{STATUS_MAP[r.status].label}</span></td>
                  <td className="px-4 py-3 text-center text-gray-500">{r.photos > 0 && <span className="flex items-center gap-0.5 text-xs"><Camera className="h-3 w-3" />{r.photos}</span>}</td>
                  <td className="px-4 py-3">{r.nonConformities > 0 && <span className="bg-red-100 dark:bg-red-900/30 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">{r.nonConformities}</span>}</td>
                  <td className="px-4 py-3"><button onClick={() => setDetail(r)} className="text-primary hover:underline text-xs font-bold"><Eye className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal — Item Inspection */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-6 w-full max-w-2xl space-y-4 max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-foreground">{detail.ref}</h3>
                <p className="text-xs text-gray-400">OC: {detail.orderRef} · {detail.supplier} · Inspector: {detail.inspector}</p>
              </div>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-gray-400" /></button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs font-bold text-gray-400 bg-gray-50 dark:bg-surface"><th className="px-3 py-2">Producto</th><th className="px-3 py-2">Esperado</th><th className="px-3 py-2">Recibido</th><th className="px-3 py-2">Condición</th><th className="px-3 py-2">Notas</th></tr></thead>
                <tbody>
                  {detail.items.map((it, i) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-card-border">
                      <td className="px-3 py-2 font-bold text-gray-700 dark:text-foreground">{it.product}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-muted text-center">{it.expectedQty}</td>
                      <td className={cn("px-3 py-2 font-bold text-center", it.receivedQty < it.expectedQty ? "text-red-600" : "text-gray-800 dark:text-foreground")}>{it.receivedQty}</td>
                      <td className="px-3 py-2"><span className={cn("text-xs font-bold", COND_MAP[it.condition].color)}>{COND_MAP[it.condition].label}</span></td>
                      <td className="px-3 py-2 text-xs text-gray-400">{it.notes || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1"><Camera className="h-4 w-4" /> {detail.photos} fotos</span>
              {detail.nonConformities > 0 && <span className="flex items-center gap-1 text-red-500"><XCircle className="h-4 w-4" /> {detail.nonConformities} no conformidades</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
