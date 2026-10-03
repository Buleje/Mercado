/**
 * El aviso de tipo mal puesto (fase 3 de alinear con la GTF, Brandon
 * 2026-10-03): las filas cuyo m³ por pieza dice otro tipo de producto. Va en
 * pantalla, encima de la guía, antes de emitirla o aceptarla; el papel no lo
 * lleva. Una línea con qué fila revisar y el porqué en el ⓘ. Sin avisos no
 * dibuja nada.
 */
import { AlertTriangle } from "lucide-react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { AvisoTipo } from "@/lib/forestal/gtf-validador-tipo";

export function AvisoTipoGtf({ avisos }: { avisos: readonly AvisoTipo[] }) {
  if (avisos.length === 0) return null;
  // El ícono reemplaza al «⚠️» del texto: en pantalla no van emojis.
  const mensaje = avisos[0].mensaje.replace(/^⚠️\s*/u, "");
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-4 py-2.5 text-sm text-[var(--data-warning-700)] dark:bg-transparent dark:text-[var(--data-warning-500)]"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0">
        <b>{mensaje}</b>
        {" · "}
        {avisos.map((a) => `${a.especie} ${a.tipo} (parece ${a.tipoProbable})`).join(" · ")}{" "}
        <InfoTip
          title="Por qué se avisa"
          what={<span>{avisos.map((a) => a.detalle).join(" ")}</span>}
          affects="El volumen no cambia, pero la guía declararía otro producto. Revisa el tipo de esa fila antes de emitirla o aceptarla."
          example="Copal COMERCIAL con 18 piezas en 0,096 m³ = 0,0053 m³ por pieza: lo de una TABLA."
          ariaLabel="Por qué se avisa el tipo de producto"
        />
      </span>
    </div>
  );
}
