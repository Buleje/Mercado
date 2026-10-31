"use client";

/**
 * Las piezas chicas de la ficha de una persona: la cifra grande y el aviso de
 * una línea. Salieron de `FichaPersonaModal` sin cambiar nada.
 */

import { ImageIcon, Lock } from "@buleje/design-system/icons";
import { urlFotoDocumento } from "./crear-persona/acciones";
import { usePuedeEditarAdelantos } from "../hooks/use-puede-editar-adelantos";

export function Kpi({
  label,
  valor,
  pie,
  tono = "neutro",
}: {
  label: string;
  valor: string;
  pie?: string;
  tono?: "neutro" | "success" | "warning" | "error" | "info";
}) {
  const color =
    tono === "info"
      ? "text-[var(--data-info-ink)]"
      : tono === "success"
      ? "text-[var(--data-success)]"
      : tono === "warning"
        ? "text-[var(--data-warning)]"
        : tono === "error"
          ? "text-[var(--data-error)]"
          : "text-[var(--text-primary)]";
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <p className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold tabular-nums ${color}`}>{valor}</p>
      {pie && <p className="text-sm text-[var(--text-secondary)]">{pie}</p>}
    </div>
  );
}

export function Aviso({ tono, children }: { tono: "error" | "info" | "neutro"; children: React.ReactNode }) {
  const cls =
    tono === "error"
      ? "bg-[var(--data-error)]/10 text-[var(--data-error)]"
      : tono === "info"
        ? "bg-[var(--data-info)]/10 text-[var(--data-info)]"
        : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]";
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold ${cls}`}>{children}</div>
  );
}

/** Toque de 44 px para el enlace chico sin agrandar la línea (memoria panel-celular-toque-44). */
const TOQUE = "relative after:absolute after:-inset-y-3 after:inset-x-0 after:content-['']";

/**
 * «Foto del DNI: guardada» (ADR-525, 30-10). Quien edita adelantos la abre en
 * grande; quien sólo mira (el analista) ve el candado: el GET de la imagen le
 * da 403 a propósito (Ley 29733) y no se pide.
 */
export function FotoDelDni({ personaId }: { personaId: string }) {
  const puede = usePuedeEditarAdelantos();
  return (
    <Aviso tono="neutro">
      {puede === false ? <Lock className="h-4 w-4 shrink-0" aria-hidden /> : <ImageIcon className="h-4 w-4 shrink-0" aria-hidden />}
      Foto del DNI: guardada
      {puede === true && (
        <a
          href={urlFotoDocumento(personaId)}
          target="_blank"
          rel="noopener noreferrer"
          className={`${TOQUE} underline text-[var(--accent-ink)] dark:text-[var(--accent)]`}
        >
          Ver
        </a>
      )}
      {puede === false && <span className="font-normal">· Solo quien edita adelantos ve la foto</span>}
    </Aviso>
  );
}

/** Las notas de la ficha (salieron de `FichaPersonaModal`, que pasaba las 300 líneas). */
export function NotasFicha({ notas }: { notas: string }) {
  return (
    <div className="rounded-2xl bg-[var(--surface-sunken)] px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Notas de la ficha</p>
      <p className="mt-1 whitespace-pre-wrap text-base text-[var(--text-primary)]">{notas}</p>
    </div>
  );
}
