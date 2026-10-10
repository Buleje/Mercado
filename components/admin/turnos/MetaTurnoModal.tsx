"use client";

/** Meta de ventas por turno (se guarda en este navegador; el resumen dice si se llegó). */
import { useEffect, useState } from "react";
import { Trophy } from "@buleje/design-system/icons";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, MarcoModalTurno } from "./MarcoModalTurno";

type Props = { abierto: boolean; meta: number; onGuardar: (v: number) => void; onCerrar: () => void };

export function MetaTurnoModal({ abierto, meta, onGuardar, onCerrar }: Props) {
  const [valor, setValor] = useState(String(meta));
  useEffect(() => { if (abierto) setValor(String(meta)); }, [abierto, meta]);
  const guardar = () => { onGuardar(parseFloat(valor) || 500); onCerrar(); };

  return (
    <MarcoModalTurno
      abierto={abierto}
      claveMemoria="turnos-meta"
      titulo="Meta del turno"
      subtitulo="El resumen del cierre te dice si llegaste"
      icono={Trophy}
      onFondo={onCerrar}
      onCerrar={onCerrar}
      pie={<>
        <button type="button" onClick={onCerrar} className={BOTON_SECUNDARIO}>Cancelar</button>
        <button type="button" onClick={guardar} className={BOTON_PRIMARIO}>Guardar</button>
      </>}
    >
      <div className="flex items-center gap-2">
        <span className="text-base font-semibold text-[var(--text-tertiary)]">S/</span>
        <input
          type="number"
          step="50"
          min="0"
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") guardar(); }}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- la ventana se abre para escribir la meta de inmediato
          autoFocus
          aria-label="Meta del turno en soles"
          className="flex-1 px-3 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-lg font-bold tabular-nums text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>
    </MarcoModalTurno>
  );
}
