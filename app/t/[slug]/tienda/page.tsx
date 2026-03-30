"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";

/**
 * Ruta local para ver la tienda online de un tenant específico.
 * Guarda el tenant slug en localStorage Y en una cookie para que el proxy lo lea.
 */
export default function TenantStoreRedirect() {
  const { slug } = useParams<{ slug: string }>();

  useEffect(() => {
    if (slug) {
      localStorage.setItem("active-tenant-slug", slug);
      // Set a cookie that the proxy can read for storefront routes
      document.cookie = `active-tenant=${slug};path=/;max-age=${7 * 24 * 60 * 60};samesite=lax`;
      window.location.href = "/";
    }
  }, [slug]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-4 border-[#0f766e] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Abriendo tienda de <strong>{slug}</strong>...</p>
      </div>
    </div>
  );
}
