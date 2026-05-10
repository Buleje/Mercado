"use client";

import { useEffect, useState } from "react";
import { X, Sparkles, ChevronRight, FileText, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchTemplates, generateFromTemplate } from "@/hooks/use-documents";
import type { DbDocumentTemplate } from "@/lib/types/documents";

interface Props {
  onClose: () => void;
  onGenerated: () => void;
}

export function TemplateGenerator({ onClose, onGenerated }: Props) {
  const [templates, setTemplates] = useState<DbDocumentTemplate[]>([]);
  const [selected, setSelected] = useState<DbDocumentTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplates().then((t) => { setTemplates(t); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function setField(name: string, v: string) {
    setValues((prev) => ({ ...prev, [name]: v }));
  }

  async function handleGenerate() {
    if (!selected) return;

    // Validar required
    for (const f of selected.fields) {
      if (f.required && !values[f.name]) {
        alert(`Faltan datos: ${f.label}`);
        return;
      }
    }

    setGenerating(true);
    try {
      const doc = await generateFromTemplate({
        templateKey: selected.key,
        values: values,
        filename: `${selected.key}-${Date.now()}.pdf`,
      });
      setSuccess(doc.name);
      setTimeout(() => {
        onGenerated();
      }, 1200);
    } catch (e) {
      alert("Error generando: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl max-h-[90vh] overflow-hidden bg-white rounded-3xl shadow-2xl flex flex-col"
      >
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
              <Sparkles className="h-5 w-5 text-violet-600" />
            </span>
            <div>
              <p className="text-base font-extrabold text-slate-900">Generador de plantillas</p>
              <p className="text-xs text-slate-500">Contratos, recibos, cotizaciones y acuerdos listos en 1 minuto.</p>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 inline-flex items-center justify-center rounded-full bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-900">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-[280px_1fr] min-h-0">
          {/* Sidebar plantillas */}
          <aside className="border-r border-slate-200 overflow-y-auto p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-3 py-2">Plantillas del sistema</p>
            {loading ? (
              <p className="text-sm text-slate-500 px-3 py-2">Cargando…</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-slate-500 px-3 py-2">Sin plantillas. Reabrí el módulo.</p>
            ) : (
              <ul className="space-y-1">
                {templates.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => { setSelected(t); setValues({}); setSuccess(null); }}
                      className={cn(
                        "w-full text-left px-3 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-2",
                        selected?.id === t.id ? "bg-primary/10 text-primary" : "text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      <FileText className={cn("h-4 w-4 shrink-0", selected?.id === t.id ? "text-primary" : "text-slate-400")} />
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{t.name}</p>
                        <p className="text-[11px] font-normal text-slate-500 truncate">{t.description}</p>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          {/* Form */}
          <div className="overflow-y-auto p-5 bg-slate-50">
            {!selected ? (
              <div className="h-full flex items-center justify-center text-center text-slate-500 text-sm py-20">
                <div>
                  <FileText className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                  Elegí una plantilla para empezar.
                </div>
              </div>
            ) : success ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white mb-3">
                  <Check className="h-7 w-7" />
                </span>
                <p className="text-lg font-extrabold text-emerald-900">¡Documento generado!</p>
                <p className="text-sm text-emerald-700 mt-1">{success}</p>
                <p className="text-xs text-emerald-600 mt-2">Ya aparece en tu lista de documentos.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <p className="text-base font-extrabold text-slate-900">{selected.name}</p>
                {selected.description && <p className="text-xs text-slate-500 mt-0.5">{selected.description}</p>}

                <div className="mt-4 space-y-3">
                  {selected.fields.map((f) => (
                    <label key={f.name} className="block">
                      <span className="text-xs font-bold text-slate-700">
                        {f.label}
                        {f.required && <span className="text-red-500"> *</span>}
                      </span>
                      {f.type === "textarea" ? (
                        <textarea
                          value={values[f.name] ?? ""}
                          onChange={(e) => setField(f.name, e.target.value)}
                          placeholder={f.placeholder ?? ""}
                          rows={3}
                          className="mt-1 w-full px-3 py-2 rounded-lg border-2 border-slate-200 text-sm outline-none focus:border-primary"
                        />
                      ) : (
                        <input
                          type={f.type === "date" ? "date" : f.type === "number" || f.type === "currency" ? "number" : "text"}
                          step={f.type === "currency" ? "0.01" : undefined}
                          value={values[f.name] ?? ""}
                          onChange={(e) => setField(f.name, e.target.value)}
                          placeholder={f.placeholder ?? ""}
                          className="mt-1 w-full px-3 py-2 rounded-lg border-2 border-slate-200 text-sm outline-none focus:border-primary"
                        />
                      )}
                    </label>
                  ))}
                </div>

                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="mt-5 w-full py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {generating ? (
                    <>
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Generando PDF…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" /> Generar documento
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
