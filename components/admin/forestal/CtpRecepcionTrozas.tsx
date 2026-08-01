"use client";

/**
 * Cerrar la recepción física de una guía (ADR-325).
 *
 * La GTF declara 25 trozas; al patio llegan 23. Acá se anota lo que hizo el
 * CENTRO al recibir —el código que le marca a cada pieza, de qué parcela del POA
 * salió y cuáles no llegaron—, que son datos propios y no del documento.
 *
 * Se guarda en UNA llamada con todos los cambios: recibir 25 trozas son 25
 * ediciones seguidas, y un PATCH por fila dejaría la recepción a medias si se
 * corta la señal a la mitad.
 */

import { useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, Check, Loader2, PackageCheck, X } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  avisosRecepcion,
  balanceRecepcion,
  type CambioRecepcion,
  type TrozaRecepcion,
} from "@/lib/forestal/recepcion-trozas";

export interface TrozaEditable extends TrozaRecepcion {
  especieComun?: string | null;
  dimensiones?: string | null;
}

export default function CtpRecepcionTrozas({
  entryId,
  trozas,
  volumenDelIngreso,
  onCerrar,
  onGuardado,
}: {
  entryId: string;
  trozas: TrozaEditable[];
  volumenDelIngreso: number | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  /** Sólo las madres: un pedazo retrozado no se recibe aparte de su troza. */
  const madres = useMemo(() => trozas.filter((t) => !t.trozaOrigenId), [trozas]);
  const [edit, setEdit] = useState<Record<string, CambioRecepcion>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valor = <K extends keyof CambioRecepcion>(t: TrozaEditable, campo: K): CambioRecepcion[K] => {
    const cambio = edit[t.id];
    if (cambio && cambio[campo] !== undefined) return cambio[campo];
    return t[campo as keyof TrozaEditable] as CambioRecepcion[K];
  };

  const tocar = (id: string, parche: Partial<CambioRecepcion>) =>
    setEdit((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { id }), id, ...parche } }));

  /** El balance se calcula sobre lo EDITADO: el aviso se mueve mientras se tipea. */
  const conCambios = useMemo(
    () => madres.map((t) => ({ ...t, ...(edit[t.id] ?? {}) })),
    [madres, edit],
  );
  const balance = useMemo(() => balanceRecepcion(conCambios), [conCambios]);
  const avisos = useMemo(
    () => avisosRecepcion(balance, volumenDelIngreso),
    [balance, volumenDelIngreso],
  );

  const cambios = Object.values(edit);

  const guardar = async () => {
    if (cambios.length === 0) return onCerrar();
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/trozas", {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ woodEntryId: entryId, cambios }),
      });
      const body = (await r.json()) as { error?: string; message?: string };
      if (!r.ok) throw new Error(body.message ?? body.error ?? "No se pudo guardar la recepción.");
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border-2 border-primary/40 bg-[var(--surface-canvas)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule-soft)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <PackageCheck className="h-4 w-4" aria-hidden />
          </span>
          <CardTitle as="h3" className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
            Recepción en patio
          </CardTitle>
        </div>
        <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
          <b className="text-[var(--text-primary)]">{balance.recibidas}</b>/{balance.declaradas} piezas ·{" "}
          <b className="text-[var(--text-primary)]">{balance.volumenRecibido.toFixed(4)}</b> m³ recibidos
        </span>
      </div>

      {avisos.length > 0 && (
        <ul className="space-y-1 border-b border-[var(--rule-soft)] bg-[var(--data-warning-50)] px-4 py-3 dark:bg-[var(--data-warning-500)]/10">
          {avisos.map((a) => (
            <li key={a} className="flex items-start gap-1.5 text-xs leading-snug text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {a}
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm hoja-grilla">
          <thead>
            <tr className="border-b border-[var(--rule-soft)] text-left text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              <th className="px-3 py-2 font-bold">Codificación</th>
              <th className="px-3 py-2 font-bold">Especie</th>
              <th className="px-3 py-2 text-right font-bold">Vol. m³</th>
              <th className="px-3 py-2 font-bold">Código de planta</th>
              <th className="px-3 py-2 font-bold">Parcela de corta</th>
              <th className="px-3 py-2 text-center font-bold">¿Llegó?</th>
              <th className="px-3 py-2 font-bold">Observación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule-soft)]">
            {madres.map((t) => {
              const falta = Boolean(valor(t, "noRecepcionada"));
              return (
                <tr key={t.id} className={falta ? "bg-[var(--data-error-50)]/40 dark:bg-[var(--data-error-500)]/10" : undefined}>
                  <td className="whitespace-nowrap px-3 py-2 font-mono font-bold text-[var(--text-primary)]">
                    {t.codificacion ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{t.especieComun ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                    {t.volumenM3 != null ? Number(t.volumenM3).toFixed(4) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={valor(t, "codigoPlanta") ?? ""}
                      onChange={(e) => tocar(t.id, { codigoPlanta: e.target.value })}
                      disabled={falta}
                      placeholder="Ej: 118"
                      className="h-10 w-28 rounded-xl border-2 border-[var(--rule-base)] bg-transparent px-2 font-mono text-sm text-[var(--text-primary)] disabled:opacity-40"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={valor(t, "parcela") ?? ""}
                      onChange={(e) => tocar(t.id, { parcela: e.target.value })}
                      disabled={falta}
                      placeholder="PC-03"
                      className="h-10 w-28 rounded-xl border-2 border-[var(--rule-base)] bg-transparent px-2 font-mono text-sm text-[var(--text-primary)] disabled:opacity-40"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => tocar(t.id, { noRecepcionada: !falta })}
                      title={falta ? "Marcar como recibida" : "Marcar como NO llegada"}
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border-2 ${
                        falta
                          ? "border-[var(--data-error-500)] text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                          : "border-[var(--rule-base)] text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                      }`}
                    >
                      {falta ? <X className="h-4 w-4" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={valor(t, "recepcionObs") ?? ""}
                      onChange={(e) => tocar(t.id, { recepcionObs: e.target.value })}
                      placeholder={falta ? "¿Por qué no llegó?" : "Rajadura, pudrición…"}
                      className="h-10 w-full min-w-40 rounded-xl border-2 border-[var(--rule-base)] bg-transparent px-2 text-sm text-[var(--text-primary)]"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && (
        <p className="border-t border-[var(--rule-soft)] px-4 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--rule-soft)] px-4 py-3">
        <span className="mr-auto text-xs text-[var(--text-tertiary)]">
          {cambios.length === 0 ? "Sin cambios todavía." : `${cambios.length} troza(s) con cambios sin guardar.`}
        </span>
        <button
          type="button"
          onClick={onCerrar}
          disabled={guardando}
          className="h-11 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)]"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={guardando || cambios.length === 0}
          className="flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white disabled:opacity-40"
        >
          {guardando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Guardar recepción
        </button>
      </div>
    </section>
  );
}
