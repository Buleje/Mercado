"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCustomer } from "@/contexts/customer-context";
import { useWishlist } from "@/hooks/use-wishlist";
import { LastOrderBanner } from "@/components/marketplace/mi-cuenta/LastOrderBanner";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StatCard {
  label: string;
  value: string;        // número real, "—" si no hay sesión, "..." si carga
  href: string;
  description: string;
}

// ── Page ──────────────────────────────────────────────────────────────────────
//
// Pedidos: fetch real /api/marketplace/mi-cuenta/pedidos?phone=...&tenantId=main
// Cupones: lee localStorage (key "marketplace-coupons:v1") como fallback
// Favoritos + Direcciones: client-side (wishlist localStorage + customer ctx)

export default function MiCuentaPage() {
  const { customer } = useCustomer();
  const { items: wishlistItems } = useWishlist();
  const [ordersCount, setOrdersCount] = useState<number | null>(null);
  const [couponsCount, setCouponsCount] = useState<number | null>(null);

  const favoritesCount = wishlistItems.length;
  const addressesCount = customer?.locations?.length ?? 0;
  const phone = customer?.phone;

  // Fetch pedidos reales si hay sesión (phone)
  useEffect(() => {
    if (!phone) {
      setOrdersCount(0);
      return;
    }
    let cancelled = false;
    fetch(
      `/api/marketplace/mi-cuenta/pedidos?phone=${encodeURIComponent(phone)}&tenantId=main`,
      { cache: "no-store" },
    )
      .then((r) => (r.ok ? r.json() : { orders: [] }))
      .then((data: { orders?: unknown[] }) => {
        if (cancelled) return;
        setOrdersCount(Array.isArray(data.orders) ? data.orders.length : 0);
      })
      .catch(() => {
        if (!cancelled) setOrdersCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [phone]);

  // Cupones disponibles: lee localStorage (cliente-side, sin endpoint dedicado)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("marketplace-coupons:v1");
      if (!raw) {
        setCouponsCount(0);
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      const count = Array.isArray(parsed) ? parsed.length : 0;
      setCouponsCount(count);
    } catch {
      setCouponsCount(0);
    }
  }, []);

  const formatCount = (n: number | null): string =>
    n === null ? "..." : String(n);

  const stats: StatCard[] = [
    {
      label: "Pedidos",
      value: formatCount(ordersCount),
      href: "/marketplace/mi-cuenta/pedidos",
      description:
        ordersCount === null
          ? "Cargando..."
          : ordersCount > 0
            ? "Ver tu historial"
            : phone
              ? "Aun sin pedidos"
              : "Identificate para ver tus pedidos",
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
      value: formatCount(couponsCount),
      href: "/marketplace/mi-cuenta/cupones",
      description:
        couponsCount === null
          ? "Cargando..."
          : couponsCount > 0
            ? "Ver disponibles"
            : "Sin cupones por ahora",
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
      {/* "Comprar de nuevo" — atajo 1-click al último pedido.
          Sólo aparece si el cliente ya tiene historial. */}
      <LastOrderBanner />

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
                <dt className="w-24 text-gray-500 dark:text-gray-400">Teléfono</dt>
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
