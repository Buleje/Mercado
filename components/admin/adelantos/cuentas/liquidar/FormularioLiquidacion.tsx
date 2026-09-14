"use client";

/**
 * Qué hacer + los campos del acto (ADR-413 §UI, pasos 3-4).
 *
 * Arma la `IntencionLiquidacion` y se la pasa al padre por `onCambiar` — la
 * vista previa la recalcula un nivel arriba con la MISMA función pura que usa
 * el servidor (`planLiquidacion`), acá sólo se junta la intención.
 */

import { useEffect, useMemo, useState } from "react";
import { Banknote, ChevronDown, HandCoins, Scale, Wallet } from "@buleje/design-system/icons";
import {
  imputarFifo,
  intencionDejarEnCero,
  maximoCompensable,
  saldosDe,
  type IntencionLiquidacion,
  type MetodoPago,
  type PartidasDePersona,
} from "@/lib/cuentas/liquidacion";
import { HOY, ORIGENES_CAJA } from "../../crear-adelanto/campos";
import { fmtMon, inputCls } from "../../shared";

type Accion = "cero" | "cruzar" | "recibido" | "hecho";
const METODOS = ORIGENES_CAJA.filter((o) => o.id) as { id: MetodoPago; label: string; Icon: typeof Banknote }[];

const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, max: number) => Math.min(Math.max(0, n), Math.max(0, max));

