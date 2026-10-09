"use client";

import { useState } from "react";
import { Banknote, Clock, Loader2, Lock } from "@buleje/design-system/icons";
import { Kicker } from "@buleje/design-system";
import { Field } from "@/components/admin/shared/Field";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { csrfHeaders } from "@/lib/csrf-client";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BotonCancelar, MarcoModalCaja, mensajeDeError } from "./MarcoModalCaja";
import { fmt, type CashRegister, type StatsCaja } from "./tipos";

const DENOMS = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1];

interface Props {
  caja: CashRegister;
  stats: StatsCaja | null;
  onCerrar: () => void;
  onHecho: () => void;
}

/** Contar el efectivo final y cerrar la caja del día. */
export function ModalCerrarCaja({ caja, stats, onCerrar, onHecho }: Props) {
  const [monto, setMonto] = useState("");
  const [notas, setNotas] = useState("");
  const [cerrando, setCerrando] = useState(false);
  const [denominaciones, setDenominaciones] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const durationMs = Date.now() - new Date(caja.openedAt).getTime();
  const durationStr = `${Math.floor(durationMs / 3_600_000)}h ${Math.floor((durationMs % 3_600_000) / 60_000)}min`;
  const ventas = caja.movements.filter((m) => m.type === "venta");
  const ventasEfectivo = ventas.filter((m) => m.method === "efectivo").reduce((s, m) => s + m.amount, 0);
  const ventasDigital = ventas.filter((m) => m.method !== "efectivo").reduce((s, m) => s + m.amount, 0);
  const promedioVenta = ventas.length > 0 ? (ventasEfectivo + ventasDigital) / ventas.length : 0;
  const esperado = stats?.expectedCash ?? 0;
  const denomTotal = DENOMS.reduce((s, d) => s + d * (denominaciones[String(d)] ?? 0), 0);
  const diferencia = Number(monto) - esperado;

  const sumarBillete = (d: number) => {
    setDenominaciones((prev) => ({ ...prev, [String(d)]: (prev[String(d)] ?? 0) + 1 }));
    setMonto(String((denomTotal + d).toFixed(2)));
  };

  const cerrar = async () => {
    if (cerrando) return;
    setCerrando(true);
    setError(null);
    try {
      const res = await fetch(`/api/cash-registers/${caja.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action: "close", closingAmount: Number(monto) || 0, notes: notas || undefined }),
      });
      // Si el cierre falla, el conteo NO se borra: volver a contarlo todo por un 503 es lo que hacía que nadie confiara.
      if (!res.ok) {
        setError(await mensajeDeError(res, "No se pudo cerrar la caja"));
        return;
      }
      onHecho();
      onCerrar();
    } catch (err) {
      console.warn("[caja] cerrar caja falló", err);
      setError("Sin conexión con el servidor — la caja NO se cerró y el conteo sigue acá.");
    } finally {
      setCerrando(false);
    }
  };

  const resumen: Array<[string, string, string]> = [
    ["Duración", durationStr, "text-[var(--text-primary)]"],
    ["Total ventas", String(ventas.length), "text-[var(--text-primary)]"],
    ["Efectivo", fmt(ventasEfectivo), "text-[var(--data-success-500)]"],
    ["Digital", fmt(ventasDigital), "text-[var(--text-secondary)]"],
    ["Ingresos manuales", fmt(stats?.totalIn ?? 0), "text-[var(--data-success-500)]"],
    ["Egresos manuales", fmt(stats?.totalOut ?? 0), "text-[var(--data-error-500)]"],
  ];

  return (
    <MarcoModalCaja
      claveMemoria="caja-cerrar"
      titulo="Cerrar caja"
      subtitulo="Cuenta el efectivo final y cierra el día"
      icono={Lock}
      iconoClase="bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 text-[var(--data-error-500)]"
      ancho="lg"
      onCerrar={onCerrar}
      error={error}
      pie={
        <>
          <BotonCancelar onClick={onCerrar} />
          <button
            type="button"
            onClick={cerrar}
            disabled={cerrando || !monto}
            className="flex-1 flex items-center justify-center gap-2 min-h-11 rounded-xl text-base font-semibold text-white bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)]/90 disabled:opacity-50 transition-colors"
          >
            {cerrando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
            Confirmar cierre
          </button>
        </>
      }
    >
      <div>
        <Kicker className="libro-kicker mb-2 flex items-center gap-2">
          <Clock className="h-4 w-4" aria-hidden /> Resumen del turno
        </Kicker>
        <div className="bg-[var(--surface-alt)] rounded-xl p-4 grid grid-cols-2 gap-3">
          {resumen.map(([rotulo, valor, color]) => (
            <div key={rotulo}>
              <p className="text-sm text-[var(--text-tertiary)]">{rotulo}</p>
              <p className={cn("text-base font-bold tabular-nums", color)}>{valor}</p>
            </div>
          ))}
          <div className="col-span-2 pt-2 border-t border-[var(--rule-soft)]">
            <p className="text-sm text-[var(--text-tertiary)]">Promedio por venta</p>
            <p className="text-base font-bold text-[var(--text-primary)] tabular-nums">{fmt(promedioVenta)}</p>
          </div>
        </div>
      </div>

      <div className="bg-primary/10 dark:bg-primary/15 rounded-xl p-4 border border-[var(--data-success-500)]/30">
        <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)] mb-1">
          Esperado en caja
          <InfoTip
            what={`Apertura (${fmt(caja.openingAmount)}) + Ventas efectivo (${fmt(stats?.salesEfectivo ?? 0)}) + Ingresos (${fmt(stats?.totalIn ?? 0)}) − Egresos (${fmt(stats?.totalOut ?? 0)})`}
            affects={stats?.fueraDelCajon ?? undefined}
          />
        </p>
        <p className="text-2xl font-extrabold text-[var(--data-success-700)] dark:text-[var(--data-success-500)] tabular-nums">{fmt(esperado)}</p>
      </div>

      <div className="bg-[var(--surface-alt)] rounded-xl p-3 border border-[var(--rule-base)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1">
            <Banknote className="h-4 w-4 text-primary" aria-hidden /> Contador de denominaciones
          </span>
          {Object.keys(denominaciones).length > 0 && (
            <button type="button" onClick={() => { setDenominaciones({}); setMonto(""); }} className="text-xs text-[var(--data-error-500)] font-bold">
              Resetear
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 mb-2">
          {DENOMS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => sumarBillete(d)}
              className="relative px-2 min-h-10 rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)] hover:border-primary hover:bg-primary/5 transition-all text-xs font-bold text-[var(--text-primary)]"
            >
              {formatCurrency(d)}
              {(denominaciones[String(d)] ?? 0) > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary text-white text-xs flex items-center justify-center">{denominaciones[String(d)]}</span>
              )}
            </button>
          ))}
        </div>
        {denomTotal > 0 && <p className="text-center text-sm font-extrabold text-primary">Contado por denominaciones: {fmt(denomTotal)}</p>}
      </div>

      <Field label="Monto contado en caja" labelClassName="text-xs font-bold text-[var(--text-secondary)]">
        {(id) => (
          <>
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
            {monto && (
              <div
                className={cn(
                  "mt-2 rounded-xl p-2 text-center text-xs font-bold",
                  diferencia >= 0 ? "bg-primary/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 text-[var(--data-error-500)]",
                )}
              >
                Diferencia: {diferencia > 0 ? "+" : ""}
                {fmt(diferencia)}
              </div>
            )}
          </>
        )}
      </Field>
      <Field label="Notas (opcional)" labelClassName="text-xs font-bold text-[var(--text-secondary)]">
        <input
          type="text"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Observaciones"
          className="w-full mt-1 px-3 h-11 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] outline-none focus:border-primary"
        />
      </Field>
    </MarcoModalCaja>
  );
}
