"use client";

/**
 * CacaoParcelaDrawer — ficha de una sección del campo: registra labores (poda,
 * fertilización, cosecha…), marca hechas/pendientes, y muestra el historial.
 * El estado de la sección (al día / pendiente / vencido) se deriva de sus
 * labores. Drawer lateral. Brandon 2026-07-02.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Plus, Check, RotateCcw, Trash2, Loader2, Calendar, Warehouse, X, Settings2, Copy, Power, Stethoscope } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import AdminModal from "@/components/admin/shared/AdminModal";
import { CACAO_LABORES, LABOR_LABEL, LABOR_UNIDADES, PARCELA_STATUS, type CacaoLaborTipo, type CacaoParcelaStatus } from "@/lib/cacao/cacao-labores";
import { PLAGA_LABEL, SANIDAD_SEVERIDAD, SANIDAD_ESTADO, type CacaoPlaga, type SanidadSeveridad, type SanidadEstado } from "@/lib/cacao/cacao-sanidad";

const CACAO_VARIEDADES = ["CCN-51", "criollo", "trinitario", "forastero", "nacional"];

interface Parcela { id: string; codigo: string; nombre: string | null; areaHa: number | null; variedad: string | null; anioSiembra: number | null; nPlantas: number | null; status: string; observaciones: string | null }
interface Labor { id: string; tipo: CacaoLaborTipo; estado: string; fechaPlan: string | null; fechaHecho: string | null; responsable: string | null; detalle: string | null; cantidad: number | null; unidad: string | null; insumo: string | null; dosis: string | null; costo: number | null; recurrenteDias: number | null; loteId: string | null; gastoId: string | null; createdAt: string }
interface Foco { id: string; plaga: CacaoPlaga; severidad: SanidadSeveridad; incidenciaPct: number | null; estado: SanidadEstado; fecha: string; tratamiento: string | null }
const money = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fdate = (iso: string | null) => { if (!iso) return "—"; try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" }); } catch { return iso; } };
const ICON = Object.fromEntries(CACAO_LABORES.map((l) => [l.tipo, l.icon])) as Record<CacaoLaborTipo, (typeof CACAO_LABORES)[number]["icon"]>;

function statusOf(labores: Labor[]): CacaoParcelaStatus {
  const now = Date.now();
  let hechos = 0, pend = 0, venc = 0;
  for (const l of labores) {
    if (l.estado === "hecho") hechos++;
    else if (l.fechaPlan && new Date(l.fechaPlan).getTime() < now) venc++;
    else pend++;
  }
  return venc > 0 ? "vencido" : pend > 0 ? "pendiente" : hechos > 0 ? "al_dia" : "sin_labores";
}

export default function CacaoParcelaDrawer({ parcelaId, onClose, onChanged }: { parcelaId: string; onClose: () => void; onChanged: () => void }) {
  const [parcela, setParcela] = useState<Parcela | null>(null);
  const [labores, setLabores] = useState<Labor[]>([]);
  const [sanidad, setSanidad] = useState<Foco[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDup, setShowDup] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [sendFor, setSendFor] = useState<Labor | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/admin/cacao/campo?view=parcela-detail&id=${encodeURIComponent(parcelaId)}`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setParcela(d.parcela); setLabores(d.labores ?? []); setSanidad(d.sanidad ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [parcelaId]);
  useEffect(() => { load(); }, [load]);

  const status = useMemo(() => statusOf(labores), [labores]);
  const activeFocos = useMemo(() => sanidad.filter((f) => f.estado !== "resuelto"), [sanidad]);
  const ultimoPorTipo = useMemo(() => {
    const m = new Map<CacaoLaborTipo, string>();
    for (const l of labores) if (l.estado === "hecho" && l.fechaHecho) { const cur = m.get(l.tipo); if (!cur || l.fechaHecho > cur) m.set(l.tipo, l.fechaHecho); }
    return m;
  }, [labores]);
  const responsables = useMemo(() => [...new Set(labores.map((l) => l.responsable).filter((r): r is string => !!r))].sort(), [labores]);

  async function mutate(fn: () => Promise<Response>, key: string) {
    setBusy(key); setError(null);
    try {
      const r = await fn();
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setDirty(true);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  const setEstado = (l: Labor, estado: "hecho" | "pendiente") => mutate(
    () => fetch("/api/admin/cacao/campo", { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify({ action: "set_labor", id: l.id, estado }) }),
    `estado-${l.id}`,
  );
  const del = (l: Labor) => mutate(
    () => fetch(`/api/admin/cacao/campo?type=labor&id=${encodeURIComponent(l.id)}`, { method: "DELETE", headers: csrfHeaders(), credentials: "include" }),
    `del-${l.id}`,
  );

  function close() { if (dirty) onChanged(); onClose(); }
  const m = PARCELA_STATUS[status];

  return (
    <AdminModal open onClose={close} variant="side" icon={m.icon} title={parcela ? `Sección ${parcela.codigo}` : "Sección"} description={parcela?.nombre ?? undefined}>
      <div className="space-y-4 p-5">
        {parcela && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold" style={{ background: m.bg, color: m.fg }}><m.icon className="h-3 w-3" />{m.label}</span>
            {parcela.status === "inactiva" && <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]"><Power className="h-3 w-3" />Inactiva</span>}
            {parcela.areaHa != null && <span>{parcela.areaHa.toLocaleString("es-PE", { maximumFractionDigits: 1 })} ha</span>}
            {parcela.variedad && <span>· {parcela.variedad}</span>}
            {parcela.anioSiembra && <span>· siembra {parcela.anioSiembra}</span>}
            {parcela.nPlantas && <span>· {parcela.nPlantas} plantas</span>}
          </div>
        )}

        {parcela && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setShowEdit((v) => !v); setShowForm(false); }} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border-2 px-3 text-xs font-bold ${showEdit ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"}`}><Settings2 className="h-3.5 w-3.5" />Editar datos</button>
            <button type="button" onClick={() => setShowDup(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><Copy className="h-3.5 w-3.5" />Duplicar</button>
          </div>
        )}

        {showEdit && parcela && <EditarParcelaForm parcela={parcela} onCancel={() => setShowEdit(false)} onDone={() => { setShowEdit(false); setDirty(true); load(); }} />}

        {error && <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)]">{error}</div>}

        {activeFocos.length > 0 && (
          <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-[var(--data-error-700)]"><Stethoscope className="h-4 w-4" />Sanidad: {activeFocos.length} foco{activeFocos.length > 1 ? "s" : ""} activo{activeFocos.length > 1 ? "s" : ""}</p>
            <ul className="space-y-1">
              {activeFocos.map((f) => { const sev = SANIDAD_SEVERIDAD[f.severidad]; const est = SANIDAD_ESTADO[f.estado]; return (
                <li key={f.id} className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold" style={{ background: sev.bg, color: sev.fg }}>{PLAGA_LABEL[f.plaga]} · {sev.label}</span>
                  <span className="rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold" style={{ background: est.bg, color: est.fg }}>{est.label}</span>
                  {f.incidenciaPct != null && <span>{f.incidenciaPct}% afectado</span>}
                  {f.tratamiento && <span className="truncate">· {f.tratamiento}</span>}
                </li>
              ); })}
            </ul>
            <p className="mt-1.5 text-[length:var(--ts-2xs)] text-[var(--data-error-700)]">Seguí su tratamiento en la pestaña Sanidad.</p>
          </div>
        )}

        {/* Resumen por labor: último hecho */}
        <div className="grid grid-cols-2 gap-2">
          {CACAO_LABORES.map((l) => {
            const ult = ultimoPorTipo.get(l.tipo);
            return (
              <div key={l.tipo} className="flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2">
                <l.icon className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-[var(--text-primary)]">{l.label}</p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{ult ? `último ${fdate(ult)}` : "sin registro"}</p>
                </div>
              </div>
            );
          })}
        </div>

        <button type="button" onClick={() => setShowForm((v) => !v)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white shadow-sm hover:opacity-90"><Plus className="h-4 w-4" />Registrar labor</button>
        {showForm && <RegistrarLaborForm parcelaId={parcelaId} responsables={responsables} onDone={() => { setShowForm(false); setDirty(true); load(); }} />}

        {/* Historial */}
        <div>
          <p className="mb-2 text-sm font-bold text-[var(--text-primary)]">Historial ({labores.length})</p>
          {loading && labores.length === 0 ? (
            <div className="p-6 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-5 w-5 animate-spin" /></div>
          ) : labores.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--rule-base)] p-6 text-center text-sm text-[var(--text-tertiary)]">Aún no registraste labores en esta sección.</p>
          ) : (
            <ul className="space-y-2">
              {labores.map((l) => {
                const Icon = ICON[l.tipo];
                const vencido = l.estado !== "hecho" && l.fechaPlan && new Date(l.fechaPlan).getTime() < Date.now();
                return (
                  <li key={l.id} className="flex items-start gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2.5">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-[var(--text-primary)]">{LABOR_LABEL[l.tipo]}</span>
                        {l.estado === "hecho"
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-success-50)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-700)]"><Check className="h-3 w-3" />Hecho {fdate(l.fechaHecho)}</span>
                          : <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold ${vencido ? "bg-[var(--data-error-50)] text-[var(--data-error-700)]" : "bg-[var(--data-warning-100)] text-[var(--data-warning-900)]"}`}><Calendar className="h-3 w-3" />{vencido ? "Vencida" : "Programada"} {fdate(l.fechaPlan)}</span>}
                      </div>
                      {(l.detalle || l.responsable || l.cantidad != null || l.insumo || l.costo != null) && (
                        <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{[l.detalle, l.responsable && `por ${l.responsable}`, l.cantidad != null && `${l.cantidad}${l.unidad ? ` ${l.unidad}` : ""}`, l.insumo && (l.dosis ? `${l.insumo} (${l.dosis})` : l.insumo), l.costo != null && `S/ ${money(l.costo)}`].filter(Boolean).join(" · ")}</p>
                      )}
                      {!!l.recurrenteDias && <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--accent)]"><RotateCcw className="h-3 w-3" />cada {l.recurrenteDias} d</span>}
                      {l.tipo === "cosecha" && l.loteId && <span className="mt-1 ml-1 inline-flex items-center gap-1 rounded-full bg-[var(--data-success-50)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-700)]"><Warehouse className="h-3 w-3" />En acopio</span>}
                      {l.gastoId && <span title="Costo posteado como gasto en Finanzas" className="mt-1 ml-1 inline-flex items-center gap-1 rounded-full bg-[var(--data-info-50)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-info-700)]">en Finanzas</span>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {l.tipo === "cosecha" && l.estado === "hecho" && l.cantidad != null && l.cantidad > 0 && !l.loteId && (
                        <button type="button" onClick={() => setSendFor(l)} title="Enviar a Acopio" className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent)] text-white hover:opacity-90"><Warehouse className="h-4 w-4" /></button>
                      )}
                      {l.estado === "hecho"
                        ? <button type="button" disabled={busy === `estado-${l.id}`} onClick={() => setEstado(l, "pendiente")} title="Reabrir" className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50">{busy === `estado-${l.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}</button>
                        : <button type="button" disabled={busy === `estado-${l.id}`} onClick={() => setEstado(l, "hecho")} title="Marcar hecha" className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--data-success-500)] text-white hover:opacity-90 disabled:opacity-50">{busy === `estado-${l.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</button>}
                      <button type="button" disabled={busy === `del-${l.id}`} onClick={() => del(l)} title="Eliminar" className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--rule-base)] text-[var(--data-error-600)] hover:bg-[var(--data-error-50)] disabled:opacity-50">{busy === `del-${l.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      {sendFor && <CosechaAcopioModal labor={sendFor} onClose={() => setSendFor(null)} onSent={() => { setSendFor(null); setDirty(true); load(); }} />}
      {showDup && parcela && <DuplicarParcelaModal parcela={parcela} onClose={() => setShowDup(false)} onDone={() => { setShowDup(false); setDirty(true); }} />}
    </AdminModal>
  );
}

