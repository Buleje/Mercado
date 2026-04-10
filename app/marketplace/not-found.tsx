import Link from "next/link";

export default function MarketplaceNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="text-center">
        <div className="text-6xl mb-4">🔍</div>
        <h1 className="text-2xl font-bold text-gray-800">
          Tienda no encontrada
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Esta tienda no existe en el marketplace o no esta publicada.
        </p>
        <div className="mt-6 flex gap-3 justify-center">
          <Link
            href="/marketplace"
            className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
          >
            Ver todas las tiendas
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-gray-200 px-6 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
