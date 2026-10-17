"use client";

/**
 * «Ya impresa» dentro de «Enviar al monte» (16-10): la guía ya salió del
 * talonario (impresa, observada o confirmada), así que otro envío gastaría
 * OTRA hoja numerada. Muestra en qué hoja quedó, la foto si la hay, y deja
 * «Reimprimir en otra hoja» sólo con el motivo escrito (queda en el envío).
 */

import { Camera } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { correlativoDeGuia } from "@/lib/forestal/gtf-cola-monte";
import type { TrabajoImpresion } from "@/lib/forestal/gtf-salida-tipos";
import { I } from "./ctp-shared";
import { PastillaEstadoMonte, cuandoLima, srcFotoHoja } from "./gtf-cola-monte-ui";

/** Lo que dice el envío ya impreso, en una línea. */
export function textoYaImpresa(t: Pick<TrabajoImpresion, "estado" | "numeroHoja" | "numeroGuia" | "observacion">): string {
  if (t.estado === "confirmada") return `Ya impresa en la hoja N° ${t.numeroHoja ?? correlativoDeGuia(t.numeroGuia) ?? t.numeroGuia}`;
  if (t.estado === "observada") return `Impresa con observación: ${t.observacion ?? "revisa la hoja"}`;
  return "Ya la imprimieron: falta confirmar el N° de la hoja";
}

export const MOTIVO_MINIMO = 3;

/**
 * Lo que dice el ⋯ de la fila en lugar de «Enviar al monte» cuando la guía ya
 * salió del talonario (`trabajo` = el de la pastilla de la fila), o null si
 * todavía se puede enviar (sin envío o con uno pendiente).
 */
export function etiquetaMonteImpresa(t: Pick<TrabajoImpresion, "estado" | "numeroHoja" | "numeroGuia"> | undefined): string | null {
  if (!t || t.estado === "pendiente" || t.estado === "anulado") return null;
  if (t.estado === "confirmada") return `Ya impresa en la hoja N° ${t.numeroHoja ?? correlativoDeGuia(t.numeroGuia) ?? t.numeroGuia}`;
  return t.estado === "observada" ? "Impresa con observación" : "Ya impresa: falta el N° de la hoja";
}

export default function MonteYaImpresa({ t, motivo, onMotivo }: { t: TrabajoImpresion; motivo: string; onMotivo: (v: string) => void }) {
  return (
    <div className="space-y-3" data-qa="monte-ya-impresa">
      <div className="space-y-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
          <PastillaEstadoMonte estado={t.estado} conFoto={!!t.fotoDocId} />
          <span>{cuandoLima(t.impresaEn ?? t.creadoEn)}</span>
          {t.fotoDocId && (
            <a
              href={srcFotoHoja(t.numeroGuia, t.fotoDocId)}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex min-h-12 items-center gap-1.5 font-bold text-[var(--accent-ink)] underline dark:text-[var(--accent)]"
              data-qa="ver-foto-hoja"
            >
              <Camera className="h-4 w-4" aria-hidden /> Ver la foto
            </a>
          )}
        </div>
        <p className="text-base font-bold text-[var(--text-primary)]" data-qa="texto-ya-impresa">{textoYaImpresa(t)}</p>
      </div>
      <div className="space-y-1.5">
        <span className="flex items-center gap-1.5">
          <label htmlFor="monte-motivo" className="block text-sm font-bold text-[var(--text-primary)]">Reimprimir en otra hoja: por qué</label>
          <InfoTip
            title="Reimprimir en otra hoja"
            what="Sólo si la hoja se dañó o se perdió: gasta otra hoja del talonario y el motivo queda escrito en el envío."
            affects="El N° de la hoja nueva no será el de la guía: el monte lo anota y la oficina lo ve como observada."
            example="Se trabó el papel en la matricial"
          />
        </span>
        <textarea
          id="monte-motivo"
          rows={2}
          maxLength={200}
          placeholder="Se mojó la hoja, se trabó el papel…"
          className={cn(I, "min-h-12 py-2 text-base")}
          value={motivo}
          onChange={(e) => onMotivo(e.target.value)}
          data-qa="motivo-reimprimir"
        />
      </div>
    </div>
  );
}
