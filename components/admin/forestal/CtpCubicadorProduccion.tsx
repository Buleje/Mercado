"use client";

/**
 * El cuerpo de «Producir sin lote»: el aviso de «lo cubicado es de otro día» y el
 * cubicador ENTERO, en su propia libreta (`ESPACIO_PRODUCCION`). Vive aparte para
 * que el modal no crezca; `libreta` es la `key` que lo vuelve a montar cuando se
 * declara o se empieza de cero.
 */
import type { ComponentProps } from "react";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import CubicadorMadera from "./CubicadorMadera";
import CtpAvisoCubicadoViejo from "./CtpAvisoCubicadoViejo";
import { ESPACIO_PRODUCCION, vaciarLibretaProduccion } from "./hooks/libreta-produccion";

type PropsCubicador = Pick<
  ComponentProps<typeof CubicadorMadera>,
  "onLote" | "piezasAImportar" | "onImportado" | "codigoDeTroza"
>;

export default function CtpCubicadorProduccion({
  libreta,
  fecha,
  piezas,
  onUsarFecha,
  onVaciada,
  ...cubicador
}: PropsCubicador & {
  libreta: number;
  /** La fecha de jornada elegida en el modal. */
  fecha: string;
  /** Lo que hay cubicado ahora. */
  piezas: readonly PiezaCubicada[];
  onUsarFecha: (iso: string) => void;
  /** Ya se vació la libreta: el modal vuelve a montar el cubicador. */
  onVaciada: () => void;
}) {
  return (
    <div className="px-2 py-3 sm:px-5 sm:py-4">
      <CtpAvisoCubicadoViejo
        fecha={fecha}
        piezas={piezas}
        libreta={libreta}
        onUsarFecha={onUsarFecha}
        onEmpezarDeCero={() => {
          vaciarLibretaProduccion();
          onVaciada();
        }}
      />
      <CubicadorMadera key={libreta} espacio={ESPACIO_PRODUCCION} {...cubicador} />
    </div>
  );
}
