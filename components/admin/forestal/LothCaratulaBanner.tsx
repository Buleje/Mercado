"use client";

/**
 * LothCaratulaBanner — el cajetín del plano sale con "—" en Distrito/Provincia
 * mientras el libro no tenga CARÁTULA. En vez de dejar que el titular descubra
 * el hueco cuando imprime, se avisa acá y se completa en un paso: los tres
 * campos de ubicación política (y el titular, si todavía no hay carátula).
 *
 * Escribe en el mismo endpoint que la carátula completa (`/loth/caratula`):
 * POST si no existe, PATCH si ya está creada.
 */

import { useState } from "react";
import { AlertTriangle, Check, Loader2, X } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";

export interface CaratulaUbicacion {
  id: string | null;
  titularName: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
}

interface Props {
  caratula: CaratulaUbicacion | null;
  /** Titular del plan activo — sugerido cuando hay que crear la carátula. */
  titularSugerido: string | null;
  onSaved: (c: CaratulaUbicacion) => void;
}

const INPUT =
  "h-12 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-semibold text-[var(--text-primary)]";

export default function LothCaratulaBanner({ caratula, titularSugerido, onSaved }: Props) {
  const completa = !!(caratula?.departamento && caratula?.provincia && caratula?.distrito);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titular, setTitular] = useState(caratula?.titularName ?? titularSugerido ?? "");
  const [departamento, setDepartamento] = useState(caratula?.departamento ?? "");
  const [provincia, setProvincia] = useState(caratula?.provincia ?? "");
  const [distrito, setDistrito] = useState(caratula?.distrito ?? "");

  if (completa) return null;

  const guardar = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = caratula?.id
        ? { id: caratula.id, departamento, provincia, distrito }
        : { titularName: titular.trim(), departamento, provincia, distrito };
      const r = await fetch("/api/admin/forestal/loth/caratula", {
        method: caratula?.id ? "PATCH" : "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      const saved = (await r.json()).caratula ?? {};
      onSaved({
        id: saved.id ?? caratula?.id ?? null,
        titularName: saved.titularName ?? titular,
        departamento: saved.departamento ?? departamento,
        provincia: saved.provincia ?? provincia,
        distrito: saved.distrito ?? distrito,
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const puedeGuardar = departamento.trim() && provincia.trim() && distrito.trim() && (caratula?.id || titular.trim().length > 1);

  return (
    <div className="rounded-2xl border-2 border-[var(--data-warning-500)]/60 bg-[var(--data-warning-100)] p-3 dark:bg-[var(--data-warning-500)]/12">
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" />
        <p className="flex-1 text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          El cajetín de los planos va a salir sin <b>ubicación política</b>{caratula?.id ? "" : " (el libro todavía no tiene carátula)"}.
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--brand-ink)] px-3 text-xs font-bold text-white hover:opacity-90"
        >
          {open ? <X className="h-3.5 w-3.5" /> : null}
          {open ? "Cerrar" : "Completar en 1 paso"}
        </button>
      </div>

      {open && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {!caratula?.id && (
            <label className="text-xs font-bold text-[var(--text-secondary)] sm:col-span-2">
              Titular del título habilitante
              <input value={titular} onChange={(e) => setTitular(e.target.value)} className={`mt-1 ${INPUT}`} />
            </label>
          )}
          <label className="text-xs font-bold text-[var(--text-secondary)]">
            Departamento
            <input value={departamento} onChange={(e) => setDepartamento(e.target.value)} placeholder="Ucayali" className={`mt-1 ${INPUT}`} />
          </label>
          <label className="text-xs font-bold text-[var(--text-secondary)]">
            Provincia
            <input value={provincia} onChange={(e) => setProvincia(e.target.value)} placeholder="Coronel Portillo" className={`mt-1 ${INPUT}`} />
          </label>
          <label className="text-xs font-bold text-[var(--text-secondary)]">
            Distrito
            <input value={distrito} onChange={(e) => setDistrito(e.target.value)} placeholder="Callería" className={`mt-1 ${INPUT}`} />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={guardar}
              disabled={!puedeGuardar || saving}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand-ink)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar
            </button>
          </div>
          {error && (
            <p className="text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)] sm:col-span-2 lg:col-span-4">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
