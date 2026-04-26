import type { Metadata } from "next";
import { buildTenantTitle } from "@/lib/store-metadata";

/**
 * Metadata dinámica: cuando el cliente entra desde `/t/<slug>/cuenta` el
 * middleware inyecta `x-tenant-id` y `x-tenant-store-route`. Delegamos al
 * helper compartido `buildTenantTitle`, que también dedupa la lectura de
 * settings con el resto de páginas via `React.cache()`.
 */
export async function generateMetadata(): Promise<Metadata> {
  return buildTenantTitle(
    "Mi Cuenta",
    "Gestiona tus pedidos, suscripciones, cupones, direcciones y todo en un solo lugar.",
    { index: false, follow: false },
  );
}

/**
 * Layout del grupo /cuenta/*.
 *
 * Mantenemos un passthrough minimal: cada página del grupo decide si se
 * envuelve con <CuentaLayoutShell> (dashboard unificado + sidebar) o si
 * renderiza su propio chrome (satellite pages legacy).
 *
 * Esto es intencional para no romper las satellite pages que ya renderizan
 * Header + AnnouncementBar propios. Se iran migrando una a una al shell
 * unificado en tickets posteriores.
 */
export default function CuentaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
