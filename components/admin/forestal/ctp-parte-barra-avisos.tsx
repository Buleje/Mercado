"use client";

/**
 * Las líneas de aviso de `CtpParteBarra` (documento mal escrito, lo que salió
 * bien, el error) y la pregunta de «Guardar en la libreta» cuando el local
 * choca con la ficha de su mismo RUC (revisión 16-10-2026): la ficha de la
 * empresa no se pisa; se guarda aparte o no se guarda.
 */

import type { ChoqueDeLocal } from "@/lib/forestal/libreta";
import { Btn } from "./ctp-shared";

interface Props {
  docMalFormado: string | null;
  aviso: string | null;
  error: string | null;
  choque: ChoqueDeLocal | null;
  ocupado: boolean;
  onAparte: () => void;
  onCancelar: () => void;
}

export default function AvisosDeBarra({ docMalFormado, aviso, error, choque, ocupado, onAparte, onCancelar }: Props) {
  return (
    <>
      {docMalFormado && <p className="mt-2 text-sm font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{docMalFormado}</p>}
      {choque && (
        <div
          role="alert"
          data-testid="libreta-choque-local"
          className="mt-2 rounded-lg border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] p-2.5 dark:bg-[var(--data-warning-500)]/12"
        >
          <p className="text-sm font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            {choque.existente.nombre} ya está en la libreta con otro dato: {choque.tiene}. ¿Guardar este local como establecimiento aparte? La ficha
            que ya tienes no se toca.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Btn size="sm" variant="primary" disabled={ocupado} onClick={onAparte}>
              Guardar aparte
            </Btn>
            <Btn size="sm" variant="secondary" disabled={ocupado} onClick={onCancelar}>
              No guardar
            </Btn>
          </div>
        </div>
      )}
      {aviso && <p className="mt-2 text-sm font-medium text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">{aviso}</p>}
      {error && <p className="mt-2 text-sm font-medium text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
    </>
  );
}
