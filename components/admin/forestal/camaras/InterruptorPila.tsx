"use client";

/**
 * «Mira la pila de trozas» de una cámara (ADR-456 §4): cada foto se compara con
 * la anterior y, si la pila bajó un día sin despacho ni producción anotados,
 * avisa al WhatsApp de la cámara. Sin número, la lectura queda sólo en la foto.
 */

import { Layers } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { numeroParaAvisoPila } from "@/lib/camaras/cruces";
import type { CamaraConConexion } from "./ConectarCamaraModal";

interface Props {
  camara: CamaraConConexion;
  guardando: boolean;
  onCambiar: (activa: boolean) => void;
}

export default function InterruptorPila({ camara: c, guardando, onCambiar }: Props) {
  const pilaSinAviso = c.vigilaPila && !numeroParaAvisoPila(c);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--rule-soft)] pt-2">
      <button
        type="button"
        role="switch"
        aria-checked={Boolean(c.vigilaPila)}
        onClick={() => onCambiar(!c.vigilaPila)}
        disabled={guardando}
        className="inline-flex min-h-9 items-center gap-2 rounded-lg pr-2 text-sm font-bold text-[var(--text-secondary)] disabled:opacity-50"
      >
        <span
          aria-hidden
          className={`relative h-6 w-10 shrink-0 rounded-full border transition-colors ${c.vigilaPila ? "border-[var(--accent-600,var(--accent))] bg-[var(--accent-600,var(--accent))]" : "border-[var(--rule-strong)]/40 bg-[var(--surface-sunken)]"}`}
        >
          <span
            className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-[var(--surface-raised)] shadow-[var(--shadow-sm)] transition-[left] ${c.vigilaPila ? "left-[1.1rem]" : "left-0.5"}`}
          />
        </span>
        <Layers className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
        Mira la pila de trozas
      </button>
      <InfoTip
        title="Mira la pila de trozas"
        side="left"
        what="Cada foto se compara con una de al menos 30 minutos antes: si la pila subió, bajó o sigue igual."
        affects="Si bajó un día sin despacho ni producción anotados, avisa al WhatsApp de esta cámara (uno cada 3 horas)."
        example="Prende sólo la cámara que tiene la pila de frente: cada comparación usa la IA."
      />
      {pilaSinAviso && (
        <span className="text-xs text-[var(--text-tertiary)]">
          sin WhatsApp: no avisa, queda en la foto
        </span>
      )}
    </div>
  );
}
