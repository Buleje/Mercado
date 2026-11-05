"use client";

import { Fragment, useState, type ReactNode } from "react";
import { DataTable } from "@buleje/design-system";
import { ChevronDown, ExternalLink, FileText } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EstadoPapel } from "@/lib/papeles/registro";
import {
  ROTULO_ESTADO_PAPEL,
  enlaceVerificacion,
  rotuloTipoPapel,
  totalDelPapel,
  type GrupoDePapel,
  type PapelDelPanel,
} from "@/lib/papeles/vista-panel";

const CLASE_ESTADO: Record<EstadoPapel, string> = {
  oficial: "text-[var(--data-success-ink)]",
  revision: "text-[var(--data-warning-ink)]",
  borrador: "text-[var(--text-secondary)]",
  reemplazado: "text-[var(--text-tertiary)]",
  anulado: "text-[var(--data-error-ink)]",
};

const BOTON = button({ variant: "secondary", className: "rounded-xl" });

interface Props {
  grupos: readonly GrupoDePapel[];
  /** Base pública del negocio para el QR; `null` mientras llega. */
  baseQr: string | null;
  onVerPdf: (documentId: string) => void;
}

/**
 * Un papel por fila (su versión vigente). Las versiones anteriores del mismo
 * número se abren debajo, en gris. En el celular el panel la dibuja como
 * tarjetas (`useMobileTableCards` rotula cada celda con su encabezado).
 */
export function TablaPapeles({ grupos, baseQr, onVerPdf }: Props) {
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());
  const alternar = (numero: string) =>
    setAbiertos((s) => {
      const n = new Set(s);
      if (n.has(numero)) n.delete(numero);
      else n.add(numero);
      return n;
    });

  return (
    <DataTable className="table-fixed">
      <colgroup className="max-sm:hidden">
        <col className="w-48" />
        <col />
        <col className="w-32" />
        <col className="w-28" />
        <col className="w-32" />
        <col className="w-60" />
      </colgroup>
      <thead>
        <tr>
          <th>Número</th>
          <th>Papel</th>
          <th>Fecha</th>
          <th>Estado</th>
          <th className="text-right">Total</th>
          <th>Abrir</th>
        </tr>
      </thead>
      <tbody>
        {grupos.map((g) => {
          const abierto = abiertos.has(g.numero);
          return (
            <Fragment key={g.numero}>
              <FilaPapel papel={g.vigente} baseQr={baseQr} onVerPdf={onVerPdf}>
                {g.anteriores.length > 0 && (
                  <button
                    type="button"
                    onClick={() => alternar(g.numero)}
                    aria-expanded={abierto}
                    className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    <ChevronDown className={cn("h-4 w-4 transition-transform", abierto && "rotate-180")} aria-hidden />
                    {g.anteriores.length === 1 ? "1 versión anterior" : `${g.anteriores.length} versiones anteriores`}
                  </button>
                )}
              </FilaPapel>
              {abierto && g.anteriores.map((p) => <FilaPapel key={p.id} papel={p} baseQr={baseQr} onVerPdf={onVerPdf} anterior />)}
            </Fragment>
          );
        })}
      </tbody>
    </DataTable>
  );
}

function FilaPapel({
  papel: p,
  baseQr,
  onVerPdf,
  anterior = false,
  children,
}: {
  papel: PapelDelPanel;
  baseQr: string | null;
  onVerPdf: (documentId: string) => void;
  anterior?: boolean;
  children?: ReactNode;
}) {
  const total = totalDelPapel(p);
  return (
    <tr className={cn(anterior && "bg-[var(--surface-raised)]/60 text-[var(--text-secondary)]")}>
      {/* Un solo bloque por celda: en el celular la celda es una fila flex
          (rótulo a la izquierda) y dos hijos sueltos se montaban uno sobre otro. */}
      <td className="whitespace-nowrap">
        <div className={cn("min-w-0", anterior && "sm:pl-5")}>
          <span className={cn("block tabular-nums", anterior ? "text-sm" : "font-bold text-[var(--text-primary)]")}>{p.numero}</span>
          <span className="block truncate text-xs tabular-nums text-[var(--text-tertiary)]" title="Código impreso al pie de la hoja">
            {p.codigo}
          </span>
          {children}
        </div>
      </td>
      <td>
        <div className="min-w-0">
          <span className="block truncate">{rotuloTipoPapel(p)}</span>
          {p.hojas != null && (
            <span className="block text-xs text-[var(--text-tertiary)]">{p.hojas === 1 ? "1 hoja" : `${p.hojas} hojas`}</span>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap tabular-nums">{formatDate(p.fecha, { soloFecha: true })}</td>
      <td className={cn("whitespace-nowrap font-semibold", CLASE_ESTADO[p.estado])}>{ROTULO_ESTADO_PAPEL[p.estado]}</td>
      <td className="whitespace-nowrap text-right font-semibold tabular-nums">{total ?? "—"}</td>
      <td>
        <div className="flex flex-wrap items-center gap-1.5 max-sm:justify-end">
          {p.documentId ? (
            <button type="button" onClick={() => onVerPdf(p.documentId as string)} className={BOTON} aria-label={`Ver el PDF de ${p.numero}`}>
              <FileText className="h-4 w-4" aria-hidden />
              Ver PDF
            </button>
          ) : (
            <span className="text-xs text-[var(--text-tertiary)]">Sin PDF</span>
          )}
          {baseQr ? (
            <a
              href={enlaceVerificacion(baseQr, p.codigo)}
              target="_blank"
              rel="noopener noreferrer"
              className={BOTON}
              title="La página que abre el QR de la hoja (sin el total: ese solo sale con el QR)"
              aria-label={`Ver la página del QR de ${p.numero}`}
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              QR
            </a>
          ) : (
            <span className={cn(BOTON, "pointer-events-none opacity-50")} aria-hidden>
              <ExternalLink className="h-4 w-4" />
              QR
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}
