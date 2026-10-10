import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import CuentaLayoutShell from "./CuentaLayoutShell";
import CuentaDashboardClient from "./CuentaDashboardClient";

/**
 * /cuenta — Dashboard unificado del cliente.
 *
 * Server component ligero. Wrappea el dashboard en <CuentaLayoutShell> que
 * aporta Header + AnnouncementBar + CuentaSidebar + CuentaMobileTabs.
 *
 * Toda la UI del dashboard vive en <CuentaDashboardClient>, que consume datos
 * reales: contexto customer (useCustomer), inteligencia de cliente
 * (useCustomerIntelligence → /api/customer/intelligence) y pedidos (/api/orders).
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
        <CuentaDashboardClient />
      </CuentaLayoutShell>
    </>
  );
}
