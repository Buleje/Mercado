"use client";

/**
 * CampoNotaSuelta — la nota de un día SIN marca (23-10, «sólo una nota, sin
 * poner presente ni nada»). Se escribe y se guarda al salir del campo o con
 * Enter; Escape deja lo que había. Vacío = borrar la nota. Si después se marca
 * el día, la nota pasa a la marca sola (servidor y hoja hacen lo mismo).
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { AVISO_NOTA_SIN_SALUD, NOTA_DIA_MAX } from "@/lib/rrhh/nota-del-dia";
import { CLASE_CAMPO } from "../rrhh-form";

interface Props {
  nombre: string;
  inicial: string;
  onGuardar: (texto: string | null) => void;
  onCerrar: () => void;
  className?: string;
}

export default function CampoNotaSuelta({ nombre, inicial, onGuardar, onCerrar, className }: Props) {
  const [texto, setTexto] = useState(inicial);

  const guardar = () => {
    const limpio = texto.trim();
    if (limpio !== inicial.trim()) onGuardar(limpio || null);
    onCerrar();
  };

  return (
    <input
      autoFocus
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={guardar}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setTexto(inicial);
          onCerrar();
        }
      }}
      aria-label={`Nota del día de ${nombre} (sin marcar)`}
      placeholder={AVISO_NOTA_SIN_SALUD}
      title={`${AVISO_NOTA_SIN_SALUD}. Ej.: avisó que llega el lunes. Enter guarda, Escape deja lo que había.`}
      maxLength={NOTA_DIA_MAX}
      data-qa="rrhh-nota-suelta"
      className={cn(CLASE_CAMPO, className)}
    />
  );
}
