"use client";

import { useState } from "react";
import type { GiftCardDesign } from "@/lib/mocks/gift-cards.mock";
import GiftCardsHero from "./GiftCardsHero";
import DenominationGrid from "./DenominationGrid";
import DesignGallery from "./DesignGallery";
import HowItWorks from "./HowItWorks";
import GiftCardsFAQ from "./GiftCardsFAQ";
import GiftCardsTestimonials from "./GiftCardsTestimonials";
import Breadcrumbs from "@/components/ui-system/Breadcrumbs";
import RelatedFeatures from "@/components/ui-system/RelatedFeatures";
import { relatedFor } from "@/lib/navigation/feature-registry";

export default function GiftCardsClient() {
  const [selectedDesign, setSelectedDesign] = useState<GiftCardDesign>("general");

  return (
    <main className="min-h-screen bg-white dark:bg-gray-900">
      <div className="border-b border-[var(--rule-muted)] bg-white dark:bg-gray-950">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
          <Breadcrumbs
            items={[
              { label: "Marketplace", href: "/marketplace" },
              { label: "Gift Cards" },
            ]}
          />
        </div>
      </div>

      <GiftCardsHero />
      <DenominationGrid selectedDesign={selectedDesign} />
      <DesignGallery
        initialDesign={selectedDesign}
        onSelect={(d) => setSelectedDesign(d)}
      />
      <HowItWorks />
      <GiftCardsFAQ />
      <GiftCardsTestimonials />

      <RelatedFeatures features={relatedFor("gift-cards")} />
    </main>
  );
}
