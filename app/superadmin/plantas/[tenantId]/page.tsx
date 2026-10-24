import "server-only";
import { Suspense } from "react";
import { CargaPagina } from "@buleje/design-system/carga-pagina";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { SUPERADMIN_CONTENT, SUPERADMIN_PAGE } from "@/lib/superadmin-layout";
import { CabeceraPlantas } from "@/components/superadmin/plantas/CabeceraPlantas";
import { PlantaFichaConsola } from "@/components/superadmin/plantas/PlantaFichaConsola";

export const metadata = {
  title: "Ficha de planta forestal — Superadmin",
  robots: "noindex, nofollow",
};

/** /superadmin/plantas/[tenantId] — todo lo de una planta para inspeccionarla. */
export default async function PlantaFichaPage({ params }: { params: Promise<{ tenantId: string }> }) {
  await requirePlatformPage();
  const { tenantId } = await params;

  return (
    <div className={SUPERADMIN_PAGE}>
      <CabeceraPlantas
        titulo="Ficha de la planta"
        what="Lo que tiene una planta según su libro: trozas, aserrada por producto, existencia por especie, movimiento del período e incoherencias."
        affects="Es sólo lectura: para corregir algo, «Ver en su libro» entra como la planta en la vista exacta."
        example="Una especie en negativo quiere decir que salió más de lo que entró: falta una guía de ingreso o sobra un despacho."
      />
      <div className={SUPERADMIN_CONTENT}>
        <Suspense fallback={<CargaPagina modo="bloque" />}>
          <PlantaFichaConsola tenantId={decodeURIComponent(tenantId)} />
        </Suspense>
      </div>
    </div>
  );
}
