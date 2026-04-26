"use client";

import dynamic from "next/dynamic";

const BulejeLandingClient = dynamic(
  () => import("@/components/BulejeLandingClient"),
  {}
);

export default function BulejeLandingClientLoader() {
  return <BulejeLandingClient />;
}
