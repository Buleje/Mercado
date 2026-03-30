"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";

/**
 * Ruta local para acceder al admin de un tenant específico.
 * Guarda el tenantSlug en localStorage y redirige a /admin.
 * El middleware/proxy lee este valor para inyectar x-tenant-id.
 */
export default function TenantAdminRedirect() {
  const { slug } = useParams<{ slug: string }>();

  useEffect(() => {
    if (slug) {
      // Guardar el tenant activo para que el admin lo use
      localStorage.setItem("active-tenant-slug", slug);
      // Redirigir al admin normal
      window.location.href = "/admin";
    }
  }, [slug]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-4 border-[#0f766e] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Cargando panel de <strong>{slug}</strong>...</p>
      </div>
    </div>
  );
}
