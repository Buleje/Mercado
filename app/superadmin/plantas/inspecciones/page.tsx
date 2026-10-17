import "server-only";
import { Suspense } from "react";
import { LoadingState } from "@buleje/design-system";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { SUPERADMIN_CONTENT, SUPERADMIN_PAGE } from "@/lib/superadmin-layout";
import { SuperAdminModuleTabs, PLANTAS_TABS } from "@/components/superadmin/_shared/ModuleTabs";
import { CabeceraPlantas } from "@/components/superadmin/plantas/CabeceraPlantas";
import { InspeccionesConsola } from "@/components/superadmin/plantas/inspeccion/InspeccionesConsola";

export const metadata = {
  title: "Inspecciones de planta — Superadmin",
  robots: "noindex, nofollow",
};

/** /superadmin/plantas/inspecciones — las inspecciones de todas las plantas. */
export default async function InspeccionesPlantasPage() {
  await requirePlatformPage();

  return (
    <div className={SUPERADMIN_PAGE}>
      <SuperAdminModuleTabs tabs={PLANTAS_TABS} />
      <CabeceraPlantas
        titulo="Inspecciones de planta"
        what="Cada visita a una planta: qué día, quién fue, cuántas trozas del libro no estaban en el patio y qué se encontró."
        affects="La abierta se sigue llenando desde el celular; la cerrada queda como acta. Una nueva se abre desde la ficha de la planta."
        example="Jueves 16/10 · Aserradero Ucayali · faltaron 7 trozas · 3 hallazgos."
      />
      <div className={SUPERADMIN_CONTENT}>
        <Suspense fallback={<LoadingState message="Cargando…" />}>
          <InspeccionesConsola />
        </Suspense>
      </div>
    </div>
  );
}
