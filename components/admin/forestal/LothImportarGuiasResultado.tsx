"use client";

/**
 * El resultado de «Importar guías despachadas» (ADR-461), guía por guía: qué
 * entró al libro (trozas, talas, despacho), qué ya estaba y qué se rechazó con
 * su motivo. Se llena mientras se importa (de a una guía), con el avance arriba. Cada importada lleva a su guía (vista GTF) y a su permiso
 * (Control del permiso, con ese permiso elegido). Debajo de cada una, lo que
 * pasó con el directorio (02-10 noche): agregado, completado, ya existía o
 * por qué no se pudo.
 */

import { useState } from "react";
import {
  AlertOctagon,
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  Truck,
  Undo2,
} from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type {
  ResultadoDirectorio,
  ResultadoImportarGuia,
  RespuestaImportar,
} from "@/lib/forestal/loth-importar-guia-tipos";
import { Btn } from "./ctp-shared";
import BotonDeshacerImportacion from "./LothImportarGuiasDeshacer";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** «5 trozas nuevas · 2 talas referenciales · 5 despachos». */
function lineasDe(r: ResultadoImportarGuia): string {
  const l = r.lineas;
  if (!l) return "";
  return [
    l.trozadosNuevos > 0 && plural(l.trozadosNuevos, "troza nueva", "trozas nuevas"),
    l.trozadosReusados > 0 &&
      plural(l.trozadosReusados, "troza que ya estaba", "trozas que ya estaban"),
    l.talasNuevas > 0 && plural(l.talasNuevas, "tala referencial", "talas referenciales"),
    l.talasAmpliadas > 0 && plural(l.talasAmpliadas, "tala ampliada", "talas ampliadas"),
    l.despachos > 0 && plural(l.despachos, "despacho", "despachos"),
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function LothImportarGuiasResultado({
  respuesta,
  avance,
  onVerGuia,
  onVerPermiso,
  onDeshecha,
}: {
  respuesta: RespuestaImportar;
  /** Mientras se importa: la guía en curso y cuántas van. */
  avance: { actual: string | null; total: number } | null;
  onVerGuia: (gtfNumber: string) => void;
  onVerPermiso: (planId: string) => void;
  /** Se deshizo una importación desde acá (ADR-461 §12): recargar el libro. */
  onDeshecha: () => void;
}) {
  const hechas = respuesta.resultados.length;
  /** Las guías cuya importación se deshizo en este modal (por `gtfId`). */
  const [deshechas, setDeshechas] = useState<Set<string>>(new Set());
  return (
    <div className="space-y-3">
      {avance && (
        <div className="space-y-1.5" role="status" aria-live="polite">
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Importando {Math.min(hechas + 1, avance.total)} de {avance.total}
            {avance.actual && (
              <span className="font-mono font-normal text-[var(--text-secondary)]">
                · GTF {avance.actual}
              </span>
            )}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]" aria-hidden>
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
              style={{ width: `${(hechas / Math.max(1, avance.total)) * 100}%` }}
            />
          </div>
        </div>
      )}
      {hechas > 0 && (
        <p
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
          role={avance ? undefined : "status"}
        >
          <span className="font-bold text-[var(--data-success-ink)]">
            {plural(respuesta.importadas, "guía importada", "guías importadas")}
          </span>
          {respuesta.yaEstaban > 0 && (
            <span className="text-[var(--text-secondary)]">
              {plural(respuesta.yaEstaban, "ya estaba", "ya estaban")}
            </span>
          )}
          {respuesta.rechazadas > 0 && (
            <span className="font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              {plural(respuesta.rechazadas, "rechazada", "rechazadas")}
            </span>
          )}
        </p>
      )}
      <ul className="space-y-2">
        {respuesta.resultados.map((r) => (
          <Fila
            key={r.clave}
            r={r}
            deshecha={!!r.gtfId && deshechas.has(r.gtfId)}
            puedeDeshacer={!avance}
            onVerGuia={onVerGuia}
            onVerPermiso={onVerPermiso}
            onDeshecha={(gtfId) => {
              setDeshechas((s) => new Set(s).add(gtfId));
              onDeshecha();
            }}
          />
        ))}
      </ul>
    </div>
  );
}

function Fila({
  r,
  deshecha,
  puedeDeshacer,
  onVerGuia,
  onVerPermiso,
  onDeshecha,
}: {
  r: ResultadoImportarGuia;
  /** Se deshizo su importación desde este modal. */
  deshecha: boolean;
  /** No mientras se importa (el turno del negocio lo tiene la importación). */
  puedeDeshacer: boolean;
  onVerGuia: (g: string) => void;
  onVerPermiso: (id: string) => void;
  onDeshecha: (gtfId: string) => void;
}) {
  const Icono =
    r.estado === "importada" ? CheckCircle2 : r.estado === "ya_estaba" ? Info : AlertOctagon;
  const color =
    r.estado === "importada"
      ? "text-[var(--data-success-ink)]"
      : r.estado === "ya_estaba"
        ? "text-[var(--text-secondary)]"
        : "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";
  const detalle = lineasDe(r);
  const { gtfNumber, planId, gtfId } = r;
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2">
      <Icono className={`mt-0.5 h-5 w-5 shrink-0 ${color}`} aria-hidden />
      <div className="min-w-0 flex-1 basis-[16rem] text-sm">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="font-mono font-bold text-[var(--text-primary)]">
            {r.gtfNumber ? `GTF ${r.gtfNumber}` : r.clave}
          </span>
          {r.volumenM3 != null && (
            <span className="font-mono tabular-nums text-[var(--text-secondary)]">
              {fmtM3(r.volumenM3)} m³
            </span>
          )}
          {r.planCreado && (
            <span className="inline-flex h-6 items-center rounded-full bg-[var(--data-info-500)]/12 px-2 text-xs font-semibold text-[var(--data-info-700)] dark:text-[var(--data-info-500)]">
              Permiso creado
            </span>
          )}
        </div>
        <div className={r.estado === "rechazada" ? color : "text-[var(--text-secondary)]"}>
          {detalle || r.mensaje}
        </div>
        {detalle && r.mensaje && r.estado !== "importada" && (
          <div className="text-[var(--text-secondary)]">{r.mensaje}</div>
        )}
        {r.directorio && r.directorio.length > 0 && <AlDirectorio items={r.directorio} />}
      </div>
      {deshecha && (
        <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-3 text-sm font-semibold text-[var(--text-secondary)]">
          <Undo2 className="h-4 w-4" aria-hidden /> Importación deshecha
        </span>
      )}
      {!deshecha && r.estado !== "rechazada" && (gtfNumber || planId) && (
        <div className="flex shrink-0 flex-wrap gap-2">
          {gtfNumber && (
            <Btn size="sm" variant="secondary" onClick={() => onVerGuia(gtfNumber)}>
              <Truck className="h-4 w-4" aria-hidden /> Ver la guía
            </Btn>
          )}
          {planId && (
            <Btn size="sm" variant="secondary" onClick={() => onVerPermiso(planId)}>
              <ExternalLink className="h-4 w-4" aria-hidden /> Ver el permiso
            </Btn>
          )}
          {r.estado === "importada" && gtfId && gtfNumber && puedeDeshacer && (
            <BotonDeshacerImportacion aboveModals gtfId={gtfId} gtfNumber={gtfNumber} onHecho={() => onDeshecha(gtfId)} />
          )}
        </div>
      )}
    </li>
  );
}