/** Edita la ficha de la sección: código, nombre, área, variedad, año, plantas,
 *  estado (activa/inactiva) y notas. Estructura → PATCH update_parcela. */
function EditarParcelaForm({ parcela, onDone, onCancel }: { parcela: Parcela; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({
    codigo: parcela.codigo,
    nombre: parcela.nombre ?? "",
    areaHa: parcela.areaHa != null ? String(parcela.areaHa) : "",
    variedad: parcela.variedad ?? "",
    anioSiembra: parcela.anioSiembra != null ? String(parcela.anioSiembra) : "",
    nPlantas: parcela.nPlantas != null ? String(parcela.nPlantas) : "",
    observaciones: parcela.observaciones ?? "",
    status: parcela.status || "activa",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!f.codigo.trim()) { setError("El código es obligatorio."); return; }
    setSubmitting(true); setError(null);
    try {
      const patch = {
        codigo: f.codigo.trim(), nombre: f.nombre.trim() || null,
        areaHa: f.areaHa ? Number(f.areaHa) : null, variedad: f.variedad || null,
        anioSiembra: f.anioSiembra ? Number(f.anioSiembra) : null, nPlantas: f.nPlantas ? Number(f.nPlantas) : null,
        observaciones: f.observaciones.trim() || null, status: f.status,
      };
      const r = await fetch("/api/admin/cacao/campo", { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify({ action: "update_parcela", id: parcela.id, patch }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error === "codigo_duplicado" ? "Ya existe una sección con ese código." : (d.message ?? `HTTP ${r.status}`)); }
      onDone();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setSubmitting(false); }
  }

  const I = "h-11 w-full rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border-2 border-[var(--accent-soft)] bg-[var(--surface-sunken)] p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-bold text-[var(--text-secondary)]">Código<input value={f.codigo} onChange={set("codigo")} className={`mt-1 ${I}`} /></label>
        <label className="text-xs font-bold text-[var(--text-secondary)]">Nombre<input value={f.nombre} onChange={set("nombre")} placeholder="Lote alto" className={`mt-1 ${I}`} /></label>
        <label className="text-xs font-bold text-[var(--text-secondary)]">Área (ha)<input type="number" step="0.01" min="0" value={f.areaHa} onChange={set("areaHa")} className={`mt-1 ${I}`} /></label>
        <label className="text-xs font-bold text-[var(--text-secondary)]">Variedad<select value={f.variedad} onChange={set("variedad")} className={`mt-1 ${I}`}><option value="">—</option>{CACAO_VARIEDADES.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
        <label className="text-xs font-bold text-[var(--text-secondary)]">Año de siembra<input type="number" min="1900" max="2200" value={f.anioSiembra} onChange={set("anioSiembra")} placeholder="2019" className={`mt-1 ${I}`} /></label>
        <label className="text-xs font-bold text-[var(--text-secondary)]">N° de plantas<input type="number" min="0" value={f.nPlantas} onChange={set("nPlantas")} placeholder="1100" className={`mt-1 ${I}`} /></label>
        <label className="text-xs font-bold text-[var(--text-secondary)]">Estado<select value={f.status} onChange={set("status")} className={`mt-1 ${I}`}><option value="activa">Activa</option><option value="inactiva">Inactiva</option></select></label>
      </div>
      <label className="block text-xs font-bold text-[var(--text-secondary)]">Notas<input value={f.observaciones} onChange={set("observaciones")} placeholder="opcional" className={`mt-1 ${I}`} /></label>
      {error && <div className="rounded-lg border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-2 text-xs text-[var(--data-error-700)]">{error}</div>}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">Cancelar</button>
        <button type="submit" disabled={submitting} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Guardar datos</button>
      </div>
    </form>
  );
}

/** Duplica la estructura de la sección (metadata, sin labores ni polígono) con un
 *  código nuevo — para clonar rápido secciones parecidas. */
function DuplicarParcelaModal({ parcela, onClose, onDone }: { parcela: Parcela; onClose: () => void; onDone: () => void }) {
  const [codigo, setCodigo] = useState(`${parcela.codigo}-copia`);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !codigo.trim()) { if (!codigo.trim()) setError("El código es obligatorio."); return; }
    setSubmitting(true); setError(null);
    try {
      const r = await fetch("/api/admin/cacao/campo?type=parcela", {
        method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({ codigo: codigo.trim(), nombre: parcela.nombre, areaHa: parcela.areaHa, variedad: parcela.variedad, anioSiembra: parcela.anioSiembra, nPlantas: parcela.nPlantas, observaciones: parcela.observaciones }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error === "codigo_duplicado" ? "Ya existe una sección con ese código." : (d.message ?? `HTTP ${r.status}`)); }
      onDone();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setSubmitting(false); }
  }

  const I = "h-12 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
  return (
    <AdminModal open onClose={onClose} variant="centered-sm" icon={Copy} title="Duplicar sección" description={`Copia los datos de ${parcela.codigo} en una sección nueva (sin labores ni polígono).`}>
      <form onSubmit={submit} className="space-y-4 p-5">
        <label className="block text-sm font-bold text-[var(--text-primary)]">Código de la nueva sección<input value={codigo} onChange={(e) => setCodigo(e.target.value)} className={`mt-1 ${I}`} autoFocus /></label>
        <p className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3 text-xs text-[var(--text-secondary)]">Se copian nombre, área, variedad, año y plantas. Dibujá su polígono y registrá sus labores aparte.</p>
        {error && <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)]">{error}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><X className="h-4 w-4" />Cancelar</button>
          <button type="submit" disabled={submitting} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}Duplicar</button>
        </div>
      </form>
    </AdminModal>
  );
}

