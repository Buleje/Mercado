"use client";

import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * /t/[slug]/admin — punto de entrada al panel admin de un tenant.
 *
 * Flujo:
 * 1. Guarda el slug como tenant activo en localStorage/sessionStorage.
 * 2. Intenta impersonar via SuperAdmin (solo funciona si hay sesión SA activa).
 *    - Si OK → redirige a /admin (el middleware inyecta x-tenant-id por el cookie).
 * 3. Si no hay sesión SA → redirige al login del tenant (/admin/login?tenant=[slug]).
 */
export default function TenantAdminGateway() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const attempted = useRef(false);

  useEffect(() => {
    if (!slug || attempted.current) return;
    attempted.current = true;

    // Persistir el tenant activo — ambos storages para máxima compatibilidad
    sessionStorage.setItem("active-tenant-slug", slug);
    localStorage.setItem("active-tenant-slug", slug);

    // Intentar impersonación SuperAdmin (fire once)
    fetch("/api/superadmin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    })
      .then((r) => {
        if (r.ok) {
          // Sesión SA activa → impersonación exitosa → panel admin con contexto de tenant
          router.replace("/admin");
        } else {
          // Sin sesión SA → login normal del tenant
          router.replace(`/admin/login?tenant=${encodeURIComponent(slug)}`);
        }
      })
      .catch(() => {
        // Error de red → login como fallback seguro
        router.replace(`/admin/login?tenant=${encodeURIComponent(slug)}`);
      });
  }, [slug, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--surface-canvas)]">
      <Loader2 className="w-8 h-8 animate-spin text-[#00B4A6]" />
      <p className="text-sm text-[var(--text-tertiary)]">
        Cargando panel de <strong className="text-[var(--text-secondary)]">{slug}</strong>…
      </p>
    </div>
  );
}
