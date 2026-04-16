import Link from "next/link";
import { Search } from "lucide-react";

export default function AdminNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-300">
            <Search className="h-8 w-8" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
          Pagina no encontrada
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Esta seccion del panel no existe o fue movida.
        </p>
        <Link
          href="/admin"
          className="mt-6 inline-block rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
        >
          Ir al panel principal
        </Link>
      </div>
    </div>
  );
}
