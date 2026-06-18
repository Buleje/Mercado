"use client";

import { useEffect, useState } from "react";

export type FiadoOptionState = {
  eligible: boolean;
  availableCredit: number;
  /** Fecha de pago ya formateada para mostrar, ej. "15 de junio". */
  dueDateLabel: string;
};

const INITIAL: FiadoOptionState = {
  eligible: false,
  availableCredit: 0,
  dueDateLabel: "",
};

/**
 * Consulta `POST /api/checkout/fiado-option` con el total final y devuelve si
 * el cliente puede pagar con fiado ("paga el día de pago"). Falla en silencio
 * a "no elegible" — el cliente simplemente paga con Yape/efectivo, nunca se
 * bloquea el checkout. La validación autoritativa la hace el backend al crear
 * la orden.
 */
export function useFiadoOption(finalTotal: number): FiadoOptionState {
  const [fiado, setFiado] = useState<FiadoOptionState>(INITIAL);

  useEffect(() => {
    if (!Number.isFinite(finalTotal) || finalTotal <= 0) {
      setFiado(INITIAL);
      return;
    }
    let alive = true;
    fetch("/api/checkout/fiado-option", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ total: finalTotal }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        setFiado({
          eligible: Boolean(d.eligible),
          availableCredit:
            typeof d.availableCredit === "number" ? d.availableCredit : 0,
          dueDateLabel: d.dueDate
            ? new Date(d.dueDate).toLocaleDateString("es-PE", {
                day: "numeric",
                month: "long",
              })
            : "",
        });
      })
      .catch((err) =>
        console.warn("[checkout] fiado-option failed", String(err)),
      );
    return () => {
      alive = false;
    };
  }, [finalTotal]);

  return fiado;
}
