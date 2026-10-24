import SuppliersQueueClient from "./SuppliersQueueClient";
import { Truck } from "@buleje/design-system/icons";
import { CabeceraConPestanas } from "@/components/admin/shared/cabecera-con-pestanas";

/**
 * /superadmin/marketplace/suppliers
 *
 * Cola de aprobación de proveedores (self-signup). Muestra pestañas
 * Pendientes / Aprobados / Rechazados con contadores; permite aprobar
 * (con modal que muestra la API key una sola vez) o rechazar (con razón).
 */
export default function SuperAdminSuppliersPage() {
  return (
    <div className="space-y-6">
      <CabeceraConPestanas
        icon={Truck}
        title="Cola de proveedores"
        kicker="Marketplace · Proveedores"
        info={{
          title: "Cola de proveedores",
          what: "Solicitudes de registro de proveedores: aprueba o rechaza cada una.",
          affects: "Al aprobar, se genera una API key única para el proveedor.",
        }}
      />
      <SuppliersQueueClient />
    </div>
  );
}
