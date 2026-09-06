"use client";

/**
 * Los despachos que HOY no podrían emitir su certificado, con el motivo.
 *
 * El módulo ya sabía contarlos —el panel de Cumplimiento decía «3 despachos no
 * certifican»— pero el número no llevaba a ningún lado: ni cuáles, ni por qué,
 * ni dónde se arregla. El operador se enteraba al apretar «emitir certificado»
 * de un camión que ya salió.
 *
 * Las tres causas son las mismas de `trazabilidadCompleta()` y en su orden, o la
 * lista y la ficha dirían cosas distintas de la misma guía:
 *
 *   1. **sin_atribucion** — el despacho no cita ninguna corrida ni troza.
 *   2. **atribucion_parcial** — cita, pero le faltan m³ por atribuir.
 *   3. **corrida_sin_origen** — cita una corrida que no declara de qué madera
 *      salió. Es el eslabón de más atrás y el más fácil de pasar por alto: el
 *      despacho se ve completo y la cadena se corta un paso antes.
 */

import { AlertTriangle, ChevronRight, ShieldCheck } from "@buleje/design-system/icons";
import { formatDate } from "./ctp-shared";
import { Btn } from "./ctp-shared";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

export interface DespachoSinCertificar {
  id: string;
  lineNo: number;
  entryDate: string;
  producto: string | null;
  gtfSalida: string | null;
  declarado: number;
  sinAtribuir: number;
  motivo: "sin_atribucion" | "atribucion_parcial" | "corrida_sin_origen";
  corridasSinOrigen: number[];
}

/** Qué le falta y dónde se arregla — no sólo el nombre técnico de la causa. */
function explicar(d: DespachoSinCertificar): { que: string; donde: string } {
  if (d.motivo === "sin_atribucion") {
    return {
      que: "No cita ninguna corrida: no hay de dónde decir que salió esta madera.",
      donde: "Abrí la ficha y declarale su corrida de origen.",
    };
  }
  if (d.motivo === "atribucion_parcial") {
    return {
      que: `Le faltan ${fmtM3(d.sinAtribuir)} m³ por atribuir de los ${fmtM3(d.declarado)} que declara.`,
      donde: "Abrí la ficha y completá el origen del resto.",
    };
  }
  return {
    que: `La corrida ${d.corridasSinOrigen.map((n) => `N° ${n}`).join(", ")} que cita no declara de qué madera salió.`,
    donde: "La cadena se corta un paso antes: hay que atribuirle sus guías a esa corrida.",
  };
}

export default function CtpSinCertificar({
  despachos,
  onAbrir,
}: {
  despachos: DespachoSinCertificar[];
  /** Abrir la ficha del despacho, que es donde se edita la atribución. */
  onAbrir: (id: string) => void;
}) {
  /* Sin huecos NO se calla: que la cadena esté entera es la afirmación que hace
     falta poder hacer frente a un fiscalizador, y sólo se puede hacer si alguien
     la verificó alguna vez. */
  if (despachos.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/8 px-4 py-2.5 text-sm text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
        Todos los despachos del período pueden emitir su certificado: la cadena llega hasta la guía de
        ingreso.
      </p>
    );
  }

  return (
    <section
      aria-label="Despachos que no pueden certificar"
      className="overflow-hidden rounded-2xl border-2 border-[var(--data-error-500)]/40 bg-[var(--surface-raised)]"
    >
      <header className="flex flex-wrap items-center gap-2 border-b-2 border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/10 px-4 py-2.5">
        <AlertTriangle
          className="h-4 w-4 shrink-0 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
          aria-hidden
        />
        <p className="text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {despachos.length} despacho{despachos.length === 1 ? "" : "s"} no puede
          {despachos.length === 1 ? "" : "n"} emitir su certificado
        </p>
        <p className="min-w-0 flex-1 text-sm text-[var(--text-tertiary)]">
          La cadena de custodia tiene un hueco. Enterarse al emitir es enterarse cuando el camión ya salió.
        </p>
      </header>

      <ul className="divide-y-2 divide-[var(--rule-soft)]">
        {despachos.map((d) => {
          const { que, donde } = explicar(d);
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <b className="font-mono text-sm text-[var(--text-primary)]">N° {d.lineNo}</b>
                  <span className="text-sm text-[var(--text-secondary)]">{d.producto ?? "Sin producto"}</span>
                  <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                    {formatDate(d.entryDate)}
                    {d.gtfSalida ? ` · GTF ${d.gtfSalida}` : ""}
                  </span>
                </span>
                <span className="mt-0.5 block text-sm text-[var(--text-secondary)]">{que}</span>
                <span className="block text-sm text-[var(--text-tertiary)]">{donde}</span>
              </span>
              <Btn size="sm" variant="secondary" onClick={() => onAbrir(d.id)}>
                Abrir la ficha <ChevronRight className="h-4 w-4" />
              </Btn>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
