"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
import { Field } from '@/components/admin/shared/Field';

import { useState } from "react";
import { FileBarChart, Plus, Check, Clock, Send, Calendar, Mail, Trash2, Pencil, Play, Pause } from "@buleje/design-system/icons";
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
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2"><FileBarChart className="h-6 w-6 text-primary" /> Reportes Automáticos</SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Programa reportes que se generan y envían automáticamente</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold bg-primary text-white hover:bg-primary/90"><Plus className="h-4 w-4" /> Nuevo reporte</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Reportes configurados", value: reports.length, color: "text-[var(--data-success-500)]" },
          { label: "Activos", value: activeCount, color: "text-[var(--data-success-500)]" },
          { label: "Total generados", value: reports.reduce((s, r) => s + r.runCount, 0), color: "text-[var(--text-secondary)]" },
          { label: "Destinatarios únicos", value: new Set(reports.flatMap(r => r.recipients)).size, color: "text-[var(--data-warning-500)]" },
        ].map(k => (
          <div key={k.label} className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-4">
            <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">{k.label}</p>
            <p className={cn("text-xl sm:text-2xl font-extrabold", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {reports.map(r => (
          <div key={r.id} className={cn("bg-[var(--surface-raised)] rounded-xl border p-3 sm:p-5 transition-opacity", r.active ? "border-[var(--rule-base)] dark:border-[var(--rule-base)]" : "border-[var(--rule-base)] dark:border-[var(--rule-base)] opacity-60")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <CardTitle className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{r.name}</CardTitle>
                  <span className={cn("text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full", r.format === "PDF" ? "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30 dark:text-[var(--data-error-500)]" : r.format === "Excel" ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:bg-primary/15 dark:text-[var(--data-success-500)]" : "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:bg-primary/15 dark:text-[var(--data-success-500)]")}>{r.format}</span>
                  <span className="text-[length:var(--ts-2xs)] font-bold bg-[var(--surface-sunken)] dark:bg-surface text-[var(--text-secondary)] dark:text-muted px-2 py-0.5 rounded-full">{SCHEDULE_LABELS[r.schedule]}</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted mb-2">{r.description}</p>
                <div className="flex items-center gap-2 sm:gap-4 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] flex-wrap">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Último: {fmtDate(r.lastGenerated)}</span>
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Próximo: {fmtDate(r.nextRun)}</span>
                  <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {r.recipients.join(", ")}</span>
                  <span className="flex items-center gap-1"><Send className="h-3 w-3" /> Generados: {r.runCount}</span>
                </div>
                {r.modules.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {r.modules.map(m => <span key={m} className="text-[length:var(--ts-2xs)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] px-1.5 py-0.5 rounded font-semibold">{m}</span>)}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setReports(prev => prev.map(x => x.id === r.id ? { ...x, active: !x.active } : x))} className={cn("p-1.5 rounded-lg", r.active ? "text-[var(--data-success-500)] hover:bg-primary/10 dark:hover:bg-primary/15" : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] dark:hover:bg-accent")} title={r.active ? "Pausar" : "Activar"}>
                  {r.active ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </button>
                <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-accent text-[var(--text-tertiary)] hover:text-primary"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => setReports(prev => prev.filter(x => x.id !== r.id))} className="p-1.5 rounded-lg hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20 text-[var(--text-tertiary)] hover:text-[var(--data-error-500)]"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="modal-backdrop p-4" onClick={() => setShowModal(false)}>
          <div className="bg-[var(--surface-raised)] rounded-xl p-3 sm:p-6 max-w-lg w-full mx-4 border border-[var(--rule-base)] dark:border-[var(--rule-base)]" onClick={e => e.stopPropagation()}>
            <CardTitle className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-4">{editReport ? "Editar reporte" : "Nuevo reporte"}</CardTitle>
            <div className="space-y-3">
              <Field label="Nombre" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted"><input value={formName} onChange={e => setFormName(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm" /></Field>
              <Field label="Descripción" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted"><input value={formDesc} onChange={e => setFormDesc(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm" /></Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Formato" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted"><select value={formFormat} onChange={e => setFormFormat(e.target.value as Report["format"])} className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm"><option>PDF</option><option>Excel</option><option>CSV</option></select></Field>
                <Field label="Frecuencia" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted"><select value={formSchedule} onChange={e => setFormSchedule(e.target.value as Report["schedule"])} className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm"><option value="diario">Diario</option><option value="semanal">Semanal</option><option value="mensual">Mensual</option><option value="manual">Manual</option></select></Field>
              </div>
              <Field label="Destinatarios (separados por coma)" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted"><input value={formRecipients} onChange={e => setFormRecipients(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm" placeholder="email1@example.com, email2@example.com" /></Field>
            </div>
            <div className="flex flex-wrap justify-end gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] dark:hover:bg-accent">Cancelar</button>
              <button onClick={save} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold bg-primary text-white hover:bg-primary/90"><Check className="h-4 w-4 inline mr-1" />Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
