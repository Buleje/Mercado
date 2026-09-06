"use client";

/**
 * CtpPatioBandeja — lo anotado en el patio que todavía no está en el libro.
 *
 * Se muestra sólo cuando hay algo que decir: sin señal, con anotaciones en cola
 * o con alguna rechazada. Un cartel permanente de "estás online" es ruido.
 */
import { AlertTriangle, Loader2, RefreshCw, Trash2, Upload, WifiOff } from "@buleje/design-system/icons";
import { borrar } from "@/lib/forestal/patio-cola";
import type { PatioColaState } from "@/hooks/use-patio-cola";

const fhora = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

export default function CtpPatioBandeja({ cola }: { cola: PatioColaState }) {
  const { online, lista, pendientes, rechazadas, sincronizando } = cola;
  if (online && pendientes === 0 && rechazadas === 0) return null;

  const tono = rechazadas > 0
    ? "border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/12"
    : "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/12";

  return (
    <section className={`rounded-2xl border-2 p-4 ${tono}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          {online ? <Upload className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          {online ? "Anotaciones del patio por subir" : "Sin señal — se está anotando en el equipo"}
        </span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
            {pendientes} por subir{rechazadas > 0 ? ` · ${rechazadas} rechazadas` : ""}
          </span>
          <button
            type="button"
            onClick={() => void cola.sincronizar()}
            disabled={sincronizando || !online}
            title={online ? "Intentar subir ahora" : "Sin conexión: se sube solo cuando vuelva"}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--text-primary)] disabled:opacity-50"
          >
            {sincronizando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Subir
          </button>
        </span>
      </div>

      <p className="mb-2 text-xs text-[var(--text-secondary)]">
        Lo anotado acá todavía <strong>no está en el libro</strong>: se sube solo cuando vuelve la señal.
        El libro puede rechazarlo (saldo insuficiente, mes cerrado) — si pasa, se avisa acá con el motivo.
      </p>

      <ul className="space-y-1.5">
        {lista.map((a) => (
          <li key={a.id} className="flex items-start gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-2">
                <b className="text-xs font-bold text-[var(--text-primary)]">{a.resumen}</b>
                <span className="text-[length:var(--ts-2xs)] uppercase tracking-wide text-[var(--text-tertiary)]">{a.section} · {fhora(a.createdAt)}</span>
              </span>
              {a.estado === "rechazado" ? (
                <span className="mt-0.5 flex items-start gap-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {a.motivo ?? "El libro la rechazó."}
                </span>
              ) : (
                <span className="mt-0.5 block text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                  {a.intentos > 0 ? `${a.intentos} intento${a.intentos === 1 ? "" : "s"} · ` : ""}esperando señal
                </span>
              )}
            </span>
            {a.estado === "rechazado" && (
              <>
                <button
                  type="button"
                  onClick={() => void cola.reencolar(a.id)}
                  className="rounded-lg border-2 border-[var(--rule-base)] px-2 py-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)]"
                  title="Ya corregí lo que faltaba en el libro: intentar de nuevo"
                >
                  Reintentar
                </button>
                <button
                  type="button"
                  onClick={() => { void borrar(a.id).then(() => cola.refrescar()); }}
                  aria-label={`Descartar la anotación ${a.resumen}`}
                  title="Descartar: la anotación se pierde"
                  className="rounded-lg border-2 border-[var(--rule-base)] p-1.5 text-[var(--text-tertiary)] hover:text-[var(--data-error-700)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
