"use client";

/**
 * CtpKardexModal — cuenta corriente de la materia prima de UNA especie.
 *
 * Saldos muestra el balance NETO; esto muestra los MOVIMIENTOS que lo formaron:
 * cada ingreso (+) y cada consumo en producción (−) en orden cronológico, con el
 * saldo corriente después de cada uno. Es el detalle que un fiscalizador
 * reconstruye a mano. El saldo final coincide con el de la pestaña Saldos.
 */

import { useCallback, useEffect, useState } from "react";
import AdminModal from "@/components/admin/shared/AdminModal";
import { MODAL_BODY } from "./ctp-shared";
import { AlertCircle, Scale } from "@buleje/design-system/icons";
import { LoadingState } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import CtpKardexTabla, { type MovimientoKardex } from "./CtpKardexTabla";

interface Kardex {
  especie: string;
  movimientos: MovimientoKardex[];
  ingresoTotal: number;
  consumoTotal: number;
  saldo: number;
}

const n4 = (v: number) => fmtM3(v);

export default function CtpKardexModal({
  especie,
  period,
  onClose,
}: {
  especie: string;
  period: CtpPeriod;
  onClose: () => void;
}) {
  const [k, setK] = useState<Kardex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = applyCtpPeriodParams(new URLSearchParams({ kardex: especie }), period);
      const r = await fetch(`/api/admin/forestal/ctp?${p}`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setK((await r.json()).kardex ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [especie, period]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminModal
      open
      onClose={onClose}
      variant="info"
      title={`Kardex · ${especie}`}
      description={`Movimientos de materia prima en ${period.label}`}
      icon={Scale}
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        {loading && <LoadingState message="Cargando movimientos…" className="py-8" />}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-ink)]">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div>
              <strong>Error:</strong> {error}
            </div>
          </div>
        )}

        {k && !loading && (
          <>
            {/* Resumen (sidebar) + movimientos (tabla) lado a lado. */}
            <div className="grid gap-4 lg:grid-cols-[15rem_1fr] lg:items-start">
              <div className="space-y-3">
                <Stat label="Ingresado" value={`${n4(k.ingresoTotal)} m³`} tone="ok" />
                <Stat label="Consumido" value={`${n4(k.consumoTotal)} m³`} />
                <Stat label="Saldo" value={`${n4(k.saldo)} m³`} tone={k.saldo < 0 ? "bad" : "ok"} />
                <p className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                  Cómo se lee
                  <InfoTip
                    icono="ayuda"
                    title="Cómo se lee el kardex"
                    what="El saldo final coincide con la pestaña Saldos."
                    affects="Consumo = m³ declarados en las corridas de producción de esta especie."
                  />
                </p>
              </div>

              <CtpKardexTabla
                movimientos={k.movimientos}
                ingresoTotal={k.ingresoTotal}
                consumoTotal={k.consumoTotal}
                saldo={k.saldo}
                vacio={`Sin movimientos de ${especie} en ${period.label}.`}
                excel={`Kardex ${especie}`}
              />
            </div>
          </>
        )}
      </div>
    </AdminModal>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  const color =
    tone === "bad"
      ? "text-[var(--data-error-ink)]"
      : tone === "ok"
        ? "text-[var(--data-success-ink)]"
        : "text-[var(--text-primary)]";
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
      <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className={`mt-0.5 font-mono text-base font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
