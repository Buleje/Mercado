"use client";

/**
 * Alta de un documento de gestión forestal.
 *
 * Antes era un `<select>` con tres siglas —PO, PMFI, DEMA— y doce campos
 * iguales para las tres. Pero no son variantes de lo mismo: **cada una
 * corresponde a un título habilitante distinto** (concesión, predio privado,
 * comunidad), y quien lo llena —un ingeniero o un regente— reconoce el suyo por
 * el tipo de bosque en el que trabaja, no por la sigla suelta.
 *
 * Ahora el tipo se elige primero, con su nombre completo y para qué sirve, y el
 * formulario se acomoda: una plantación no tiene parcela de corta, un PGMF no
 * tiene la parcela del año, y el **regente forestal** —que firma el informe de
 * ejecución junto al titular— tiene por fin dónde ir.
 *
 * Reglas y fuentes: `lib/forestal/loth-tipos-plan.ts`.
 */

import { useState } from "react";
import { AlertTriangle, Check, Loader2, Plus } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { Field, cls } from "./loth-plan-ui";
import {
  ESPECIALIDADES_REGENTE,
  TIPOS_PLAN_LISTA,
  especialidadSugerida,
  metaDe,
  pideCampo,
  type TipoPlan,
} from "@/lib/forestal/loth-tipos-plan";

