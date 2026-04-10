import SupplierRegisterForm from "@/components/supplier/SupplierRegisterForm";

/**
 * /supplier/registrar — Public self-signup for proveedores.
 * Ver item #15 del Master Roadmap: desbloqueo del supply-side del marketplace.
 */
export default function SupplierRegistrarPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950 py-10 px-4">
      <SupplierRegisterForm />
    </main>
  );
}
