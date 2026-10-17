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
 * Es un `AdminModal` con `aboveModals` (2026-10-11): portal propio, foco
 * atrapado, y Escape cierra sólo esta capa, no el anexo de atrás.
 */
import { AlertTriangle, Scale } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { CuadreDelPapel } from "@/lib/forestal/cuadre-del-papel";
import AdminModal from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";

const TONO_ERROR =
  "border-[var(--data-error-500)]/50 bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]";
const BTN = "inline-flex h-12 items-center gap-2 rounded-xl px-4 text-sm font-bold transition";

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
  return (
    <AdminModal
      open
      onClose={onCancelar}
      title="La distribución no cuadra"
      icon={AlertTriangle}
      size="md"
      aboveModals
      claveVentana="anexo04-confirmar-cuadre"
      footer={
        <ModalFooter>
          {onVerCuadre && (
            <button type="button" onClick={onVerCuadre} className={`${BTN} mr-auto border-2 border-[var(--accent)] text-[var(--accent-ink)] hover:bg-primary/10 dark:text-[var(--accent)]`}>
              <Scale className="h-4 w-4" aria-hidden /> Revisar el cuadre
            </button>
          )}
          <button type="button" onClick={onCancelar} className={button({ variant: "secondary" })}>
            Cancelar
          </button>
          <button type="button" onClick={onConfirmar} className={button({ variant: "danger" })}>
            {accion}
          </button>
        </ModalFooter>
      }
    >
      <div className="px-5 py-4 sm:px-6">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{cuadre.frase}</p>
        {cuadre.lineas && cuadre.lineas.length > 0 && (
          <ul className={`mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl border p-3 text-xs font-semibold ${TONO_ERROR}`}>
            {cuadre.lineas.map((l) => <li key={l}>· {l}</li>)}
          </ul>
        )}
        <p className="mt-3 text-sm text-[var(--text-secondary)]">{pregunta}</p>
      </div>
    </AdminModal>
  );
}
