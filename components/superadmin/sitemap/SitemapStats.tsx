"use client";

/**
 * SitemapStats — 4 stat cards del sitemap: Total, Live, Beta/WIP, Legacy.
 *
 * Usa StatCard del DS canónico con emphasis neutral (sin colores saturados).
 */

import { StatCard } from "@buleje/design-system";
import {
  Map,
  CheckCircle2,
  Sparkles,
  Archive,
} from "@buleje/design-system/icons";

interface Props {
  stats: {
    total: number;
    live: number;
    beta: number;
    wip: number;
    mock: number;
    legacy: number;
    categories: number;
  };
}

export default function SitemapStats({ stats }: Props) {
  const wipTotal = stats.wip + stats.mock + stats.beta;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
      <StatCard
        label="Total rutas"
        value={stats.total}
        icon={Map}
        subValue={`${stats.categories} categorías`}
      />
      <StatCard
        label="Live"
        value={stats.live}
        icon={CheckCircle2}
        subValue="En producción"
      />
      <StatCard
        label="Beta · WIP"
        value={wipTotal}
        icon={Sparkles}
        subValue={`${stats.beta} beta · ${stats.wip} wip · ${stats.mock} mock`}
      />
      <StatCard
        label="Legacy"
        value={stats.legacy}
        icon={Archive}
        subValue="Alias a migrar"
      />
    </div>
  );
}
