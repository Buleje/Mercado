"use client";

/**
 * MarcasParaRevisar — sólo las marcas dudosas de los últimos 14 días
 * (`lib/rrhh/marcas-para-revisar.ts`), para no mirar las 123 del mes.
 *
 * Una línea con el número («3 marcas para revisar»); al abrirla, una fila por
 * marca con el motivo. «Está bien» la aprueba (queda guardada); «Corregir»
 * lleva a ese día de la hoja, donde la corrección pide su motivo como siempre
 * (`MotivoCorreccionModal`, ADR-417). Sin dudosas, sólo dice que está al día.
 */

import { useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, ClipboardCheck, Pencil } from "@buleje/design-system/icons";
import { etiquetaDia } from "@/lib/rrhh/fechas";
import { pluralizar } from "../rrhh-ui";
import { Button } from "@/components/ui-system";
import { CLASE_CHIP } from "../rrhh-form";
import { cn } from "@/lib/utils";
import { DIAS_A_REVISAR, useMarcasParaRevisar } from "./use-marcas-para-revisar";

interface Props {
  /** Cambia cuando la hoja cambió de día o de vista: vuelve a leer las marcas. */
  clave: string;
  hoy: string;
  onCorregir: (fecha: string) => void;
  /** Botones que van en la misma fila (la tablet de la entrada). */
  acciones?: ReactNode;
}

export default function MarcasParaRevisar({ clave, hoy, onCorregir, acciones }: Props) {
  const { lista, cargando, error, aprobando, aprobar } = useMarcasParaRevisar(hoy, clave);
  const [abierta, setAbierta] = useState(false);
  const hay = lista.length > 0;

  return (
    <section aria-label="Marcas para revisar" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {acciones}
        {error ? (
          <span className="text-sm text-[var(--text-tertiary)]">No se pudieron leer las marcas para revisar.</span>
        ) : cargando && lista.length === 0 ? (
          <span className="text-sm text-[var(--text-tertiary)]">Buscando marcas dudosas…</span>
        ) : hay ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setAbierta((v) => !v)}
            aria-expanded={abierta}
            className="border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 text-[var(--data-warning-ink)]"
          >
            <ClipboardCheck className="h-4 w-4" aria-hidden />
            {pluralizar(lista.length, "marca para revisar", "marcas para revisar")}
            {abierta ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
            <Check className="h-4 w-4 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" aria-hidden />
            Sin marcas dudosas en los últimos {DIAS_A_REVISAR} días
          </span>
        )}
      </div>

      {hay && abierta && (
        <ul className="divide-y divide-[var(--rule-soft)] overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          {lista.map(({ marca, nombre, motivos }) => (
            <li key={marca.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-3">
              <div className="min-w-0 flex-1 basis-64">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {nombre} <span className="font-normal text-[var(--text-secondary)]">· {etiquetaDia(marca.fecha, hoy)}</span>
                  {marca.origen === "kiosko" && <span className={cn(CLASE_CHIP, "ml-2 bg-[var(--surface-sunken)] text-[var(--text-secondary)]")}>Kiosko</span>}
                </p>
                <ul className="mt-1 space-y-0.5 text-sm text-[var(--text-secondary)]">
                  {motivos.map((m) => (
                    <li key={m.codigo}>{m.texto}</li>
                  ))}
                </ul>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="secondary" onClick={() => onCorregir(marca.fecha)}>
                  <Pencil className="h-4 w-4" aria-hidden /> Corregir
                </Button>
                <Button type="button" onClick={() => void aprobar([marca.id])} disabled={aprobando.has(marca.id)}>
                  <Check className="h-4 w-4" aria-hidden /> Está bien
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
