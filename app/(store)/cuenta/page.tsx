import { Suspense } from "react";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import CuentaLayoutShell from "./CuentaLayoutShell";
import CuentaDashboardClient from "./CuentaDashboardClient";

/**
 * /cuenta — Dashboard unificado del cliente.
 *
 * Server component ligero: <CuentaLayoutShell> (una columna, fondo del
 * negocio) + <CuentaDashboardClient> (saludo + último pedido + secciones
 * `?sub=`). Datos reales: contexto del cliente, `/api/orders` y, al abrir
 * Puntos, `/api/customer/intelligence`. El Suspense es por `useSearchParams`.
 */

export default function CuentaPage() {
  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.buleje.pe/" },
          { name: "Mi cuenta", url: "https://www.buleje.pe/cuenta" },
        ]}
      />
      <CuentaLayoutShell>
        <Suspense fallback={null}>
          <CuentaDashboardClient />
        </Suspense>
      </CuentaLayoutShell>
    </>
  );
}
