import type { Metadata } from "next";
import { headers } from "next/headers";
import SeguimientoPublico from "@/components/store/seguimiento/SeguimientoPublico";

/**
 * El link de seguimiento que se comparte (`/t/<negocio>/seguimiento/<token>`).
 *
 * El proxy reescribe `/t/<negocio>/*` hacia la tienda con el negocio en
 * `x-tenant-id` (`lib/middleware/slug-routes.ts`), así que el link llega ACÁ,
 * dentro del encabezado y el pie del negocio. Antes esta ruta no existía y
 * todo link compartido daba 404 (medido 02-10-2026).
 */
interface PageProps {
  params: Promise<{ token: string }>;
}

export const metadata: Metadata = {
  title: "Seguimiento del pedido",
  description: "Revisa en tiempo real dónde está el pedido que te compartieron.",
  robots: { index: false, follow: false },
};

export default async function SeguimientoEnLaTienda({ params }: PageProps) {
  const { token } = await params;
  const negocio = (await headers()).get("x-tenant-id") ?? "";
  return <SeguimientoPublico token={token} negocio={negocio} conMarcoPropio={false} />;
}
