import SuppliersQueueClient from "./SuppliersQueueClient";

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Cola de proveedores
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Revisa las solicitudes de registro de proveedores y aprueba o
          rechaza cada una. Las aprobaciones generan un API key único.
        </p>
      </div>
      <SuppliersQueueClient />
    </div>
  );
}
