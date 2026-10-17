/**
 * LothAvisoPlazo — «esto se está registrando tarde», dicho AL registrar.
 *
 * La RDE 264-2019 da 15 días para asentar una operación en el Libro TH. La
 * tabla, el impreso y el Excel ya marcaban en ámbar la línea tardía, pero
 * recién DESPUÉS de guardarla: quien la cargaba no se enteraba (en QA hay un
 * trozado registrado 55 días tarde). Esto lo dice bajo la fecha, mientras se
 * llena el formulario. No bloquea: el libro admite registros tardíos, sólo
 * quedan marcados.
 *
 * Usa el MISMO predicado que la tabla y el impreso (`estaFueraDePlazo` de
 * loth-constants) con la hora de ahora como «fecha de registro», que es lo
 * que el servidor va a guardar en `createdAt`: si acá sale fuera de plazo, en
 * la tabla sale igual.
 */

import { Clock } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { PLAZO_REGISTRO_DIAS, diasDeRegistro, estaFueraDePlazo } from "@/lib/forestal/loth-constants";
import { diaDelLibro } from "@/lib/forestal/loth-censo-uso";

/** «YYYY-MM-DD» del input → el instante que se guarda (medianoche UTC, date-only). */
function fechaDelLibro(fecha: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `${fecha}T00:00:00.000Z` : fecha;
}

export default function LothAvisoPlazo({
  fecha,
  ahora,
  className = "",
}: {
  /** La fecha de la operación, como la tiene el input («YYYY-MM-DD»). */
  fecha: string | null | undefined;
  /** El momento del registro. Por defecto, ahora (lo que guardará el servidor). */
  ahora?: Date;
  className?: string;
}) {
  const f = fecha ? fechaDelLibro(fecha) : null;
  const registro = ahora ?? new Date();
  const fuera = f != null && estaFueraDePlazo(f, registro);
  const dias = fuera ? (diasDeRegistro(f, registro) ?? 0) : 0;

  return (
    // El contenedor queda montado aunque no haya aviso: así un lector de
    // pantalla anuncia el aviso cuando aparece al cambiar la fecha.
    <div aria-live="polite" className={className}>
      {fuera && (
        <div
          data-aviso-plazo={dias}
          className="mt-1 flex items-start gap-1.5 text-xs font-semibold text-[var(--data-warning-ink)]"
        >
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            Registras esto {dias} {dias === 1 ? "día" : "días"} después: la norma pide {PLAZO_REGISTRO_DIAS}. Queda marcado fuera de plazo.
          </span>
          <InfoTip
            title="Plazo de registro"
            ariaLabel="Qué significa fuera de plazo"
            what={`La RDE 264-2019 pide asentar cada operación en el libro dentro de los ${PLAZO_REGISTRO_DIAS} días calendario siguientes. No bloquea: se guarda igual.`}
            affects="La línea sale en ámbar con «registro +N d» en la tabla del libro, en el libro impreso y en el Excel que se presenta a la ARFFS."
            example={`Operación del ${diaDelLibro(f?.slice(0, 10))}, registrada hoy: ${dias} días, ${dias - PLAZO_REGISTRO_DIAS} más de lo que da la norma.`}
          />
        </div>
      )}
    </div>
  );
}
