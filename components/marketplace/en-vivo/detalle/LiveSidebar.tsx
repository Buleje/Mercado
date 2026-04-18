"use client";

import { FeaturedProductsInLive } from "@/components/marketplace/en-vivo/FeaturedProductsInLive";
import { LiveChat } from "@/components/marketplace/en-vivo/LiveChat";
import type { LiveSession } from "@/lib/mocks/lives.mock";

export interface LiveSidebarProps {
  live: LiveSession;
}

export function LiveSidebar({ live }: LiveSidebarProps) {
  return (
    <aside className="space-y-4" aria-label="Panel lateral de la transmisión">
      <FeaturedProductsInLive products={live.products} compact />
      <LiveChat
        initialMessages={live.chat}
        hostName={live.storeName}
        active={live.status === "live"}
      />
    </aside>
  );
}
