import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="text-center">
        <div className="text-6xl mb-4">🔍</div>
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
