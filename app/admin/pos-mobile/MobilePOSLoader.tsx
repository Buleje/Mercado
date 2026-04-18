"use client";

import dynamic from "next/dynamic";

const MobilePOS = dynamic(() => import("@/components/admin/MobilePOS"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center bg-black" style={{ height: "100dvh" }}>
      <div className="h-8 w-8 border-4 border-[var(--data-success)]/30 border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

export default function MobilePOSLoader() {
  return <MobilePOS />;
}
