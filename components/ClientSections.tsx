"use client";

import dynamic from "next/dynamic";

const AnnouncementBar = dynamic(() => import("@/components/AnnouncementBar"), { ssr: false });
const StatsCounter = dynamic(() => import("@/components/StatsCounter"), { ssr: false });
const Benefits = dynamic(() => import("@/components/Benefits"), { ssr: false });
const CTABanner = dynamic(() => import("@/components/CTABanner"), { ssr: false });
const RecommendedProducts = dynamic(() => import("@/components/RecommendedProducts"), { ssr: false });

export { AnnouncementBar, StatsCounter, Benefits, CTABanner, RecommendedProducts };
