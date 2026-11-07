"use client";

/**
 * El aviso de «Llenar desde» (arriba del alta): lo que la foto o el dictado
 * PUSO, en una línea cada cosa, lo que hay que mirar, la persona si no se pudo
 * elegir sola, y «Deshacer» / «Listo». Es el mismo para las dos entradas: lo
 * que cambia es el título. Nada de esto guarda: guardar sigue siendo el botón
 * del pie.
 */

import type { ReactNode } from "react";
import { AlertTriangle, Mic, ScanText, Undo2, X } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import type { DictarAdelanto } from "./use-dictar-adelanto";
import PersonaDelAviso from "./PersonaDelAviso";
import type { BeneficiarioConSaldo } from "./tipos";

export type OrigenLlenado = "foto" | "dictado";

export const BOTON_SUAVE = button({ variant: "ghost", className: "rounded-xl" });

const TITULO: Record<OrigenLlenado, string> = { foto: "Leído de la foto — revisa", dictado: "Dictado — revisa" };

/** Lo que necesita el aviso para elegir o crear la persona leída. */
export interface PersonasDelAviso {
  beneficiarios: BeneficiarioConSaldo[];
  beneficiarioId: string;
  onPersonaCreada?: () => void;
}

export function IconoOrigen({ de, className }: { de: OrigenLlenado; className: string }) {
  return de === "foto" ? <ScanText className={className} aria-hidden /> : <Mic className={className} aria-hidden />;
}

export function AvisoLlenado({
  de,
  etiqueta,
  izquierda,
  detalle,
  puestos,
  avisos,
  persona,
  onDeshacer,
  onListo,
}: {
  de: OrigenLlenado;
  /** Al lado del título (la confianza de la lectura). */
  etiqueta?: ReactNode;
  /** La miniatura de la captura. */
  izquierda?: ReactNode;
  /** Bajo el título (la frase dicha). */
  detalle?: ReactNode;
  puestos: string[];
  avisos: string[];
  persona: ReactNode;
  onDeshacer: () => void;
  onListo: () => void;
}) {
  return (
    <div role="status" aria-live="polite" data-aviso-llenado={de} className="flex items-start gap-3 rounded-xl bg-primary/8 px-3.5 py-3 ring-1 ring-primary/30">
      {izquierda}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Ícono y título en un solo bloque: a 400 px el ícono quedaba solo en su renglón. */}
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--accent-ink)]">
            <IconoOrigen de={de} className="h-4 w-4 shrink-0" />
            {TITULO[de]}
          </span>
          {etiqueta}
        </div>
        {detalle}
        {puestos.length > 0 && (
          <ul className="space-y-0.5 text-sm text-[var(--text-primary)]">
            {puestos.map((p) => (
              <li key={p} className="break-words">{p}</li>
            ))}
          </ul>
        )}
        {avisos.map((a) => (
          <p key={a} className="flex items-start gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning)]" aria-hidden />
            {a}
          </p>
        ))}
        {persona}
        <p className="text-sm text-[var(--text-tertiary)]">Nada se guarda hasta que confirmes con el botón de abajo.</p>
        {/* Abajo y en fila, no en una columna al costado: a 400 px la columna
            dejaba ~110 px para el texto. */}
        <div className="-ml-2.5 flex flex-wrap gap-1">
          <button type="button" onClick={onDeshacer} className={BOTON_SUAVE}>
            <Undo2 className="h-4 w-4" aria-hidden /> Deshacer
          </button>
          <button type="button" onClick={onListo} className={BOTON_SUAVE}>
            <X className="h-4 w-4" aria-hidden /> Listo
          </button>
        </div>
      </div>
    </div>
  );
}

export function AvisoDictado({ dictado, personas }: { dictado: DictarAdelanto; personas: PersonasDelAviso }) {
  const { estado } = dictado;
  if (estado.fase === "inactivo") return null;
  if (estado.fase === "nada") {
    return (
      <div role="alert" data-aviso-llenado="dictado-nada" className="flex items-start gap-3 rounded-xl bg-[var(--data-warning-500)]/10 px-3.5 py-3">
        <p className="flex min-w-0 flex-1 items-start gap-1.5 text-sm font-bold text-[var(--text-primary)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning)]" aria-hidden />
          <span>
            No entendí el monto ni la persona en «{estado.frase}»: no cambié nada. Prueba así: «le di 500 a Wasaco por aserrío».
          </span>
        </p>
        <button type="button" onClick={dictado.cerrar} aria-label="Cerrar el aviso del dictado" className={BOTON_SUAVE}>
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }
  return (
    <AvisoLlenado
      de="dictado"
      detalle={<p className="break-words text-sm italic text-[var(--text-secondary)]">«{estado.frase}»</p>}
      puestos={estado.puestos}
      avisos={estado.avisos}
      persona={<PersonaDelAviso persona={estado.persona} {...personas} onElegir={dictado.elegirPersona} />}
      onDeshacer={dictado.deshacer}
      onListo={dictado.cerrar}
    />
  );
}

/** Bajo el monto, mientras siga siendo el que se puso. */
export function MarcaLlenado({ de }: { de: OrigenLlenado }) {
  return (
    <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--accent-ink)]" data-marca-llenado={de}>
      <IconoOrigen de={de} className="h-4 w-4 shrink-0" />
      {TITULO[de]}
    </p>
  );
}
