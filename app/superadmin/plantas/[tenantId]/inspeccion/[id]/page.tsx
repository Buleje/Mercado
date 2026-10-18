import "server-only";
import { Suspense } from "react";
import { CargaPagina } from "@buleje/design-system/carga-pagina";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { SUPERADMIN_CONTENT, SUPERADMIN_PAGE } from "@/lib/superadmin-layout";
import { CabeceraPlantas } from "@/components/superadmin/plantas/CabeceraPlantas";
import { InspeccionConsola } from "@/components/superadmin/plantas/inspeccion/InspeccionConsola";

export const metadata = {
  title: "Inspección de planta — Superadmin",
  robots: "noindex, nofollow",
};

/** /superadmin/plantas/[tenantId]/inspeccion/[id] — la inspección en la planta, desde el celular. */
export default async function InspeccionPlantaPage({ params }: { params: Promise<{ tenantId: string; id: string }> }) {
  await requirePlatformPage();
  const { tenantId, id } = await params;

  return (
    <div className={SUPERADMIN_PAGE}>
      <CabeceraPlantas
        titulo="Inspección de planta"
        what="Cuentas en la planta lo que su libro decía al abrir la inspección: trozas del patio, aserrada por producto y lo que encuentres."
        affects="Todo se guarda solo mientras escribes. Al cerrarla queda de sólo lectura y se imprime el acta."
        example="Libro: 128 trozas en el patio. Escaneas 121 → faltan 7, agrupadas por especie y por guía."
      />
      <div className={SUPERADMIN_CONTENT}>
        <Suspense fallback={<CargaPagina modo="bloque" />}>
          <InspeccionConsola tenantId={decodeURIComponent(tenantId)} id={decodeURIComponent(id)} />
        </Suspense>
      </div>
    </div>
  );
}
