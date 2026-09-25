"use client";

/**
 * El paso que faltaba entre la propuesta y la firma (ADR-408).
 *
 * La materia prima se atribuye **desde un lote** (`sumar-corrida`), y las trozas
 * que los códigos del cubicado señalan suelen estar sueltas en el patio: en
 * Blas, las 160 trozas del patio (197,646 m³) están todas sin lote y los lotes
 * abiertos no tienen ni una pieza libre. Sin este botón el desplegable de abajo
 * sale vacío y la vinculación no se puede terminar nunca.
 *
 * Acá se ve QUÉ se va a escribir antes de escribirlo: cuántas trozas, cuánto
 * volumen, de qué guías, con qué permiso y si abre un lote nuevo o guarda en el
 * que ya tiene sus hermanas. Y lo que lo impide —dos especies, dos títulos
 * habilitantes— sale con nombre y apellido, no como un botón apagado.
 */

import { AlertTriangle, Boxes, Check, Loader2 } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { ArmadoDeLote, CorridaDelPlan, PlanDeLote } from "@/lib/forestal/lote-desde-propuesta";
import type { TrozaRechazada } from "./hooks/use-armar-lote-de-propuesta";

const DATO = "font-mono tabular-nums text-[var(--text-primary)]";

/** Lo que el servidor no aceptó, con su motivo: nunca en silencio. */
function NoEntraron({ rechazadas }: { rechazadas: TrozaRechazada[] }) {
  return (
    <ul className="space-y-1 rounded-lg border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-2.5 py-2">
      {rechazadas.map((r) => (
        <li key={r.id} className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">
          <span className="font-mono font-bold">{r.codigo ?? r.id}</span> no entró: {r.motivo}
        </li>
      ))}
    </ul>
  );
}

export default function CtpArmarLoteDesdePropuesta({
  armado,
  corrida,
  armando,
  error,
  rechazadas,
  listo,
  onArmar,
}: {
  armado: ArmadoDeLote;
  corrida: CorridaDelPlan;
  armando: boolean;
  error: string | null;
  rechazadas: TrozaRechazada[];
  /** Ya armado: el lote quedó elegido abajo y no hay nada más que apartar. */
  listo: { code: string; piezas: number } | null;
  onArmar: (plan: PlanDeLote, corrida: CorridaDelPlan) => void;
}) {
  const { plan, impedimento, avisos } = armado;

  /* Ya se armó: la propuesta de arriba quedó vieja (se leyó antes de escribir),
     así que se dice lo que pasó en vez de volver a ofrecer el mismo botón. */
  if (listo) {
    return (
      <div className="space-y-2 rounded-lg border border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 px-2.5 py-2">
        <p className="flex items-start gap-1.5 text-sm text-[var(--text-secondary)]">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" aria-hidden />
          <span>
            El lote <b className="font-mono">{listo.code}</b> quedó con {listo.piezas}{" "}
            {listo.piezas === 1 ? "troza" : "trozas"} y está elegido abajo. Revisa y confirma la vinculación.
          </span>
        </p>
        {rechazadas.length > 0 && <NoEntraron rechazadas={rechazadas} />}
      </div>
    );
  }

  /* Nada que apartar y nada que explicar: la pantalla queda como estaba. */
  if (!plan && !impedimento) return null;

  if (!plan) {
    return (
      <p className="rounded-lg border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-2.5 py-2 text-sm text-[var(--text-secondary)]">
        <AlertTriangle className="mr-1.5 inline h-4 w-4 align-text-bottom text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
        {impedimento}
      </p>
    );
  }

  const crear = plan.accion === "crear";
  return (
    <div className="space-y-2 rounded-lg border border-[var(--accent)]/40 bg-[var(--surface-canvas)] px-2.5 py-2">
      <p className="text-sm text-[var(--text-secondary)]">
        {plan.trozas.length === 1 ? "Una troza propuesta" : `${plan.trozas.length} trozas propuestas`} (
        <span className={DATO}>{fmtM3(plan.volumenM3)}</span> m³) todavía no{" "}
        {plan.trozas.length === 1 ? "está apartada" : "están apartadas"} en un lote, y la materia prima se
        atribuye desde un lote.
      </p>
      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
        {crear ? "Se abre un lote" : `Se guardan en el lote ${plan.loteCode}`} de{" "}
        <b className="text-[var(--text-secondary)]">{plan.especie}</b>
        {crear && (
          <>
            {" "}
            · permiso{" "}
            <b className="text-[var(--text-secondary)]">{plan.permiso ?? "sin declarar"}</b>
          </>
        )}
        {plan.guias.length > 0 && (
          <>
            {" "}
            · {plan.guias.length === 1 ? "guía" : "guías"}{" "}
            <span className="font-mono">{plan.guias.join(", ")}</span>
          </>
        )}{" "}
        · códigos <span className="font-mono">{plan.trozas.map((t) => t.codigo).join(", ")}</span>
      </p>

      {avisos.map((a) => (
        <p key={a} className="flex items-start gap-1.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{a}</span>
        </p>
      ))}

      <button
        type="button"
        onClick={() => onArmar(plan, corrida)}
        disabled={armando}
        title={
          crear
            ? "Abre el lote con estas trozas y lo deja elegido abajo"
            : `Guarda estas trozas en el lote ${plan.loteCode} y lo deja elegido abajo`
        }
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--accent)] px-3.5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent)]/10 disabled:opacity-50 dark:text-[var(--accent)]"
      >
        {armando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Boxes className="h-4 w-4" aria-hidden />}
        {armando
          ? "Armando el lote…"
          : crear
            ? `Armar el lote con ${plan.trozas.length === 1 ? "esta troza" : `estas ${plan.trozas.length} trozas`}`
            : `Guardarlas en el lote ${plan.loteCode}`}
      </button>
      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
        Esto aparta la madera; no vincula nada. La vinculación la sigues confirmando abajo.
      </p>

      {rechazadas.length > 0 && <NoEntraron rechazadas={rechazadas} />}

      {error && (
        <p className="rounded-lg border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-2.5 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}
    </div>
  );
}
