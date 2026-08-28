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
  Building2, Save, Plus, Trash2, Loader2, CheckCircle2, AlertCircle, AlertTriangle, ArrowUp, FileText, Pencil, Search, X as XIcon,
} from "@buleje/design-system/icons";
import { LoadingState } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { Field, I } from "./ctp-shared";
import { listDepartamentos } from "@/lib/peru-ubigeo";
import CtpParteLogo from "./CtpParteLogo";
import CtpFichaReadView from "./CtpFichaReadView";
import {
  emptyCtpFicha, rucValido, CTP_TITULO_TIPOS,
  type CtpFicha, type CtpTituloHabilitante, type CtpCitesPermiso,
} from "@/lib/forestal/ctp-ficha-types";

export default function CtpFichaEditor() {
  const [ficha, setFicha] = useState<CtpFicha>(emptyCtpFicha());
  const [draft, setDraft] = useState<CtpFicha>(emptyCtpFicha());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  /** Resultado de la última consulta al padrón SUNAT (no bloquea nada). */
  const [padron, setPadron] = useState<{ estado: "idle" | "cargando" | "ok" | "aviso" | "error"; mensaje: string | null }>({ estado: "idle", mensaje: null });

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
  const addTitulo = () => setDraft((d) => ({ ...d, titulos: [...d.titulos, { tipo: "concesion", codigo: "", resolucion: "", planManejo: "", vencimiento: "" }] }));
  const removeTitulo = (i: number) => setDraft((d) => ({ ...d, titulos: d.titulos.filter((_, j) => j !== i) }));
  /** Sube un título un lugar. El PRIMERO es el que se imprime en la GTF
   *  (`tituloDeGuia`), así que reordenar es la forma de elegir cuál declara la
   *  guía de salida — antes era invisible y siempre salía el que se cargó primero. */
  const subirTitulo = (i: number) =>
    setDraft((d) => {
      if (i <= 0) return d;
      const titulos = [...d.titulos];
      [titulos[i - 1], titulos[i]] = [titulos[i], titulos[i - 1]];
      return { ...d, titulos };
    });
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

  // El RUC sale impreso en el certificado y en el Libro: si el dígito
  // verificador no cierra, el fiscalizador lo cruza contra SUNAT y el documento
  // queda observado. Se avisa mientras se tipea, sin bloquear el guardado
  // (puede estar a medio escribir, y un RUC raro no es motivo para perder todo).
  const rucSospechoso = draft.ruc.length === 11 && !rucValido(draft.ruc);

  /**
   * Trae razón social y domicilio fiscal del padrón (proxy a SUNAT). La razón
   * social del certificado y los casilleros (7)/(10)/(11)/(12) de la guía tienen
   * que decir LO MISMO que SUNAT: tipeados a mano difieren por una S.A.C. o un
   * acento y el documento queda observado.
   *
   * Sólo COMPLETA lo vacío salvo la razón social, que es el dato oficial. Si el
   * padrón no responde, se avisa y se sigue a mano — nunca se pisa en silencio.
   */
  async function traerDeSunat() {
    setPadron({ estado: "cargando", mensaje: null });
    try {
      const r = await fetch(`/api/sunat/lookup-ruc?ruc=${encodeURIComponent(draft.ruc)}`, { credentials: "include" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      setDraft((d) => ({
        ...d,
        razonSocial: body.razonSocial || d.razonSocial,
        direccion: d.direccion || body.direccion || "",
        region: d.region || body.departamento || "",
        provincia: d.provincia || body.provincia || "",
        distrito: d.distrito || body.distrito || "",
        ubigeo: d.ubigeo || body.ubigeo || "",
      }));
      const baja = typeof body.estado === "string" && !/activo/i.test(body.estado);
      setPadron({
        estado: baja ? "aviso" : "ok",
        mensaje: baja
          ? `SUNAT devuelve el RUC en estado «${body.estado}». Revisá antes de emitir documentos con él.`
          : `Traído de SUNAT: ${body.razonSocial ?? "sin razón social"}.`,
      });
    } catch (e) {
      setPadron({ estado: "error", mensaje: e instanceof Error ? e.message : String(e) });
    }
  }

  if (loading) return <LoadingState message="Cargando ficha…" />;

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

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}
      {ok && <div className="flex items-center gap-2 rounded-xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-50)] p-3 text-sm font-medium text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]"><CheckCircle2 className="h-5 w-5" /> Ficha guardada.</div>}

      {editing ? (
        <div className="space-y-5 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <Section title="Identidad del centro" icon={Building2}>
            <Field label="Nombre del CTP" required><input className={I} value={draft.nombreCtp} onChange={(e) => set("nombreCtp", e.target.value)} placeholder="Aserradero San Martín" /></Field>
            <Field label="Código de CTP" required hint="Asignado por la ARFFS"><input className={I} value={draft.codigoCtp} onChange={(e) => set("codigoCtp", e.target.value)} placeholder="CTP-25-000123" /></Field>
            <Field label="RUC" required hint={rucSospechoso || padron.mensaje ? undefined : "11 dígitos · se puede traer de SUNAT"}>
              <div className="flex gap-2">
                <input className={I} value={draft.ruc} onChange={(e) => { set("ruc", e.target.value.replace(/\D/g, "").slice(0, 11)); setPadron({ estado: "idle", mensaje: null }); }} inputMode="numeric" placeholder="20512345671" aria-invalid={rucSospechoso} />
                <button
                  type="button"
                  onClick={() => void traerDeSunat()}
                  disabled={draft.ruc.length !== 11 || padron.estado === "cargando"}
                  title="Traer razón social y domicilio fiscal del padrón de SUNAT"
                  className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
                >
                  {padron.estado === "cargando" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />} SUNAT
                </button>
              </div>
              {rucSospechoso && (
                <p className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  Ese RUC no pasa la verificación de SUNAT (dígito verificador). Revisá que no falte o sobre un número.
                </p>
              )}
              {padron.mensaje && (
                <p className={`mt-1.5 flex items-start gap-1.5 text-sm font-medium ${padron.estado === "ok"
                  ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                  : padron.estado === "aviso"
                    ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                    : "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"}`}>
                  {padron.estado === "ok"
                    ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
                  {padron.mensaje}
                </p>
              )}
            </Field>
            <Field label="Razón social" required><input className={I} value={draft.razonSocial} onChange={(e) => set("razonSocial", e.target.value)} placeholder="Maderera San Martín S.A.C." /></Field>
            {/* El logo es del CENTRO: encabeza la guía de salida, el certificado
                y todo lo que emite el CTP con su nombre. */}
            <Field label="Logo del CTP" hint="Va en el membrete de la guía de salida y sus anexos">
              <CtpParteLogo logo={draft.logo ?? ""} onCambio={(logo) => set("logo", logo)} />
            </Field>
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
              {draft.titulos.length === 0 && <p className="text-sm text-[var(--text-tertiary)]">Sin títulos cargados. Agregá las concesiones/permisos que abastecen el CTP.</p>}
              {draft.titulos.length > 1 && (
                <p className="text-sm text-[var(--text-tertiary)]">
                  El <strong className="text-[var(--text-secondary)]">primero</strong> es el que cada guía de salida propone (casilleros 5, 6, 8 y 9); en el formulario de la guía se puede elegir otro. Usá <ArrowUp className="inline h-3.5 w-3.5" aria-hidden /> para cambiar el predeterminado.
                </p>
              )}
              {draft.titulos.map((t, i) => (
                <div key={i} className={`rounded-xl border-2 p-2 ${i === 0 ? "border-[var(--accent)] bg-[var(--accent-soft)] dark:bg-[var(--accent)]/10" : "border-[var(--rule-base)]"}`}>
                  {i === 0 && (
                    <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-muted)] px-2.5 py-1 text-[length:var(--ts-xs)] font-bold text-[var(--accent-dark)] dark:bg-[var(--accent)]/15 dark:text-[var(--accent)]">
                      <FileText className="h-3.5 w-3.5" aria-hidden /> Predeterminado en la GTF
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <select className={`${I} max-w-[13rem]`} value={t.tipo} onChange={(e) => setTitulo(i, { tipo: e.target.value })} title="Tipo de título — es también el casillero (5) de la GTF">
                      {CTP_TITULO_TIPOS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <input className={`${I} min-w-[10rem] flex-1`} value={t.codigo} onChange={(e) => setTitulo(i, { codigo: e.target.value })} placeholder="N° del título habilitante — casillero (6)" />
                    <input type="date" className={`${I} max-w-[10rem]`} value={t.vencimiento} onChange={(e) => setTitulo(i, { vencimiento: e.target.value })} title="Vencimiento" />
                    {i > 0 && (
                      <button type="button" onClick={() => subirTitulo(i)} title="Subir — el primero es el que declara la GTF" aria-label="Subir este título" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border-2 border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"><ArrowUp className="h-4 w-4" /></button>
                    )}
                    <button type="button" onClick={() => removeTitulo(i)} aria-label="Quitar este título" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border-2 border-[var(--rule-base)] text-[var(--data-error-600)] hover:bg-[var(--data-error-50)]"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  {/* (8) y (9): los pide la GTF y no vivían en ningún lado, así
                      que esos dos casilleros salían vacíos en cada guía. */}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      className={`${I} min-w-[14rem] flex-1`}
                      value={t.resolucion}
                      onChange={(e) => setTitulo(i, { resolucion: e.target.value })}
                      placeholder="N° de resolución que lo aprobó — casillero (8)"
                    />
                    <input
                      className={`${I} min-w-[10rem] max-w-[16rem] flex-1`}
                      value={t.planManejo}
                      onChange={(e) => setTitulo(i, { planManejo: e.target.value })}
                      placeholder="Plan de manejo: DEMA, PMFI, POA… — casillero (9)"
                      list="planes-manejo"
                    />
                  </div>
                </div>
              ))}
              {/* Sugerencias, no un enum: la nomenclatura cambia por región y
                  por tipo de título, y una lista cerrada rechazaría un plan
                  válido. */}
              <datalist id="planes-manejo">
                <option value="Declaración de Manejo (DEMA)" />
                <option value="Plan de Manejo Forestal Intermedio (PMFI)" />
                <option value="Plan General de Manejo Forestal (PGMF)" />
                <option value="Plan Operativo Anual (POA)" />
                <option value="Plan de Manejo Consolidado" />
              </datalist>
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
            <Field label="Región">
              <input className={I} value={draft.region} onChange={(e) => set("region", e.target.value)} placeholder="Ucayali" list="ficha-regiones-peru" />
              {/* Autocompletar (no restringe): un typo acá ("Ucayaly") hace que
                  `arffsMesaPartes()` no encuentre la mesa de partes de la
                  región y el banner de Trámites no aparece, en silencio —
                  la lista oficial de 25 departamentos guía sin bloquear el
                  campo para tenants fuera de esa cobertura. */}
              <datalist id="ficha-regiones-peru">
                {listDepartamentos().map((d) => (
                  <option key={d.code} value={d.nombre} />
                ))}
              </datalist>
            </Field>
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
        <CtpFichaReadView ficha={ficha} onEditar={() => { setDraft(ficha); setEditing(true); setError(null); }} />
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
