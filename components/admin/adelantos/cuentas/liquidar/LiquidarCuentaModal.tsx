"use client";

/**
 * «Liquidar la cuenta de una persona» (ADR-413) — cruzar Adelantos con la
 * cuenta forestal, cobrar o pagar, en un solo acto con código.
 *
 * DEPENDE DEL SERVIDOR (en paralelo, mismo ADR): tipos/funciones puras de
 * `@/lib/cuentas/liquidacion`, `LiquidacionDTO` de `@/lib/db/liquidacion-cuenta.db`
 * y las rutas bajo `/api/adelantos/cuentas/`. Hasta que existan, el typecheck
 * marca estos imports como módulo faltante — es lo que el ADR pide programar
 * contra el contrato, no un error de este archivo.
 *
 * Layout: "de arriba abajo" como pide el ADR (§UI) — una sola pantalla con
 * secciones, no un wizard con "siguiente": la vista previa se recalcula sola
 * (función pura, sin red) apenas cambia algo del formulario.
 */

import { useMemo, useState } from "react";
import { CheckCircle2, Link2, Scale } from "@buleje/design-system/icons";
import { useLiquidacionCuenta } from "@/hooks/use-liquidacion-cuenta";
import { leerNeto, type CuentaPersona } from "@/lib/adelantos/cuenta-unificada";
import { saldosDe, type IntencionLiquidacion } from "@/lib/cuentas/liquidacion";
import type { LiquidacionDTO } from "@/lib/db/liquidacion-cuenta.db";
import { ModalShell, fmtMon } from "../../shared";
import FormularioLiquidacion from "./FormularioLiquidacion";
import VistaPreviaLiquidacion from "./VistaPreviaLiquidacion";
import LiquidacionesDePersona from "./LiquidacionesDePersona";
import ResultadoLiquidacion from "./ResultadoLiquidacion";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Cómo se lee la pata forestal en la cabecera, con SU signo — nunca
 * `max(0, −saldo)`: eso lee «S/ 0 a favor suyo» cuando en realidad debe un
 * cargo de aserrío (saldo positivo), la deuda opuesta (revisión de código).
 */
function leerMadera(saldo: number): string {
  if (saldo > 0.005) return `te debe ${fmtMon(saldo)}`;
  if (saldo < -0.005) return `${fmtMon(-saldo)} a favor suyo`;
  return "al día";
}

