"use client";

import { useState } from "react";
import { FileBarChart, Plus, Check, Clock, Send, Calendar, Mail, Trash2, Pencil, Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

type Report = {
  id: string; name: string; description: string; modules: string[]; format: "PDF" | "Excel" | "CSV";
  schedule: "diario" | "semanal" | "mensual" | "manual"; recipients: string[];
  lastGenerated: string | null; nextRun: string | null; active: boolean; runCount: number;
};

const SEED: Report[] = [];

const SCHEDULE_LABELS: Record<string, string> = { diario: "Diario", semanal: "Semanal", mensual: "Mensual", manual: "Manual" };

function fmtDate(iso: string | null) { return iso ? new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"; }

export default function AutoReportsTab() {
  const [reports, setReports] = useState(SEED);
  const [showModal, setShowModal] = useState(false);
  const [editReport, setEditReport] = useState<Report | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formFormat, setFormFormat] = useState<"PDF" | "Excel" | "CSV">("PDF");
  const [formSchedule, setFormSchedule] = useState<"diario" | "semanal" | "mensual" | "manual">("semanal");
  const [formRecipients, setFormRecipients] = useState("");

  const openCreate = () => { setEditReport(null); setFormName(""); setFormDesc(""); setFormFormat("PDF"); setFormSchedule("semanal"); setFormRecipients(""); setShowModal(true); };
  const openEdit = (r: Report) => { setEditReport(r); setFormName(r.name); setFormDesc(r.description); setFormFormat(r.format); setFormSchedule(r.schedule); setFormRecipients(r.recipients.join(", ")); setShowModal(true); };

  const save = () => {
    if (!formName.trim()) return;
    const recipients = formRecipients.split(",").map(r => r.trim()).filter(Boolean);
    if (editReport) {
      setReports(prev => prev.map(r => r.id === editReport.id ? { ...r, name: formName, description: formDesc, format: formFormat, schedule: formSchedule, recipients } : r));
    } else {
      setReports(prev => [...prev, { id: `r${Date.now()}`, name: formName, description: formDesc, modules: [], format: formFormat, schedule: formSchedule, recipients, lastGenerated: null, nextRun: null, active: true, runCount: 0 }]);
    }
    setShowModal(false);
  };

  const activeCount = reports.filter(r => r.active).length;

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2"><FileBarChart className="h-6 w-6 text-primary" /> Reportes Automáticos</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Programa reportes que se generan y envían automáticamente</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90"><Plus className="h-4 w-4" /> Nuevo reporte</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Reportes configurados", value: reports.length, color: "text-blue-500" },
          { label: "Activos", value: activeCount, color: "text-emerald-500" },
          { label: "Total generados", value: reports.reduce((s, r) => s + r.runCount, 0), color: "text-violet-500" },
          { label: "Destinatarios únicos", value: new Set(reports.flatMap(r => r.recipients)).size, color: "text-amber-500" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-muted">{k.label}</p>
            <p className={cn("text-xl sm:text-2xl font-extrabold", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {reports.map(r => (
          <div key={r.id} className={cn("bg-white dark:bg-card rounded-2xl border p-3 sm:p-5 transition-opacity", r.active ? "border-gray-200 dark:border-card-border" : "border-gray-200 dark:border-card-border opacity-60")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-bold text-gray-900 dark:text-foreground">{r.name}</h3>
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", r.format === "PDF" ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" : r.format === "Excel" ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400")}>{r.format}</span>
                  <span className="text-[10px] font-bold bg-gray-100 dark:bg-surface text-gray-500 dark:text-muted px-2 py-0.5 rounded-full">{SCHEDULE_LABELS[r.schedule]}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-muted mb-2">{r.description}</p>
                <div className="flex items-center gap-2 sm:gap-4 text-[10px] text-gray-400 flex-wrap">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Último: {fmtDate(r.lastGenerated)}</span>
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Próximo: {fmtDate(r.nextRun)}</span>
                  <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {r.recipients.join(", ")}</span>
                  <span className="flex items-center gap-1"><Send className="h-3 w-3" /> Generados: {r.runCount}</span>
                </div>
                {r.modules.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {r.modules.map(m => <span key={m} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">{m}</span>)}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setReports(prev => prev.map(x => x.id === r.id ? { ...x, active: !x.active } : x))} className={cn("p-1.5 rounded-lg", r.active ? "text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/20" : "text-gray-400 hover:bg-gray-100 dark:hover:bg-accent")} title={r.active ? "Pausar" : "Activar"}>
                  {r.active ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </button>
                <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent text-gray-400 hover:text-primary"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => setReports(prev => prev.filter(x => x.id !== r.id))} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl p-3 sm:p-6 max-w-lg w-full mx-4 border border-gray-200 dark:border-card-border" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-extrabold text-gray-900 dark:text-foreground mb-4">{editReport ? "Editar reporte" : "Nuevo reporte"}</h3>
            <div className="space-y-3">
              <div><label className="text-xs font-bold text-gray-500 dark:text-muted">Nombre</label><input value={formName} onChange={e => setFormName(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" /></div>
              <div><label className="text-xs font-bold text-gray-500 dark:text-muted">Descripción</label><input value={formDesc} onChange={e => setFormDesc(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-xs font-bold text-gray-500 dark:text-muted">Formato</label><select value={formFormat} onChange={e => setFormFormat(e.target.value as Report["format"])} className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm"><option>PDF</option><option>Excel</option><option>CSV</option></select></div>
                <div><label className="text-xs font-bold text-gray-500 dark:text-muted">Frecuencia</label><select value={formSchedule} onChange={e => setFormSchedule(e.target.value as Report["schedule"])} className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm"><option value="diario">Diario</option><option value="semanal">Semanal</option><option value="mensual">Mensual</option><option value="manual">Manual</option></select></div>
              </div>
              <div><label className="text-xs font-bold text-gray-500 dark:text-muted">Destinatarios (separados por coma)</label><input value={formRecipients} onChange={e => setFormRecipients(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" placeholder="email1@example.com, email2@example.com" /></div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-accent">Cancelar</button>
              <button onClick={save} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90"><Check className="h-4 w-4 inline mr-1" />Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
