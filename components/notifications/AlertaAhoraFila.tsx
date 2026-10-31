"use client";

/**
 * Una fila de «Para atender ahora»: estado de hoy (stock bajo, pedidos
 * pendientes, lotes por vencer…), no un aviso guardado — por eso no se marca
 * como leída: desaparece sola cuando se resuelve. Se dibuja con `FilaAhora`
 * (18-10), igual que los grupos por acción.
 */
import { AlertTriangle, Clock } from "@buleje/design-system/icons";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import FilaAhora from "./FilaAhora";
import type { AlertaAhora } from "./use-alertas-consolidadas";

interface Props {
  alerta: AlertaAhora;
  /** Se llamó al navegar (el modal se cierra). */
  onNavegar: () => void;
}

export default function AlertaAhoraFila({ alerta, onNavegar }: Props) {
  const { action } = alerta;
  return (
    <FilaAhora
      icono={alerta.categoria === "sistema" ? Clock : AlertTriangle}
      urgente={alerta.severity === "critical"}
      titulo={alerta.title}
      detalle={alerta.description}
      accion={
        action
          ? {
              label: action.label,
              onClick: () => {
                irAEnlace(action.href);
                onNavegar();
              },
            }
          : undefined
      }
    />
  );
}
