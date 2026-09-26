"use client";

/**
 * «Puesto en patio» (ADR-437 §8): cuánto te costó la guía de verdad — la madera
 * más los fletes que pagas tú más los gastos de la guía (estiba, descarga…).
 *
 * Es DERIVADO: no se escribe en el costo de la madera (el P&L ya cuenta los
 * gastos y los fletes por su lado; sumarlos al costo sería contarlos dos veces).
 * Un flete sin monto deja el total «incompleto», nunca lo cuenta como 0.
 *
 * Plegado muestra igual la cifra: plegar no es esconder el dato.
 */

import { useId, useState } from "react";
import { ChevronDown, Loader2, Plus, Route, Trash2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  CATEGORIA_GASTO_GUIA_LABEL,
  type GastoGuiaInput,
  type PlataDeGuiaDTO,
} from "@/lib/forestal/plata-de-guia";
import type { Resultado } from "@/hooks/use-plata-de-guia";
import { Btn } from "../ctp-shared";
import { Bloque, diaCorto, soles } from "./comun";
import FormGasto from "./FormGasto";

export default function SeccionPuesto({
  dto,
  onAgregarFlete,
  onAgregarGasto,
  onBorrarGasto,
  abierto,
  onAlternar,
}: {
  dto: PlataDeGuiaDTO;
  onAgregarFlete: () => void;
  onAgregarGasto: (g: Omit<GastoGuiaInput, "gtfNumber">) => Promise<Resultado>;
  onBorrarGasto: (id: string) => Promise<Resultado>;
  /** Controlado desde el modal: al volver de «Agregar flete» sigue abierto. */
  abierto: boolean;
  onAlternar: () => void;
}) {
  const [nuevoGasto, setNuevoGasto] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null);
  const cp = dto.costoPuesto;
  const esServicio = dto.tipo === "servicio";
  const idPanel = useId();

  const resumen = cp.incompleto
    ? `${soles(cp.total)} · incompleto`
    : `${soles(cp.total)}${cp.porM3 != null ? ` · ${soles(cp.porM3)} por m³` : ""}`;

  return (
    <Bloque
      titulo={
        <>
          <button
            type="button"
            aria-expanded={abierto}
            aria-controls={idPanel}
            onClick={onAlternar}
            className="inline-flex min-h-11 items-center gap-1.5 text-left"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${abierto ? "" : "-rotate-90"}`}
              aria-hidden
            />
            Puesto en patio
          </button>
          <InfoTip
            title="Costo puesto en patio"
            what="La madera + los fletes que pagas tú + los gastos de la guía (estiba, descarga…)."
            affects="Se calcula al mirar: no cambia el costo de la madera ni el margen del libro."
            example="S/ 12 000 de madera + S/ 800 de flete + S/ 150 de estiba = S/ 12 950."
          />
        </>
      }
      extra={
        <span
          className={`text-sm font-bold tabular-nums ${cp.incompleto ? "text-[var(--data-warning-ink)]" : "text-[var(--text-primary)]"}`}
        >
          {resumen}
        </span>
      }
    >
      {abierto && (
        <div id={idPanel} className="space-y-3 text-sm">
          {cp.incompleto && cp.faltantes.length > 0 && (
            <p className="font-bold text-[var(--data-warning-ink)]">
              Falta {cp.faltantes.join(" y ")}.
            </p>
          )}
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[var(--text-secondary)]">Madera</span>
            <span className="font-bold tabular-nums text-[var(--text-primary)]">
              {esServicio
                ? "no lleva (de servicio)"
                : cp.madera == null
                  ? "falta el costo"
                  : soles(cp.madera)}
            </span>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-bold text-[var(--text-secondary)]">Fletes</span>
              <Btn size="sm" variant="secondary" onClick={onAgregarFlete}>
                <Route className="h-4 w-4" aria-hidden /> Agregar flete
              </Btn>
            </div>
            {dto.fletes.length === 0 ? (
              <p className="text-[var(--text-tertiary)]">Sin viaje anotado para esta guía.</p>
            ) : (
              <ul className="space-y-1">
                {dto.fletes.map((f) => (
                  <li key={f.id} className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[var(--text-secondary)]">
                      {diaCorto(f.fecha)} · {f.transportistaNombre ?? "sin transportista"}
                      {f.placa ? ` · ${f.placa}` : ""}
                    </span>
                    <span className="shrink-0 font-bold tabular-nums text-[var(--text-primary)]">
                      {f.pagaQuien === "proveedor" ? (
                        <span className="font-normal text-[var(--text-tertiary)]">
                          lo paga el proveedor
                        </span>
                      ) : f.monto == null ? (
                        <span className="text-[var(--data-warning-ink)]">sin monto</span>
                      ) : (
                        soles(f.monto)
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-bold text-[var(--text-secondary)]">Gastos de la guía</span>
              {!nuevoGasto && (
                <Btn size="sm" variant="secondary" onClick={() => setNuevoGasto(true)}>
                  <Plus className="h-4 w-4" aria-hidden /> Agregar gasto
                </Btn>
              )}
            </div>
            {dto.gastos.length === 0 && !nuevoGasto && (
              <p className="text-[var(--text-tertiary)]">Sin gastos anotados.</p>
            )}
            <ul className="space-y-1">
              {dto.gastos.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[var(--text-secondary)]">
                    {CATEGORIA_GASTO_GUIA_LABEL[g.categoria]} · {diaCorto(g.fecha)}
                    {g.pagadoA ? ` · ${g.pagadoA}` : ""}
                    {!g.pagado && (
                      <span className="font-bold text-[var(--data-warning-ink)]"> · por pagar</span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="font-bold tabular-nums text-[var(--text-primary)]">
                      {soles(g.monto)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Quitar el gasto de ${CATEGORIA_GASTO_GUIA_LABEL[g.categoria]}`}
                      disabled={borrando === g.id}
                      onClick={async () => {
                        setBorrando(g.id);
                        setErrorBorrar(null);
                        const r = await onBorrarGasto(g.id);
                        setBorrando(null);
                        if (!r.ok) setErrorBorrar(r.mensaje);
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-ink)]"
                    >
                      {borrando === g.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            {errorBorrar && (
              <p role="alert" className="text-sm font-bold text-[var(--data-error-ink)]">
                {errorBorrar}
              </p>
            )}
            {nuevoGasto && (
              <FormGasto onGuardar={onAgregarGasto} onCancelar={() => setNuevoGasto(false)} />
            )}
          </div>

          <div className="flex items-baseline justify-between gap-2 border-t border-[var(--rule-soft)] pt-2">
            <span className="font-bold text-[var(--text-primary)]">Total puesto en patio</span>
            <span className="text-right">
              <span className="block text-base font-black tabular-nums text-[var(--text-primary)]">
                {soles(cp.total)}
              </span>
              <span className="block text-[var(--text-secondary)]">
                {cp.porM3 != null
                  ? `${soles(cp.porM3)} por m³`
                  : cp.incompleto
                    ? "es un piso: falta un dato"
                    : "sin volumen"}
              </span>
            </span>
          </div>
        </div>
      )}
    </Bloque>
  );
}
