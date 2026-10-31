"use client";

/**
 * «Repartir en la distribución» (Brandon 27-10: «llevar de frente al cubicador
 * en distribución para que se distribuyan en bloque»): un lote EN CONSUMO
 * —consumido, con su corrida sin declarar— entra a la Distribución de rolliza
 * como un bloque que adopta esa corrida (ADR-521). Ahí se reparte lo aserrado y
 * el Recorrido del permiso declara la producción. Uno solo para la tarjeta, el
 * detalle y el aviso del import.
 */

import { LayoutGrid, Loader2 } from "@buleje/design-system/icons";
import { Btn } from "./ctp-shared";
import { useLlevarLoteADistribucion } from "./hooks/use-llevar-lote-a-distribucion";

export default function CtpLoteADistribucionBtn({
  loteId,
  size = "md",
  variant = "primary",
}: {
  loteId: string;
  size?: "md" | "sm";
  variant?: "primary" | "secondary";
}) {
  const { llevar, llevando, error } = useLlevarLoteADistribucion();
  return (
    <>
      <Btn
        size={size}
        variant={variant}
        disabled={llevando}
        onClick={() => void llevar(loteId)}
        title="Lleva sus trozas a la Distribución del cubicador: ahí repartes lo aserrado en un bloque y declaras su producción"
      >
        {llevando ? <Loader2 className="h-4 w-4 animate-spin" /> : <LayoutGrid className="h-4 w-4" />} Repartir en la distribución
      </Btn>
      {error && (
        <span role="alert" className="text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </span>
      )}
    </>
  );
}
