"use client";

/**
 * El candado del cuadre en pantalla (Brandon, 2026-10-03: «hoy se puede emitir
 * aunque diga "Difiere 0,242 m³"; con esto avisa y pide confirmar»).
 *
 *  · `LineaCuadre`: la línea roja de arriba del modal, mientras difiere.
 *  · `Anexo04ConfirmarCuadre` (default): el diálogo que aparece al descargar,
 *    imprimir o guardar con la distribución descuadrada. Lista la diferencia
 *    y ofrece «Revisar el cuadre» o seguir igual.
 *
 * El diálogo se monta FUERA de la caja del modal que lo abre (hermano, dentro
 * de su fondo): la caja se mueve con `transform` y un `fixed` adentro quedaría
 * atado a ella. `useModalAccesible` atrapa el foco y su Escape corta el
 * evento antes de que el Escape del modal de atrás lo cierre entero.
 */
import { useId, useRef } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, Scale } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import type { CuadreDelPapel } from "@/lib/forestal/cuadre-del-papel";

const TONO_ERROR =
  "border-[var(--data-error-500)]/50 bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]";
const BTN = "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold transition";

/** La línea roja: qué no cuadra, el detalle en ⓘ y el atajo al cuadre. */
export function LineaCuadre({ cuadre, onVerCuadre }: { cuadre: CuadreDelPapel; onVerCuadre?: () => void }) {
  return (
    <div role="status" className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-1.5 text-xs font-bold ${TONO_ERROR}`}>
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      <span>{cuadre.frase}</span>
      <InfoTip
        title="El cuadre de la distribución"
        what={
          <span>
            {(cuadre.lineas ?? []).map((l) => <span key={l} className="block">· {l}</span>)}
          </span>
        }
        affects="Puedes emitir igual: al descargar o imprimir te pide confirmar."
        example="Un bloque que ampara 0.242 m³ más de lo que le cabe sube ese volumen al papel sin rolliza que lo respalde."
        ancho="w-96"
      />
      {onVerCuadre && (
        <button type="button" onClick={onVerCuadre} className="ml-auto inline-flex h-7 items-center gap-1 rounded-md px-2 underline-offset-2 hover:underline">
          <Scale className="h-3.5 w-3.5" aria-hidden /> Revisar el cuadre
        </button>
      )}
    </div>
  );
}

export default function Anexo04ConfirmarCuadre({
  cuadre, accion = "Emitir igual", pregunta = "¿Emitir igual? El papel sale con estas cifras.", onConfirmar, onCancelar, onVerCuadre,
}: {
  cuadre: CuadreDelPapel;
  /** El botón que sigue: «Emitir igual», «Guardar igual». */
  accion?: string;
  pregunta?: string;
  onConfirmar: () => void;
  onCancelar: () => void;
  /** Sin él no hay «Revisar el cuadre» (quien abre el diálogo no tiene el modal del cuadre). */
  onVerCuadre?: () => void;
}) {
  const cajaRef = useRef<HTMLDivElement>(null);
  useModalAccesible(cajaRef, { onCerrar: onCancelar });
  const idTitulo = useId();
  const idTexto = useId();
  return (
    <div
      className="modal-backdrop fixed inset-0 z-modal-2 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancelar(); }}
    >
      <div
        ref={cajaRef}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={idTexto}
        className="w-full max-w-[34rem] rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-lg)]"
      >
        <CardTitle as="h3" id={idTitulo} className="flex items-center gap-2 text-base font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden /> La distribución no cuadra
        </CardTitle>
        <p id={idTexto} className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{cuadre.frase}</p>
        {cuadre.lineas && cuadre.lineas.length > 0 && (
          <ul className={`mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl border p-3 text-xs font-semibold ${TONO_ERROR}`}>
            {cuadre.lineas.map((l) => <li key={l}>· {l}</li>)}
          </ul>
        )}
        <p className="mt-3 text-sm text-[var(--text-secondary)]">{pregunta}</p>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {onVerCuadre && (
            <button type="button" onClick={onVerCuadre} className={`${BTN} mr-auto border-2 border-[var(--accent)] text-[var(--accent-ink)] hover:bg-primary/10 dark:text-[var(--accent)]`}>
              <Scale className="h-4 w-4" aria-hidden /> Revisar el cuadre
            </button>
          )}
          <button type="button" onClick={onCancelar} className={`${BTN} border border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]`}>
            Cancelar
          </button>
          <button type="button" onClick={onConfirmar} className={`${BTN} bg-[var(--data-error-700)] text-white hover:brightness-110`}>
            {accion}
          </button>
        </div>
      </div>
    </div>
  );
}
