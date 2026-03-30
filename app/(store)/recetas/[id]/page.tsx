import RecetaDetalleClient from "@/components/store/RecetaDetalleClient";

export default async function RecetaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecetaDetalleClient recetaId={id} />;
}