export default function LiquidarCuentaModal({
  persona,
  onClose,
  onVincular,
  onCambio,
}: {
  persona: CuentaPersona;
  onClose: () => void;
  /** El mismo `vincularParte` que ya usa `ControlVinculo` — «Es la misma persona». */
  onVincular: (beneficiarioId: string, forestPartyId: string | null) => Promise<boolean>;
  /** Se confirmó o se anuló una liquidación: la fila de afuera tiene que traer el saldo nuevo. */
  onCambio: () => void;
}) {
  const { partidas, loading, error, planCambio, previa, confirmar, liquidaciones, anular, recargarPartidas } = useLiquidacionCuenta({
    beneficiarioId: persona.beneficiarioId,
    parteId: persona.parteId,
  });

  const [intencion, setIntencion] = useState<IntencionLiquidacion | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [errorConfirmar, setErrorConfirmar] = useState<string | null>(null);
  const [vinculando, setVinculando] = useState(false);
  const [resultado, setResultado] = useState<LiquidacionDTO | null>(null);

  const plan = useMemo(() => (intencion ? previa(intencion) : null), [intencion, previa]);

  /**
   * La cabecera sale de las PARTIDAS FRESCAS del servidor, no del `persona` de
   * la lista de afuera: ese prop queda congelado en lo que había al abrir el
   * modal, y después de confirmar/anular seguía leyendo el importe viejo
   * (revisión en el navegador, LIQ-2026-0005). Adelantos siempre viene en
   * `partidas`; la cuenta forestal sólo si hay vínculo explícito — sin él, se
   * cae al `persona.madera` de la lista (es lo único que hay: el servidor ni
   * la manda).
   */
  const saldosFrescos = useMemo(() => (partidas ? saldosDe(partidas) : null), [partidas]);
  const teDebeAdelantos = saldosFrescos?.adelantosTeDebe ?? persona.adelantos?.teDebe ?? 0;
  const maderaSaldo = partidas?.forestal ? (saldosFrescos?.maderaSaldo ?? 0) : (persona.madera?.saldo ?? 0);
  const netoCabecera = r2(teDebeAdelantos + maderaSaldo);

  // Cruzar exige el vínculo EXPLÍCITO (ADR-413 §4): la fila puede venir unida
  // por documento (para MOSTRAR alcanza), pero mover plata entre libretas no.
  const necesitaConfirmarVinculo = partidas != null && !partidas.cruzable && persona.parteId != null && persona.vinculo === "documento";

  const esLaMismaPersona = async () => {
    if (!persona.beneficiarioId || !persona.parteId) return;
    setVinculando(true);
    const ok = await onVincular(persona.beneficiarioId, persona.parteId);
    setVinculando(false);
    if (ok) await recargarPartidas();
  };

  const anularYAvisar = async (id: string, motivo: string, devolucionCaja: string | null) => {
    const r = await anular(id, motivo, devolucionCaja);
    if (r.ok) onCambio();
    return r;
  };

  const onConfirmar = async () => {
    if (!intencion || !plan?.ok) return;
    setConfirmando(true);
    setErrorConfirmar(null);
    const r = await confirmar(intencion);
    setConfirmando(false);
    if (r.ok) {
      setResultado(r.liquidacion);
      onCambio();
    } else if (!r.planCambio) {
      setErrorConfirmar(r.error);
    }
    // Un 409 `plan_cambio` ya recargó `partidas`/`huella` adentro del hook: la
    // vista previa de abajo se recalcula sola con los datos nuevos.
  };

  if (resultado) {
    return (
      <ModalShell title="Liquidación confirmada" onClose={onClose} size="md">
        <ResultadoLiquidacion liquidacion={resultado} persona={persona} onCerrar={onClose} />
      </ModalShell>
    );
  }

  return (
    <ModalShell title={`Liquidar la cuenta de ${persona.nombre}`} subtitle={persona.documento ?? undefined} onClose={onClose} size="lg">
      {/* 1) Las dos patas y el neto — mismo texto que la fila. */}
      <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            <Scale className="h-4 w-4 shrink-0" aria-hidden />
            Adelantos: {fmtMon(teDebeAdelantos)} · Cuenta forestal: {leerMadera(maderaSaldo)}
          </div>
          <p className="min-w-0 break-words text-right text-base font-extrabold text-[var(--text-primary)]">
            {leerNeto(netoCabecera, persona.nombre)}
          </p>
        </div>
      </div>

      {/* 2) Vínculo explícito: sin él, la madera de esta parte NO entra a la
          liquidación (ni para cruzar ni para cobrar/pagar) — el servidor arma
          las partidas sin ella (revisión de código). */}
      {necesitaConfirmarVinculo && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--data-warning-700)]/30 bg-[var(--data-warning-700)]/10 p-4">
          <p className="text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            La madera de {persona.nombre} todavía no entra: confirma que es la misma persona.
          </p>
          <button
            type="button"
            onClick={esLaMismaPersona}
            disabled={vinculando}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
          >
            <Link2 className="h-4 w-4" aria-hidden /> {vinculando ? "Vinculando…" : "Es la misma persona"}
          </button>
        </div>
      )}

      {planCambio && (
        <div className="mt-3 rounded-2xl border border-[var(--data-warning-700)]/30 bg-[var(--data-warning-700)]/10 p-3 text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          La cuenta cambió mientras la mirabas: revisa la vista previa de nuevo.
        </div>
      )}

      {error && <p className="mt-3 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}

      {/* 3-4) Qué hacer + campos del formulario. */}
      {loading || !partidas ? (
        <div className="mt-4 h-40 animate-pulse rounded-2xl bg-[var(--surface-sunken)]" />
      ) : (
        <>
          <div className="mt-4">
            <FormularioLiquidacion partidas={partidas} onCambiar={setIntencion} vinculoFaltante={necesitaConfirmarVinculo} />
          </div>

          {/* 5) Vista previa — recalculada localmente, sin red. */}
          <div className="mt-4">
            <VistaPreviaLiquidacion
              plan={plan}
              nombre={persona.nombre}
              vinculoFaltante={necesitaConfirmarVinculo}
              maderaAFavorSuyo={Math.max(0, -(persona.madera?.saldo ?? 0))}
            />
          </div>

          {errorConfirmar && (
            <p className="mt-3 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{errorConfirmar}</p>
          )}

          {/* 6) Confirmar. */}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={onConfirmar}
              disabled={!intencion || !plan?.ok || confirmando || (necesitaConfirmarVinculo && (intencion?.compensar ?? 0) > 0)}
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-primary px-6 text-base font-bold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 className="h-5 w-5" aria-hidden /> {confirmando ? "Liquidando…" : "Confirmar liquidación"}
            </button>
          </div>

          {/* Historial de liquidaciones de esta persona. */}
          <div className="mt-6 border-t border-[var(--rule-soft)] pt-4">
            <LiquidacionesDePersona liquidaciones={liquidaciones} persona={persona} onAnular={anularYAvisar} />
          </div>
        </>
      )}
    </ModalShell>
  );
}
