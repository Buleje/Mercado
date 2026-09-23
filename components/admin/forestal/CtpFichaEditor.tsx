"use client";

/**
 * CtpFichaEditor — Ficha legal del CTP (identidad SERFOR/ARFFS).
 *
 * Es el header legal que encabeza el certificado de trazabilidad, la GTF de
 * salida y el export del Libro de Operaciones, y además la **carátula** del
 * propio Libro (Anexo 1 de la RDE N° D000025-2023-MIDAGRI-SERFOR-DE). Sin
 * estos datos, esos documentos salen anónimos y no sirven ante un fiscalizador
 * — por eso la pantalla dice cuántos faltan y cuáles. Persiste vía
 * /api/admin/forestal/ctp-ficha (KV, sin migración).
 *
 * Acá vive SÓLO la orquestación (cargar, editar, guardar). Los campos viven en
 * `CtpFichaFormIdentidad` / `…Titulos` / `…Ubicacion`.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Pencil, Save, X as XIcon } from "@buleje/design-system/icons";
import { LoadingState } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import CtpFichaReadView from "./CtpFichaReadView";
import CtpFichaCompletitud from "./CtpFichaCompletitud";
import CtpFichaFormIdentidad, { type EstadoPadron } from "./CtpFichaFormIdentidad";
import CtpFichaFormTitulos from "./CtpFichaFormTitulos";
import CtpFichaFormUbicacion from "./CtpFichaFormUbicacion";
import { emptyCtpFicha, type CtpFicha } from "@/lib/forestal/ctp-ficha-types";

export default function CtpFichaEditor() {
  const [ficha, setFicha] = useState<CtpFicha>(emptyCtpFicha());
  const [draft, setDraft] = useState<CtpFicha>(emptyCtpFicha());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  /** Resultado de la última consulta al padrón SUNAT (no bloquea nada). */
  const [padron, setPadron] = useState<EstadoPadron>({ estado: "idle", mensaje: null });

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

  const abrirEdicion = () => { setDraft(ficha); setEditing(true); setError(null); };

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
          ? `SUNAT devuelve el RUC en estado «${body.estado}». Revisa antes de emitir documentos con él.`
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
          Identidad legal del Centro de Transformación Primaria ante <strong className="text-[var(--text-secondary)]">SERFOR / ARFFS</strong>. Es la carátula del Libro de Operaciones y encabeza el certificado de trazabilidad y la GTF de salida.
        </p>
        {!editing && (
          <button type="button" onClick={abrirEdicion} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">
            <Pencil className="h-4 w-4" /> Editar ficha
          </button>
        )}
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}
      {ok && <div className="flex items-center gap-2 rounded-xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-50)] p-3 text-sm font-medium text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]"><CheckCircle2 className="h-5 w-5" /> Ficha guardada.</div>}

      {editing ? (
        <>
          {/* En vivo mientras se llena: la cuenta baja a medida que se carga,
              que es lo que hace que valga la pena terminar la carátula. */}
          <CtpFichaCompletitud ficha={draft} />
          <div className="space-y-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
            <CtpFichaFormIdentidad
              draft={draft}
              set={set}
              padron={padron}
              onConsultarSunat={() => void traerDeSunat()}
              onRucEditado={() => setPadron({ estado: "idle", mensaje: null })}
            />
            <CtpFichaFormTitulos draft={draft} set={set} />
            <CtpFichaFormUbicacion draft={draft} set={set} />

            <div className="flex items-center justify-end gap-2 border-t-2 border-[var(--rule-soft)] pt-4">
              <button type="button" onClick={() => { setEditing(false); setDraft(ficha); setError(null); }} disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"><XIcon className="h-4 w-4" /> Cancelar</button>
              <button type="button" onClick={save} disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar ficha</button>
            </div>
          </div>
        </>
      ) : (
        <CtpFichaReadView ficha={ficha} onEditar={abrirEdicion} />
      )}
    </div>
  );
}
