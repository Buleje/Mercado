"use client";

import dynamic from "next/dynamic";

const ScrollProgress       = dynamic(() => import("@/components/ui/ScrollProgress"),     { ssr: false });
const LiveActivityTicker   = dynamic(() => import("@/components/ui/LiveActivityTicker"), { ssr: false });
const BetaFeedbackWidget   = dynamic(() => import("@/components/BetaFeedbackWidget"),    { ssr: false });

export default function ClientEffects() {
  return (
    <>
      <ScrollProgress />
      <LiveActivityTicker />
      <BetaFeedbackWidget />
    </>
  );
}
