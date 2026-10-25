"use client";

/**
 * Una fila de «Papeles del permiso»: el estado (está / falta / vencido / si
 * aplica), el nombre con su ⓘ (qué es y qué norma lo pide), el archivo que lo
 * respalda con su vencimiento, y «Ver» / «Subir». Subir acepta foto o PDF: en
 * el celular abre la cámara. Un archivo con candado para el rol que mira sale
 * como «1 archivo con candado», sin nombre ni «Ver» (security 25-10).
 */

import { useRef } from "react";
import { AlertCircle, AlertTriangle, Check, Clock, Eye, Loader2, Minus, Upload, type LucideIcon } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { formatDate } from "@/lib/format";
import type { EstadoPapel, PapelDelPlan } from "@/lib/forestal/loth-plan-papeles";

const ASPECTO: Record<EstadoPapel, { label: string; icono: LucideIcon; pastilla: string; tinta: string }> = {
  presente: {
    label: "Está",
    icono: Check,
    pastilla: "border-[var(--data-success-500)]/45 bg-[var(--data-success-500)]/10",
    tinta: "text-[var(--data-success-ink)]",
  },
  vence_pronto: {
    label: "Vence pronto",
    icono: Clock,
    pastilla: "border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10",
    tinta: "text-[var(--data-warning-ink)]",
  },
  vencido: {
    label: "Vencido",
    icono: AlertTriangle,
    pastilla: "border-[var(--data-error-500)]/50 bg-[var(--data-error-500)]/10",
    tinta: "text-[var(--data-error-ink)]",
  },
  falta: {
    label: "Falta",
    icono: AlertCircle,
    pastilla: "border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10",
    tinta: "text-[var(--data-warning-ink)]",
  },
  segun_caso: {
    label: "Si aplica",
    icono: Minus,
    pastilla: "border-[var(--rule-base)] bg-[var(--surface-sunken)]",
    tinta: "text-[var(--text-tertiary)]",
  },
};

/** Las fechas de los papeles son de día (vencimiento, plazo): se leen en UTC. */
const fecha = (dia: string) => formatDate(`${dia}T00:00:00.000Z`, { soloFecha: true });

const conCandado = (n: number) => `${n} ${n === 1 ? "archivo" : "archivos"} con candado`;

function detalle(p: PapelDelPlan): string | null {
  const partes: string[] = [];
  const candados = p.conCandado ?? 0;
  if (p.archivo?.nombre) {
    partes.push(p.archivo.nombre);
    if (p.archivo.uploadedAt) partes.push(`subido ${fecha(p.archivo.uploadedAt.slice(0, 10))}`);
    if (candados > 0) partes.push(`${candados} más con candado`);
  } else if (p.archivo) {
    partes.push(conCandado(Math.max(candados, 1)));
  }
  if (p.vence) {
    const verbo = p.archivo ? (p.estado === "vencido" ? "venció" : "vence") : "plazo";
    partes.push(`${verbo} ${fecha(p.vence)}${p.archivo && p.venceDerivado ? " (vigencia del plan)" : ""}`);
  }
  if (p.cuantos > 1 && p.cuantos > candados) partes.push(`${p.cuantos} archivos`);
  return partes.length > 0 ? partes.join(" · ") : null;
}

export default function PapelFila({
  papel,
  subiendo,
  bloqueado,
  onSubir,
  onVer,
}: {
  papel: PapelDelPlan;
  subiendo: boolean;
  /** Otra subida o escritura en curso. */
  bloqueado: boolean;
  onSubir: (files: File[]) => void;
  onVer: (documentId: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const a = ASPECTO[papel.estado];
  const linea = detalle(papel) ?? (papel.subible ? null : "Se archivan solas con cada guía");
  /* A 400 px, «Ver» + «Otra versión» con texto dejaban el nombre en una
     tercera línea: con dos botones, en el celular quedan sólo con su ícono. */
  const verId = papel.archivo?.documentId ?? null;
  const soloIcono = verId != null && papel.subible ? "max-sm:sr-only" : "";
  return (
    <li data-papel={papel.clave} className="flex items-center gap-3 py-3">
      {/* En pantalla ancha, el estado es una columna; en el celular va pegado al nombre. */}
      <Pastilla aspecto={a} className="hidden h-7 w-32 shrink-0 sm:inline-flex" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-semibold text-[var(--text-primary)]">
          <Pastilla aspecto={a} className="inline-flex h-6 sm:hidden" />
          {/* Nombre y ⓘ juntos: si el nombre se parte, el ⓘ no cae solo a otra línea. */}
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span className="min-w-0">{papel.nombre}</span>
            <InfoTip
              title={papel.nombre}
              what={papel.ayuda}
              affects={<span>Lo pide: {papel.fuente}</span>}
              example={papel.exigencia === "segun_caso" ? <span>No cuenta en «papeles» hasta que te lo pidan o lo subas.</span> : undefined}
            />
          </span>
        </p>
        {linea && <p className="truncate text-xs text-[var(--text-tertiary)]" title={linea}>{linea}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        {verId && (
          <button
            type="button"
            className={button({ variant: "ghost" })}
            aria-label={`Ver ${papel.nombre}`}
            onClick={() => onVer(verId)}
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
            <span className={soloIcono}>Ver</span>
          </button>
        )}
        {papel.subible && (
          <>
            <button
              type="button"
              className={button({ variant: papel.archivo ? "ghost" : "secondary" })}
              disabled={bloqueado}
              aria-label={`Subir ${papel.nombre} (foto o PDF)`}
              onClick={() => input.current?.click()}
            >
              {subiendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
              <span className={soloIcono}>{papel.archivo ? "Otra versión" : "Subir"}</span>
            </button>
            <input
              ref={input}
              type="file"
              accept="application/pdf,image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length > 0) onSubir(files);
              }}
            />
          </>
        )}
      </div>
    </li>
  );
}

function Pastilla({ aspecto: a, className }: { aspecto: (typeof ASPECTO)[EstadoPapel]; className: string }) {
  const Icono = a.icono;
  return (
    <span className={`${className} items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold text-[var(--text-primary)] ${a.pastilla}`}>
      <Icono className={`h-4 w-4 shrink-0 ${a.tinta}`} aria-hidden="true" />
      {a.label}
    </span>
  );
}
