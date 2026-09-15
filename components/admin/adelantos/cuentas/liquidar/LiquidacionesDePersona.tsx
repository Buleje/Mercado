"use client";

/**
 * Historial de liquidaciones de la persona (ADR-413 §UI «Historial»).
 *
 * «Anular» sólo en la última liquidación VIVA (el servidor lo exige igual:
 * `NoEsLaUltimaError`) — acá se decide el motivo y, si movió la caja, si se
 * devuelve, como un formulario que se abre en la fila (mismo criterio que
 * `ControlVinculo`: nada de un diálogo sobre un diálogo).
 */

import { useState } from "react";
import { AlertTriangle, Ban, FileDown } from "@buleje/design-system/icons";
import { useSettingsSafe } from "@/contexts/settings-context";
import type { LiquidacionDTO } from "@/lib/db/liquidacion-cuenta.db";
import type { CuentaPersona } from "@/lib/adelantos/cuenta-unificada";
import { ORIGENES_CAJA } from "../../crear-adelanto/campos";
import { fmtMon, inputCls } from "../../shared";
import { textoResultadoCaja } from "./caja-texto";

const fechaUtc = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });

const METODOS = ORIGENES_CAJA.filter((o) => o.id);

export default function LiquidacionesDePersona({
  liquidaciones,
  persona,
  onAnular,
}: {
  liquidaciones: LiquidacionDTO[];
  persona: CuentaPersona;
  onAnular: (
    id: string,
    motivo: string,
    devolucionCaja: string | null,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  const settings = useSettingsSafe();
  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [devolver, setDevolver] = useState(false);
  const [metodoDevolucion, setMetodoDevolucion] = useState<string>("efectivo");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ordenadas = [...liquidaciones].sort((a, b) => b.creadaEn.localeCompare(a.creadaEn));
  const ultimaVivaId = ordenadas.find((l) => !l.anulada)?.id ?? null;

  const descargarPdf = async (liq: LiquidacionDTO) => {
    const { descargarComprobanteLiquidacion } = await import("@/lib/adelantos/pdf-liquidacion");
    await descargarComprobanteLiquidacion({
      negocio: settings?.businessName ?? null,
      liquidacion: liq,
    });
  };

  const confirmarAnulacion = async (id: string) => {
    if (motivo.trim().length < 3) {
      setError("Cuenta en pocas palabras por qué se anula.");
      return;
    }
    setGuardando(true);
    setError(null);
    const r = await onAnular(id, motivo.trim(), devolver ? metodoDevolucion : null);
    setGuardando(false);
    if (r.ok) {
      setAnulando(null);
      setMotivo("");
      setDevolver(false);
    } else {
      // El 409 trae el motivo real («Anula primero LIQ-…», «ya está anulada»).
      setError(r.message);
    }
  };

  if (liquidaciones.length === 0) {
    return (
      <p className="text-sm text-[var(--text-tertiary)]">Todavía no se liquidó esta cuenta.</p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-bold text-[var(--text-primary)]">
        Liquidaciones de {persona.nombre}
      </p>
      <ul className="space-y-2">
        {ordenadas.map((liq) => {
          // Una sola vez por fila: se usa dos veces (texto + tono) y no
          // queremos derivarla dos veces con datos que ya tenemos acá.
          const resultadoCaja = textoResultadoCaja(liq);
          return (
            <li key={liq.id} className="rounded-2xl border border-[var(--rule-base)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p
                    className={`font-mono text-sm font-bold ${liq.anulada ? "text-[var(--text-tertiary)] line-through" : "text-[var(--text-primary)]"}`}
                  >
                    {liq.codigo}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {fechaUtc(liq.fecha)} · Cruzado {fmtMon(liq.compensado)}
                    {liq.pago
                      ? ` · Pagado ${fmtMon(liq.pago.monto)} (${liq.pago.direccion === "recibido" ? "recibió" : "pagó"})`
                      : ""}
                  </p>
                  {resultadoCaja &&
                    (resultadoCaja.tono === "aviso" ? (
                      <p
                        role="status"
                        className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                      >
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />{" "}
                        {resultadoCaja.texto}
                      </p>
                    ) : (
                      <p className="text-xs text-[var(--text-tertiary)]">{resultadoCaja.texto}</p>
                    ))}
                  {liq.anulada && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                      <Ban className="h-3.5 w-3.5 shrink-0" aria-hidden /> Anulada:{" "}
                      {liq.anulada.motivo}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => descargarPdf(liq)}
                    aria-label={`Descargar el comprobante de ${liq.codigo}`}
                    className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                  >
                    <FileDown className="h-3.5 w-3.5" aria-hidden /> PDF
                  </button>
                  {liq.id === ultimaVivaId && (
                    <button
                      type="button"
                      onClick={() => setAnulando(anulando === liq.id ? null : liq.id)}
                      aria-expanded={anulando === liq.id}
                      className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-bold text-[var(--data-error-700)] hover:bg-[var(--surface-sunken)] dark:text-[var(--data-error-500)]"
                    >
                      <Ban className="h-3.5 w-3.5" aria-hidden /> Anular
                    </button>
                  )}
                </div>
              </div>

              {anulando === liq.id && (
                <div className="mt-3 space-y-2 rounded-xl bg-[var(--surface-sunken)] p-3">
                  <label className="block space-y-1">
                    <span className="text-sm font-semibold text-[var(--text-secondary)]">
                      Motivo de la anulación
                    </span>
                    <textarea
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      rows={2}
                      maxLength={300}
                      className={`${inputCls} py-2`}
                    />
                  </label>
                  {liq.caja.resultado === "movida" && (
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
                        <input
                          type="checkbox"
                          checked={devolver}
                          onChange={(e) => setDevolver(e.target.checked)}
                          className="h-4 w-4 rounded"
                        />
                        Devolver a la caja
                      </label>
                      {devolver && (
                        <div className="flex flex-wrap gap-1.5">
                          {METODOS.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setMetodoDevolucion(m.id)}
                              className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-bold transition-colors ${
                                metodoDevolucion === m.id
                                  ? "bg-primary/12 text-[var(--accent-ink)] ring-1 ring-primary/40 dark:text-[var(--accent)]"
                                  : "bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                              }`}
                            >
                              <m.Icon className="h-4 w-4 shrink-0" aria-hidden /> {m.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {error && (
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {error}
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setAnulando(null)}
                      className="h-9 rounded-lg px-3 text-sm font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={guardando}
                      onClick={() => confirmarAnulacion(liq.id)}
                      className="h-9 rounded-lg bg-[var(--data-error-700)] px-3 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:opacity-50"
                    >
                      {guardando ? "Anulando…" : "Confirmar anulación"}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
