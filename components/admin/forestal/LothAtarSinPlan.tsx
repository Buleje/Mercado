"use client";

/**
 * LothAtarSinPlan — el aviso de «líneas sin permiso» de la vista Secciones y el
 * modal que las ata (02-10-2026, ADR-459).
 *
 * Una línea del libro sin plan cuenta en el saldo de TODOS los permisos: las
 * produjo el importador viejo y las líneas antiguas. El aviso es UNA línea y se
 * va solo cuando no queda ninguna. «Atarlas» pide el permiso de las TALAS; el
 * trozado, el despacho y el consumo heredan el de su fuente (tala / troza) y la
 * vista previa dice, por sección, cuántas van a qué permiso — antes de escribir.
 *
 * Los meses cerrados no se tocan y se dicen. Sólo admin/dueño ven el botón (el
 * servidor lo exige igual): el encargado ve el aviso, no la acción.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Link2, Loader2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { useMiRol } from "@/hooks/use-mi-rol";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import type { AtarSinPlanConteo, AtarSinPlanResultado } from "@/lib/forestal/loth-atar-sin-plan";
import { nombreDelPlan, type PlanTablero } from "@/lib/forestal/loth-tablero-permiso";
import { SECTION_META } from "./LothEntryForm";
import type { LothSection } from "@/lib/forestal/loth-constants";

/** El mismo rótulo que los selectores de permiso del libro y del Control. */
function rotulo(p: PlanTablero): string {
  return p.titularName && p.titularName !== nombreDelPlan(p) ? `${nombreDelPlan(p)} · ${p.titularName}` : nombreDelPlan(p);
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default function LothAtarSinPlan({
  planes,
  planInicial,
  reloadSignal,
  onAtado,
}: {
  planes: readonly PlanTablero[];
  /** El permiso con el que se mira el libro, si es un plan real: arranca elegido. */
  planInicial: string | null;
  reloadSignal: number;
  /** Se ataron líneas: la vista relee la lista y los contadores. */
  onAtado: () => void;
}) {
  const rol = useMiRol();
  const puede = rol === "admin" || rol === "owner" || rol === "superadmin";
  const [conteo, setConteo] = useState<AtarSinPlanConteo | null>(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const r = await fetch("/api/admin/forestal/loth/atar-plan", { credentials: "include", signal: ac.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await leerJson<AtarSinPlanConteo>(r);
        if (!ac.signal.aborted && j) setConteo(j);
      } catch (err) {
        if (ac.signal.aborted) return;
        /* Sin el conteo no hay aviso: el libro sigue sirviendo. */
        logger.warn("[loth-atar] no se pudo contar las líneas sin plan", { error: String(err) });
      }
    })();
    return () => ac.abort();
  }, [reloadSignal]);

  if (!conteo || conteo.total === 0) return null;
  return (
    <>
      <div
        role="status"
        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 px-4 py-2.5 text-sm"
      >
        <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
        <p className="min-w-0 flex-1 font-semibold text-[var(--text-primary)]">
          {plural(conteo.total, "línea sin permiso", "líneas sin permiso")}: cuentan en el saldo de todos.
        </p>
        {puede && (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[var(--accent-dark)] px-4 text-sm font-semibold text-white hover:opacity-90"
          >
            <Link2 className="h-4 w-4" aria-hidden />
            Atarlas
          </button>
        )}
      </div>
      {abierto && (
        <AtarModal
          planes={planes}
          planInicial={planInicial}
          onClose={() => setAbierto(false)}
          onAtado={() => {
            setAbierto(false);
            onAtado();
          }}
        />
      )}
    </>
  );
}

