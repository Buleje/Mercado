"use client";

/**
 * «Para atender ahora» del centro de notificaciones: el estado de hoy y los
 * avisos sin leer, agrupados por lo que hay que HACER (M08, 17-10: «Cuadrar
 * la caja», «Cobrar 3», «Reponer 5», en orden de impacto) y, debajo, lo que no
 * es de ningún grupo (recordatorios). Arriba de la lista, o en su propia
 * columna a la derecha cuando el modal es ancho (≥ 1280 px).
 */
import { CardTitle } from "@buleje/design-system";
import { FilaAccion } from "./AccionesAgrupadas";
import AlertaAhoraFila from "./AlertaAhoraFila";
import type { AlertaAhora } from "./use-alertas-consolidadas";
import type { GrupoConEnlace } from "./use-acciones-de-avisos";

interface Props {
  grupos: readonly GrupoConEnlace[];
  sueltas: readonly AlertaAhora[];
  onNavegar: () => void;
}

export default function SeccionAhora({ grupos, sueltas, onNavegar }: Props) {
  if (grupos.length === 0 && sueltas.length === 0) return null;
  return (
    <section aria-labelledby="notif-ahora" className="space-y-2">
      <CardTitle id="notif-ahora" className="text-sm font-bold text-[var(--text-secondary)]">
        Para atender ahora
      </CardTitle>
      {grupos.map((g) => (
        <FilaAccion key={g.id} grupo={g} onNavegar={onNavegar} />
      ))}
      {sueltas.map((a) => (
        <AlertaAhoraFila key={a.id} alerta={a} onNavegar={onNavegar} />
      ))}
    </section>
  );
}