export default function LothPlanForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    planType: "PO" as TipoPlan,
    planNumber: "", tituloHabilitante: "", resolucionNumber: "", resolucionDate: "",
    titularName: "", representanteLegal: "", arffs: "", region: "Ucayali", parcelaCorta: "",
    areaHa: "", uitRef: "5350", vigenciaDesde: "", vigenciaHasta: "",
    regenteName: "", regenteRegistro: "", regenteEspecialidad: "maderable",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const meta = metaDe(f.planType);
  const faltaRegente = meta.regente === "obligatorio" && f.regenteName.trim().length < 2;
  const puedeGuardar = f.titularName.trim().length >= 2 && !busy;

  function elegirTipo(tipo: TipoPlan) {
    setF((p) => ({
      ...p,
      planType: tipo,
      // La especialidad del regente la decide el tipo de documento; si el
      // usuario ya la cambió a mano, no se le pisa.
      regenteEspecialidad: p.regenteName ? p.regenteEspecialidad : especialidadSugerida(tipo),
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!puedeGuardar) return;
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(f)) body[k] = v === "" ? null : v;
      body.titularName = f.titularName.trim();
      // Lo que este tipo no usa no se manda: un campo escondido que igual viaja
      // deja datos que la pantalla nunca va a mostrar.
      if (!pideCampo(f.planType, "parcelaCorta")) body.parcelaCorta = null;
      if (!pideCampo(f.planType, "tituloHabilitante")) body.tituloHabilitante = null;
      const r = await fetch("/api/admin/forestal/plan", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 p-5">
      {err && (
        <div className="rounded-lg border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-3 py-2 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
          {err}
        </div>
      )}

      {/* 1 · Qué documento es: decide todo lo demás */}
      <Bloque n={1} titulo="Qué documento vas a registrar">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TIPOS_PLAN_LISTA.map((t) => {
            const activo = f.planType === t.key;
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={activo}
                onClick={() => elegirTipo(t.key)}
                className={`rounded-xl border-2 p-3 text-left transition-colors ${
                  activo
                    ? "border-[var(--data-success-500)] bg-[var(--data-success-50)]"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--rule-strong)]"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className={`text-sm font-bold ${activo ? "text-[var(--data-success-700)]" : "text-[var(--text-primary)]"}`}>
                    {t.sigla}
                  </span>
                  {activo && <Check className="h-3.5 w-3.5 text-[var(--data-success-700)]" strokeWidth={3} />}
                </span>
                <span className="mt-0.5 block text-xs font-semibold text-[var(--text-secondary)]">{t.nombre}</span>
                <span className="mt-1 block text-xs text-[var(--text-tertiary)]">{t.para}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">{meta.ayuda}</p>
      </Bloque>

      {/* 2 · El documento aprobado */}
      <Bloque n={2} titulo="Documento aprobado">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Field label="N° de documento">
            <input value={f.planNumber} onChange={(e) => set("planNumber", e.target.value)} placeholder="PO 12" className={cls} />
          </Field>
          {pideCampo(f.planType, "tituloHabilitante") && (
            <Field label="Título habilitante">
              <input value={f.tituloHabilitante} onChange={(e) => set("tituloHabilitante", e.target.value)} placeholder="17-CPO/C-J-001-02" className={cls} />
            </Field>
          )}
          <Field label="N° resolución">
            <input value={f.resolucionNumber} onChange={(e) => set("resolucionNumber", e.target.value)} placeholder="RDF N° 001-2026..." className={cls} />
          </Field>
          <Field label="Fecha resolución">
            <input type="date" value={f.resolucionDate} onChange={(e) => set("resolucionDate", e.target.value)} className={cls} />
          </Field>
          <Field label="ARFFS que aprobó">
            <input value={f.arffs} onChange={(e) => set("arffs", e.target.value)} placeholder="GERFOR Ucayali" className={cls} />
          </Field>
        </div>
      </Bloque>

      {/* 3 · Quién responde: titular y regente */}
      <Bloque n={3} titulo="Titular y regente">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Field label="Titular *">
            <input value={f.titularName} onChange={(e) => set("titularName", e.target.value)} placeholder="Maderera ... SAC" required className={cls} />
          </Field>
          <Field label="Representante legal">
            <input value={f.representanteLegal} onChange={(e) => set("representanteLegal", e.target.value)} placeholder="Si el titular es empresa" className={cls} />
          </Field>
          <Field label={`Regente forestal${meta.regente === "obligatorio" ? " *" : ""}`}>
            <input value={f.regenteName} onChange={(e) => set("regenteName", e.target.value)} placeholder="Ing. ..." className={cls} />
          </Field>
          <Field label="N° de registro SERFOR">
            <input value={f.regenteRegistro} onChange={(e) => set("regenteRegistro", e.target.value)} placeholder="RNR-0000" className={`${cls} font-mono`} />
          </Field>
          <Field label="Especialidad del regente">
            <select value={f.regenteEspecialidad} onChange={(e) => set("regenteEspecialidad", e.target.value)} className={cls}>
              {ESPECIALIDADES_REGENTE.map((x) => (
                <option key={x.key} value={x.key}>{x.label}</option>
              ))}
            </select>
          </Field>
        </div>
        {faltaRegente && (
          <p className="mt-2 flex items-start gap-2 rounded-xl border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-100)] px-3 py-2 text-xs font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Un {meta.sigla} lo elabora e implementa un regente forestal, y es quien firma el informe de ejecución junto
            al titular. Puedes guardar sin cargarlo, pero va a faltar en el expediente.
          </p>
        )}
      </Bloque>

      {/* 4 · Dónde y hasta cuándo */}
      <Bloque n={4} titulo="Área y vigencia">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Field label="Región">
            <input value={f.region} onChange={(e) => set("region", e.target.value)} onFocus={(e) => e.target.select()} className={cls} />
          </Field>
          {pideCampo(f.planType, "parcelaCorta") && (
            <Field label="Parcela de corta">
              <input value={f.parcelaCorta} onChange={(e) => set("parcelaCorta", e.target.value)} placeholder="PC 12" className={cls} />
            </Field>
          )}
          <Field label="Área (ha)">
            <input type="number" step="0.01" value={f.areaHa} onChange={(e) => set("areaHa", e.target.value)} className={cls} />
          </Field>
          <Field label="Vigencia desde">
            <input type="date" value={f.vigenciaDesde} onChange={(e) => set("vigenciaDesde", e.target.value)} className={cls} />
          </Field>
          <Field label="Vigencia hasta">
            <input type="date" value={f.vigenciaHasta} onChange={(e) => set("vigenciaHasta", e.target.value)} className={cls} />
          </Field>
        </div>
        {meta.vigenciaTipicaAnios != null && (
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">
            Un {meta.sigla} suele aprobarse por {meta.vigenciaTipicaAnios} año
            {meta.vigenciaTipicaAnios === 1 ? "" : "s"}. Carga las fechas de tu resolución, no las típicas.
          </p>
        )}
      </Bloque>

      <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3">
        <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!puedeGuardar}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--data-success-700)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Crear {meta.sigla}
        </button>
      </div>
    </form>
  );
}

/** Un paso del formulario, numerado: el alta tiene un orden, no doce campos sueltos. */
function Bloque({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--surface-sunken)] text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">
          {n}
        </span>
        {titulo}
      </CardTitle>
      {children}
    </section>
  );
}
