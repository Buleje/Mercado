import "server-only";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { SUPERADMIN_PAGE, SUPERADMIN_CONTENT } from "@/lib/superadmin-layout";
import { RescueQueue } from "./RescueQueue";
import { RetencionTabs } from "@/components/superadmin/_shared/RetencionTabs";

export const metadata = {
  title: "Cola de rescate — Buleje",
  robots: "noindex, nofollow",
};

/**
 * /superadmin/rescue — Cola de rescate (Brandon 2026-06-19, idea #3). Negocios a
 * punto de irse, priorizados por urgencia × valor, con acciones de retención.
 * El hero (AdminTabShell) lo renderiza RescueQueue (client, necesita el icon prop).
 */
export default async function RescuePage() {
  await requirePlatformPage();

  return (
    <div className={SUPERADMIN_PAGE}>
      <RetencionTabs />
      <div className={SUPERADMIN_CONTENT}>
        <RescueQueue />
      </div>
    </div>
  );
}
