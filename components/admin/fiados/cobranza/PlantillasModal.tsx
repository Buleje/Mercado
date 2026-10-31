"use client";

/** Qué se le escribe a cada tramo — port de PlantillasModal.tsx (Adelantos). */

import { useState } from "react";
import { RotateCcw } from "@buleje/design-system/icons";
import { TRAMOS } from "@/lib/fiados/gestion-cobranza";
import { PLANTILLAS_POR_DEFECTO, VARIABLES_PLANTILLA, armarMensaje, type Plantillas } from "@/lib/fiados/plantillas-cobranza";
import AdminModal from "@/components/admin/shared/AdminModal";
import { ModalActions, inputCls } from "./shared";

/** Cliente de ejemplo para la vista previa (con último contacto y promesa, para ver los huecos llenos). */
const EJEMPLO = {
  nombre: "Juan",
  saldo: "S/ 250.00",
  dias: 45,
  ultimoContacto: "Te escribí el martes 14/10.",
  promesa: "Quedamos en que pagabas el viernes 17/10.",
};

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
    <AdminModal
      open
      onClose={onClose}
      title="Mensajes de cobranza"
      description="Uno por tramo de atraso. Toca un hueco para sumarlo al final del mensaje: se llena con los datos de cada cliente."
      variant="wide"
      footer={<ModalActions onClose={onClose} onSubmit={() => onGuardar(borrador)} saving={false} label="Guardar" />}
    >
      <div className="space-y-4 px-5 py-5 sm:px-6">
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
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Huecos para ${t.label}`}>
              {VARIABLES_PLANTILLA.map((v) => (
                <button key={v.clave} type="button" title={v.ayuda} data-qa="plantilla-hueco"
                  onClick={() => setBorrador((b) => ({ ...b, [t.id]: `${b[t.id].trimEnd()} ${v.clave}` }))}
                  className="inline-flex min-h-9 items-center rounded-lg border border-[var(--rule-base)] px-2.5 font-mono text-sm text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]">
                  {v.clave}
                </button>
              ))}
            </div>
            <p className="rounded-lg bg-[var(--surface-sunken)] px-3 py-2 text-sm italic text-[var(--text-tertiary)]">
              {armarMensaje(borrador[t.id], EJEMPLO)}
            </p>
          </div>
        ))}
      </div>
    </AdminModal>
  );
}
