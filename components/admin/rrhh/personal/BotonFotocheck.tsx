"use client";

/**
 * BotonFotocheck — descarga el fotocheck en PDF de una o varias personas
 * (ADR-416). El mismo botón en la ficha (una persona) y en Personal (todas las
 * de la lista que no están cesadas).
 */

import { useState } from "react";
import { toast } from "sonner";
import { QrCode } from "@buleje/design-system/icons";
import { sinDato } from "@/lib/errores/sin-dato";
import type { ColaboradorDTO } from "@/lib/rrhh/tipos";
import { BOTON } from "../rrhh-form";
import { archivoDeFotocheck, descargarFotochecksDe } from "./fotocheck";

interface Props {
  colaboradores: ColaboradorDTO[];
  etiqueta: string;
  className?: string;
}

export default function BotonFotocheck({ colaboradores, etiqueta, className }: Props) {
  const [armando, setArmando] = useState(false);

  const descargar = async () => {
    setArmando(true);
    try {
      await descargarFotochecksDe(colaboradores, archivoDeFotocheck(colaboradores));
    } catch (err) {
      sinDato("RRHH fotocheck")(err);
      toast.error("No se pudo armar el fotocheck. Reintenta.");
    } finally {
      setArmando(false);
    }
  };

  return (
    <button type="button" onClick={descargar} disabled={armando || colaboradores.length === 0} className={className ?? BOTON.chico}>
      <QrCode className="h-4 w-4" /> {armando ? "Armando el PDF…" : etiqueta}
    </button>
  );
}
