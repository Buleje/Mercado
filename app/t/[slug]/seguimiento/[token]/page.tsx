import type { Metadata } from "next";
import SeguimientoPublico from "@/components/store/seguimiento/SeguimientoPublico";

interface PageProps {
  params: Promise<{ slug: string; token: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `Seguimiento — ${slug}`,
    description: "Revisa en tiempo real dónde está el pedido que te compartieron.",
    robots: { index: false, follow: false },
  };
}

/** Con marco propio. El link compartido llega por la tienda: `app/(store)/seguimiento/[token]`. */
export default async function PublicTrackingPage({ params }: PageProps) {
  const { slug, token } = await params;
  return <SeguimientoPublico token={token} negocio={slug} conMarcoPropio />;
}
