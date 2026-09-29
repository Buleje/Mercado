"use client";

/**
 * Bloque 2 del alta: con quién es la plata. El buscador y los frecuentes, más
 * lo que la pantalla ya sabe sin que nadie lo escriba: si hoy ya se le dio, y
 * cuánto fue la última vez (sólo del mismo modo: «repetir» un préstamo que te
 * hicieron no es repetir un adelanto que diste).
 */

import { AlertTriangle, RotateCcw } from "@buleje/design-system/icons";
import { SeccionForm } from "@/components/admin/shared/SeccionForm";
import type { AltaAdelanto } from "../hooks/use-alta-adelanto";
import { fmtMon } from "../shared";
import { CLASE_BLOQUE } from "./piezas";
import SelectorPersona from "./SelectorPersona";
import type { BeneficiarioConSaldo } from "./tipos";

export default function BloquePersona({
  alta,
  beneficiarios,
  onPersonaCreada,
}: {
  alta: AltaAdelanto;
  beneficiarios: BeneficiarioConSaldo[];
  onPersonaCreada?: () => void;
}) {
  const { adelantoDeHoy, repetible, monto, modo } = alta;
  return (
    <SeccionForm
      numero={2}
      titulo={alta.def.tituloPersona}
      titular="tarjeta"
      columnas="libre"
      className={CLASE_BLOQUE}
      info={{
        what: "La persona con la que es esta plata. Arriba ves a la que elegiste; abajo, las que más se repiten.",
        example: "Buscas por nombre, DNI o teléfono, sin tildes: «maria» encuentra a «María».",
      }}
    >
      <div className="space-y-3">
        <SelectorPersona
          beneficiarios={beneficiarios}
          beneficiarioId={alta.beneficiarioId}
          recurrentes={alta.recurrentes}
          onElegir={alta.setBeneficiarioId}
          onPersonaCreada={onPersonaCreada}
        />

        {/* Dos personas atendiendo el mismo mostrador, o el botón apretado dos
            veces: el duplicado se descubre al cuadrar la caja. */}
        {adelantoDeHoy && (
          <p className="flex items-start gap-2 rounded-xl bg-[var(--data-warning-500)]/10 px-3 py-2 text-sm font-semibold text-[var(--data-warning-ink)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              {modo === "dar" ? "Hoy ya se le dio " : "Hoy ya te dio "}
              {fmtMon(adelantoDeHoy.montoAdelantado, adelantoDeHoy.moneda)}
              {adelantoDeHoy.codigoOperacion ? ` (${adelantoDeHoy.codigoOperacion})` : ""}. ¿Es uno nuevo?
            </span>
          </p>
        )}

        {repetible && !monto && !adelantoDeHoy && (
          <button
            type="button"
            onClick={alta.usarRepetible}
            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-[var(--rule-base)] px-3 py-2.5 text-left text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)]"
          >
            <RotateCcw className="h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1">
              Repetir el último: <strong className="tabular-nums text-[var(--text-primary)]">{fmtMon(repetible.monto, repetible.moneda)}</strong>
              <span className="text-[var(--text-tertiary)]">
                {" "}· {repetible.hace === 0 ? "hoy" : repetible.hace === 1 ? "ayer" : `hace ${repetible.hace} días`}
              </span>
            </span>
          </button>
        )}
      </div>
    </SeccionForm>
  );
}
