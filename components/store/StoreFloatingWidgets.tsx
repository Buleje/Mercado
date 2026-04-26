"use client";

import dynamic from "next/dynamic";

const RecentPurchases = dynamic(() => import("@/components/store/RecentPurchases"), {});
const PostDeliverySurveyTrigger = dynamic(() => import("@/components/store/PostDeliverySurveyTrigger"), {});
const WhatsAppFloatingButton = dynamic(() => import("@/components/store/WhatsAppFloatingButton"), {});
const QuickReorderButton = dynamic(() => import("@/components/store/QuickReorderButton"), {});
const SocioPromoFlotante = dynamic(
  () => import("@/components/ui-system/widgets/SocioPromoFlotante").then((m) => m.SocioPromoFlotante),
  {},
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
