import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mi Cuenta — Panel del Cliente | Buleje",
  description:
    "Gestiona tus pedidos, suscripciones, cupones, direcciones y todo en un solo lugar.",
  robots: { index: false, follow: false },
};

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
