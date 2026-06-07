import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveDetailPage } from "@/components/marketplace/en-vivo/detalle/LiveDetailPage";
import { getLiveById as getMockLiveById } from "@/lib/mocks/lives.mock";
import { LiveSessionsDB } from "@/lib/db/live-sessions.db";
import { toUiLive } from "@/lib/lives/client";

interface PageProps {
  params: Promise<{ liveId: string }>;
}

/**
 * Carga desde la DB real primero. Si no existe (ej. desde dev antes del backfill),
 * cae al mock. Devuelve null si ninguno matchea.
 */
async function resolveLive(liveId: string) {
  try {
    const result = await LiveSessionsDB.getById(null, liveId);
    if (result) {
      return toUiLive(result.session as unknown as Record<string, unknown>, result.products, result.messages);
    }
  } catch {
    // DB no accesible (ej. antes de migration) → fallback mock
  }
  return getMockLiveById(liveId);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { liveId } = await params;
  const live = await resolveLive(liveId);
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
  const live = await resolveLive(liveId);
  if (!live) notFound();
  return <LiveDetailPage live={live} />;
}
