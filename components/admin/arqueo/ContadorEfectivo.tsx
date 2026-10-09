"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CardTitle, DataTable } from "@buleje/design-system";
import { AlertTriangle, Banknote, ChevronDown, Coins, ExternalLink } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import {
  BILLETES, MONEDAS, claveDenominacion, notaDelConteo, pideObservacion, totalesDelConteo,
  type Conteo, type Denominacion,
} from "@/lib/caja/conteo-efectivo";
import { diaYFecha, fmt, fmtSigno, horaLima, type ConteoExpress } from "./arqueo-shared";

type Props = {
  expectedAmount: number;
  registerId: string | null;
  abiertaDesde: string | null;
  ultimoConteo: ConteoExpress | null;
  abierto: boolean;
  onAlternar: () => void;
  onSaved: () => void;
  onIrACaja?: () => void;
};

const ORDEN = [...BILLETES, ...MONEDAS];

/**
 * Conteo del cajón por denominación contra el efectivo esperado de la caja
 * abierta (backend). Se guarda como «conteo express»: no cierra la caja —eso
 * se hace en Caja registradora, con su arqueo guiado— pero queda en la caja
 * con su desglose y la observación de quien contó.
 */
export default function ContadorEfectivo({ expectedAmount, registerId, abiertaDesde, ultimoConteo, abierto, onAlternar, onSaved, onIrACaja }: Props) {
  const [conteo, setConteo] = useState<Conteo>({});
  const [observacion, setObservacion] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const cuerpoId = useId();
  const obsId = useId();
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const t = useMemo(() => totalesDelConteo(conteo, expectedAmount), [conteo, expectedAmount]);
  const faltaObs = pideObservacion(t) && !observacion.trim();

  function setCount(key: string, raw: string) {
    const v = Math.max(0, parseInt(raw.replace(/\D/g, ""), 10) || 0);
    setConteo((prev) => ({ ...prev, [key]: v }));
  }

  /** Enter o ↓ pasa a la siguiente denominación, ↑ vuelve: se cuenta sin soltar el teclado. */
  function onTecla(e: KeyboardEvent<HTMLInputElement>, idx: number) {
    const destino = e.key === "Enter" || e.key === "ArrowDown" ? idx + 1 : e.key === "ArrowUp" ? idx - 1 : null;
    if (destino == null) return;
    e.preventDefault();
    const el = inputsRef.current[destino];
    if (el) { el.focus(); el.select(); }
    else if (destino >= ORDEN.length) document.getElementById(obsId)?.focus();
  }

  async function guardar() {
    if (!registerId) { setFeedback({ kind: "err", msg: "No hay caja abierta para contar." }); return; }
    if (!t.hayConteo) { setFeedback({ kind: "err", msg: "Cuenta al menos una denominación antes de guardar." }); return; }
    if (faltaObs) { setFeedback({ kind: "err", msg: "La caja no cuadra: escribe una observación antes de guardar." }); return; }
    setSaving(true);
    setFeedback(null);
    try {
      const { csrfHeaders } = await import("@/lib/csrf-client");
      const res = await fetch(`/api/cash-registers/${registerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ action: "arqueo", closingAmount: t.contado, notes: notaDelConteo(conteo, expectedAmount, observacion) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(typeof body?.error === "string" ? body.error : `No se pudo guardar (error ${res.status}).`);
      }
      setFeedback({ kind: "ok", msg: `Conteo guardado · diferencia ${fmtSigno(t.diferencia)}` });
      onSaved();
    } catch (err) {
      setFeedback({ kind: "err", msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  const tablaDenominaciones = (titulo: string, Icono: typeof Coins, lista: readonly Denominacion[], desde: number) => (
    <div>
      <p className="libro-kicker mb-2 flex items-center gap-1 text-[var(--text-secondary)]">
        <Icono className="h-4 w-4" aria-hidden /> {titulo}
      </p>
      <DataTable>
        <thead><tr><th>Denominación</th><th className="text-center">Cantidad</th><th className="text-right">Subtotal</th></tr></thead>
        <tbody>
          {lista.map((d, i) => {
            const key = claveDenominacion(d);
            const qty = conteo[key] ?? 0;
            const idx = desde + i;
            return (
              <tr key={key}>
                <td className="py-1.5 font-semibold text-[var(--text-primary)]">{d.etiqueta}</td>
                <td className="py-1.5 px-2 text-center">
                  <input
                    ref={(el) => { inputsRef.current[idx] = el; }}
                    type="text"
                    inputMode="numeric"
                    enterKeyHint="next"
                    aria-label={`Cantidad de ${d.tipo === "billete" ? "billetes" : "monedas"} de ${d.etiqueta}`}
                    value={qty || ""}
                    onChange={(e) => setCount(key, e.target.value)}
                    onKeyDown={(e) => onTecla(e, idx)}
                    onFocus={(e) => e.currentTarget.select()}
                    placeholder="0"
                    className="h-10 w-16 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-center text-sm tabular-nums text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                  />
                </td>
                <td className="py-1.5 text-right font-bold tabular-nums text-[var(--text-primary)]">{qty > 0 ? fmt(qty * d.valor) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
    </div>
  );

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10" aria-hidden>
          <Coins className="h-4 w-4 text-[var(--accent-ink)] dark:text-[var(--accent)]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-bold">Contar el efectivo</CardTitle>
            <InfoTip
              title="Contar el efectivo"
              what="Cuentas billetes y monedas y lo comparas con lo que debería haber en la caja abierta: apertura + ventas en efectivo + ingresos − egresos."
              affects="Queda guardado en la caja con su desglose. No la cierra: eso se hace en Caja registradora."
              example="Abres con S/ 200 y vendes S/ 350 en efectivo: deberías tener S/ 550. Si cuentas S/ 540 hay un faltante de S/ 10 y tienes que explicar por qué. Enter pasa a la siguiente denominación."
            />
          </div>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            {registerId && expectedAmount < 0 ? (
              <span className="text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                El esperado da <strong className="tabular-nums">{fmt(expectedAmount)}</strong>: revisa los egresos antes de contar.
              </span>
            ) : registerId ? (
              <>
                Deberías tener <strong className="tabular-nums text-[var(--text-primary)]">{fmt(expectedAmount)}</strong>
                {abiertaDesde && <> · abierta desde {diaYFecha(abiertaDesde)} {horaLima(abiertaDesde)}</>}
                {ultimoConteo && (
                  <> · último conteo <strong className="tabular-nums text-[var(--text-primary)]">{fmt(ultimoConteo.contado)}</strong> a las {horaLima(ultimoConteo.creadoEn)}
                    {ultimoConteo.diferencia != null && ultimoConteo.diferencia !== 0 && (
                      <span className={ultimoConteo.diferencia < 0 ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"}> ({fmtSigno(ultimoConteo.diferencia)})</span>
                    )}
                  </>
                )}
              </>
            ) : (
              "No hay una caja abierta: ábrela en Caja registradora para contar."
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={abierto}
          aria-controls={cuerpoId}
          className={cn(
            "inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40",
            abierto ? "border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]" : "bg-primary text-white hover:bg-primary-dark",
          )}
        >
          {abierto ? "Ocultar" : "Contar"}
          <ChevronDown className={cn("h-4 w-4 transition-transform", abierto && "rotate-180")} aria-hidden />
        </button>
      </div>

      {abierto && (
        <div id={cuerpoId} className="space-y-4 border-t border-[var(--rule-soft)] px-4 pb-4 pt-4">
          {!registerId && (
            <div role="status" className="flex items-center gap-2 rounded-lg border border-[var(--data-warning-500)]/30 bg-[var(--data-warning-100)] px-3 py-2 dark:bg-[var(--data-warning-500)]/20">
              <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" strokeWidth={1.75} aria-hidden />
              <p className="text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">Puedes contar, pero no se guarda sin una caja abierta.</p>
            </div>
          )}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {tablaDenominaciones("Billetes", Banknote, BILLETES, 0)}
            {tablaDenominaciones("Monedas", Coins, MONEDAS, BILLETES.length)}
          </div>

          <div className="grid grid-cols-3 gap-3 border-t border-[var(--rule-soft)] pt-3 text-center">
            <div className="rounded-xl bg-[var(--surface-sunken)] p-3">
              <p className="libro-kicker text-[var(--text-secondary)]">Esperado</p>
              <p className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">{registerId ? fmt(expectedAmount) : "—"}</p>
            </div>
            <div className="rounded-xl bg-[var(--surface-sunken)] p-3">
              <p className="libro-kicker text-[var(--text-secondary)]">Contado</p>
              <p className={cn("text-sm font-extrabold tabular-nums", t.hayConteo ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]")}>{t.hayConteo ? fmt(t.contado) : "—"}</p>
              {t.hayConteo && <p className="text-xs tabular-nums text-[var(--text-secondary)]">billetes {fmt(t.billetes)} · monedas {fmt(t.monedas)}</p>}
            </div>
            <div className={cn("rounded-xl p-3", !t.hayConteo || t.diferencia >= 0 ? "bg-[var(--surface-sunken)]" : "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20")}>
              <p className="libro-kicker text-[var(--text-secondary)]">Diferencia</p>
              <p className={cn(
                "text-sm font-extrabold tabular-nums",
                !t.hayConteo ? "text-[var(--text-tertiary)]" : t.diferencia < 0 ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
              )}>
                {!t.hayConteo || !registerId ? "—" : t.diferencia === 0 ? "Cuadra" : `${fmtSigno(t.diferencia)} ${t.diferencia > 0 ? "sobrante" : "faltante"}`}
              </p>
            </div>
          </div>

          <div>
            <label htmlFor={obsId} className="mb-1 block text-sm font-semibold text-[var(--text-primary)]">
              Observación{pideObservacion(t) ? <span className="font-normal text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"> · obligatoria: la caja no cuadra</span> : <span className="font-normal text-[var(--text-secondary)]"> (opcional)</span>}
            </label>
            <textarea
              id={obsId}
              rows={2}
              maxLength={500}
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              placeholder="Ej.: di S/ 10 de vuelto de más a un cliente"
              className="w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
            />
          </div>

          {feedback && (
            <div role="status" aria-live="polite" className={cn(
              "rounded-lg px-3 py-2 text-sm font-semibold",
              feedback.kind === "ok" ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/20 dark:text-[var(--data-error-500)]",
            )}>
              {feedback.msg}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={guardar}
              disabled={saving || !t.hayConteo || !registerId || faltaObs}
              title={!registerId ? "No hay caja abierta" : !t.hayConteo ? "Cuenta al menos una denominación" : faltaObs ? "Escribe por qué no cuadra" : undefined}
              className="min-h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar conteo"}
            </button>
            <button type="button" onClick={() => { setConteo({}); setObservacion(""); setFeedback(null); }} className="min-h-10 px-3 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--data-error-700)]">
              Limpiar
            </button>
            {onIrACaja && registerId && (
              <button type="button" onClick={onIrACaja} className="ml-auto inline-flex min-h-10 items-center gap-1.5 px-2 text-sm font-semibold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]">
                Cerrar la caja en Caja registradora <ExternalLink className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
