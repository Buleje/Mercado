"use client";

/**
 * «Documento de origen» de la ficha de una troza: la GTF que la ampara, quién
 * la trajo, el título habilitante con su resolución y parcela, el N° de
 * registro del SNIFFS con el enlace a la consulta pública de SERFOR, y las
 * medidas tal como las publica SERFOR. Es lo primero que pide una
 * fiscalización frente al tronco.
 */

import type { ReactNode } from "react";
import { ExternalLink } from "@buleje/design-system/icons";
import { Kicker } from "@buleje/design-system";
import { consultaSerforDe, fechaDelLibro, type FichaTroza } from "@/lib/forestal/troza-ficha-recorrido";

function Fila({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="pt-px text-xs text-[var(--text-secondary)]">{k}</dt>
      <dd className="min-w-0 break-words text-sm font-medium text-[var(--text-primary)]">{children}</dd>
    </div>
  );
}

export function DocumentoDeOrigen({ ficha, hoyKey }: { ficha: FichaTroza; hoyKey: string }) {
  const { troza: t, ingreso: g } = ficha;
  const consulta = consultaSerforDe(g.constanciaSniffs);
  const asentada = fechaDelLibro(g.entryDate, hoyKey);

  return (
    <section aria-labelledby="troza-ficha-origen" className="space-y-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3.5">
      <Kicker as="h3" id="troza-ficha-origen">Documento de origen</Kicker>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5">
        <Fila k="GTF">
          <span className="font-mono font-bold">{g.gtfNumber}</span>
        </Fila>
        {asentada && (
          <Fila k="Asentada">
            {asentada}
            {g.libroNro != null && <span className="text-[var(--text-secondary)]"> · asiento N° {g.libroNro}</span>}
          </Fila>
        )}
        <Fila k="Proveedor">{g.proveedor}</Fila>
        <Fila k="Título habilitante">
          {g.permiso?.trim() ? (
            <span className="font-mono">{g.permiso}</span>
          ) : (
            <span className="font-bold text-[var(--data-warning-ink)]">Sin título habilitante</span>
          )}
        </Fila>
        {g.resolucion && (
          <Fila k="Resolución">
            <span className="font-mono">{g.resolucion}</span>
          </Fila>
        )}
        {t.parcela && (
          <Fila k="Parcela de corta">
            <span className="font-mono">{t.parcela}</span>
          </Fila>
        )}
        {g.constanciaSniffs && (
          <Fila k="N° registro SNIFFS">
            <span className="font-mono">{g.constanciaSniffs}</span>
          </Fila>
        )}
      </dl>
      {consulta && (
        <a
          href={consulta}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:border-[var(--accent)] dark:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 sm:min-h-9"
        >
          Consultar la guía en SERFOR <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      )}
      {t.dimensiones && (
        <p className="border-t border-[var(--rule-soft)] pt-2 text-xs text-[var(--text-secondary)]">
          Como lo publica SERFOR: <span className="font-mono font-bold text-[var(--text-primary)]">{t.dimensiones}</span>
        </p>
      )}
      {t.observaciones && <p className="text-xs text-[var(--text-secondary)]">{t.observaciones}</p>}
    </section>
  );
}
