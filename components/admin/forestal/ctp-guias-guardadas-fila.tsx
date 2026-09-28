"use client";

/**
 * Piezas chicas que comparten la bandeja de Ingresos y el listado de guías
 * guardadas (ADR-442): el chip «3/6 docs», el estado frente al libro, cuánto le
 * queda a la guía antes de vencer y cómo se compara lo que se busca.
 */

import { CheckCircle2, Clock, FolderOpen } from "@buleje/design-system/icons";
import { TOTAL_CASILLEROS } from "@/lib/forestal/documentos-guia";
import type { GuiaGuardadaVista } from "@/lib/forestal/guias-guardadas";
import { vencimientoDeGuiaGuardada, type GuiaConFicha } from "@/lib/forestal/vencimiento-guia-guardada";
import { limaDateKey } from "@/lib/utils";
import { tonoDeDocs } from "./ctp-documentos-guia-contexto";
import { ChipVencimiento } from "./ctp-guia-vence-chip";
import { fechaDeIngreso } from "./ctp-guia-guardada-partes";

/** Minúsculas y sin tildes: «Muñoz» se encuentra escribiendo «munoz». */
export function sinAcentos(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** «3/6 docs» sin botón (la fila entera ya abre la guía). */
export function ChipDocsGuardada({ n }: { n: number }) {
  return (
    <span
      title={`${n} de ${TOTAL_CASILLEROS} casilleros con archivo`}
      className={`inline-flex min-h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${tonoDeDocs(n)}`}
    >
      <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {n}/{TOTAL_CASILLEROS} docs
    </span>
  );
}

/** Cuánto le queda a la guía, calculado con el «hoy» de Lima. */
export function VenceGuardada({ g, hoy }: { g: GuiaConFicha; hoy?: string }) {
  return <ChipVencimiento v={vencimientoDeGuiaGuardada(g, hoy ?? limaDateKey())} />;
}

/**
 * «Por ingresar · vence en 2 días» o «Ingresada 27 set.». El vencimiento sólo
 * en las que esperan su madera: en una ingresada lo que importa es cuándo
 * llegó, y `ingreso.en` es cuándo se registró (no la llegada).
 */
export function EstadoGuardada({ g }: { g: GuiaGuardadaVista }) {
  return g.ingreso ? (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[var(--data-success-500)]/15 px-2 py-0.5 text-xs font-bold text-[var(--data-success-ink)]">
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
      Ingresada {fechaDeIngreso(g.ingreso.en)}
    </span>
  ) : (
    <>
      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[var(--data-warning-500)]/15 px-2 py-0.5 text-xs font-bold text-[var(--data-warning-ink)]">
        <Clock className="h-3.5 w-3.5" aria-hidden />
        Por ingresar
      </span>
      <VenceGuardada g={g} />
    </>
  );
}
