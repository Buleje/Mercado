"use client";

/**
 * Qué se le escribe a cada tramo.
 *
 * Había UN texto para todos: el mismo mensaje al que se pasó tres días y al que
 * debe hace tres meses. El primero se ofende y el segundo no se da por aludido.
 */

import { useState } from "react";
import { RotateCcw } from "@buleje/design-system/icons";
import { TRAMOS } from "@/lib/adelantos/gestion-cobranza";
import { PLANTILLAS_POR_DEFECTO, armarMensaje, type Plantillas } from "@/lib/adelantos/plantillas-cobranza";
import { ModalActions, ModalShell, inputCls } from "../shared";

export default function PlantillasModal({
  plantillas,
  onClose,
  onGuardar,
}: {
  plantillas: Plantillas;
  onClose: () => void;
  onGuardar: (p: Plantillas) => void;
}) {
  const [borrador, setBorrador] = useState<Plantillas>(plantillas);

  return (
    <ModalShell
      title="Mensajes de cobranza"
      subtitle="Uno por tramo de atraso. Podés usar {nombre}, {saldo} y {dias}."
      onClose={onClose}
      size="md"
      footer={<ModalActions onClose={onClose} onSubmit={() => onGuardar(borrador)} saving={false} label="Guardar" />}
    >
      {TRAMOS.map((t) => (
        <div key={t.id} className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-secondary)]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.tono }} />
              {t.label}
              <span className="font-medium text-[var(--text-tertiary)]">· {t.detalle}</span>
            </p>
            {borrador[t.id] !== PLANTILLAS_POR_DEFECTO[t.id] && (
              <button
                type="button"
                onClick={() => setBorrador((b) => ({ ...b, [t.id]: PLANTILLAS_POR_DEFECTO[t.id] }))}
                className="inline-flex items-center gap-1 text-sm font-bold text-[var(--text-tertiary)] hover:underline"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar
              </button>
            )}
          </div>
          <textarea
            value={borrador[t.id]}
            onChange={(e) => setBorrador((b) => ({ ...b, [t.id]: e.target.value }))}
            rows={2}
            aria-label={`Mensaje para ${t.label}`}
            className={`${inputCls} h-auto py-2.5 text-sm`}
          />
          {/* Cómo se va a leer de verdad: los huecos sin reemplazar son el error
              más fácil de cometer y el más difícil de ver en el propio texto. */}
          <p className="rounded-lg bg-[var(--surface-sunken)] px-3 py-2 text-sm italic text-[var(--text-tertiary)]">
            {armarMensaje(borrador[t.id], { nombre: "Juan", saldo: "S/ 250.00", dias: 45 })}
          </p>
        </div>
      ))}
    </ModalShell>
  );
}