function CosechaAcopioModal({ labor, onClose, onSent }: { labor: Labor; onClose: () => void; onSent: () => void }) {
  const [precio, setPrecio] = useState("");
  const [productor, setProductor] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kg = labor.cantidad ?? 0;
  const total = precio ? kg * Number(precio) : 0;

  async function enviar() {
    if (submitting) return;
    setSubmitting(true); setError(null);
    try {
      const r = await fetch("/api/admin/cacao/campo", {
        method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({ action: "enviar_acopio", laborId: labor.id, precioPorKg: precio ? Number(precio) : null, productorNombre: productor.trim() || null }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onSent();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setSubmitting(false); }
  }

  const I = "h-12 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
  return (
    <AdminModal open onClose={onClose} variant="centered-sm" icon={Warehouse} title="Enviar cosecha a Acopio" description={`${kg.toLocaleString("es-PE")} kg cosechados el ${fdate(labor.fechaHecho)}.`}>
      <div className="space-y-4 p-5">
        <p className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3 text-xs text-[var(--text-secondary)]">Se creará un lote en <strong className="text-[var(--text-primary)]">Acopio</strong> con estos {kg} kg y el origen de esta sección (trazabilidad NTP 208.040). Podés ajustarlo luego en Acopio.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-bold text-[var(--text-primary)]">Precio S/ por kg<input type="number" step="0.01" min="0" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="opcional" className={`mt-1 ${I}`} autoFocus /></label>
          <label className="text-sm font-bold text-[var(--text-primary)]">Productor<input value={productor} onChange={(e) => setProductor(e.target.value)} placeholder="opcional" className={`mt-1 ${I}`} /></label>
        </div>
        {precio && <p className="text-sm text-[var(--text-secondary)]">Liquidación estimada: <strong className="text-[var(--text-primary)]">S/ {money(total)}</strong></p>}
        {error && <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)]">{error}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><X className="h-4 w-4" />Cancelar</button>
          <button type="button" disabled={submitting} onClick={enviar} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Warehouse className="h-4 w-4" />}Enviar a Acopio</button>
        </div>
      </div>
    </AdminModal>
  );
}

function RegistrarLaborForm({ parcelaId, responsables, onDone }: { parcelaId: string; responsables: string[]; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ tipo: "poda" as CacaoLaborTipo, estado: "hecho", fecha: today, responsable: "", detalle: "", cantidad: "", unidad: LABOR_UNIDADES.poda[0], insumo: "", dosis: "", costo: "", recurrente: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  // Al cambiar la labor, la unidad por defecto pasa a la primera sugerida de ese tipo.
  const setTipo = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tipo = e.target.value as CacaoLaborTipo;
    setF((s) => ({ ...s, tipo, unidad: LABOR_UNIDADES[tipo].includes(s.unidad) ? s.unidad : LABOR_UNIDADES[tipo][0] }));
  };
  const hecho = f.estado === "hecho";
  const fechaFutura = hecho && f.fecha > today;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (fechaFutura) { setError("Si ya la hiciste, la fecha no puede ser futura. Cambiá el estado a “Programada” para agendarla."); return; }
    if (f.cantidad && Number(f.cantidad) < 0) { setError("La cantidad no puede ser negativa."); return; }
    setSubmitting(true); setError(null);
    try {
      const payload = {
        parcelaId, tipo: f.tipo, estado: f.estado,
        fechaHecho: hecho ? f.fecha : null, fechaPlan: hecho ? null : f.fecha,
        responsable: f.responsable.trim() || null, detalle: f.detalle.trim() || null,
        cantidad: f.cantidad ? Number(f.cantidad) : null, unidad: f.cantidad ? f.unidad : null,
        insumo: f.insumo.trim() || null, dosis: f.dosis.trim() || null,
        costo: f.costo ? Number(f.costo) : null, recurrenteDias: f.recurrente ? Number(f.recurrente) : null,
      };
      const r = await fetch("/api/admin/cacao/campo?type=labor", { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify(payload) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onDone();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setSubmitting(false); }
  }

  const I = "h-11 w-full rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border-2 border-[var(--accent-soft)] bg-[var(--surface-sunken)] p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-bold text-[var(--text-secondary)]">Labor<select value={f.tipo} onChange={setTipo} className={`mt-1 ${I}`}>{CACAO_LABORES.map((l) => <option key={l.tipo} value={l.tipo}>{l.label}</option>)}</select></label>
        <label className="text-xs font-bold text-[var(--text-secondary)]">Estado<select value={f.estado} onChange={set("estado")} className={`mt-1 ${I}`}><option value="hecho">Ya la hice</option><option value="pendiente">Programada</option></select></label>
        <label className="text-xs font-bold text-[var(--text-secondary)]">{hecho ? "Fecha realizada" : "Fecha programada"}<input type="date" value={f.fecha} onChange={set("fecha")} max={hecho ? today : undefined} min={hecho ? undefined : today} className={`mt-1 ${I} ${fechaFutura ? "border-[var(--data-error-500)]" : ""}`} /></label>
        <label className="text-xs font-bold text-[var(--text-secondary)]">Responsable<input value={f.responsable} onChange={set("responsable")} list="cacao-responsables" placeholder="opcional" className={`mt-1 ${I}`} /><datalist id="cacao-responsables">{responsables.map((r) => <option key={r} value={r} />)}</datalist></label>
        <label className="text-xs font-bold text-[var(--text-secondary)]">Cantidad<input type="number" step="0.01" min="0" value={f.cantidad} onChange={set("cantidad")} placeholder="ej. 200" className={`mt-1 ${I}`} /></label>
        <label className="text-xs font-bold text-[var(--text-secondary)]">Unidad<select value={f.unidad} onChange={set("unidad")} className={`mt-1 ${I}`}>{LABOR_UNIDADES[f.tipo].map((u) => <option key={u} value={u}>{u}</option>)}</select></label>
        <label className="text-xs font-bold text-[var(--text-secondary)]">Insumo / producto<input value={f.insumo} onChange={set("insumo")} placeholder="ej. urea, fungicida" className={`mt-1 ${I}`} /></label>
        <label className="text-xs font-bold text-[var(--text-secondary)]">Dosis<input value={f.dosis} onChange={set("dosis")} placeholder="ej. 2 kg/ha" className={`mt-1 ${I}`} /></label>
        <label className="text-xs font-bold text-[var(--text-secondary)]">Costo (S/)<input type="number" step="0.01" min="0" value={f.costo} onChange={set("costo")} placeholder="mano de obra + insumo" className={`mt-1 ${I}`} /></label>
        <label className="text-xs font-bold text-[var(--text-secondary)]">Repetir cada (días)<input type="number" min="1" max="3650" value={f.recurrente} onChange={set("recurrente")} placeholder="ej. 30 (opcional)" className={`mt-1 ${I}`} /></label>
      </div>
      <label className="block text-xs font-bold text-[var(--text-secondary)]">Detalle<input value={f.detalle} onChange={set("detalle")} placeholder="opcional" className={`mt-1 ${I}`} /></label>
      {f.recurrente && Number(f.recurrente) > 0 && <p className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]"><RotateCcw className="h-3 w-3" />Al marcarla hecha, se agenda automáticamente la próxima a {f.recurrente} días.</p>}
      {fechaFutura && !error && <p className="text-xs font-bold text-[var(--data-error-700)]">Una labor “ya hecha” no puede tener fecha futura.</p>}
      {error && <div className="rounded-lg border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-2 text-xs text-[var(--data-error-700)]">{error}</div>}
      <button type="submit" disabled={submitting || fechaFutura} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Guardar labor</button>
    </form>
  );
}