export default function FormularioLiquidacion({
  partidas,
  onCambiar,
  vinculoFaltante,
}: {
  partidas: PartidasDePersona;
  onCambiar: (intencion: IntencionLiquidacion | null) => void;
  /**
   * Sin vínculo explícito, el servidor arma las partidas SIN la cuenta
   * forestal (`leerPartidas`, revisión de código): `intencionDejarEnCero`
   * calcularía "en cero" mirando sólo los adelantos, aunque la cabecera siga
   * mostrando una deuda de madera real — "Dejar en cero" queda deshabilitado
   * mientras tanto.
   */
  vinculoFaltante: boolean;
}) {
  const maxCompensable = useMemo(() => maximoCompensable(partidas), [partidas]);
  const saldos = useMemo(() => saldosDe(partidas), [partidas]);
  const puedeCero = useMemo(() => !vinculoFaltante && intencionDejarEnCero(partidas, HOY(), "efectivo", true) != null, [partidas, vinculoFaltante]);
  // "Me pagó" cobra el adelanto Y, si la corre la misma persona con vínculo
  // explícito, lo que debe por aserrío (ADR-412/413: el caso central de
  // Brandon — le cobrás el aserrío y te paga una parte). Sin vínculo,
  // `saldos.maderaSaldo` ya sale en 0 (la cuenta forestal no llega a
  // `partidas`), así que la fórmula se achica sola a sólo adelantos.
  const maximoRecibido = useMemo(() => r2(saldos.adelantosTeDebe + Math.max(0, saldos.maderaSaldo)), [saldos]);

  const [accion, setAccion] = useState<Accion | null>(null);
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");
  const [moverCaja, setMoverCaja] = useState(true);
  const [fecha, setFecha] = useState(HOY());
  const [notas, setNotas] = useState("");
  const [repartoManual, setRepartoManual] = useState(false);
  const [repartoPorAdelanto, setRepartoPorAdelanto] = useState<Record<string, string>>({});

  // Al elegir una acción, se prellena el monto con el máximo que corresponde —
  // el operador corrige si va a cruzar/cobrar/pagar menos.
  useEffect(() => {
    if (accion === "cruzar") setMonto(String(maxCompensable));
    else if (accion === "recibido") setMonto(String(maximoRecibido));
    else if (accion === "hecho") setMonto(String(Math.max(0, r2(-saldos.maderaSaldo))));
    // "cero": no se edita, sale entero de `intencionDejarEnCero`.
  }, [accion, maxCompensable, maximoRecibido, saldos.maderaSaldo]);

  // "Anotar en la caja" arranca marcado sólo con efectivo (mismo criterio que el alta de adelanto).
  useEffect(() => {
    setMoverCaja(metodo === "efectivo");
  }, [metodo]);

  const fifoDelMonto = useMemo(() => {
    const m = accion === "cruzar" ? clamp(Number(monto) || 0, maxCompensable) : 0;
    return imputarFifo(partidas.adelantos, m);
  }, [accion, monto, maxCompensable, partidas.adelantos]);

  useEffect(() => {
    if (!repartoManual) return;
    setRepartoPorAdelanto(Object.fromEntries(fifoDelMonto.map((f) => [f.partida.adelantoId, String(f.monto)])));
  }, [repartoManual, fifoDelMonto]);

  useEffect(() => {
    let intencion: IntencionLiquidacion | null = null;

    if (accion === "cero") {
      intencion = intencionDejarEnCero(partidas, fecha, metodo, moverCaja);
    } else if (accion === "cruzar") {
      const compensar = clamp(Number(monto) || 0, maxCompensable);
      if (compensar > 0) {
        intencion = {
          fecha,
          compensar,
          pago: null,
          ...(repartoManual && partidas.adelantos.length > 1
            ? { imputacion: { compensacion: Object.entries(repartoPorAdelanto).map(([adelantoId, v]) => ({ adelantoId, monto: Number(v) || 0 })) } }
            : {}),
          notas: notas.trim() || undefined,
        };
      }
    } else if (accion === "recibido" || accion === "hecho") {
      const m = Number(monto) || 0;
      if (m > 0) {
        intencion = {
          fecha,
          compensar: 0,
          pago: { direccion: accion === "recibido" ? "recibido" : "hecho", monto: m, metodo, moverCaja },
          notas: notas.trim() || undefined,
        };
      }
    }

    onCambiar(intencion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accion, monto, metodo, moverCaja, fecha, notas, repartoManual, repartoPorAdelanto, partidas, maxCompensable]);

  const cardCls = (activa: boolean, disponible: boolean) =>
    `flex flex-col items-start gap-1 rounded-2xl border-2 p-3 text-left transition-colors ${
      !disponible
        ? "cursor-not-allowed border-[var(--rule-soft)] opacity-40"
        : activa
          ? "border-primary bg-primary/10"
          : "border-[var(--rule-base)] hover:border-primary/50"
    }`;

  return (
    <div className="space-y-4">
      {/* 3) Qué hacer */}
      <div role="group" aria-label="Qué hacer" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button type="button" disabled={!puedeCero} onClick={() => setAccion("cero")} className={cardCls(accion === "cero", puedeCero)}>
          <Wallet className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="text-sm font-bold text-[var(--text-primary)]">Dejar en cero</span>
          <span className="text-xs text-[var(--text-tertiary)]">Cruza y paga el resto</span>
        </button>
        <button
          type="button"
          disabled={maxCompensable <= 0.005}
          onClick={() => setAccion("cruzar")}
          className={cardCls(accion === "cruzar", maxCompensable > 0.005)}
        >
          <Scale className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="text-sm font-bold text-[var(--text-primary)]">Solo cruzar</span>
          <span className="text-xs text-[var(--text-tertiary)]">Máx. {fmtMon(maxCompensable)}</span>
        </button>
        <button
          type="button"
          disabled={maximoRecibido <= 0.005}
          onClick={() => setAccion("recibido")}
          className={cardCls(accion === "recibido", maximoRecibido > 0.005)}
        >
          <HandCoins className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="text-sm font-bold text-[var(--text-primary)]">Me pagó</span>
          <span className="text-xs text-[var(--text-tertiary)]">Cobra el adelanto y/o el aserrío</span>
        </button>
        <button
          type="button"
          disabled={saldos.maderaSaldo >= -0.005}
          onClick={() => setAccion("hecho")}
          className={cardCls(accion === "hecho", saldos.maderaSaldo < -0.005)}
        >
          <Banknote className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="text-sm font-bold text-[var(--text-primary)]">Le pagué</span>
          <span className="text-xs text-[var(--text-tertiary)]">Le debías por madera</span>
        </button>
      </div>

      {accion && (
        <div className="space-y-3 rounded-2xl bg-[var(--surface-sunken)] p-4">
          {accion !== "cero" && (
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-[var(--text-secondary)]">{accion === "cruzar" ? "Monto a cruzar" : "Monto"}</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className={`${inputCls} h-11`}
              />
            </label>
          )}

          {accion !== "cruzar" && (
            <div className="space-y-1.5">
              <span className="block text-sm font-semibold text-[var(--text-secondary)]">Método</span>
              <div className="flex flex-wrap gap-1.5">
                {METODOS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMetodo(m.id)}
                    className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-bold transition-colors ${
                      metodo === m.id
                        ? "bg-primary/12 text-[var(--accent-ink)] ring-1 ring-primary/40 dark:text-[var(--accent)]"
                        : "bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <m.Icon className="h-4 w-4 shrink-0" aria-hidden /> {m.label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 pt-1 text-sm font-semibold text-[var(--text-secondary)]">
                <input type="checkbox" checked={moverCaja} onChange={(e) => setMoverCaja(e.target.checked)} className="h-4 w-4 rounded" />
                Anotar en la caja
              </label>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-[var(--text-secondary)]">Fecha</span>
              <input type="date" value={fecha} max={HOY()} onChange={(e) => setFecha(e.target.value)} className={`${inputCls} h-11 tabular-nums`} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-[var(--text-secondary)]">Notas (opcional)</span>
              <input type="text" value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} className={`${inputCls} h-11`} />
            </label>
          </div>

          {accion === "cruzar" && partidas.adelantos.length > 1 && (
            <div>
              <button
                type="button"
                aria-expanded={repartoManual}
                onClick={() => setRepartoManual((v) => !v)}
                className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${repartoManual ? "rotate-180" : ""}`} aria-hidden />
                Repartir a mano
              </button>
              {repartoManual && (
                <div className="mt-2 space-y-1.5">
                  {partidas.adelantos.map((a) => (
                    <div key={a.adelantoId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-[var(--text-secondary)]">{a.codigo ?? a.adelantoId} · {fmtMon(a.saldo)}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={a.saldo}
                        value={repartoPorAdelanto[a.adelantoId] ?? "0"}
                        onChange={(e) => setRepartoPorAdelanto((r) => ({ ...r, [a.adelantoId]: e.target.value }))}
                        className={`${inputCls} h-9 w-28 text-right`}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
