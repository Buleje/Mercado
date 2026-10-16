"use client";

/**
 * CtpVehiculoBarra — la placa de la guía, elegida de las guardadas o agregada
 * desde la propia guía.
 *
 * El vehículo no es una "parte" (no tiene documento ni dirección), pero se elige
 * en el mismo paso que el transportista, así que vive al lado. Elegir una placa
 * completa además marca, tipo y el remolque guardado.
 *
 * «Placas guardadas» abre una ventana (`LibretaVehiculosModal`, Brandon
 * 15-10-2026) con buscador y «Agregar nuevo»: el camión que se carga ahí queda
 * en el Directorio y en la guía en el mismo gesto. Hasta 2026-09-15 la barra se
 * escondía con la libreta vacía (Blas tenía **cero** vehículos), así que nunca
 * se dibujaba; ahora con la libreta vacía abre directo en el alta.
 */

import { useState } from "react";
import { Truck } from "@buleje/design-system/icons";
import { placaParaGuia, type Vehiculo, type VehiculoInput } from "@/lib/forestal/directorio";
import LibretaVehiculosModal, { type VehiculoDeLaGuia } from "./LibretaVehiculosModal";
import { Btn } from "./ctp-shared";

export function CtpVehiculoBarra({
  vehiculos,
  onAplicar,
  onElegir,
  onGuardarVehiculo,
  borrador,
}: {
  vehiculos: Vehiculo[];
  onAplicar: (v: { placa: string; marca: string; tipo: string; placaRemolque?: string }) => void;
  onElegir?: (id: string) => void;
  /** Alta en el Directorio desde la ventana. Sin esto, la ventana sólo elige. */
  onGuardarVehiculo?: (input: VehiculoInput) => Promise<Vehiculo>;
  /** Lo que ya está tipeado en la guía: arranca el alta. */
  borrador?: VehiculoDeLaGuia;
}) {
  const [abierta, setAbierta] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  if (vehiculos.length === 0 && !onGuardarVehiculo) return null;

  function usar(v: Vehiculo, prefijo: string) {
    /* El Directorio guarda la placa sin guion (`W2D853`): a la guía va como se
       escribe en el papel. Y el remolque guardado viaja con el camión. */
    onAplicar({
      placa: placaParaGuia(v.placa, v.tipo),
      marca: v.marca ?? "",
      tipo: v.tipo ?? "",
      ...(v.placaRemolque ? { placaRemolque: placaParaGuia(v.placaRemolque) } : {}),
    });
    onElegir?.(v.id);
    setAbierta(false);
    setAviso(`${prefijo}.`);
  }

  return (
    <div className="sm:col-span-3">
      <div className="flex flex-wrap items-center gap-2">
        <Btn size="sm" variant="secondary" className="max-sm:h-12" onClick={() => setAbierta(true)} aria-haspopup="dialog">
          <Truck className="h-4 w-4" />
          Placas guardadas
          <span className="rounded bg-[var(--surface-raised)]/60 px-1.5 font-mono text-xs tabular-nums">{vehiculos.length}</span>
        </Btn>
      </div>
      {aviso && <p className="mt-1 text-sm font-medium text-[var(--data-success-ink)]">{aviso}</p>}
      {abierta && (
        <LibretaVehiculosModal
          vehiculos={vehiculos}
          borrador={borrador}
          puedeAgregar={Boolean(onGuardarVehiculo)}
          onUsar={(v) => usar(v, `${placaParaGuia(v.placa, v.tipo)} cargada desde la libreta`)}
          onAgregar={async (input) => {
            if (!onGuardarVehiculo) return;
            const v = await onGuardarVehiculo(input);
            usar(v, `${placaParaGuia(v.placa, v.tipo)} quedó en la libreta y en la guía`);
          }}
          onCerrar={() => setAbierta(false)}
        />
      )}
    </div>
  );
}