function AtarModal({
  planes,
  planInicial,
  onClose,
  onAtado,
}: {
  planes: readonly PlanTablero[];
  planInicial: string | null;
  onClose: () => void;
  onAtado: () => void;
}) {
  const [planId, setPlanId] = useState<string>(
    planInicial && planes.some((p) => p.id === planInicial) ? planInicial : planes.length === 1 ? planes[0].id : "",
  );
  const [vista, setVista] = useState<AtarSinPlanResultado | null>(null);
  const [cargando, setCargando] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nombres = useMemo(() => new Map(planes.map((p) => [p.id, rotulo(p)])), [planes]);

  /* La vista previa sigue al permiso elegido; sólo vale la última pedida. */
  useEffect(() => {
    if (!planId) {
      setVista(null);
      return;
    }
    const ac = new AbortController();
    setCargando(true);
    setError(null);
    (async () => {
      try {
        const r = await fetch(`/api/admin/forestal/loth/atar-plan?planId=${encodeURIComponent(planId)}`, {
          credentials: "include",
          signal: ac.signal,
        });
        const j = await leerJson<AtarSinPlanResultado & { message?: string; error?: string }>(r);
        if (ac.signal.aborted) return;
        if (!r.ok || !j) throw new Error(j?.message ?? j?.error ?? `HTTP ${r.status}`);
        setVista(j);
      } catch (err) {
        if (ac.signal.aborted) return;
        setVista(null);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!ac.signal.aborted) setCargando(false);
      }
    })();
    return () => ac.abort();
  }, [planId]);

  const atar = useCallback(async () => {
    if (!planId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/loth/atar-plan", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ planId }),
      });
      const j = await leerJson<{ message?: string; error?: string }>(r);
      if (!r.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${r.status}`);
      onAtado();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [planId, onAtado]);

  const atables = vista?.atadas ?? 0;

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Atar líneas sin permiso"
      description="Una línea sin permiso cuenta en el saldo de todos. Elige el de las talas; lo demás sigue a su fuente."
      icon={Link2}
      className="max-w-2xl"
      footer={
        <>
          <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void atar()}
            disabled={busy || cargando || !planId || atables === 0}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent-dark)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
            {atables > 0 ? `Atar ${plural(atables, "línea", "líneas")}` : "Atar"}
          </button>
        </>
      }
    >
      <div className={`space-y-3 ${MODAL_BODY}`}>
        {error && (
          <p role="alert" className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="atar-permiso" className="shrink-0 text-sm font-semibold text-[var(--text-secondary)]">
            Permiso de las talas
          </label>
          <select
            id="atar-permiso"
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            /* `dark:bg-…` saca al select del respaldo oscuro de globals.css, que le pisa el borde. */
            className={`h-10 w-auto max-w-full flex-1 rounded-xl border-2 bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none dark:bg-[var(--surface-raised)] ${
              planId ? "border-[var(--accent)]" : "border-[var(--rule-base)]"
            }`}
          >
            <option value="">Elige un permiso…</option>
            {planes.map((p) => (
              <option key={p.id} value={p.id}>
                {rotulo(p)}
              </option>
            ))}
          </select>
        </div>

        {!planId && <p className="text-sm text-[var(--text-secondary)]">Elige el permiso para ver cuántas líneas va a atar a cada uno.</p>}
        {planId && cargando && !vista && (
          <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Calculando…
          </p>
        )}

        {vista && (
          <>
            <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-sunken)] text-left text-xs font-bold text-[var(--text-secondary)]">
                  <tr>
                    <th className="px-3 py-2">Sección</th>
                    <th className="px-3 py-2 text-right">Sin permiso</th>
                    <th className="px-3 py-2">Va a</th>
                  </tr>
                </thead>
                <tbody>
                  {vista.porSeccion.map((s) => (
                    <tr key={s.section} className="border-t border-[var(--rule-base)] align-top">
                      <td className="px-3 py-2 font-semibold text-[var(--text-primary)]">{SECTION_META[s.section as LothSection]?.label ?? s.section}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-primary)]">{s.total}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">
                        <ul className="space-y-0.5">
                          {s.porPlan.map((t) => (
                            <li key={t.planId}>
                              <b className="font-mono tabular-nums text-[var(--text-primary)]">{t.n}</b> a {nombres.get(t.planId) ?? "otro permiso"}
                              {t.heredado > 0 && <span> ({t.heredado === t.n ? "siguen a su " : `${t.heredado} siguen a su `}{s.section === "trozado" ? "tala" : "troza"})</span>}
                            </li>
                          ))}
                          {s.cerradas > 0 && <li>{plural(s.cerradas, "queda", "quedan")} sin tocar: mes cerrado</li>}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {vista.cerradas.n > 0 && (
              <p className="rounded-xl bg-[var(--surface-sunken)] p-3 text-sm text-[var(--text-secondary)]">
                <b className="text-[var(--text-primary)]">{plural(vista.cerradas.n, "línea", "líneas")}</b> de {vista.cerradas.periodos.join(", ")} no se {vista.cerradas.n === 1 ? "toca" : "tocan"}:
                el mes está cerrado y su acta no cambia. Reábrelo para atarlas.
              </p>
            )}
            {vista.fueraDelRegistro.n > 0 && (
              <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/12 p-3 text-sm font-semibold text-[var(--text-primary)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
                <span>
                  {plural(vista.fueraDelRegistro.n, "línea queda", "líneas quedan")} con una especie que no está en el registro de su permiso (
                  {vista.fueraDelRegistro.especies.join(", ")}). Se atan igual —ya estaban asentadas—, pero revísalas.
                </span>
              </p>
            )}
          </>
        )}
      </div>
    </AdminModal>
  );
}
