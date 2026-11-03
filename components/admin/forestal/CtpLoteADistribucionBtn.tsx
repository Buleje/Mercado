"use client";

/**
 * «Repartir en la distribución» (Brandon 27-10: «llevar de frente al cubicador
 * en distribución para que se distribuyan en bloque»): un lote EN CONSUMO
 * —consumido, con su corrida sin declarar— entra a la Distribución de rolliza
 * como un bloque que adopta esa corrida (ADR-521). Ahí se reparte lo aserrado y
 * el Recorrido del permiso declara la producción. Uno solo para la tarjeta, el
 * detalle y el aviso del import.
 *
 * Con `lote` (03-11, «va todo, sea declarada o no declarada»): el abierto va
 * con su rolliza libre y el ya declarado con lo que le sobra hasta el 56 %
 * (`aporteDeLote`, la misma regla de la barra y del cubicador). Si no le queda
 * nada que amparar, no se muestra.
 */

import { useState } from "react";
import { LayoutGrid, Loader2 } from "@buleje/design-system/icons";
import { loteEnConsumo, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import { abrirDeFrente, aporteDeLote, avisoDeReparto, bloqueDeAporte } from "@/lib/forestal/lotes-a-distribucion";
import { Btn } from "./ctp-shared";
import { useLlevarLoteADistribucion } from "./hooks/use-llevar-lote-a-distribucion";

export default function CtpLoteADistribucionBtn({
  loteId,
  lote,
  size = "md",
  variant = "primary",
}: {
  loteId?: string;
  lote?: LoteAserrio;
  size?: "md" | "sm";
  variant?: "primary" | "secondary";
}) {
  const { llevar, llevarVarios, llevando, error } = useLlevarLoteADistribucion();
  const [aviso, setAviso] = useState<string | null>(null);
  const enConsumo = lote ? loteEnConsumo(lote) : true;
  const aporte = lote && !enConsumo ? aporteDeLote(lote) : null;
  const id = lote?.id ?? loteId;
  if (!id || (lote && !enConsumo && !aporte)) return null;

  const onClick = () => {
    setAviso(null);
    if (lote && aporte) {
      void llevarVarios([], [], [{ code: lote.code, bloque: bloqueDeAporte(lote, aporte) }]).then((r) => {
        if (r && !abrirDeFrente(r)) setAviso(avisoDeReparto(r));
      });
      return;
    }
    void llevar(id);
  };
  const mensaje = error ?? aviso;
  return (
    <>
      <Btn
        size={size}
        variant={variant}
        disabled={llevando}
        onClick={onClick}
        title={
          aporte
            ? aporte.esMargen
              ? "Lleva lo que le sobra hasta el 56 % a la Distribución del cubicador, como un bloque de aserrada"
              : "Lleva su rolliza libre a la Distribución del cubicador: ahí repartes lo aserrado en un bloque"
            : "Lleva sus trozas a la Distribución del cubicador: ahí repartes lo aserrado en un bloque y declaras su producción"
        }
      >
        {llevando ? <Loader2 className="h-4 w-4 animate-spin" /> : <LayoutGrid className="h-4 w-4" />} Repartir en la distribución
      </Btn>
      {mensaje && (
        <span role="alert" className="text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {mensaje}
        </span>
      )}
    </>
  );
}
