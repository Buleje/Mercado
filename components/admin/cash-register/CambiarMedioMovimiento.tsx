"use client";

/**
 * «Cambiar medio» de un ingreso/egreso ya anotado en la caja abierta.
 *
 * Un adelanto que se anotó como efectivo y se pagó por transferencia deja el
 * «Efectivo actual» en un número imposible. Esto lo corrige: eliges el medio,
 * la confirmación dice cómo cambia el esperado («El esperado pasa de S/ −6.424,00
 * a S/ −2.782,00») y el servidor lo guarda con quién lo hizo.
 *
 * La cuenta de la confirmación es una PREVISUALIZACIÓN (`esperadoTrasCambiarMedio`);
 * el número que queda es el que devuelve el servidor, y se muestra al terminar.
 * Sólo lo ve admin/dueño: el servidor igual devuelve 403 a los demás.
 */
import { useId, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "@buleje/design-system/icons";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { csrfHeaders } from "@/lib/csrf-client";
import { METODOS_DE_CAJA, medioDeMovimiento } from "@/lib/caja/saldo-esperado";
import {
  NOMBRE_DEL_MEDIO_DE_CAJA,
  esperadoTrasCambiarMedio,
  nombreDelMedio,
  textoCambioDelEsperado,
  type MedioDeCaja,
} from "@/lib/caja/cambiar-medio";

interface Props {
  cashRegisterId: string;
  movimiento: { id: string; type: string; amount: number; method: string; description: string };
  /** El «Efectivo actual» que ve la pantalla ahora: base de la previsualización. */
  esperadoActual: number;
  formato: (n: number) => string;
  /** Recargar la caja después de guardar. */
  onCambiado: () => void;
}

export function CambiarMedioMovimiento({ cashRegisterId, movimiento, esperadoActual, formato, onCambiado }: Props) {
  const { confirm, notice } = useConfirm();
  const [guardando, setGuardando] = useState(false);
  const selectId = useId();
  const actual = medioDeMovimiento(movimiento.method);
  const opciones = METODOS_DE_CAJA.filter((m) => m !== actual);

  async function elegir(nuevo: MedioDeCaja) {
    const cambio = esperadoTrasCambiarMedio(esperadoActual, movimiento, nuevo);
    const tipo = movimiento.type === "egreso" ? "egreso" : "ingreso";
    const ok = await confirm({
      title: `¿Pasar este ${tipo} de ${nombreDelMedio(actual)} a ${NOMBRE_DEL_MEDIO_DE_CAJA[nuevo]}?`,
      description:
        `${formato(movimiento.amount)}${movimiento.description ? ` · ${movimiento.description}` : ""}. ` +
        textoCambioDelEsperado(cambio, formato) +
        " Queda registrado quién lo cambió.",
      intent: "warning",
      confirmLabel: `Sí, pasar a ${NOMBRE_DEL_MEDIO_DE_CAJA[nuevo]}`,
    });
    if (!ok) return;
    setGuardando(true);
    try {
      const res = await fetch(`/api/cash-registers/${cashRegisterId}/movements/${movimiento.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ method: nuevo }),
      });
      const body: { error?: unknown; esperadoDespues?: unknown } = await res.json().catch(() => ({}));
      if (!res.ok) {
        await notice({
          title: "No se cambió el medio",
          description: typeof body.error === "string" ? body.error : `El servidor respondió ${res.status}. Vuelve a intentarlo.`,
          intent: "danger",
        });
        return;
      }
      const esperado = typeof body.esperadoDespues === "number" ? body.esperadoDespues : cambio.despues;
      toast.success(`Medio cambiado a ${NOMBRE_DEL_MEDIO_DE_CAJA[nuevo]}. Efectivo esperado: ${formato(esperado)}.`);
      onCambiado();
    } catch {
      await notice({
        title: "Sin conexión con el servidor",
        description: "El medio NO se cambió. Revisa tu conexión y vuelve a intentarlo.",
        intent: "danger",
      });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <label htmlFor={selectId} className="sr-only">
        Cambiar el medio de este movimiento (ahora: {nombreDelMedio(actual)})
      </label>
      <select
        id={selectId}
        value=""
        disabled={guardando}
        onChange={(e) => {
          const v = e.target.value as MedioDeCaja;
          if (v) void elegir(v);
        }}
        className="h-8 max-w-[9.5rem] rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-60"
      >
        <option value="" disabled>
          Cambiar medio
        </option>
        {opciones.map((m) => (
          <option key={m} value={m}>
            {NOMBRE_DEL_MEDIO_DE_CAJA[m]}
          </option>
        ))}
      </select>
      {guardando && <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" aria-label="Guardando" />}
    </span>
  );
}
