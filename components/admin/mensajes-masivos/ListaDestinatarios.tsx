"use client";

import { CardTitle } from "@buleje/design-system";
import { ExternalLink, MessageSquare } from "@buleje/design-system/icons";
import { aplicarPlantilla, enlaceWhatsApp, type Destinatario } from "./shared";

interface Props {
  destinatarios: Destinatario[];
  plantilla: string;
}

/** Quién recibe qué: cada fila abre WhatsApp con SU mensaje ya escrito (el envío lo hace la persona, uno a uno). */
export function ListaDestinatarios({ destinatarios, plantilla }: Props) {
  return (
    <section aria-labelledby="mm-destinatarios" className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <CardTitle id="mm-destinatarios" className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
        <MessageSquare className="h-4 w-4 text-primary" aria-hidden /> Destinatarios ({destinatarios.length})
      </CardTitle>
      {destinatarios.length === 0 ? (
        <p className="py-4 text-center text-sm text-[var(--text-secondary)]">Nadie coincide con este segmento.</p>
      ) : (
        <ul className="max-h-96 divide-y divide-[var(--rule-soft)] overflow-y-auto">
          {destinatarios.map((c) => {
            const url = enlaceWhatsApp(c, aplicarPlantilla(plantilla, c));
            return (
              <li key={c.phone || c.name} className="flex min-h-12 items-center gap-3 py-1">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">{c.name}</span>
                <span className="shrink-0 text-sm text-[var(--text-secondary)]">{c.phone || "sin número"}</span>
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[var(--accent-ink)] hover:bg-primary/10 dark:text-[var(--accent)]">
                    <ExternalLink className="h-4 w-4" aria-hidden /> Abrir
                    <span className="sr-only"> WhatsApp con {c.name}</span>
                  </a>
                ) : (
                  <span className="inline-flex h-12 shrink-0 items-center px-3 text-sm text-[var(--data-warning-ink)]">No le llega</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
