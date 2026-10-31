"use client";

/**
 * Las pestañas del Directorio en UNA fila (compactación del libro, 17-10).
 *
 * Es el 2.º nivel del libro (`PestanasDeVista`: flechas, Inicio/Fin, foco
 * itinerante, 48 px) sin íconos —todos eran el mismo muñequito— y con el conteo
 * en gris al lado del nombre.
 *
 * La última es «Tu CTP»: la Ficha del CTP, los datos propios que llenan la guía.
 */

import type { ReactNode } from "react";
import { ROL_DESCRIPCION, ROL_PLURAL, ROLES_PARTE, type RolParte } from "@/lib/forestal/directorio";
import PestanasDeVista, { type PestanaDeVista } from "./PestanasDeVista";
import type { SubDirectorio } from "./ctp-vistas-fusionadas";

const ITEMS: readonly PestanaDeVista<SubDirectorio>[] = [
  ...ROLES_PARTE.map((r: RolParte) => ({ id: r as SubDirectorio, label: ROL_PLURAL[r], hint: ROL_DESCRIPCION[r] })),
  { id: "vehiculos", label: "Vehículos", hint: "Las placas que ya viajaron" },
  {
    id: "tu-ctp",
    label: "Tu CTP",
    hint: "La Ficha del CTP: tu razón social, RUC, títulos y ubicación — encabezan el libro, la guía y el certificado",
  },
];

export default function CtpDirectorioPestanas({
  activa,
  onCambiar,
  conteo,
  children,
}: {
  activa: SubDirectorio;
  onCambiar: (id: SubDirectorio) => void;
  /** Cuántos hay en cada pestaña; `null` = no se cuenta (Tu CTP). */
  conteo: (id: SubDirectorio) => number | null;
  children: ReactNode;
}) {
  return (
    <PestanasDeVista
      prefijo="ctp-directorio"
      etiqueta="Pestañas del Directorio"
      items={ITEMS.map((p) => ({ ...p, cuenta: conteo(p.id) }))}
      activa={activa}
      onCambiar={onCambiar}
      unaFila
    >
      {children}
    </PestanasDeVista>
  );
}
