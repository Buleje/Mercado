"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Store, ShoppingBag, Settings, ExternalLink, Loader2 } from "lucide-react";

interface TenantInfo {
  name: string;
  slug: string;
  plan: string;
  type: string;
  active: boolean;
}

export default function TenantHomePage() {
  const { slug } = useParams<{ slug: string }>();
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/superadmin/tenants`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        const t = data?.tenants?.find((t: TenantInfo & { slug: string }) => t.slug === slug);
        if (t) setTenant(t);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Loader2 className="w-8 h-8 animate-spin text-[#0f766e]" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
        <div className="text-center">
          <Store className="w-16 h-16 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Tienda no encontrada</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">No existe una tienda con el slug &quot;{slug}&quot;</p>
          <Link href="/registro" className="px-6 py-3 bg-[#0f766e] text-white rounded-2xl font-bold hover:opacity-90">
            Crear una tienda
          </Link>
        </div>
      </div>
    );
  }

  const planColors: Record<string, string> = {
    free: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    pro: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
    business: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
    enterprise: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  };

  const typeLabels: Record<string, string> = { store: "Tienda", supplier: "Proveedor", delivery: "Delivery" };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="w-20 h-20 rounded-2xl bg-[#0f766e] flex items-center justify-center mx-auto text-white text-2xl font-bold">
            {tenant.name.slice(0, 2).toUpperCase()}
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">{tenant.name}</h1>
          <div className="flex items-center justify-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${planColors[tenant.plan] ?? planColors.free}`}>
              {tenant.plan.toUpperCase()}
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              {typeLabels[tenant.type] ?? tenant.type}
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${tenant.active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
              {tenant.active ? "Activa" : "Suspendida"}
            </span>
          </div>
        </div>

        {/* Links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href={`/t/${slug}/admin`}
            className="flex items-center gap-4 p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl hover:shadow-lg transition-shadow"
          >
            <div className="w-12 h-12 rounded-xl bg-[#0f766e]/10 flex items-center justify-center">
              <Settings className="w-6 h-6 text-[#0f766e]" />
            </div>
            <div>
              <p className="font-bold text-gray-900 dark:text-white">Panel Admin</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Gestionar ventas, inventario, fiados</p>
            </div>
            <ExternalLink className="w-4 h-4 text-gray-400 ml-auto" />
          </Link>

          <Link
            href={`/t/${slug}/tienda`}
            className="flex items-center gap-4 p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl hover:shadow-lg transition-shadow"
          >
            <div className="w-12 h-12 rounded-xl bg-[#f97316]/10 flex items-center justify-center">
              <ShoppingBag className="w-6 h-6 text-[#f97316]" />
            </div>
            <div>
              <p className="font-bold text-gray-900 dark:text-white">Tienda Online</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Ver como ven tus clientes</p>
            </div>
            <ExternalLink className="w-4 h-4 text-gray-400 ml-auto" />
          </Link>
        </div>

        {/* Back */}
        <div className="text-center">
          <Link href="/superadmin" className="text-sm text-gray-500 dark:text-gray-400 hover:text-[#0f766e]">
            ← Volver al SuperAdmin
          </Link>
        </div>
      </div>
    </div>
  );
}
