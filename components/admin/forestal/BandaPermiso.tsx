"use client";

/**
 * BandaPermiso — el permiso de trabajo y «Solo este permiso», como UN control.
 *
 * Brandon (2026-09-24, señalando la banda del LO-CTP): «que esté en una sola
 * fila». Eran dos cajas con borde propio (384 + 221 px a 1920) y se leían como
 * dos controles sueltos, cuando el interruptor sólo tiene sentido sobre el
 * permiso de al lado: es «qué permiso» y «¿filtro por él?». Juntos comparten
 * borde, el chip cede primero su titular y el interruptor su rótulo.
 *
 * El borde de aviso (2 px punteado sin permiso fijado) lo pone el grupo: es el
 * mismo lenguaje que el chip suelto de los otros libros.
 */

import ContratoActivoChip from "./ContratoActivoChip";
import SoloEstePermisoSwitch from "./SoloEstePermisoSwitch";
import { useContratoActivo } from "@/contexts/contrato-activo-context";

export default function BandaPermiso() {
  const { activo, listo } = useContratoActivo();
  return (
    <div
      role="group"
      aria-label="Permiso de trabajo"
      className={`flex h-10 min-w-0 items-stretch rounded-xl bg-[var(--surface-raised)] ${
        !listo || activo
          ? "border border-[var(--rule-base)]"
          : "border-2 border-dashed border-[var(--rule-base)]"
      }`}
    >
      <ContratoActivoChip enGrupo />
      <SoloEstePermisoSwitch enGrupo />
    </div>
  );
}
