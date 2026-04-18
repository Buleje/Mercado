import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveDetailPage } from "@/components/marketplace/en-vivo/detalle/LiveDetailPage";
import { getLiveById } from "@/lib/mocks/lives.mock";

interface PageProps {
  params: Promise<{ liveId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { liveId } = await params;
  const live = getLiveById(liveId);
  if (!live) {
    return { title: "Transmisión no encontrada — Buleje en Vivo" };
  }
  return {
    title: `${live.title} — Buleje en Vivo`,
    description: live.description,
    openGraph: {
      title: `${live.title} — Buleje en Vivo`,
      description: live.description,
      images: [{ url: live.thumbnail }],
      url: `https://www.buleje.pe/marketplace/en-vivo/${live.id}`,
      type: "video.other",
    },
  };
}

export default async function LiveDetailRoute({ params }: PageProps) {
  const { liveId } = await params;
  const live = getLiveById(liveId);
  if (!live) notFound();
  return <LiveDetailPage live={live} />;
}
