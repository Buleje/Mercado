"use client";

/**
 * CtpVehiculoBarra — la placa de la guía, elegida de las guardadas o creada acá.
 */

import { useState } from "react";
import { Plus, Users } from "@buleje/design-system/icons";
import { formatearPlaca } from "@/lib/forestal/directorio";
import { Btn } from "./ctp-shared";

/**
 * Selector de placa. El vehículo no es una "parte" (no tiene documento ni
 * dirección), pero se elige en el mismo paso que el transportista, así que vive
 * al lado. Elegir una placa completa además marca, tipo y —si el vehículo tiene
 * dueño cargado— deja al transportista listo para copiarse.
 *
 * Con la lista vacía ya NO desaparece: hasta 2026-09-15 se auto-ocultaba, así
 * que el único camino para guardar un camión era ir a Gestión → Directorio y
 * volver. En el tenant de Blas había **cero** vehículos cargados, o sea que la
 * barra nunca se dibujó: ahora ofrece crearlo desde la propia guía.
 */
export default function CtpVehiculoBarra({
  vehiculos,
  onAplicar,
  onElegir,
  onCrear,
}: {
  vehiculos: { id: string; placa: string; marca: string | null; tipo: string | null; transportistaNombre: string | null; usos: number }[];
  onAplicar: (v: { placa: string; marca: string; tipo: string }) => void;
  onElegir?: (id: string) => void;
  /** Abre el alta de vehículo sin salir de la guía. */
  onCrear?: () => void;
}) {
  const [abierta, setAbierta] = useState(false);
  if (vehiculos.length === 0) {
    return onCrear ? (
      <div className="sm:col-span-3">
        <Btn size="sm" variant="secondary" onClick={onCrear}>
          <Plus className="h-4 w-4" />
          Guardar esta placa en el directorio
        </Btn>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          Todavía no hay camiones guardados. El que cargues acá se te va a ofrecer en la próxima guía.
        </p>
      </div>
    ) : null;
  }

  return (
    <div className="sm:col-span-3">
      <div className="flex flex-wrap items-center gap-2">
        <Btn size="sm" variant={abierta ? "dark" : "secondary"} onClick={() => setAbierta((v) => !v)} aria-expanded={abierta}>
          <Users className="h-4 w-4" />
          Placas guardadas
          <span className="rounded bg-[var(--surface-raised)]/60 px-1.5 font-mono text-xs tabular-nums">{vehiculos.length}</span>
        </Btn>
        {onCrear && (
          <Btn size="sm" variant="secondary" onClick={onCrear}>
            <Plus className="h-4 w-4" />
            Agregar vehículo
          </Btn>
        )}
      </div>
      {abierta && (
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
          {vehiculos.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => {
                  onAplicar({ placa: v.placa, marca: v.marca ?? "", tipo: v.tipo ?? "" });
                  onElegir?.(v.id);
                  setAbierta(false);
                }}
                className="flex w-full items-center gap-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 min-h-10 text-left transition-colors hover:border-[var(--accent)] hover:bg-primary/5"
              >
                <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{formatearPlaca(v.placa)}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-tertiary)]">
                  {[v.marca, v.tipo, v.transportistaNombre].filter(Boolean).join(" · ")}
                </span>
                {v.usos > 0 && <span className="shrink-0 text-xs tabular-nums text-[var(--text-tertiary)]">{v.usos}×</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
