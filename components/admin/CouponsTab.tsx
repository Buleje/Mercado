"use client";

import type { ReactNode } from "react";
import { LoadingState } from "@buleje/design-system";
import { useCupones } from "@/components/admin/cupones/hooks/use-cupones";
import CuponesReglas from "@/components/admin/cupones/CuponesReglas";
import CuponesManuales from "@/components/admin/cupones/CuponesManuales";
import CuponesVentanas from "@/components/admin/cupones/CuponesVentanas";

/** `barra`: las secciones de Ofertas y cupones, que viajan en la fila de la cabecera. */
export default function CouponsTab({ barra }: { barra?: ReactNode } = {}) {
  // El estado y las acciones viven en `useCupones` (cupones/hooks/); cada bloque de la vista,
  // en su pieza de `cupones/`. Partido el 09-10 sin cambiar el DOM y ordenado después.
  const cup = useCupones();
  const {
    loading,
  } = cup;

  if (loading) return <div className="space-y-4">{barra}<LoadingState /></div>;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Orden por pregunta: arriba los cupones (lo que el cliente usa hoy), después las reglas automáticas. */}
      <CuponesManuales cup={cup} barra={barra} />

      <CuponesReglas cup={cup} />

      <CuponesVentanas cup={cup} />
    </div>
  );
}
