"use client";

/**
 * Bloque 4 del abono («Me pagan lo que me deben»): a qué adelanto va la plata.
 *
 * No crea un adelanto nuevo: baja uno que ya existe. Por defecto la más vieja
 * primero (la misma regla que Liquidar); o se elige uno, que es la única forma
 * de pagar uno en dólares o marcar la cuota de un plan. Lo que no entra al
 * reparto se dice con su motivo: esconderlo haría creer que quedó en cero.
 */

import { AlertTriangle, Layers, ListChecks } from "@buleje/design-system/icons";
import { SeccionForm } from "@/components/admin/shared/SeccionForm";
import { formatDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AltaAdelanto } from "../hooks/use-alta-adelanto";
import { fmtMon } from "../shared";
import { CLASE_BLOQUE, MarcaSeleccion, claseOpcion } from "./piezas";

export default function BloqueAbono({ alta }: { alta: AltaAdelanto }) {
  const { abono } = alta;
  const nada = abono.elegibles.length === 0;
  const puedeRepartir = abono.adentro.length > 0;
  const recibe = new Map(abono.reparto.map((r) => [r.adelantoId, r.monto]));
  const filas = abono.porAntiguedad ? abono.adentro : abono.elegibles;
  /* Pagarle a UN adelanto más de lo que debe: lo que sobra pasa a «le debes». */
  const sobra = abono.elegido ? Math.max(0, Math.round((alta.montoNum - abono.elegido.saldo) * 100) / 100) : 0;

  return (
    <SeccionForm
      numero={4}
      titulo={alta.def.tituloDevolucion}
      titular="tarjeta"
      columnas="libre"
      className={CLASE_BLOQUE}
      info={{
        what: "El abono no crea un adelanto: baja uno que ya le diste.",
        affects: "Entra a tu caja y baja lo que te debe. Repartido entre varios queda con un código LIQ que se puede anular.",
        example: "Te debe dos adelantos de S/ 100 y S/ 50 y te paga S/ 120: el más viejo queda en cero y el otro en S/ 30.",
      }}
    >
      {nada ? (
        <p className="rounded-xl bg-[var(--surface-sunken)] px-4 py-3 text-base font-semibold text-[var(--text-secondary)]">
          {alta.persona ? "No te debe nada en adelantos abiertos." : "Elige a la persona para ver lo que te debe."}
        </p>
      ) : (
        <div className="space-y-3">
          <div role="group" aria-label="A qué adelanto va" className="grid gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              aria-pressed={abono.porAntiguedad}
              disabled={!puedeRepartir}
              onClick={() => abono.setDestino("fifo")}
              className={claseOpcion(abono.porAntiguedad, puedeRepartir)}
            >
              <Layers className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-ink)]" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold text-[var(--text-primary)]">La más vieja primero</span>
                <span className="block text-sm font-medium text-[var(--text-secondary)]">
                  {puedeRepartir ? `Se reparte entre ${abono.adentro.length} · hasta ${fmtMon(abono.totalAdentro)}` : "Ninguno entra al reparto"}
                </span>
              </span>
              <MarcaSeleccion activa={abono.porAntiguedad} />
            </button>
            <button
              type="button"
              aria-pressed={!abono.porAntiguedad}
              onClick={() => abono.setDestino(abono.elegibles[0].id)}
              className={claseOpcion(!abono.porAntiguedad)}
            >
              <ListChecks className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-ink)]" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold text-[var(--text-primary)]">Elegir uno</span>
                <span className="block text-sm font-medium text-[var(--text-secondary)]">Todo va a ese adelanto</span>
              </span>
              <MarcaSeleccion activa={!abono.porAntiguedad} />
            </button>
          </div>

          <ul className="divide-y divide-[var(--rule-soft)] overflow-hidden rounded-xl border border-[var(--rule-soft)]">
            {filas.map((a) => {
              const toma = recibe.get(a.id) ?? 0;
              const activo = !abono.porAntiguedad && abono.destino === a.id;
              const contenido = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block whitespace-nowrap text-sm font-bold text-[var(--text-primary)]">
                      {a.codigo ?? "sin código"}
                      {a.conCuotas && <span className="ml-1.5 font-semibold text-[var(--text-tertiary)]">· con cuotas</span>}
                    </span>
                    <span className="block text-sm tabular-nums text-[var(--text-tertiary)]">
                      {formatDateShort(a.fecha)} · debe {fmtMon(a.saldo, a.moneda)}
                    </span>
                  </span>
                  {toma > 0 && (
                    <span className="shrink-0 whitespace-nowrap text-right text-sm tabular-nums">
                      <span className="block font-extrabold text-[var(--data-success-ink)]">− {fmtMon(toma, a.moneda)}</span>
                      {toma > a.saldo + 0.005 ? (
                        <span className="block font-semibold text-[var(--data-info-ink)]">le debes {fmtMon(toma - a.saldo, a.moneda)}</span>
                      ) : (
                        <span className="block text-[var(--text-tertiary)]">queda {fmtMon(Math.max(0, a.saldo - toma), a.moneda)}</span>
                      )}
                    </span>
                  )}
                </>
              );
              return (
                <li key={a.id}>
                  {abono.porAntiguedad ? (
                    <div className="flex items-center gap-3 px-3.5 py-2.5">{contenido}</div>
                  ) : (
                    <button
                      type="button"
                      aria-pressed={activo}
                      onClick={() => abono.setDestino(a.id)}
                      className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${activo ? "bg-primary/8" : "hover:bg-[var(--surface-sunken)]"}`}
                    >
                      <MarcaSeleccion activa={activo} />
                      {contenido}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {sobra > 0 && abono.elegido && (
            <p className="flex items-start gap-2 rounded-xl bg-[var(--data-info-500)]/10 px-3 py-2 text-sm font-semibold text-[var(--data-info-ink)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {abono.elegido.codigo ?? "Ese adelanto"} debe {fmtMon(abono.elegido.saldo, abono.elegido.moneda)}: los otros{" "}
                {fmtMon(sobra, abono.elegido.moneda)} quedan a favor suyo (le debes).
              </span>
            </p>
          )}

          {/* Un adelanto con plan: el abono cumple una cuota, que se marca en la misma operación. */}
          {abono.elegido && abono.elegido.cuotas.length > 0 && (
            <div role="group" aria-label="Qué cuota cumple" className="space-y-1.5">
              <p className="text-sm font-semibold text-[var(--text-secondary)]">¿Qué cuota cumple?</p>
              <div className="flex flex-wrap gap-1.5">
                {abono.elegido.cuotas.map((c) => {
                  const activa = abono.cuota?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={activa}
                      onClick={() => {
                        abono.setCuota(c.id);
                        if (!alta.monto) alta.setMonto(String(c.valor));
                      }}
                      className={chip(activa)}
                    >
                      Cuota {c.numero} · {fmtMon(c.valor, abono.elegido?.moneda)}
                      {/* `ml-1`: en un inline-flex el espacio inicial del span se pierde («S/ 100.00· 15 oct.»). */}
                      {c.fecha && <span className="ml-1 font-medium">· {formatDateShort(c.fecha)}</span>}
                    </button>
                  );
                })}
                <button type="button" aria-pressed={!abono.cuota} onClick={() => abono.setCuota("ninguna")} className={chip(!abono.cuota)}>
                  Ninguna
                </button>
              </div>
            </div>
          )}

          {abono.fuera.length > 0 && (
            <details className="rounded-xl bg-[var(--surface-sunken)] px-3.5 py-2.5 text-sm">
              <summary className="cursor-pointer font-semibold text-[var(--text-secondary)]">
                {abono.fuera.length} {abono.fuera.length === 1 ? "queda fuera del reparto" : "quedan fuera del reparto"}
              </summary>
              <ul className="mt-2 space-y-1.5">
                {abono.fuera.map((f) => (
                  <li key={f.id} className="text-[var(--text-secondary)]">
                    <strong className="text-[var(--text-primary)]">{f.codigo ?? "sin código"}</strong> · {fmtMon(f.monto, f.moneda)} — {f.motivo}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </SeccionForm>
  );
}

const chip = (activo: boolean) =>
  cn(
    "inline-flex h-10 items-center rounded-xl px-3 text-sm font-bold tabular-nums transition-colors",
    activo ? "bg-primary/12 text-[var(--accent-ink)] ring-1 ring-primary/40" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
  );
