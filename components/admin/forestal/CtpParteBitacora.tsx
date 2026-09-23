"use client";

/**
 * Bitácora de una ficha del Directorio: qué pasó con esta parte y cuándo.
 *
 * «Observaciones internas» es una hoja que se pisa: el que escribe lo último
 * borra lo anterior, y nadie sabe quién puso qué. Acá cada nota queda con su
 * fecha y su autor — «el 12/08 dijo que la guía sale el lunes» vale justamente
 * porque el viernes sigue diciendo lo mismo.
 *
 * La firma la pone el SERVIDOR (`lib/db/forest-directorio.db.ts`): el
 * formulario sólo manda el texto. Una nota donde el autor lo elige quien
 * escribe no prueba nada.
 */

import { CardTitle } from "@buleje/design-system";
import { MessageSquare } from "@buleje/design-system/icons";
import type { NotaBitacora } from "@/lib/forestal/directorio";
import { I } from "./ctp-shared";

/** Fecha corta en hora de Lima. Las notas llevan hora, así que no va `UTC`. */
function cuando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Lima",
  });
}

export default function CtpParteBitacora({
  notas,
  nueva,
  onNueva,
}: {
  notas: readonly NotaBitacora[];
  nueva: string;
  onNueva: (v: string) => void;
}) {
  return (
    <div className="sm:col-span-12">
      <label htmlFor="bitacora-nueva" className="mb-1.5 block text-sm font-semibold text-[var(--text-primary)]">
        Agregar a la bitácora
      </label>
      <div className="flex items-start gap-2">
        <MessageSquare className="mt-3 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
        <input
          id="bitacora-nueva"
          type="text"
          className={I}
          value={nueva}
          onChange={(e) => onNueva(e.target.value)}
          placeholder="Pidió que la próxima guía salga a nombre de la comunidad"
        />
      </div>
      <p className="mt-1 text-xs text-[var(--text-tertiary)]">
        Se guarda con tu usuario y la fecha al guardar la ficha. Lo anterior no se pisa.
      </p>

      {notas.length > 0 && (
        <div className="mt-3">
          <CardTitle className="mb-2 text-sm">Lo anotado antes</CardTitle>
          <ul className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3">
            {notas.map((n, i) => (
              <li key={`${n.fecha}-${i}`} className="border-l-2 border-[var(--rule-base)] pl-2.5">
                <p className="text-sm text-[var(--text-primary)]">{n.texto}</p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {n.autor} · <span className="tabular-nums">{cuando(n.fecha)}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
