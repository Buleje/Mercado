"use client";

/**
 * Documentos › Papeles emitidos (ADR-534): el talonario de los papeles que salen
 * del negocio con el formato único (proforma, estado de cuenta, liquidación,
 * resumen…), cada uno con su estado, su total y su PDF.
 *
 * Por qué aquí (04-11): el programa `papel` ya registraba cada hoja en el panel
 * para el QR, pero ninguna pantalla la mostraba; para saber si el estado de
 * cuenta de un contratista estaba oficial o en revisión había que preguntarle
 * a la terminal. El estado no se cambia desde acá: va impreso DENTRO de la hoja,
 * así que cambiarlo es rehacer el PDF (lo hace el programa, con código nuevo).
 */

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { LoadingState, SectionTitle } from "@buleje/design-system";
import { AlertCircle, Lock, RefreshCw, Search } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { useBaseVerificacion } from "@/hooks/use-base-verificacion";
import { usePapelesEmitidos } from "@/hooks/use-papeles-emitidos";
import { cn } from "@/lib/utils";
import {
  FILTROS_ESTADO_PAPEL,
  ROTULO_FILTRO_PAPEL,
  agruparPapeles,
  contarPorEstado,
  filtrarPapeles,
  rotuloTipoPapel,
  type FiltroEstadoPapel,
} from "@/lib/papeles/vista-panel";
import { TablaPapeles } from "./TablaPapeles";

/** El mismo visor del Archivo (PDF.js pesa): entra al abrir el primer PDF. */
const VistaPreviaDoc = dynamic(() => import("@/components/admin/forestal/plan-documentos/VistaPreviaDoc"), { ssr: false });

const CHIP = "inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors";
const CHIP_ON = "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]";
const CHIP_OFF =
  "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]";

const VACIO: Record<FiltroEstadoPapel, string> = {
  todos: "Todavía no salió ningún papel con el formato del negocio.",
  oficial: "Ningún papel oficial todavía.",
  revision: "Ningún papel en revisión.",
  borrador: "Ningún borrador.",
  anulado: "Ningún papel anulado.",
};

export default function PapelesEmitidosVista() {
  const { papeles, error, recargar } = usePapelesEmitidos();
  const { base: baseQr } = useBaseVerificacion();
  const [filtro, setFiltro] = useState<FiltroEstadoPapel>("todos");
  const [texto, setTexto] = useState("");
  const [pdf, setPdf] = useState<string | null>(null);

  const grupos = useMemo(() => agruparPapeles(papeles ?? []), [papeles]);
  const cuentas = useMemo(() => contarPorEstado(grupos), [grupos]);
  const filas = useMemo(() => filtrarPapeles(grupos, filtro, texto), [grupos, filtro, texto]);
  const ultimo = grupos[0]?.vigente;

  if (error === "sin_permiso") {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-[var(--text-secondary)]">
        <Lock className="h-4 w-4 shrink-0" aria-hidden />
        Los papeles emitidos los ven solo el dueño y el administrador.
      </p>
    );
  }

  return (
    <div className="space-y-3" data-qa="papeles-emitidos">
      {/* Una fila: título · ⓘ · Actualizar. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Papeles emitidos</SectionTitle>
          <InfoTip
            title="Papeles emitidos"
            what="Cada papel que salió del negocio con su formato: proformas, estados de cuenta, liquidaciones, resúmenes. Un número puede tener varias versiones; vale la más nueva."
            affects="El estado va impreso dentro de la hoja y en la página que abre su QR. Cambiarlo es rehacer el papel: sale con código nuevo y la versión de antes queda como reemplazada."
            example={
              ultimo
                ? `Último: ${rotuloTipoPapel(ultimo)} ${ultimo.numero}, ${ultimo.estado === "oficial" ? "oficial" : ultimo.estado === "revision" ? "en revisión" : ultimo.estado}.`
                : "«Estado de cuenta EC-0001, oficial»: quien recibe la hoja escanea el QR y ve que es real y vigente."
            }
          />
        </div>
        <button
          type="button"
          onClick={recargar}
          className={button({ variant: "secondary", size: "icon", className: "ml-auto rounded-xl" })}
          title="Actualizar"
          aria-label="Actualizar la lista de papeles"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Filtros pegados a la tabla: buscador · estado. */}
      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
        <label className="relative min-w-0 grow basis-full sm:basis-60">
          <span className="sr-only">Buscar papeles</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por número, código o tipo (EC-0001, proforma…)"
            className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
          />
        </label>
        <div role="group" aria-label="Qué papeles ver" className="flex min-w-0 max-w-full gap-1.5 overflow-x-auto scrollbar-none">
          {FILTROS_ESTADO_PAPEL.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filtro === f}
              onClick={() => setFiltro(f)}
              className={cn(CHIP, filtro === f ? CHIP_ON : CHIP_OFF)}
            >
              {ROTULO_FILTRO_PAPEL[f]}
              {papeles && <span className="tabular-nums text-[var(--text-secondary)]">{cuentas[f]}</span>}
            </button>
          ))}
        </div>
      </div>

      {error === "fallo" && !papeles ? (
        <p className="flex items-center gap-2 text-sm text-[var(--data-error-ink)]">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          No se pudo traer la lista de papeles.
          <button type="button" onClick={recargar} className="font-semibold underline underline-offset-2">
            Reintentar
          </button>
        </p>
      ) : !papeles ? (
        <LoadingState />
      ) : filas.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--text-secondary)]">
          {texto.trim() ? `Ningún papel coincide con «${texto.trim()}».` : VACIO[filtro]}
        </p>
      ) : (
        <TablaPapeles grupos={filas} baseQr={baseQr} onVerPdf={setPdf} />
      )}

      <VistaPreviaDoc docId={pdf} onClose={() => setPdf(null)} onCambio={recargar} />
    </div>
  );
}
