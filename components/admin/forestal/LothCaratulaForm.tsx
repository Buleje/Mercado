"use client";

/**
 * LothCaratulaForm — Carátula del libro LO-TH (Anexo 1 RDE 264-2019, ADR-125).
 * Crea o edita los datos del titular / documento de gestión / tomo.
 */

import { useState } from "react";
import { FileText, Loader2, X, AlertTriangle, Check, AlertCircle } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";

interface Caratula {
  id: string;
  registroNumber: string | null;
  tomo: string | null;
  titularName: string;
  representanteLegal?: string | null;
  tituloHabilitante: string | null;
  ruc?: string | null;
  dni?: string | null;
  domicilio?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  telefono?: string | null;
  email?: string | null;
  docGestionType?: string | null;
  docGestionName?: string | null;
  resolucionNumber?: string | null;
}

interface Props {
  current: Caratula | null;
  onClose: () => void;
  onSaved: () => void;
}

const REGIONS_PE = ["Loreto", "Ucayali", "Madre de Dios", "San Martín", "Junín", "Pasco", "Huánuco", "Amazonas", "Cusco", "Otra"];

export default function LothCaratulaForm({ current, onClose, onSaved }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    registroNumber: current?.registroNumber ?? "",
    tomo: current?.tomo ?? "",
    titularName: current?.titularName ?? "",
    representanteLegal: current?.representanteLegal ?? "",
    tituloHabilitante: current?.tituloHabilitante ?? "",
    ruc: current?.ruc ?? "",
    dni: current?.dni ?? "",
    domicilio: current?.domicilio ?? "",
    departamento: current?.departamento ?? "Ucayali",
    provincia: current?.provincia ?? "",
    distrito: current?.distrito ?? "",
    telefono: current?.telefono ?? "",
    email: current?.email ?? "",
    docGestionType: current?.docGestionType ?? "PO",
    docGestionName: current?.docGestionName ?? "",
    resolucionNumber: current?.resolucionNumber ?? "",
  });

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const isValid = f.titularName.trim().length >= 2;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !isValid) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(f)) body[k] = typeof v === "string" && v.trim() === "" ? null : v;
      body.titularName = f.titularName.trim();

      const res = await fetch("/api/admin/forestal/loth/caratula", {
        method: current ? "PATCH" : "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(current ? { id: current.id, ...body } : body),
      });
      if (!res.ok) {
        const r = await res.json().catch(() => ({}));
        throw new Error(r.message ?? (r.issues && r.issues[0]?.message) ?? r.error ?? `HTTP ${res.status}`);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <AdminModal open onClose={onClose} variant="wide" hideCloseButton className="sm:max-w-[1200px]">
      <div className="flex h-full max-h-[92vh] flex-col bg-[var(--surface-raised)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rule-base)] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--data-success-100)] text-[var(--data-success-700)]">
              <FileText className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <CardTitle as="h2" className="truncate text-base font-bold text-[var(--text-primary)]">Carátula del libro</CardTitle>
              <p className="truncate text-xs text-[var(--text-tertiary)]">Datos del titular y documento de gestión (Anexo 1 SERFOR)</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="shrink-0 rounded-lg p-2 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
        <form id="loth-caratula-form" onSubmit={submit} className="min-w-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:grid sm:grid-cols-2 sm:gap-x-5 sm:gap-y-4 sm:content-start [&>*]:min-w-0 max-sm:space-y-4">
          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)] sm:col-span-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{error}</div>
            </div>
          )}

          <Field label="Titular del título habilitante" required>
            <input type="text" value={f.titularName} onChange={(e) => set("titularName", e.target.value)} placeholder="Maderera El Aguajal SAC" required className={cls.input} />
          </Field>
          <Field label="Representante legal" hint="Si el titular es persona jurídica">
            <input type="text" value={f.representanteLegal} onChange={(e) => set("representanteLegal", e.target.value)} placeholder="Pedro Rinconada Pariachi" className={cls.input} />
          </Field>

          <div className="grid grid-cols-2 gap-3 sm:col-span-2">
            <Field label="RUC"><input type="text" value={f.ruc} onChange={(e) => set("ruc", e.target.value)} placeholder="20XXXXXXXXX" className={cls.input} /></Field>
            <Field label="DNI (rep. legal)"><input type="text" value={f.dni} onChange={(e) => set("dni", e.target.value)} placeholder="05040151" className={cls.input} /></Field>
          </div>

          <Field label="N° de título habilitante"><input type="text" value={f.tituloHabilitante} onChange={(e) => set("tituloHabilitante", e.target.value)} placeholder="17-CPO/C-J-001-02" className={cls.input} /></Field>

          <div className="grid grid-cols-2 gap-3 sm:col-span-2">
            <Field label="N° de registro del libro" hint="Otorgado por la ARFFS"><input type="text" value={f.registroNumber} onChange={(e) => set("registroNumber", e.target.value)} placeholder="001-GOREU-..." className={cls.input} /></Field>
            <Field label="N° de tomo"><input type="text" value={f.tomo} onChange={(e) => set("tomo", e.target.value)} placeholder="PO 12 - Tomo I" className={cls.input} /></Field>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:col-span-2">
            <Field label="Documento de gestión">
              <select value={f.docGestionType} onChange={(e) => set("docGestionType", e.target.value)} className={cls.input}>
                <option value="PO">PO</option>
                <option value="PMFI">PMFI</option>
                <option value="DEMA">DEMA</option>
              </select>
            </Field>
            <Field label="Nombre/periodo"><input type="text" value={f.docGestionName} onChange={(e) => set("docGestionName", e.target.value)} placeholder="Plan Operativo 2019-2020" className={cls.input} /></Field>
            <Field label="N° resolución"><input type="text" value={f.resolucionNumber} onChange={(e) => set("resolucionNumber", e.target.value)} placeholder="RDF N° 001-2019..." className={cls.input} /></Field>
          </div>

          <Field label="Domicilio"><input type="text" value={f.domicilio} onChange={(e) => set("domicilio", e.target.value)} placeholder="Coronel Portillo Km 15" className={cls.input} /></Field>

          <div className="grid grid-cols-3 gap-3 sm:col-span-2">
            <Field label="Departamento">
              <select value={f.departamento} onChange={(e) => set("departamento", e.target.value)} className={cls.input}>
                {REGIONS_PE.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Provincia"><input type="text" value={f.provincia} onChange={(e) => set("provincia", e.target.value)} placeholder="Coronel Portillo" className={cls.input} /></Field>
            <Field label="Distrito"><input type="text" value={f.distrito} onChange={(e) => set("distrito", e.target.value)} placeholder="Callería" className={cls.input} /></Field>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:col-span-2">
            <Field label="Teléfono"><input type="text" value={f.telefono} onChange={(e) => set("telefono", e.target.value)} placeholder="992696555" className={cls.input} /></Field>
            <Field label="Correo electrónico"><input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="titular@correo.com" className={cls.input} /></Field>
          </div>
        </form>

        {/* Panel derecho: vista previa en vivo (lg+) */}
        <aside className="hidden w-[300px] shrink-0 flex-col border-l border-[var(--rule-base)] bg-[var(--surface-canvas)] lg:flex">
          <div className="border-b border-[var(--rule-soft)] px-5 py-3.5">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Vista previa de la carátula</span>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <div className="mb-5">
              <CardTitle className="text-lg font-bold leading-tight text-[var(--text-primary)]">{f.titularName.trim() || "Titular sin nombre"}</CardTitle>
              {f.representanteLegal.trim() && <p className="mt-0.5 text-xs italic text-[var(--text-tertiary)]">Rep. legal: {f.representanteLegal.trim()}</p>}
            </div>
            <div className="mb-5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
              <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Documento de gestión</div>
              <div className="mt-1 text-lg font-bold text-[var(--text-primary)]">{f.docGestionType}</div>
              {f.docGestionName.trim() && <div className="mt-0.5 text-xs text-[var(--text-tertiary)]">{f.docGestionName.trim()}</div>}
            </div>
            <dl className="space-y-2.5">
              <PreviewRow label="RUC" value={f.ruc.trim() || "—"} mono />
              <PreviewRow label="Título habilitante" value={f.tituloHabilitante.trim() || "—"} mono />
              <PreviewRow label="Registro del libro" value={f.registroNumber.trim() || "—"} mono />
              <PreviewRow label="Tomo" value={f.tomo.trim() || "—"} />
              <PreviewRow label="Departamento" value={f.departamento || "—"} />
              <PreviewRow label="Provincia" value={f.provincia.trim() || "—"} />
              <PreviewRow label="Distrito" value={f.distrito.trim() || "—"} />
            </dl>
          </div>
          <div className="border-t border-[var(--rule-soft)] px-5 py-4">
            {isValid ? (
              <div className="flex items-center gap-2 rounded-lg bg-[var(--data-success-50)] px-3 py-2 text-sm font-medium text-[var(--data-success-700)]"><Check className="h-4 w-4 shrink-0" /> Listo para {current ? "actualizar" : "crear"}</div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-[var(--data-warning-50)] px-3 py-2 text-sm font-medium text-[var(--data-warning-700)]"><AlertCircle className="h-4 w-4 shrink-0" /> Completá el titular</div>
            )}
          </div>
        </aside>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3.5 sm:px-6">
          <button type="button" onClick={onClose} disabled={submitting} className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]">
            Cancelar
          </button>
          <button type="submit" form="loth-caratula-form" disabled={!isValid || submitting} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--data-success-700)] px-4 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
            {submitting ? (<><Loader2 className="h-4 w-4 animate-spin" />Guardando</>) : current ? "Actualizar carátula" : "Crear carátula"}
          </button>
        </footer>
      </div>
    </AdminModal>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-sm font-medium text-[var(--text-primary)]">
        {label}
        {required && <span className="text-[var(--data-error-600)]">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--text-tertiary)]">{hint}</span>}
    </label>
  );
}

function PreviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-[var(--text-tertiary)]">{label}</dt>
      <dd className={`min-w-0 truncate text-right text-sm font-medium text-[var(--text-primary)] ${mono ? "font-mono tabular-nums" : ""}`}>{value}</dd>
    </div>
  );
}

const cls = {
  input:
    "w-full h-10 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--data-success-600)] focus:ring-1 focus:ring-[var(--data-success-600)]/20 placeholder:text-[var(--text-tertiary)]",
};
