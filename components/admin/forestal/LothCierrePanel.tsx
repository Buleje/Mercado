"use client";

/**
 * LothCierrePanel — pestaña "Cierre" del Libro TH. Cerrar un mes lo vuelve un
 * acta inmutable (invariante P1): las líneas fechadas en él ya no se pueden
 * registrar ni anular hasta reabrir. Es lo #1 que pide OSINFOR de un libro.
 *
 * Gemelo (más simple) de `CtpCierrePanel`: el LO-TH no congela costos ni
 * snapshotea existencia — sólo bloquea el mes.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Lock,
  Unlock,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  CalendarClock,
} from "@buleje/design-system/icons";
import { LoadingState, ErrorAlert } from "@buleje/design-system";
import { Btn } from "./ctp-shared";

interface Cierre {
  periodKey: string;
  label: string;
  closedAt: string;
  closedBy: string;
  totales: { lineasCount: number; taladoM3: number; trozadoM3: number };
  reabierto?: { at: string; by: string; motivo: string } | null;
}

const fm = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fdate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
};

/** "YYYY-MM" del mes ACTUAL (default del picker — donde suele estar la actividad
 * reciente; antes apuntaba al mes anterior y el usuario podía cerrar uno vacío). */
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function LothCierrePanel() {
  const [cierres, setCierres] = useState<Cierre[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState(currentMonth);
  const [busy, setBusy] = useState(false);
  const [confirmCerrar, setConfirmCerrar] = useState(false);
  const [reabrirKey, setReabrirKey] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/loth/cierre", { credentials: "include" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.message ?? d.error ?? `HTTP ${r.status}`);
      }
      setCierres((await r.json()).cierres ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const { csrfHeaders } = await import("@/lib/csrf-client");
      const r = await fetch("/api/admin/forestal/loth/cierre", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.message ?? d.error ?? `HTTP ${r.status}`);
      }
      setCierres((await r.json()).cierres ?? []);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function cerrar() {
    const [y, m] = period.split("-").map(Number);
    if (!y || !m) return;
    await post({ action: "cerrar", year: y, month: m });
    setConfirmCerrar(false);
  }
  async function doReabrir(periodKey: string) {
    if (motivo.trim().length < 3) return;
    const ok = await post({ action: "reabrir", periodKey, motivo: motivo.trim() });
    if (ok) {
      setReabrirKey(null);
      setMotivo("");
    }
  }

  if (loading && cierres === null) return <LoadingState message="Cargando períodos cerrados..." />;
  if (error && cierres === null) {
    return <ErrorAlert title="No se pudo cargar el cierre" description={error} action={<Btn variant="secondary" size="sm" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" /> Reintentar</Btn>} />;
  }

  const activos = (cierres ?? []).filter((c) => !c.reabierto);

  return (
    <div className="space-y-4">
      {error && <ErrorAlert title="No se pudo completar la acción" description={error} />}

      {/* Cerrar un período */}
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <div className="mb-1 flex items-center gap-2">
          <Lock className="h-4 w-4 text-[var(--accent-dark)] dark:text-[var(--accent)]" />
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Cerrar un período</h3>
        </div>
        <p className="mb-3 text-sm text-[var(--text-tertiary)]">
          Cerrar el mes vuelve sus líneas <b className="text-[var(--text-secondary)]">inmutables</b>: no se podrán registrar ni anular hasta reabrirlo. Es lo que exige OSINFOR de un libro de operaciones.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Mes a cerrar</span>
            <input
              type="month"
              value={period}
              onChange={(e) => { setPeriod(e.target.value); setConfirmCerrar(false); }}
              className="h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </label>
          {!confirmCerrar ? (
            <Btn variant="primary" size="md" onClick={() => setConfirmCerrar(true)} disabled={busy}>
              <Lock className="h-4 w-4" /> Cerrar período
            </Btn>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-[var(--data-warning-700)]">Bloquea el mes (solo reabrible con motivo). ¿Confirmás?</span>
              <Btn variant="danger" size="md" onClick={() => void cerrar()} disabled={busy}>
                {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Sí, cerrar
              </Btn>
              <Btn variant="secondary" size="md" onClick={() => setConfirmCerrar(false)} disabled={busy}>Cancelar</Btn>
            </div>
          )}
        </div>
      </div>

      {/* Períodos cerrados */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-[var(--text-tertiary)]" />
          <h3 className="text-sm font-bold text-[var(--text-primary)]">
            Períodos cerrados <span className="text-[var(--text-tertiary)]">({activos.length} {activos.length === 1 ? "activo" : "activos"})</span>
          </h3>
        </div>
        {(cierres ?? []).length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-8 text-center text-sm text-[var(--text-tertiary)]">
            Ningún período cerrado todavía. Cerrá un mes cuando termines de registrar sus operaciones.
          </div>
        ) : (
          <div className="space-y-2">
            {(cierres ?? []).map((c) => (
              <div key={c.periodKey} className={`rounded-2xl border-2 p-4 ${c.reabierto ? "border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)]" : "border-[var(--rule-base)] bg-[var(--surface-raised)]"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {c.reabierto ? <Unlock className="h-4 w-4 text-[var(--data-warning-700)]" /> : <ShieldCheck className="h-4 w-4 text-[var(--data-success-600)]" />}
                      <span className="font-bold capitalize text-[var(--text-primary)]">{c.label}</span>
                      {c.reabierto ? (
                        <span className="rounded-full bg-[var(--data-warning-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--data-warning-700)]">Reabierto</span>
                      ) : (
                        <span className="rounded-full bg-[var(--data-success-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--data-success-700)]">Bloqueado</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                      {c.totales.lineasCount} líneas · {fm(c.totales.taladoM3)} m³ talados · {fm(c.totales.trozadoM3)} m³ trozados · cerrado {fdate(c.closedAt)} por {c.closedBy}
                    </p>
                    {c.reabierto && (
                      <p className="mt-1 flex items-start gap-1.5 text-xs text-[var(--data-warning-700)]">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Reabierto {fdate(c.reabierto.at)} por {c.reabierto.by} · motivo: {c.reabierto.motivo}
                      </p>
                    )}
                  </div>
                  {!c.reabierto && (
                    reabrirKey === c.periodKey ? (
                      <div className="flex flex-col items-end gap-2">
                        <input
                          type="text"
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                          placeholder="Motivo de reapertura (min 3)"
                          className="h-9 w-56 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--data-warning-500)]"
                        />
                        <div className="flex gap-2">
                          <Btn variant="danger" size="sm" onClick={() => void doReabrir(c.periodKey)} disabled={busy || motivo.trim().length < 3}>
                            <Unlock className="h-3.5 w-3.5" /> Confirmar reapertura
                          </Btn>
                          <Btn variant="secondary" size="sm" onClick={() => { setReabrirKey(null); setMotivo(""); }}>Cancelar</Btn>
                        </div>
                      </div>
                    ) : (
                      <Btn variant="secondary" size="sm" onClick={() => { setReabrirKey(c.periodKey); setMotivo(""); }}>
                        <Unlock className="h-3.5 w-3.5" /> Reabrir
                      </Btn>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
