"use client";

import Link from "next/link";
import { useCustomer } from "@/contexts/customer-context";
import { useWishlist } from "@/hooks/use-wishlist";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StatCard {
  label: string;
  value: string;        // número real, o "—" si no tenemos dato confiable
  href: string;
  description: string;
}

// ── Page ──────────────────────────────────────────────────────────────────────
//
// Las tarjetas que SÍ tienen dato confiable en el cliente muestran número real:
//   - Favoritos (useWishlist — localStorage)
//   - Direcciones (useCustomer — perfil local)
// Las que requieren fetch al server (pedidos, cupones) muestran "—" hasta
// cablear PR-2. NO mostramos números ficticios (rompe confianza del cliente).

export default function MiCuentaPage() {
  const { customer } = useCustomer();
  const { items: wishlistItems } = useWishlist();

  const favoritesCount = wishlistItems.length;
  const addressesCount = customer?.locations?.length ?? 0;

  const stats: StatCard[] = [
    {
      label: "Pedidos",
      value: "—",
      href: "/marketplace/mi-cuenta/pedidos",
      description: "Ver tu historial",
    },
    {
      label: "Favoritos",
      value: String(favoritesCount),
      href: "/marketplace/mi-cuenta/favoritos",
      description:
        favoritesCount > 0 ? "Ver guardados" : "Aún sin guardados",
    },
    {
      label: "Cupones",
      value: "—",
      href: "/marketplace/mi-cuenta/cupones",
      description: "Ver disponibles",
    },
    {
      label: "Direcciones",
      value: String(addressesCount),
      href: "/marketplace/mi-cuenta/direcciones",
      description:
        addressesCount > 0 ? "Gestionar" : "Agregar una dirección",
    },
  ];

  return (
    <div>
      <h2 className="mb-4 text-base font-medium text-gray-700 dark:text-gray-300">
        Resumen
      </h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <Link
            key={stat.href}
            href={stat.href}
            className="group rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600 dark:hover:bg-gray-800"
          >
            <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
              {stat.value}
            </p>
            <p className="mt-1 text-sm font-medium text-gray-600 dark:text-gray-300">
              {stat.label}
            </p>
            <p className="mt-1 text-xs text-gray-400 group-hover:text-gray-500 dark:text-gray-500 dark:group-hover:text-gray-400">
              {stat.description}
            </p>
          </Link>
        ))}
      </div>

      {/* Info del perfil */}
      {customer && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
            Datos de contacto
          </h3>
          <dl className="space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="w-24 text-gray-500 dark:text-gray-400">Nombre</dt>
              <dd className="text-gray-900 dark:text-gray-100">{customer.name}</dd>
            </div>
            {customer.phone && (
              <div className="flex gap-2">
                <dt className="w-24 text-gray-500 dark:text-gray-400">Telefono</dt>
                <dd className="text-gray-900 dark:text-gray-100">{customer.phone}</dd>
              </div>
            )}
            {customer.location && (
              <div className="flex gap-2">
                <dt className="w-24 text-gray-500 dark:text-gray-400">Direccion</dt>
                <dd className="text-gray-900 dark:text-gray-100">{customer.location}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}
