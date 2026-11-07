"use client";

/**
 * ADR-504: el mismo N° de GTF vive en dos o más permisos y el servidor no pudo
 * deducir cuál es (409 GUIA_AMBIGUA). Muestra las candidatas como botones
 * («GTF 4 · permiso 017 · titular») para que el operario elija y la pantalla
 * reintente con ese `contratoId`. Lo normal es no verlo nunca: la pantalla
 * manda la corrida o el ingreso y el servidor resuelve solo.
 */

import { AlertTriangle } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";

export type CandidataGuia = {
  gtfNumber: string;
  contratoId: string | null;
  permiso: string | null;
  titular?: string | null;
};

/** El 409 GUIA_AMBIGUA leído en el cliente, con lo necesario para elegir. */
export class GuiaAmbiguaCliente extends Error {
  constructor(
    readonly gtfNumber: string,
    readonly candidatas: CandidataGuia[],
    message: string,
  ) {
    super(message);
    this.name = "GuiaAmbiguaCliente";
  }
}

/** Si la respuesta es un 409 GUIA_AMBIGUA con candidatas, el error para tirar; si no, null. */
export function guiaAmbiguaDe(
  status: number,
  j: { error?: string; message?: string; gtfNumber?: string; candidatas?: unknown } | null,
): GuiaAmbiguaCliente | null {
  if (status !== 409 || j?.error !== "GUIA_AMBIGUA" || !Array.isArray(j.candidatas)) return null;
  const candidatas = (j.candidatas as Partial<CandidataGuia>[]).map((c) => ({
    gtfNumber: String(c.gtfNumber ?? j.gtfNumber ?? ""),
    contratoId: typeof c.contratoId === "string" ? c.contratoId : null,
    permiso: typeof c.permiso === "string" ? c.permiso : null,
    titular: typeof c.titular === "string" ? c.titular : null,
  }));
  return new GuiaAmbiguaCliente(String(j.gtfNumber ?? ""), candidatas, j.message ?? "La guía está en dos permisos.");
}

export function etiquetaCandidata(c: CandidataGuia): string {
  return [`GTF ${c.gtfNumber}`, c.permiso ? `permiso ${c.permiso}` : "sin permiso", c.titular?.trim() || null]
    .filter(Boolean)
    .join(" · ");
}

export default function GuiaAmbiguaElegir({
  gtfNumber,
  candidatas,
  disabled,
  onElegir,
}: {
  gtfNumber: string;
  candidatas: readonly CandidataGuia[];
  disabled?: boolean;
  onElegir: (c: CandidataGuia) => void;
}) {
  return (
    <div
      role="group"
      aria-label={`Elegir el permiso de la guía ${gtfNumber}`}
      className="mt-3 rounded-lg border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 py-2 text-xs text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]"
    >
      <p className="flex items-center gap-1.5 font-bold">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        La guía N° {gtfNumber} está en {candidatas.length} permisos. ¿Cuál es la de esta corrida?
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {candidatas.map((c) => (
          <button
            key={c.contratoId ?? "sin-permiso"}
            type="button"
            disabled={disabled}
            onClick={() => onElegir(c)}
            className={button({ variant: "secondary" })}
          >
            {etiquetaCandidata(c)}
          </button>
        ))}
      </div>
    </div>
  );
}
