"use client";

import { useState } from "react";
import { Settings } from "@buleje/design-system/icons";
import { MarcoModalCaja } from "./MarcoModalCaja";
import { BOTON_PRIMARIO } from "./tipos";

/** Tolerancia de diferencia: dentro de este rango, un cierre se marca como aceptable. */
export function ModalToleranciaCaja({ valor, onGuardar, onCerrar }: { valor: number; onGuardar: (v: number) => void; onCerrar: () => void }) {
  const [borrador, setBorrador] = useState(String(valor));
  const guardar = () => {
    onGuardar(Math.max(0, Number(borrador) || 0));
    onCerrar();
  };
  return (
    <MarcoModalCaja
      claveMemoria="caja-tolerancia"
      titulo="Tolerancia de diferencia"
      subtitulo="Diferencias dentro de este rango se marcan como aceptables"
      icono={Settings}
      onCerrar={onCerrar}
      pie={
        <button type="button" onClick={guardar} className={`${BOTON_PRIMARIO} flex-1 min-h-11`}>
          Listo
        </button>
      }
    >
      <label className="flex items-center gap-2">
        <span className="text-base font-bold text-[var(--text-tertiary)]">± S/</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="1"
          value={borrador}
          onChange={(e) => setBorrador(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") guardar();
          }}
          aria-label="Tolerancia de diferencia en soles"
          className="flex-1 px-3 h-11 rounded-xl border border-[var(--rule-base)] text-base font-bold tabular-nums text-center text-[var(--text-primary)] bg-[var(--surface-raised)] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- la ventana se abre para escribir el monto
          autoFocus
        />
      </label>
    </MarcoModalCaja>
  );
}
