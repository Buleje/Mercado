"use client";

import { useState, useMemo } from "react";
import { Scale, FileText, AlertTriangle, CheckCircle, Clock, Calendar, Download, Search, Building2 } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

type Obligation = {
  id: string; title: string; entity: string; frequency: string; nextDue: string;
  status: "al-dia" | "pendiente" | "vencido" | "proximo"; lastFiled: string | null;
  description: string; documents: string[];
};

const SEED: Obligation[] = [];

const STATUS_CONFIG = {
  "al-dia": { label: "Al día", icon: CheckCircle, color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  pendiente: { label: "Pendiente", icon: Clock, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  vencido: { label: "Vencido", icon: AlertTriangle, color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  proximo: { label: "Próximo vencimiento", icon: Calendar, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
};

function fmtDate(iso: string | null) { return iso && iso !== "—" ? new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) : "—"; }

export default function ComplianceTab() {
  const [obligations] = useState(SEED);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let list = obligations;
    if (filterStatus !== "all") list = list.filter(o => o.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o => o.title.toLowerCase().includes(q) || o.entity.toLowerCase().includes(q));
    }
    return list;
  }, [obligations, filterStatus, search]);

  const alDia = obligations.filter(o => o.status === "al-dia").length;
  const pendientes = obligations.filter(o => o.status === "pendiente" || o.status === "proximo").length;
  const vencidos = obligations.filter(o => o.status === "vencido").length;

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2"><Scale className="h-6 w-6 text-primary" /> Cumplimiento SUNAT</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Control de obligaciones tributarias y regulatorias</p>
        </div>
        <button onClick={() => exportToCSV(filtered.map(o => ({ obligacion: o.title, entidad: o.entity, frecuencia: o.frequency, proximo_vencimiento: fmtDate(o.nextDue), estado: o.status, ultimo_presentado: fmtDate(o.lastFiled) })), "cumplimiento")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary hover:bg-primary/10"><Download className="h-3.5 w-3.5" /> CSV</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Obligaciones", value: obligations.length, color: "text-blue-500" },
          { label: "Al día", value: alDia, color: "text-emerald-500" },
          { label: "Pendientes / Próximos", value: pendientes, color: "text-amber-500" },
          { label: "Vencidos", value: vencidos, color: vencidos > 0 ? "text-red-500" : "text-gray-400" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-muted">{k.label}</p>
            <p className={cn("text-xl sm:text-2xl font-extrabold", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" placeholder="Buscar obligación…" />
        </div>
        <div className="flex items-center gap-1.5">
          {["all", "al-dia", "proximo", "pendiente", "vencido"].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} className={cn("px-2.5 py-1 rounded-lg text-xs font-bold transition-colors", filterStatus === s ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>{s === "all" ? "Todos" : STATUS_CONFIG[s as keyof typeof STATUS_CONFIG].label}</button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map(o => {
          const S = STATUS_CONFIG[o.status];
          const SIcon = S.icon;
          return (
            <div key={o.id} className={cn("bg-white dark:bg-card rounded-2xl border p-3 sm:p-5", o.status === "vencido" ? "border-red-200 dark:border-red-900/30" : o.status === "proximo" ? "border-blue-200 dark:border-blue-900/30" : "border-gray-200 dark:border-card-border")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-bold text-gray-900 dark:text-foreground">{o.title}</h3>
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5", S.color)}><SIcon className="h-2.5 w-2.5" /> {S.label}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-muted mb-2">{o.description}</p>
                  <div className="flex items-center gap-2 sm:gap-4 text-[10px] text-gray-400 flex-wrap">
                    <span className="flex items-center gap-0.5"><Building2 className="h-2.5 w-2.5" />{o.entity}</span>
                    <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{o.frequency}</span>
                    <span>Próx. vencimiento: <b className="text-gray-600 dark:text-muted">{fmtDate(o.nextDue)}</b></span>
                    <span>Último: {fmtDate(o.lastFiled)}</span>
                  </div>
                  {o.documents.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {o.documents.map(d => (
                        <span key={d} className="text-[10px] bg-gray-50 dark:bg-surface text-gray-500 dark:text-muted px-2 py-0.5 rounded flex items-center gap-0.5"><FileText className="h-2.5 w-2.5" />{d}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
