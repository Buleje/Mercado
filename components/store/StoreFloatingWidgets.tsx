"use client";

import dynamic from "next/dynamic";

const RecentPurchases = dynamic(() => import("@/components/store/RecentPurchases"), { ssr: false });
const PostDeliverySurveyTrigger = dynamic(() => import("@/components/store/PostDeliverySurveyTrigger"), { ssr: false });

export default function StoreFloatingWidgets() {
  return (
    <>
      <RecentPurchases />
      <PostDeliverySurveyTrigger />
    </>
  );
}
