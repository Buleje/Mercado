"use client";

import { useState } from "react";
import { AlertTriangle, Banknote, Check, Loader2, Scan } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { csrfHeaders } from "@/lib/csrf-client";
import { formatCurrency, formatDateTimeShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BotonCancelar, MarcoModalCaja } from "./MarcoModalCaja";
import { fmt, type CashRegister, type StatsCaja } from "./tipos";

const ARQUEO_DENOMS = [100, 50, 20, 10, 5, 1];

interface Props {
  caja: CashRegister;
  stats: StatsCaja | null;
  onCerrar: () => void;
  onHecho: () => void;
}

/** Conteo intermedio: verifica el cajón SIN cerrar la caja. */
export function ModalArqueoExpress({ caja, stats, onCerrar, onHecho }: Props) {
  const [monto, setMonto] = useState("");
  const [denoms, setDenoms] = useState<Record<string, number>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = ARQUEO_DENOMS.reduce((s, d) => s + d * (denoms[String(d)] ?? 0), 0);
  const esperado = stats?.expectedCash ?? 0;
  const contado = Number(monto) || 0;
  const diferencia = contado - esperado;
  const cuadra = Math.abs(diferencia) < 0.5;

  const registrar = async () => {
    if (guardando || !monto) return;
    setGuardando(true);
    setError(null);
    try {
      // Mismo contrato que CashAuditTab: /api/cash-registers/[id] con action «arqueo».
      const res = await fetch(`/api/cash-registers/${caja.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          action: "arqueo",
          closingAmount: contado,
          notes: `${formatDateTimeShort(new Date())} | Esperado: ${formatCurrency(esperado)} | Contado: ${formatCurrency(contado)} | Diferencia: ${diferencia >= 0 ? "+" : ""}${formatCurrency(diferencia)}`,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      onHecho();
      onCerrar();
    } catch (err) {
      setError(`No se pudo registrar el arqueo: ${err instanceof Error ? err.message : "intenta de nuevo."}`);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <MarcoModalCaja
      claveMemoria="caja-arqueo"
      titulo={
        <span className="inline-flex items-center gap-1.5">
          Arqueo express
          <InfoTip what="El arqueo express NO cierra la caja: sólo deja anotada una verificación intermedia para control." example="A media tarde cuentas el cajón y ves si falta algo antes del cierre." />
        </span>
      }
      subtitulo="Verificación rápida sin cerrar caja"
      icono={Scan}
      iconoClase="bg-primary/10 text-[var(--data-success-500)]"
      onCerrar={onCerrar}
      error={error}
      pie={
        <>
          <BotonCancelar onClick={onCerrar} />
          <button
            type="button"
            onClick={registrar}
            disabled={guardando || !monto}
            className="flex-1 flex items-center justify-center gap-2 min-h-11 rounded-xl text-base font-semibold text-white bg-[var(--accent-dark)] hover:brightness-110 disabled:opacity-50 transition-colors"
          >
            {guardando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            Registrar arqueo
          </button>
        </>
      }
    >
      <div className="bg-[var(--surface-alt)] rounded-xl p-4 space-y-2">
        <div className="flex justify-between items-center text-base">
          <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
            Esperado en caja
            <InfoTip
              what={`Apertura (${fmt(caja.openingAmount)}) + Ventas efectivo (${fmt(stats?.salesEfectivo ?? 0)}) + Ingresos (${fmt(stats?.totalIn ?? 0)}) − Egresos (${fmt(stats?.totalOut ?? 0)})`}
              affects={stats?.fueraDelCajon ?? undefined}
            />
          </span>
          <span className="font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)] tabular-nums">{fmt(esperado)}</span>
        </div>
        <div className="flex justify-between items-center text-base">
          <span className="text-[var(--text-secondary)]">Contado</span>
          <span className="font-bold text-[var(--text-primary)] tabular-nums">{fmt(contado)}</span>
        </div>
      </div>

      <div className="bg-[var(--surface-alt)] rounded-xl p-3 border border-[var(--rule-base)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1">
            <Banknote className="h-4 w-4 text-primary" aria-hidden /> Conteo rápido
          </span>
          {Object.keys(denoms).length > 0 && (
            <button type="button" onClick={() => { setDenoms({}); setMonto(""); }} className="text-xs text-[var(--data-error-500)] font-bold">
              Resetear
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 mb-2">
          {ARQUEO_DENOMS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setDenoms((prev) => ({ ...prev, [String(d)]: (prev[String(d)] ?? 0) + 1 }));
                setMonto(String((total + d).toFixed(2)));
              }}
              className="relative px-3 min-h-11 rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)] hover:border-primary hover:bg-primary/5 transition-all text-sm font-semibold text-[var(--text-primary)]"
            >
              S/{d}
              {(denoms[String(d)] ?? 0) > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold">{denoms[String(d)]}</span>
              )}
            </button>
          ))}
        </div>
        {total > 0 && <p className="text-center text-base font-extrabold text-primary">Total contado: {fmt(total)}</p>}
      </div>

      <Field label="Monto total verificado" labelClassName="text-xs font-bold text-[var(--text-secondary)]">
        {(id) => (
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] font-bold text-sm">S/</span>
            <input
              id={id}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.10"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00"
              className="w-full pl-10 pr-4 h-11 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] outline-none focus:border-primary"
              // eslint-disable-next-line jsx-a11y/no-autofocus -- el modal se abre para escribir el monto de inmediato
              autoFocus
            />
          </div>
        )}
      </Field>

      {monto && <VeredictoDiferencia diferencia={diferencia} cuadra={cuadra} />}
    </MarcoModalCaja>
  );
}

/** «Cuadra / sobra / falta» con la diferencia grande. Lo usan los dos arqueos. */
export function VeredictoDiferencia({ diferencia, cuadra }: { diferencia: number; cuadra: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl p-3 text-center border",
        cuadra ? "bg-primary/10 border-[var(--data-success-500)]/30" : "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 border-[var(--data-error-500)]/40",
      )}
    >
      <div className="flex items-center justify-center gap-2 mb-1">
        {cuadra ? <Check className="h-5 w-5 text-[var(--data-success-500)]" aria-hidden /> : <AlertTriangle className="h-5 w-5 text-[var(--data-error-500)]" aria-hidden />}
        <span className="text-xs font-bold text-[var(--text-secondary)] uppercase">Diferencia</span>
      </div>
      <p className={cn("text-xl sm:text-2xl font-extrabold tabular-nums", cuadra ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
        {diferencia >= 0 ? "+" : ""}
        {fmt(diferencia)}
      </p>
      <p className="text-xs text-[var(--text-secondary)] mt-1">{cuadra ? "Cuadra correctamente" : diferencia > 0 ? "Hay más efectivo del esperado" : "Falta efectivo"}</p>
    </div>
  );
}
