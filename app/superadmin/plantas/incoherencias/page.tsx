import "server-only";
import { Suspense } from "react";
import { CargaPagina } from "@buleje/design-system/carga-pagina";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { SUPERADMIN_CONTENT, SUPERADMIN_PAGE } from "@/lib/superadmin-layout";
import { CabeceraPlantas } from "@/components/superadmin/plantas/CabeceraPlantas";
import { IncoherenciasConsola } from "@/components/superadmin/plantas/IncoherenciasConsola";

export const metadata = {
  title: "Incoherencias de las plantas — Superadmin",
  robots: "noindex, nofollow",
};

/** /superadmin/plantas/incoherencias — las diferencias de volumen de todas las plantas. */
export default async function IncoherenciasPlantasPage() {
  await requirePlatformPage();

  return (
    <div className={SUPERADMIN_PAGE}>
      <CabeceraPlantas
        titulo="Incoherencias de volumen"
        what="Las diferencias que muestra el libro de cada planta: saldos negativos, ingresos que no cuadran con su guía, rendimientos fuera de rango y pendientes."
        affects="Primero la de más m³ en juego. «Ver en su libro» entra como la planta en la vista donde está la diferencia."
        example="«Cumala en −3,214 m³» en Saldo de rolliza: salió más cumala de la que entró."
      />
      <div className={SUPERADMIN_CONTENT}>
        <Suspense fallback={<CargaPagina modo="bloque" />}>
          <IncoherenciasConsola />
        </Suspense>
      </div>
    </div>
  );
}
