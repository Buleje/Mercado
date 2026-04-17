"use client";

import Link from "next/link";
import { useCustomer } from "@/contexts/customer-context";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StatCard {
  label: string;
  value: string;
  href: string;
  description: string;
}

// ── Mock stats (PR-2 los conecta a DB real) ───────────────────────────────────

const MOCK_STATS: StatCard[] = [
  {
    label: "Pedidos",
    value: "12",
    href: "/marketplace/mi-cuenta/pedidos",
    description: "Ver historial",
  },
  {
    label: "Favoritos",
    value: "5",
    href: "/marketplace/mi-cuenta/favoritos",
    description: "Ver guardados",
  },
  {
    label: "Cupones activos",
    value: "2",
    href: "/marketplace/mi-cuenta/cupones",
    description: "Ver cupones",
  },
  {
    label: "Direcciones",
    value: "3",
    href: "/marketplace/mi-cuenta/direcciones",
    description: "Gestionar",
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MiCuentaPage() {
  const { customer } = useCustomer();

  return (
    <div>
      <h2 className="mb-4 text-base font-medium text-gray-700 dark:text-gray-300">
        Resumen
      </h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {MOCK_STATS.map((stat) => (
          <Link
            key={stat.href}
            href={stat.href}
            className="group rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600 dark:hover:bg-gray-800"
          >
            <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
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
