"use client";

import { LoadingState } from "@buleje/design-system";
import { useCupones } from "@/components/admin/cupones/hooks/use-cupones";
import CuponesReglas from "@/components/admin/cupones/CuponesReglas";
import CuponesManuales from "@/components/admin/cupones/CuponesManuales";
import CuponesVentanas from "@/components/admin/cupones/CuponesVentanas";

export default function CouponsTab() {
  // El estado y las acciones viven en `useCupones` (cupones/hooks/); cada bloque de la vista,
  // en su pieza de `cupones/`. Partido el 09-10 sin cambiar el DOM y ordenado después.
  const cup = useCupones();
  const {
    loading,
  } = cup;

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Orden por pregunta: arriba los cupones (lo que el cliente usa hoy), después las reglas automáticas. */}
      <CuponesManuales cup={cup} />

      <CuponesReglas cup={cup} />

      <CuponesVentanas cup={cup} />
    </div>
  );
}
