"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";

/**
 * Ruta local para acceder al admin de un tenant específico.
 * Si hay sesión SuperAdmin activa, impersona automáticamente al tenant
 * y redirige directo al panel admin sin pasar por el login.
 * Si no hay sesión SuperAdmin, guarda el slug y redirige al login normal.
 */
export default function TenantAdminRedirect() {
  const { slug } = useParams<{ slug: string }>();

  useEffect(() => {
    if (!slug) return;

    // Siempre guardar el tenant activo para que el admin lo use
    localStorage.setItem("active-tenant-slug", slug);
    localStorage.setItem("superadmin-impersonate-tenant", slug);

    // Intentar impersonación SuperAdmin (auto-login sin contraseña)
    fetch("/api/superadmin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    })
      .then((r) => {
        if (r.ok) {
          // SuperAdmin autenticado → sesión admin ya seteada → ir directo al panel
          window.location.href = "/admin";
        } else {
          // No es SuperAdmin o token expirado → login normal del tenant
          window.location.href = "/admin/login";
        }
      })
      .catch(() => {
        // Error de red → login normal como fallback seguro
        window.location.href = "/admin/login";
      });
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
