"use client";

/**
 * CtpFichaEditor — Ficha legal del CTP (identidad SERFOR/ARFFS).
 *
 * Es el header legal que encabeza el certificado de trazabilidad, la GTF de
 * salida y el export del Libro de Operaciones. Sin estos datos, esos documentos
 * salen anónimos y no sirven ante un fiscalizador — por eso avisamos cuáles
 * faltan. Persiste vía /api/admin/forestal/ctp-ficha (KV, sin migración).
 */

import { useCallback, useEffect, useState } from "react";
import {
  Building2, Save, Plus, Trash2, Loader2, CheckCircle2, AlertCircle, Pencil, X as XIcon,
} from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { Field, I } from "./ctp-shared";
import {
  emptyCtpFicha, ctpFichaFaltantes, type CtpFicha, type CtpTituloHabilitante, type CtpCitesPermiso,
} from "@/lib/forestal/ctp-ficha-types";

const TITULO_TIPOS: { value: string; label: string }[] = [
  { value: "concesion", label: "Concesión forestal" },
  { value: "permiso", label: "Permiso forestal" },
  { value: "autorizacion", label: "Autorización" },
  { value: "plantacion", label: "Plantación registrada" },
  { value: "dema", label: "DEMA (declaración de manejo)" },
  { value: "predio", label: "Predio privado" },
  { value: "otro", label: "Otro" },
];
const tituloLabel = (t: string) => TITULO_TIPOS.find((x) => x.value === t)?.label ?? (t || "—");

const FIELD_LABELS: Partial<Record<keyof CtpFicha, string>> = {
  nombreCtp: "Nombre del CTP", codigoCtp: "Código de CTP", ruc: "RUC", razonSocial: "Razón social",
};

/** Estado de vigencia de un permiso CITES según su fecha de vencimiento. */
function permisoEstado(vencimiento: string): "vencido" | "por_vencer" | "vigente" | null {
  if (!vencimiento) return null;
  const v = new Date(`${vencimiento}T23:59:59`); // vence al final de ese día
  if (Number.isNaN(v.getTime())) return null;
  const dias = Math.floor((v.getTime() - Date.now()) / 86_400_000);
  if (dias < 0) return "vencido";
  if (dias <= 30) return "por_vencer";
  return "vigente";
}

