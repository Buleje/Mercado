"use client";

import dynamic from "next/dynamic";

const AnnouncementBar = dynamic(() => import("@/components/AnnouncementBar"), {});
const StatsCounter = dynamic(() => import("@/components/StatsCounter"), {});
const Benefits = dynamic(() => import("@/components/Benefits"), {});
const CTABanner = dynamic(() => import("@/components/CTABanner"), {});
const RecommendedProducts = dynamic(() => import("@/components/RecommendedProducts"), {});

export { AnnouncementBar, StatsCounter, Benefits, CTABanner, RecommendedProducts };
