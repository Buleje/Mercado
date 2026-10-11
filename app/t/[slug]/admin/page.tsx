"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Lock } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { urlCredenciales } from "@/components/superadmin/tenants/abrir-panel-tienda";

/**
 * /t/[slug]/admin — punto de entrada al panel admin de un tenant.
 *
 * Flujo:
 * 1. Guarda el slug como tenant activo en localStorage/sessionStorage.
 * 2. Intenta impersonar via SuperAdmin (solo funciona si hay sesión SA activa).
 *    - Si OK → redirige a /admin (el middleware inyecta x-tenant-id por el cookie).
 * 3. Si no hay sesión SA → redirige al login del tenant (/admin/login?tenant=[slug]).
 * 4. Sesión SA con el candado de credenciales configurado y CERRADO (423) → lo dice
 *    y enlaza a la ficha de la tienda en Credenciales para abrirlo (no al login).
 */
export default function TenantAdminGateway() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const attempted = useRef(false);
  const [candadoCerrado, setCandadoCerrado] = useState(false);

  useEffect(() => {
    if (!slug || attempted.current) return;
    attempted.current = true;

    // Persistir el tenant activo — ambos storages para máxima compatibilidad
    sessionStorage.setItem("active-tenant-slug", slug);
    localStorage.setItem("active-tenant-slug", slug);

    // Intentar impersonación SuperAdmin (fire once)
    fetch("/api/superadmin/impersonate", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ slug }),
    })
      .then((r) => {
        if (r.ok) {
          // Sesión SA activa → impersonación exitosa → panel admin con contexto de tenant
          router.replace("/admin");
        } else if (r.status === 423) {
          setCandadoCerrado(true);
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

  if (candadoCerrado) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[var(--surface-canvas)] px-6 text-center">
        <Lock className="w-8 h-8 text-[var(--accent)]" aria-hidden="true" />
        <p className="text-base font-bold text-[var(--text-primary)]">Tu candado de credenciales está cerrado</p>
        <p className="text-sm text-[var(--text-tertiary)]">
          Para entrar como <strong className="text-[var(--text-secondary)]">{slug}</strong> ábrelo primero.
        </p>
        <a
          href={urlCredenciales(slug)}
          className="mt-1 inline-flex h-10 items-center rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white"
        >
          Abrir el candado en el superadmin
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--surface-canvas)]">
      <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
      <p className="text-sm text-[var(--text-tertiary)]">
        Cargando panel de <strong className="text-[var(--text-secondary)]">{slug}</strong>…
      </p>
    </div>
  );
}
