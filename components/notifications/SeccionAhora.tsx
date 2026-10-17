"use client";

/**
 * «Para atender ahora» del centro de notificaciones (el estado de hoy: stock
 * bajo, pedidos pendientes, lotes por vencer). Arriba de la lista, o en su
 * propia columna a la derecha cuando el modal es ancho (≥ 1280 px).
 */
import { CardTitle } from "@buleje/design-system";
import AlertaAhoraFila from "./AlertaAhoraFila";
import type { AlertaAhora } from "./use-alertas-consolidadas";

interface Props {
  alertas: readonly AlertaAhora[];
  onNavegar: () => void;
}

export default function SeccionAhora({ alertas, onNavegar }: Props) {
  if (alertas.length === 0) return null;
  return (
    <section aria-labelledby="notif-ahora" className="space-y-2">
      <CardTitle id="notif-ahora" className="text-sm font-bold text-[var(--text-secondary)]">
        Para atender ahora
      </CardTitle>
      {alertas.map((a) => (
        <AlertaAhoraFila key={a.id} alerta={a} onNavegar={onNavegar} />
      ))}
    </section>
  );
}
