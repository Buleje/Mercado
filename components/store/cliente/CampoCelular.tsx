"use client";

/**
 * CampoCelular — el celular del cliente (9 dígitos, empieza con 9). Acepta
 * espacios, guiones y +51; avisa sólo al salir del campo, sin regañar mientras
 * escribe. Sin colores fijos: la tienda lo viste con las clases.
 *
 *   <CampoCelular valor={cel} onCambio={(crudo) => setCel(crudo)} claseInput="…" />
 *   const listo = normalizarCelularPe(cel) !== null;
 */

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { normalizarCelularPe } from "@/lib/tienda-cliente/celular";

export interface CampoCelularProps {
  valor: string;
  /** `crudo` = lo escrito; `normalizado` = 9 dígitos o null. */
  onCambio: (crudo: string, normalizado: string | null) => void;
  etiqueta?: string;
  ayuda?: string;
  requerido?: boolean;
  id?: string;
  className?: string;
  claseEtiqueta?: string;
  claseInput?: string;
  claseAyuda?: string;
  /** Clase del aviso «revisa tu número». */
  claseError?: string;
}

export function CampoCelular({
  valor,
  onCambio,
  etiqueta = "Tu celular",
  ayuda = "Para avisarte cuando salga tu pedido.",
  requerido = true,
  id,
  className,
  claseEtiqueta,
  claseInput,
  claseAyuda,
  claseError,
}: CampoCelularProps) {
  const idPropio = useId();
  const idCampo = id ?? `celular-${idPropio}`;
  const [tocado, setTocado] = useState(false);
  const normalizado = normalizarCelularPe(valor);
  const malo = tocado && valor.trim() !== "" && normalizado === null;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={idCampo} className={cn("text-sm font-semibold", claseEtiqueta)}>
        {etiqueta}
      </label>
      <input
        id={idCampo}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="987 654 321"
        maxLength={20}
        required={requerido}
        value={valor}
        onChange={(e) => onCambio(e.target.value, normalizarCelularPe(e.target.value))}
        onBlur={() => setTocado(true)}
        aria-invalid={malo || undefined}
        aria-describedby={`${idCampo}-ayuda`}
        className={cn("h-12 w-full rounded-xl border px-4 text-base outline-none", claseInput)}
      />
      {malo ? (
        <p id={`${idCampo}-ayuda`} role="alert" className={cn("text-sm", claseError ?? claseAyuda)}>
          Revisa tu número: son 9 dígitos y empieza con 9.
        </p>
      ) : (
        <p id={`${idCampo}-ayuda`} className={cn("text-sm", claseAyuda)}>
          {ayuda}
        </p>
      )}
    </div>
  );
}

export default CampoCelular;
