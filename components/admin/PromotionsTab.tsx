"use client";

import { useId } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { usePromociones } from "@/components/admin/promociones/hooks/use-promociones";
import PromocionesCabecera from "@/components/admin/promociones/PromocionesCabecera";
import PromocionesResumen from "@/components/admin/promociones/PromocionesResumen";
import CampanasProgramadas from "@/components/admin/promociones/CampanasProgramadas";
import PromocionesLista from "@/components/admin/promociones/PromocionesLista";
import PromoFormModal from "@/components/admin/promociones/PromoFormModal";
import PromoDetalleModal from "@/components/admin/promociones/PromoDetalleModal";
import PromoEnviarModal from "@/components/admin/promociones/PromoEnviarModal";
import PromoVentanasChicas from "@/components/admin/promociones/PromoVentanasChicas";
import CampanaFormModal from "@/components/admin/promociones/CampanaFormModal";

const CLAVE_KPIS_PROMOCIONES = "promociones:kpis-abiertos";

export default function PromotionsTab() {
  // El estado y las acciones viven en `usePromociones` (promociones/hooks/); cada bloque de la vista,
  // en su pieza de `promociones/`. Partido el 09-10 sin cambiar el DOM y ordenado después.
  const prm = usePromociones();
  // Indicadores plegables y recordados: plegados siguen diciendo sus cifras en una línea.
  const [kpisAbiertos, setKpisAbiertos] = useLocalStorage<boolean>(CLAVE_KPIS_PROMOCIONES, false);
  const kpisId = useId();
  return (
    <div className="space-y-4">
      <PromocionesCabecera
        prm={prm}
        kpisAbiertos={kpisAbiertos}
        onAlternarKpis={() => setKpisAbiertos((v) => !v)}
        kpisId={kpisId}
      />

      <PromocionesResumen prm={prm} abierto={kpisAbiertos} id={kpisId} />

      {/* Orden por pregunta: primero las promociones (lo que la tienda ofrece hoy), después las campañas. */}
      <PromocionesLista prm={prm} />

      <CampanasProgramadas prm={prm} />

      <PromoFormModal prm={prm} />

      <PromoDetalleModal prm={prm} />

      <PromoEnviarModal prm={prm} />

      <PromoVentanasChicas prm={prm} />

      <CampanaFormModal prm={prm} />
    </div>
  );
}
