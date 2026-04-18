"use client";

import dynamic from "next/dynamic";

const RecentPurchases = dynamic(() => import("@/components/store/RecentPurchases"), { ssr: false });
const PostDeliverySurveyTrigger = dynamic(() => import("@/components/store/PostDeliverySurveyTrigger"), { ssr: false });
const WhatsAppFloatingButton = dynamic(() => import("@/components/store/WhatsAppFloatingButton"), { ssr: false });
const QuickReorderButton = dynamic(() => import("@/components/store/QuickReorderButton"), { ssr: false });
const SocioPromoFlotante = dynamic(
  () => import("@/components/ui-system/widgets/SocioPromoFlotante").then((m) => m.SocioPromoFlotante),
  { ssr: false },
);

export default function StoreFloatingWidgets() {
  return (
    <>
      <RecentPurchases />
      <PostDeliverySurveyTrigger />
      <WhatsAppFloatingButton />
      <QuickReorderButton />
      <SocioPromoFlotante />
    </>
  );
}
