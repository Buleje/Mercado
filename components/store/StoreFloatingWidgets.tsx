"use client";

import dynamic from "next/dynamic";

const WhatsAppFloat = dynamic(() => import("@/components/store/WhatsAppFloat"), { ssr: false });
const RecentPurchases = dynamic(() => import("@/components/store/RecentPurchases"), { ssr: false });
const StoreChatbot = dynamic(() => import("@/components/store/StoreChatbot"), { ssr: false });

export default function StoreFloatingWidgets() {
  return (
    <>
      <WhatsAppFloat />
      <RecentPurchases />
      <StoreChatbot />
    </>
  );
}
