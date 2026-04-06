import { ShieldX, ArrowLeft } from "lucide-react";

export default function SuperAdminNotFound() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900/80 backdrop-blur-xl border border-gray-200 dark:border-gray-800 rounded-3xl w-full max-w-md p-8 shadow-xl text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-6">
          <ShieldX className="w-8 h-8 text-amber-600 dark:text-amber-400" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Página no encontrada
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
          Esta sección del panel de plataforma no existe o fue movida.
        </p>
        <a
          href="/superadmin/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Ir al Dashboard
        </a>
      </div>
    </div>
  );
}