const TONO_DIRECTORIO: Record<ResultadoDirectorio["estado"], { texto: string; clase: string }> = {
  agregado: { texto: "Agregado", clase: "text-[var(--data-success-ink)]" },
  completado: { texto: "Completado", clase: "text-[var(--data-success-ink)]" },
  ya_existia: { texto: "Ya existía", clase: "text-[var(--text-secondary)]" },
  omitido: { texto: "No se guardó", clase: "text-[var(--text-secondary)]" },
  fallo: { texto: "No se pudo", clase: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" },
};

/** Lo que pasó con el directorio de una guía importada. */
function AlDirectorio({ items }: { items: ResultadoDirectorio[] }) {
  return (
    <ul className="mt-1.5 space-y-0.5 border-t border-[var(--rule-soft)] pt-1.5" aria-label="Directorio">
      {items.map((x) => {
        const t = TONO_DIRECTORIO[x.estado];
        return (
          <li key={`${x.clave}-${x.nombre}`} className="flex flex-wrap items-baseline gap-x-1.5">
            <span className={`font-semibold ${t.clase}`}>{t.texto}:</span>
            <span className={`font-semibold text-[var(--text-primary)] [overflow-wrap:anywhere] ${x.clave === "vehiculo" || x.clave === "permiso" ? "font-mono" : ""}`}>
              {x.nombre}
            </span>
            <span className="text-[var(--text-secondary)]">— {x.mensaje}</span>
          </li>
        );
      })}
    </ul>
  );
}
