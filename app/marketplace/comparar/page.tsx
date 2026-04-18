import type { Metadata } from "next";
import { Suspense } from "react";
import CompareClient from "@/components/marketplace/comparar/CompareClient";
import CompareLoading from "./loading";

export const metadata: Metadata = {
  title: "Comparar productos",
  description:
    "Compara hasta 4 productos del marketplace Buleje lado a lado. Decide mejor con precio, stock, marca y tienda en una sola vista.",
  robots: { index: false, follow: true },
};

export default function ComparePage() {
  return (
    <Suspense fallback={<CompareLoading />}>
      <CompareClient />
    </Suspense>
  );
}
