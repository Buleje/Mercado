"use client";

/**
 * Retirar a una persona desde Asistencia (Brandon 20-10: «cuando aparezca el
 * nombre de un personal que ya está retirado, una opción de retirado y desde
 * qué fecha, para que en Asistencia no aparezca»). Abre el mismo modal que la
 * ficha (`CesarColaboradorModal`), con el día que estás mirando propuesto como
 * último día de trabajo. Desde el día siguiente la hoja ya no lo trae
 * (`AsistenciaDB.hoja` filtra por `fechaCese`); lo de antes queda.
 *
 * Sólo gestión y completo (el servidor pide lo mismo para «cesar»).
 */
import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import type { ColaboradorMinDTO, FechaKey, NivelRrhh } from "@/lib/rrhh/tipos";

const CesarColaboradorModal = dynamic(() => import("../personal/CesarColaboradorModal"), { ssr: false });

export function useRetirarPersona(nivel: NivelRrhh, onHecho: () => void): {
  /** `undefined` si este rol no puede retirar (la opción no se muestra). */
  abrir?: (c: ColaboradorMinDTO, fecha: FechaKey) => void;
  modal: ReactNode;
} {
  const [a, setA] = useState<{ c: ColaboradorMinDTO; fecha: FechaKey } | null>(null);
  const puede = nivel === "gestion" || nivel === "completo";
  const modal = a ? (
    <CesarColaboradorModal
      open
      onClose={() => setA(null)}
      colaboradorId={a.c.id}
      colaborador={a.c}
      fechaInicial={a.fecha}
      nivel={nivel}
      onGuardado={() => {
        toast.success(`${a.c.nombre} quedó retirado: ya no sale en Asistencia después de su último día`);
        setA(null);
        onHecho();
      }}
    />
  ) : null;
  return { abrir: puede ? (c, fecha) => setA({ c, fecha }) : undefined, modal };
}