export default function CtpFichaEditor() {
  const [ficha, setFicha] = useState<CtpFicha>(emptyCtpFicha());
  const [draft, setDraft] = useState<CtpFicha>(emptyCtpFicha());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp-ficha", { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      const f: CtpFicha = (await r.json()).ficha;
      setFicha(f); setDraft(f);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const set = <K extends keyof CtpFicha>(k: K, v: CtpFicha[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setTitulo = (i: number, patch: Partial<CtpTituloHabilitante>) =>
    setDraft((d) => ({ ...d, titulos: d.titulos.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));
  const addTitulo = () => setDraft((d) => ({ ...d, titulos: [...d.titulos, { tipo: "concesion", codigo: "", vencimiento: "" }] }));
  const removeTitulo = (i: number) => setDraft((d) => ({ ...d, titulos: d.titulos.filter((_, j) => j !== i) }));
  const setCites = (i: number, patch: Partial<CtpCitesPermiso>) =>
    setDraft((d) => ({ ...d, citesPermisos: d.citesPermisos.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const addCites = () => setDraft((d) => ({ ...d, citesPermisos: [...d.citesPermisos, { especie: "", numero: "", vencimiento: "" }] }));
  const removeCites = (i: number) => setDraft((d) => ({ ...d, citesPermisos: d.citesPermisos.filter((_, j) => j !== i) }));

  async function save() {
    setSaving(true); setError(null); setOk(false);
    try {
      const r = await fetch("/api/admin/forestal/ctp-ficha", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        credentials: "include",
        body: JSON.stringify(draft),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.issues?.[0]?.message ?? body.message ?? `HTTP ${r.status}`);
      setFicha(body.ficha); setDraft(body.ficha); setEditing(false); setOk(true);
      setTimeout(() => setOk(false), 2500);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  const faltantes = ctpFichaFaltantes(ficha);

  if (loading) return <div className="p-8 text-center text-[var(--text-tertiary)]"><Loader2 className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando ficha…</p></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-tertiary)] max-w-2xl">
          Identidad legal del Centro de Transformación Primaria ante <strong className="text-[var(--text-secondary)]">SERFOR / ARFFS</strong>. Encabeza el certificado de trazabilidad, la GTF de salida y el export del Libro de Operaciones.
        </p>
        {!editing && (
          <button type="button" onClick={() => { setDraft(ficha); setEditing(true); setError(null); }} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">
            <Pencil className="h-4 w-4" /> Editar ficha
          </button>
        )}
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}
      {ok && <div className="flex items-center gap-2 rounded-xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-50)] p-3 text-sm font-medium text-[var(--data-success-700)]"><CheckCircle2 className="h-5 w-5" /> Ficha guardada.</div>}
      {!editing && faltantes.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-4 text-sm text-[var(--data-warning-700)]">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div><strong>Ficha incompleta.</strong> Faltan datos que los documentos SERFOR necesitan: {faltantes.map((k) => FIELD_LABELS[k] ?? k).join(", ")}.</div>
        </div>
      )}

      {editing ? (
        <div className="space-y-5 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <Section title="Identidad del centro" icon={Building2}>
            <Field label="Nombre del CTP" required><input className={I} value={draft.nombreCtp} onChange={(e) => set("nombreCtp", e.target.value)} placeholder="Aserradero San Martín" /></Field>
            <Field label="Código de CTP" required hint="Asignado por la ARFFS"><input className={I} value={draft.codigoCtp} onChange={(e) => set("codigoCtp", e.target.value)} placeholder="CTP-25-000123" /></Field>
            <Field label="RUC" required hint="11 dígitos"><input className={I} value={draft.ruc} onChange={(e) => set("ruc", e.target.value.replace(/\D/g, "").slice(0, 11))} inputMode="numeric" placeholder="20512345678" /></Field>
            <Field label="Razón social" required><input className={I} value={draft.razonSocial} onChange={(e) => set("razonSocial", e.target.value)} placeholder="Maderera San Martín S.A.C." /></Field>
          </Section>

          <Section title="Registro ante la autoridad forestal (ARFFS)" icon={CheckCircle2}>
            <Field label="ARFFS competente"><input className={I} value={draft.arffs} onChange={(e) => set("arffs", e.target.value)} placeholder="GORE Ucayali · DRSAFFS" /></Field>
            <Field label="N° de registro / constancia"><input className={I} value={draft.registroArffs} onChange={(e) => set("registroArffs", e.target.value)} /></Field>
            <Field label="Fecha de registro"><input type="date" className={I} value={draft.registroArffsFecha} onChange={(e) => set("registroArffsFecha", e.target.value)} /></Field>
            <Field label="Serie GTF autorizada" hint="Serie del talonario de GTF de salida"><input className={I} value={draft.gtfSerie} onChange={(e) => set("gtfSerie", e.target.value.toUpperCase().slice(0, 20))} placeholder="GTF-001" /></Field>
          </Section>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold text-[var(--text-primary)]">Títulos habilitantes (origen de la materia prima)</span>
              <button type="button" onClick={addTitulo} className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"><Plus className="h-3.5 w-3.5" /> Agregar</button>
            </div>
            <div className="space-y-2">
              {draft.titulos.length === 0 && <p className="text-xs text-[var(--text-tertiary)]">Sin títulos cargados. Agregá las concesiones/permisos que abastecen el CTP.</p>}
              {draft.titulos.map((t, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select className={`${I} max-w-[13rem]`} value={t.tipo} onChange={(e) => setTitulo(i, { tipo: e.target.value })}>
                    {TITULO_TIPOS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <input className={`${I} min-w-[10rem] flex-1`} value={t.codigo} onChange={(e) => setTitulo(i, { codigo: e.target.value })} placeholder="N° del título habilitante" />
                  <input type="date" className={`${I} max-w-[10rem]`} value={t.vencimiento} onChange={(e) => setTitulo(i, { vencimiento: e.target.value })} title="Vencimiento" />
                  <button type="button" onClick={() => removeTitulo(i)} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border-2 border-[var(--rule-base)] text-[var(--data-error-600)] hover:bg-[var(--data-error-50)]"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold text-[var(--text-primary)]">Permisos CITES (especies protegidas)</span>
              <button type="button" onClick={addCites} className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"><Plus className="h-3.5 w-3.5" /> Agregar</button>
            </div>
            <div className="space-y-2">
              {draft.citesPermisos.length === 0 && <p className="text-xs text-[var(--text-tertiary)]">Sin permisos CITES. Si procesás caoba, cedro, shihuahuaco u otra especie CITES, cargá su permiso para tenerlo a mano ante un fiscalizador.</p>}
              {draft.citesPermisos.map((p, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <input className={`${I} min-w-[9rem] flex-1`} value={p.especie} onChange={(e) => setCites(i, { especie: e.target.value })} placeholder="Especie (ej. Shihuahuaco)" />
                  <input className={`${I} min-w-[9rem] flex-1`} value={p.numero} onChange={(e) => setCites(i, { numero: e.target.value })} placeholder="N° de permiso CITES" />
                  <input type="date" className={`${I} max-w-[10rem]`} value={p.vencimiento} onChange={(e) => setCites(i, { vencimiento: e.target.value })} title="Vencimiento" />
                  <button type="button" onClick={() => removeCites(i)} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border-2 border-[var(--rule-base)] text-[var(--data-error-600)] hover:bg-[var(--data-error-50)]"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </div>

          <Section title="Representante legal">
            <Field label="Nombre"><input className={I} value={draft.representante} onChange={(e) => set("representante", e.target.value)} /></Field>
            <Field label="DNI / CE"><input className={I} value={draft.representanteDni} onChange={(e) => set("representanteDni", e.target.value)} /></Field>
          </Section>

          <Section title="Ubicación y contacto">
            <Field label="Dirección"><input className={I} value={draft.direccion} onChange={(e) => set("direccion", e.target.value)} /></Field>
            <Field label="Región"><input className={I} value={draft.region} onChange={(e) => set("region", e.target.value)} placeholder="Ucayali" /></Field>
            <Field label="Provincia"><input className={I} value={draft.provincia} onChange={(e) => set("provincia", e.target.value)} /></Field>
            <Field label="Distrito"><input className={I} value={draft.distrito} onChange={(e) => set("distrito", e.target.value)} /></Field>
            <Field label="Teléfono"><input className={I} value={draft.telefono} onChange={(e) => set("telefono", e.target.value)} /></Field>
            <Field label="Email"><input className={I} value={draft.email} onChange={(e) => set("email", e.target.value)} type="email" /></Field>
          </Section>

          <div className="flex items-center justify-end gap-2 border-t-2 border-[var(--rule-soft)] pt-4">
            <button type="button" onClick={() => { setEditing(false); setDraft(ficha); setError(null); }} disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"><XIcon className="h-4 w-4" /> Cancelar</button>
            <button type="button" onClick={save} disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar ficha</button>
          </div>
        </div>
      ) : (
        <FichaReadView ficha={ficha} />
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon?: typeof Building2; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">{Icon && <Icon className="h-4 w-4 text-[var(--text-tertiary)]" />}<span className="text-sm font-bold text-[var(--text-primary)]">{title}</span></div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-[var(--rule-soft)] py-2 last:border-0">
      <span className="text-xs font-medium text-[var(--text-tertiary)]">{label}</span>
      <span className="text-sm text-[var(--text-primary)]">{value || "—"}</span>
    </div>
  );
}

function FichaReadView({ ficha: f }: { ficha: CtpFicha }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <CardTitle as="h3" className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Building2 className="h-4 w-4" /> Identidad del centro</CardTitle>
        <Row label="Nombre del CTP" value={f.nombreCtp} />
        <Row label="Código de CTP (ARFFS)" value={f.codigoCtp} />
        <Row label="RUC" value={f.ruc} />
        <Row label="Razón social" value={f.razonSocial} />
        <Row label="ARFFS competente" value={f.arffs} />
        <Row label="Registro ARFFS" value={[f.registroArffs, f.registroArffsFecha].filter(Boolean).join(" · ")} />
        <Row label="Serie GTF autorizada" value={f.gtfSerie} />
      </div>
      <div className="space-y-4">
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <CardTitle as="h3" className="mb-3 text-sm font-bold text-[var(--text-primary)]">Títulos habilitantes</CardTitle>
          {f.titulos.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">Sin títulos cargados.</p>
          ) : (
            <ul className="space-y-1.5">
              {f.titulos.map((t, i) => {
                const estado = permisoEstado(t.vencimiento);
                return (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-0.5 text-xs font-bold text-[var(--text-secondary)]">{tituloLabel(t.tipo)}</span>
                    <span className="flex items-center gap-2">
                      {estado === "vencido" && <span className="rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">vencido</span>}
                      {estado === "por_vencer" && <span className="rounded-full bg-[var(--data-warning-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)]">por vencer</span>}
                      <span className="font-mono text-[var(--text-primary)]">{t.codigo || "—"}{t.vencimiento ? ` · vence ${t.vencimiento}` : ""}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {f.citesPermisos.length > 0 && (
          <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
            <CardTitle as="h3" className="mb-3 text-sm font-bold text-[var(--text-primary)]">Permisos CITES</CardTitle>
            <ul className="space-y-1.5">
              {f.citesPermisos.map((p, i) => {
                const estado = permisoEstado(p.vencimiento);
                return (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="rounded-full bg-[var(--data-error-100)] px-2.5 py-0.5 text-xs font-bold text-[var(--data-error-700)]">{p.especie || "—"}</span>
                    <span className="flex items-center gap-2">
                      {estado === "vencido" && <span className="rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">vencido</span>}
                      {estado === "por_vencer" && <span className="rounded-full bg-[var(--data-warning-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)]">por vencer</span>}
                      <span className="font-mono text-[var(--text-primary)]">{p.numero || "—"}{p.vencimiento ? ` · vence ${p.vencimiento}` : ""}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <CardTitle as="h3" className="mb-3 text-sm font-bold text-[var(--text-primary)]">Representante y ubicación</CardTitle>
          <Row label="Representante legal" value={[f.representante, f.representanteDni].filter(Boolean).join(" · ")} />
          <Row label="Dirección" value={[f.direccion, f.distrito, f.provincia, f.region].filter(Boolean).join(", ")} />
          <Row label="Contacto" value={[f.telefono, f.email].filter(Boolean).join(" · ")} />
        </div>
      </div>
    </div>
  );
}
