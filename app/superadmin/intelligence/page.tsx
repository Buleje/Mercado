import "server-only";
import type { Metadata } from "next";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import IntelligenceClient from "./IntelligenceClient";

export const metadata: Metadata = {
  title: "Inteligencia de Barrio — Buleje Platform",
  robots: "noindex, nofollow",
};

export default async function IntelligencePage() {
  await requirePlatformPage();

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* El client renderiza header + secciones con datos del endpoint */}
      <IntelligenceClient />
    </div>
  );
}
