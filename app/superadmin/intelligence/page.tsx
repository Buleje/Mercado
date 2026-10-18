import "server-only";
import type { Metadata } from "next";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import IntelligenceClient from "./IntelligenceClient";
import { SuperAdminModuleTabs, ANALYTICS_TABS } from "@/components/superadmin/_shared/ModuleTabs";
import { PestanasDelModulo } from "@/components/admin/shared/cabecera-compacta";

export const metadata: Metadata = {
  title: "Inteligencia de Barrio — Buleje Platform",
  robots: "noindex, nofollow",
};

export default async function IntelligencePage() {
  await requirePlatformPage();

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* El client renderiza la cabecera (con estas pestañas al lado) + secciones */}
      <PestanasDelModulo pestanas={<SuperAdminModuleTabs enLinea tabs={ANALYTICS_TABS} />}>
        <IntelligenceClient />
      </PestanasDelModulo>
    </div>
  );
}
