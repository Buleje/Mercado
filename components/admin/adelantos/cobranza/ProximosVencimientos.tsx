"use client";

/**
 * Lo que vence esta semana.
 *
 * Todo el módulo mira hacia atrás: quién ya se atrasó y hace cuánto. Este
 * bloque mira hacia adelante, que es donde la plata todavía se puede recuperar
 * sin pelear: un «mañana vence lo tuyo» por WhatsApp evita el reclamo de
 * treinta días después.
 */

import { CalendarClock, MessageCircle } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { enlaceWhatsApp } from "@/lib/adelantos/contacto";
import {
  cuandoVence,
  proximosVencimientos,
  totalProximo,
  type CompromisoProximo,
} from "@/lib/adelantos/proximos-vencimientos";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { fmtMon } from "../shared";

/** Aviso amable, en primera persona y sin reclamo: todavía no debe nada. */
function mensajeDeAviso(c: CompromisoProximo): string {
  const cuando = c.faltan === 0 ? "hoy" : c.faltan === 1 ? "mañana" : `en ${c.faltan} días`;
  return `Hola ${c.nombre}, te recuerdo que ${cuando} vence ${c.concepto.toLowerCase()} por ${fmtMon(c.monto, c.moneda)}. ¡Gracias!`;
}

export default function ProximosVencimientos({ adelantos }: { adelantos: DbAdelanto[] }) {
  const proximos = proximosVencimientos(adelantos, 7);
  if (proximos.length === 0) return null;

  const total = totalProximo(proximos);

  return (
    <div className="rounded-xl bg-[var(--data-info)]/8 p-5 ring-1 ring-[var(--data-info)]/25">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base font-extrabold text-[var(--text-primary)]">
          <CalendarClock className="h-5 w-5 shrink-0 text-[var(--data-info)]" aria-hidden />
          Vence esta semana ({proximos.length})
        </CardTitle>
        <span className="text-base font-extrabold tabular-nums text-[var(--data-info)]">
          {fmtMon(total, proximos[0]?.moneda)} por entrar
        </span>
      </div>
      <p className="mb-3 text-sm text-[var(--text-secondary)]">
        Todavía no deben nada. Un aviso ahora evita el reclamo del mes que viene.
      </p>
      <ul className="divide-y divide-[var(--rule-soft)]">
        {proximos.slice(0, 8).map((c, i) => {
          const wa = enlaceWhatsApp(c.telefono, c.nombre, 0);
          /* El enlace con el texto del AVISO, no el de cobranza: a quien está
             en fecha no se le reclama una deuda que todavía no existe. */
          const link = wa ? `${wa.split("?text=")[0]}?text=${encodeURIComponent(mensajeDeAviso(c))}` : null;
          return (
            <li key={`${c.adelantoId}-${i}`} className="flex flex-wrap items-center gap-3 py-2.5">
              <span
                className={`w-20 shrink-0 text-sm font-bold ${
                  c.faltan <= 1 ? "text-[var(--data-warning)]" : "text-[var(--text-tertiary)]"
                }`}
              >
                {cuandoVence(c.faltan)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-bold text-[var(--text-primary)]">{c.nombre}</span>
                <span className="block truncate text-sm text-[var(--text-tertiary)]">
                  {c.concepto}
                  {c.codigoOperacion ? ` · ${c.codigoOperacion}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-base font-extrabold tabular-nums text-[var(--text-primary)]">
                {fmtMon(c.monto, c.moneda)}
              </span>
              {link ? (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-primary/12 hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
                >
                  <MessageCircle className="h-4 w-4" /> Avisar
                </a>
              ) : (
                <span className="shrink-0 text-sm text-[var(--text-tertiary)]">sin teléfono</span>
              )}
            </li>
          );
        })}
      </ul>
      {proximos.length > 8 && (
        <p className="mt-2 text-sm text-[var(--text-tertiary)]">y {proximos.length - 8} más…</p>
      )}
    </div>
  );
}
