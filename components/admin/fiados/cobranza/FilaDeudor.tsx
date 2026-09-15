"use client";

/**
 * Un cliente en la lista de cobranza de fiados — port de FilaDeudor.tsx
 * (Adelantos). Sin el caso "sin teléfono": en Fiados el teléfono ES la
 * clave del cliente (`customerId`), así que siempre está.
 */

import { MessageCircle, NotebookPen, Phone } from "@buleje/design-system/icons";
import { waLink } from "@/lib/whatsapp-link";
import {
  diasSinGestion,
  etiquetaGestion,
  type Gestion,
  type PromesaVigente,
} from "@/lib/fiados/gestion-cobranza";
import type { DeudorCobranza } from "@/lib/fiados/urgencia-cobranza";
import { explicarAtraso } from "@/lib/fiados/urgencia-cobranza";

function formatCurrency(n: number) { return `S/${n.toFixed(2)}`; }

const hace = (dias: number) => (dias <= 0 ? "hoy" : dias === 1 ? "ayer" : `hace ${dias} d`);

export default function FilaDeudor({
  deudor: d,
  promesa,
  ultima,
  cumplimiento,
  enTanda,
  onTanda,
  onAnotar,
  mensaje,
}: {
  deudor: DeudorCobranza;
  promesa?: PromesaVigente;
  ultima?: Gestion;
  /** % histórico de puntualidad; null si nunca tuvo un fiado cerrado. */
  cumplimiento: number | null;
  enTanda: boolean;
  onTanda: (v: boolean) => void;
  onAnotar: () => void;
  /** El texto que se le manda, según su tramo de atraso. */
  mensaje: string;
}) {
  const wa = waLink(d.telefono, mensaje);
  const sinGestion = diasSinGestion(ultima);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-1 py-3">
      <input
        type="checkbox"
        checked={enTanda}
        onChange={(e) => onTanda(e.target.checked)}
        aria-label={`Sumar a ${d.nombre} a la ronda`}
        className="h-5 w-5 shrink-0"
      />

      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-extrabold text-[var(--accent-ink)] dark:text-[var(--accent)]">
        {d.nombre.charAt(0).toUpperCase()}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-base font-bold text-[var(--text-primary)]">{d.nombre}</span>
          {cumplimiento != null && (
            <span
              title={`Pagó a tiempo el ${cumplimiento}% de sus fiados cerrados`}
              className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                cumplimiento >= 70
                  ? "bg-[var(--data-success)]/15 text-[var(--data-success)]"
                  : cumplimiento >= 30
                    ? "bg-[var(--data-warning)]/15 text-[var(--data-warning)]"
                    : "bg-[var(--data-error)]/15 text-[var(--data-error)]"
              }`}
            >
              {cumplimiento}%
            </span>
          )}
        </span>

        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          {d.dias > 0 && (
            <span className={d.dias > 60 ? "font-semibold text-[var(--data-error)]" : "text-[var(--text-tertiary)]"}>
              {explicarAtraso(d)}
            </span>
          )}
          {promesa && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                promesa.estado === "incumplio"
                  ? "bg-[var(--data-error)]/15 text-[var(--data-error)]"
                  : promesa.estado === "vence-hoy"
                    ? "bg-[var(--data-warning)]/15 text-[var(--data-warning)]"
                    : "bg-[var(--data-info)]/15 text-[var(--data-info)]"
              }`}
            >
              {promesa.estado === "incumplio"
                ? `Prometió y no cumplió (${hace(-promesa.faltan)})`
                : promesa.estado === "vence-hoy"
                  ? "Prometió pagar HOY"
                  : `Prometió en ${promesa.faltan} d`}
            </span>
          )}
          <span className="text-[var(--text-tertiary)]">
            {!ultima
              ? "sin gestionar"
              : promesa && ultima.id === promesa.gestion.id
                ? `anotado ${hace(sinGestion ?? 0)}`
                : `${etiquetaGestion(ultima.tipo)} · ${hace(sinGestion ?? 0)}`}
          </span>
        </span>
        {ultima?.nota && (
          <span className="mt-0.5 block truncate text-sm italic text-[var(--text-tertiary)]">«{ultima.nota}»</span>
        )}
      </span>

      <span className="shrink-0 text-right">
        <span className="block text-lg font-extrabold tabular-nums text-[var(--data-warning)]">
          {formatCurrency(d.saldo)}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onAnotar}
          title="Anotar qué pasó"
          aria-label={`Anotar gestión de ${d.nombre}`}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-[var(--text-secondary)] transition-colors hover:bg-primary/12 hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
        >
          <NotebookPen className="h-4 w-4" />
        </button>
        <a
          href={`tel:${d.telefono.replace(/\D/g, "")}`}
          title="Llamar"
          aria-label={`Llamar a ${d.nombre}`}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-[var(--text-secondary)] transition-colors hover:bg-primary/12 hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
        >
          <Phone className="h-4 w-4" />
        </a>
        <a
          href={wa ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary/12 px-3 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:bg-primary/20 dark:text-[var(--accent)]"
        >
          <MessageCircle className="h-4 w-4" /> Escribir
        </a>
      </span>
    </li>
  );
}
