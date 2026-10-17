import SuppliersQueueClient from "./SuppliersQueueClient";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

/**
 * /superadmin/marketplace/suppliers
 *
 * Cola de aprobación de proveedores (self-signup). Muestra pestañas
 * Pendientes / Aprobados / Rechazados con contadores; permite aprobar
 * (con modal que muestra la API key una sola vez) o rechazar (con razón).
 */
export default function SuperAdminSuppliersPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center gap-2">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          Cola de proveedores
        </h1>
        <InfoTip
          side="bottom"
          title="Cola de proveedores"
          what="Solicitudes de registro de proveedores: aprueba o rechaza cada una."
          affects="Al aprobar, se genera una API key única para el proveedor."
        />
      </div>
      <SuppliersQueueClient />
    </div>
  );
}
