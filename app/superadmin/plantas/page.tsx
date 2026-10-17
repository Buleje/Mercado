import "server-only";
import { Suspense } from "react";
import { LoadingState } from "@buleje/design-system";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { SUPERADMIN_CONTENT, SUPERADMIN_PAGE } from "@/lib/superadmin-layout";
import { SuperAdminModuleTabs, PLANTAS_TABS } from "@/components/superadmin/_shared/ModuleTabs";
import { CabeceraPlantas } from "@/components/superadmin/plantas/CabeceraPlantas";
import { PlantasConsola } from "@/components/superadmin/plantas/PlantasConsola";

export const metadata = {
  title: "Plantas forestales — Superadmin",
  robots: "noindex, nofollow",
};

/**
 * /superadmin/plantas — los aserraderos (negocios con el libro forestal
 * activado): trozas, aserrada, movimiento, incoherencias y semáforo de cada uno.
 */
export default async function PlantasPage() {
  await requirePlatformPage();

  return (
    <div className={SUPERADMIN_PAGE}>
      <SuperAdminModuleTabs tabs={PLANTAS_TABS} />
      <CabeceraPlantas
        titulo="Plantas forestales"
        what="Cada aserradero con el libro forestal activado: cuánta troza y aserrada tiene, qué entró y salió, y si su libro cuadra."
        affects="Las cifras salen del mismo libro que ve cada planta. Los pies tablares son un derivado: 1 m³ = 424 PT."
        example="Una planta en rojo tiene una especie con existencia negativa o un descuadre: ábrela para ver dónde."
      />
      <div className={SUPERADMIN_CONTENT}>
        <Suspense fallback={<LoadingState message="Cargando…" />}>
          <PlantasConsola />
        </Suspense>
      </div>
    </div>
  );
}
