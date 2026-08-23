"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Sparkles, ChevronRight, FileText, Check, User, Search, MessageCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { fetchTemplates, generateFromTemplate } from "@/hooks/use-documents";
import type { DbDocument, DbDocumentTemplate } from "@/lib/types/documents";
import { SendWhatsAppModal } from "./SendWhatsAppModal";

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
  /** El documento recién generado: se puede mandar sin salir de acá. */
  const [generado, setGenerado] = useState<DbDocument | null>(null);
  const [enviando, setEnviando] = useState(false);
  /** Clientes del negocio, para no tipear el nombre y el DNI a mano. */
  const [clientes, setClientes] = useState<{ nombre: string; telefono: string; documento?: string; direccion?: string }[]>([]);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [telefonoCliente, setTelefonoCliente] = useState("");

  useEffect(() => {
    fetchTemplates().then((t) => { setTemplates(t); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  // Los datos del cliente ya están en el sistema: escribirlos otra vez es donde
  // aparecen los errores (un DNI mal tipeado en un contrato).
  useEffect(() => {
    fetch("/api/customers?limit=200", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { customers: [] }))
      .then((data: { customers?: Array<{ name?: string; phone?: string; documentNumber?: string; address?: string }> }) => {
        const arr = Array.isArray(data) ? data : data?.customers ?? [];
        setClientes(arr
          .filter((c) => c.phone)
          .map((c) => ({ nombre: c.name || c.phone || "Cliente", telefono: c.phone ?? "", documento: c.documentNumber, direccion: c.address })));
      })
      .catch(() => { /* sin clientes: se llena a mano, como antes */ });
  }, []);

  const clientesFiltrados = useMemo(() => {
    const q = buscaCliente.trim().toLowerCase();
    const base = q ? clientes.filter((c) => c.nombre.toLowerCase().includes(q) || c.telefono.includes(q)) : clientes;
    return base.slice(0, 8);
  }, [buscaCliente, clientes]);

  /**
   * Vuelca los datos del cliente en los campos que le corresponden.
   *
   * El match es por el NOMBRE del campo de la plantilla (cliente, arrendatario,
   * ruc, dni…): así sirve para las tres plantillas sin una tabla de mapeo por
   * cada una.
   */
  function usarCliente(c: { nombre: string; telefono: string; documento?: string; direccion?: string }) {
    if (!selected) return;
    const next: Record<string, string> = { ...values };
    for (const f of selected.fields) {
      const n = f.name.toLowerCase();
      if (/(cliente|arrendatario|pagador|destinatario)/.test(n) && !/dni|ruc/.test(n)) next[f.name] = c.nombre;
      else if (/(ruc|dni)/.test(n) && c.documento) next[f.name] = c.documento;
      else if (/direccion/.test(n) && c.direccion) next[f.name] = c.direccion;
      else if (/(telefono|celular)/.test(n)) next[f.name] = c.telefono;
    }
    setValues(next);
    setTelefonoCliente(c.telefono);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Al elegir una plantilla, las fechas arrancan en hoy (es lo que se pone). */
  function elegirPlantilla(t: DbDocumentTemplate) {
    setSelected(t);
    const hoy = new Date().toISOString().slice(0, 10);
    const iniciales: Record<string, string> = {};
    for (const f of t.fields) if (f.type === "date") iniciales[f.name] = hoy;
    setValues(iniciales);
  }

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
      setGenerado(doc);
      onGenerated();
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
        className="w-full max-w-5xl max-h-[90vh] overflow-hidden bg-white rounded-3xl shadow-[var(--shadow-xl)] flex flex-col"
      >
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
              <Sparkles className="h-5 w-5 text-[var(--accent)]" />
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
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] px-3 py-2">Plantillas del sistema</p>
            {loading ? (
              <p className="text-sm text-slate-500 px-3 py-2">Cargando…</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-slate-500 px-3 py-2">Sin plantillas. Reabrí el módulo.</p>
            ) : (
              <ul className="space-y-1">
                {templates.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => { elegirPlantilla(t); setSuccess(null); setGenerado(null); }}
                      className={cn(
                        "w-full text-left px-3 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-2",
                        selected?.id === t.id ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      <FileText className={cn("h-4 w-4 shrink-0", selected?.id === t.id ? "text-primary" : "text-slate-400")} />
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{t.name}</p>
                        <p className="text-[length:var(--ts-2xs)] font-normal text-[var(--text-tertiary)] truncate">{t.description}</p>
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
                {/* Generar y mandar es el mismo trámite: la cotización se hace
                    PARA mandarla. Va el PDF, no un enlace. */}
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  {generado && (
                    <button
                      onClick={() => setEnviando(true)}
                      className="inline-flex items-center gap-2 rounded-xl bg-[var(--data-success-700)] px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 dark:bg-[var(--data-success-500)]"
                    >
                      <MessageCircle className="h-4 w-4" /> Mandarlo por WhatsApp
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="rounded-xl border-2 border-emerald-300 px-4 py-2.5 text-sm font-bold text-emerald-800 hover:bg-emerald-100"
                  >
                    Listo
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <p className="text-base font-extrabold text-slate-900">{selected.name}</p>
                {selected.description && <p className="text-xs text-slate-500 mt-0.5">{selected.description}</p>}

                {/* Traer al cliente del sistema en vez de tipearlo: menos errores
                    en el DNI y el teléfono queda listo para mandarlo. */}
                {clientes.length > 0 && (
                  <div className="mt-4 rounded-xl border-2 border-slate-200 bg-slate-50 p-3">
                    <p className="mb-1.5 text-xs font-bold text-slate-700">Traer datos de un cliente</p>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        value={buscaCliente}
                        onChange={(e) => setBuscaCliente(e.target.value)}
                        placeholder="Buscar cliente…"
                        aria-label="Buscar cliente"
                        className="w-full rounded-lg border-2 border-slate-200 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-primary"
                      />
                    </div>
                    {buscaCliente.trim() !== "" && (
                      <ul className="mt-1.5 max-h-36 space-y-0.5 overflow-y-auto">
                        {clientesFiltrados.map((c) => (
                          <li key={c.telefono}>
                            <button
                              type="button"
                              onClick={() => { usarCliente(c); setBuscaCliente(""); }}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white"
                            >
                              <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                              <span className="min-w-0 flex-1 truncate font-bold text-slate-700">{c.nombre}</span>
                              <span className="shrink-0 text-xs tabular-nums text-slate-500">{c.telefono}</span>
                            </button>
                          </li>
                        ))}
                        {clientesFiltrados.length === 0 && (
                          <li className="px-2 py-2 text-center text-xs italic text-slate-500">Sin coincidencias.</li>
                        )}
                      </ul>
                    )}
                  </div>
                )}

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

      {/* El envío se monta encima: al cerrarlo se vuelve al generador. */}
      {enviando && generado && (
        <SendWhatsAppModal docs={[generado]} telefono={telefonoCliente} onClose={() => setEnviando(false)} />
      )}
    </div>
  );
}
