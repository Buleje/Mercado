"use client";

/**
 * Cumplimiento › «Cerrar el mes» — lo que era la vista Cierre (compactación del
 * libro, 17-10: «unificar pestañas que tienen casi la misma función»).
 *
 * El chequeo responde «¿puedo cerrar?» y esta pestaña cierra: separadas, el
 * operador leía el veredicto en una vista y tenía que acordarse de ir a otra.
 * Arriba el asistente (único selector de mes, revisa EXACTAMENTE el mes que va
 * a cerrar) y debajo el historial, el único lugar para reabrir.
 *
 * Un solo estado de cierres para los dos: el asistente cierra y el historial
 * se entera sin otro pedido.
 */

import { useCtpCierres } from "@/hooks/use-ctp-cierres";
import CtpCierreAsistido from "./CtpCierreAsistido";
import CtpCierrePanel from "./CtpCierrePanel";

export default function CtpCumplimientoCerrar({ onIr }: { onIr: (vista: string) => void }) {
  const cierres = useCtpCierres();
  return (
    <div className="space-y-4">
      <CtpCierreAsistido onIr={onIr} cierres={cierres} />
      <CtpCierrePanel estado={cierres} />
    </div>
  );
}
