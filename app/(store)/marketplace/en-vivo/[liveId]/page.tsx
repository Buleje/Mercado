import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveDetailPage } from "@/components/marketplace/en-vivo/detalle/LiveDetailPage";
import { logger } from "@/lib/logger";
import { LiveSessionsDB } from "@/lib/db/live-sessions.db";
import { toUiLive } from "@/lib/lives/client";

interface PageProps {
  params: Promise<{ liveId: string }>;
}

/**
 * Solo transmisiones REALES (live_sessions). Sin fila → 404: nunca se arma la
 * ficha con el mock (09-10: tiendas inventadas con «en vivo» falso).
 */
async function resolveLive(liveId: string) {
  try {
    const result = await LiveSessionsDB.getById(null, liveId);
    if (result) {
      return toUiLive(result.session as unknown as Record<string, unknown>, result.products, result.messages);
    }
  } catch (err) {
    logger.warn("[en-vivo] getById failed", { liveId, error: String(err).slice(0, 200) });
  }
  return null;
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
