"use client";

/**
 * Los descuentos de planilla del período, en una pasada.
 *
 * Con cinco empleados, descontar el adelanto de sueldo son cinco liquidaciones a
 * mano el mismo día con el mismo concepto — y la que se olvida no se descuenta
 * nunca.
 *
 * **Muestra antes de aplicar, siempre.** Se propone el saldo (o el tope que se
 * fije), se puede ajustar línea por línea o poner 0 para saltear a alguien, y
 * recién entonces se aplica. Una pantalla que descuenta sola el sueldo de una
 * persona es exactamente lo que nadie quiere firmar.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Users } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/currency";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import {
  ajustarLinea,
  conceptoDelPeriodo,
  proponerDescuentos,
  totalPorMoneda,
  type LineaDescuento,
} from "@/lib/adelantos/planilla-lote";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { ModalShell, inputCls } from "./shared";

const periodoDeHoy = () =>
  new Date().toLocaleDateString("es-PE", { month: "long", year: "numeric" });

export default function DescuentoPlanillaModal({
  adelantos,
  onClose,
  onAplicado,
}: {
  adelantos: DbAdelanto[];
  onClose: () => void;
  onAplicado: () => void;
}) {
  const [periodo, setPeriodo] = useState(periodoDeHoy);
  const [tope, setTope] = useState("");
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState<{ hechos: number; fallidos: string[] } | null>(null);

  /** La propuesta base. Se recalcula si cambia el tope. */
  const base = useMemo(
    () => proponerDescuentos(adelantos, Number(tope) > 0 ? Number(tope) : null),
    [adelantos, tope],
  );
  const [ajustes, setAjustes] = useState<Record<string, number>>({});

  const lineas: LineaDescuento[] = base.map((l) =>
    ajustes[l.adelantoId] != null ? ajustarLinea(l, ajustes[l.adelantoId]) : l,
  );
  const conMonto = lineas.filter((l) => l.descuento > 0);
  const totales = totalPorMoneda(lineas);

  const aplicar = async () => {
    if (conMonto.length === 0) return;
    setAplicando(true);
    const fallidos: string[] = [];
    let hechos = 0;
    // De a uno y en serie: cada liquidación es atómica del lado del servidor, y
    // mandarlas en paralelo sólo sirve para chocar contra el rate limit.
    for (const l of conMonto) {
      try {
        const r = await fetch(`/api/adelantos/${encodeURIComponent(l.adelantoId)}/entregas`, {
          method: "POST",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            tipo: "LIBRE",
            valorManual: l.descuento,
            descripcion: conceptoDelPeriodo(periodo),
            // El descuento NO mueve la caja: la plata nunca entró al cajón, se
            // dejó de pagar. Anotarlo como ingreso inflaría el arqueo.
          }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        hechos += 1;
      } catch (err) {
        logger.error("[adelantos] falló un descuento de planilla", {
          adelantoId: l.adelantoId,
          error: String(err),
        });
        fallidos.push(l.persona);
      }
    }
    setAplicando(false);
    setResultado({ hechos, fallidos });
    if (hechos > 0) onAplicado();
  };

  return (
    <ModalShell title="Descuentos de planilla" onClose={onClose} wide>
      {base.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-8 text-center">
          <Users className="mx-auto mb-3 h-10 w-10 text-[var(--text-tertiary)] opacity-40" />
          <p className="text-base font-bold text-[var(--text-primary)]">No hay adelantos de planilla abiertos</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Se listan acá los adelantos con modalidad «descuento por planilla» que todavía tienen saldo.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Período</span>
              <input
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                aria-label="Período del descuento"
                className={inputCls}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                Tope por persona (opcional)
              </span>
              <input
                type="number"
                min={0}
                value={tope}
                onChange={(e) => { setTope(e.target.value); setAjustes({}); }}
                placeholder="Sin tope: se descuenta todo el saldo"
                aria-label="Tope por persona"
                className={`${inputCls} tabular-nums`}
              />
            </label>
          </div>

          <div className="overflow-hidden rounded-2xl border-2 border-[var(--rule-base)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] text-left">
                <tr>
                  <th className="px-3 py-2 font-bold text-[var(--text-secondary)]">Persona</th>
                  <th className="px-3 py-2 text-right font-bold text-[var(--text-secondary)]">Debe</th>
                  <th className="px-3 py-2 text-right font-bold text-[var(--text-secondary)]">Se descuenta</th>
                  <th className="px-3 py-2 font-bold text-[var(--text-secondary)]">Queda</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {lineas.map((l) => (
                  <tr key={l.adelantoId}>
                    <td className="px-3 py-2">
                      <span className="block font-bold text-[var(--text-primary)]">{l.persona}</span>
                      {l.codigo && <span className="font-mono text-xs text-[var(--text-tertiary)]">{l.codigo}</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">
                      {formatCurrency(l.saldo)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={l.saldo}
                        value={l.descuento}
                        onChange={(e) => setAjustes((a) => ({ ...a, [l.adelantoId]: Number(e.target.value) }))}
                        aria-label={`Descuento para ${l.persona}`}
                        className="h-9 w-28 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-right text-sm font-bold tabular-nums text-[var(--text-primary)] outline-none focus:border-primary"
                      />
                    </td>
                    <td className="px-3 py-2">
                      {l.descuento <= 0 ? (
                        <span className="text-sm text-[var(--text-tertiary)]">se saltea</span>
                      ) : l.liquida ? (
                        <span className="inline-flex items-center gap-1 text-sm font-bold text-[var(--data-success)]">
                          <Check className="h-3.5 w-3.5" /> liquidado
                        </span>
                      ) : (
                        <span className="text-sm tabular-nums text-[var(--text-secondary)]">
                          debe {formatCurrency(l.saldo - l.descuento)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--surface-sunken)] px-4 py-3">
            <span className="text-sm font-bold text-[var(--text-secondary)]">
              {conMonto.length} de {lineas.length} persona{lineas.length === 1 ? "" : "s"}
            </span>
            <span className="flex flex-wrap gap-x-4 text-base font-extrabold tabular-nums text-[var(--text-primary)]">
              {Object.entries(totales).map(([m, v]) => (
                <span key={m}>{m === "PEN" ? formatCurrency(v) : `${m} ${v.toFixed(2)}`}</span>
              ))}
              {Object.keys(totales).length === 0 && <span className="text-[var(--text-tertiary)]">—</span>}
            </span>
          </div>

          {resultado && (
            <div
              className={`rounded-2xl border-2 px-4 py-3 text-sm ${
                resultado.fallidos.length > 0
                  ? "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                  : "border-[var(--data-success-500)] bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
              }`}
            >
              <p className="font-bold">
                Se aplicaron {resultado.hechos} descuento{resultado.hechos === 1 ? "" : "s"}.
              </p>
              {resultado.fallidos.length > 0 && (
                <p className="mt-1 flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  No se pudo con: {resultado.fallidos.join(", ")}. Esos siguen debiendo lo mismo — se pueden
                  reintentar sin duplicar nada.
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="h-12 flex-1 rounded-2xl border-2 border-[var(--rule-base)] text-base font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
            >
              {resultado ? "Cerrar" : "Cancelar"}
            </button>
            <button
              onClick={() => void aplicar()}
              disabled={aplicando || conMonto.length === 0}
              className="h-12 flex-1 rounded-2xl bg-primary text-base font-bold text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {aplicando ? "Aplicando…" : `Aplicar a ${conMonto.length}`}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}
