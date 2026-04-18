import type { Metadata } from "next";
import { CuponesDB } from "@/lib/db/cupones.db";
import { getTenantId } from "@/lib/tenant";
import CuponesClient from "@/components/customer/cupones/CuponesClient";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "Mis cupones — Buleje",
  description:
    "Tus cupones y descuentos del marketplace Buleje. Aplica nuevos codigos y revisa tu historial.",
  robots: { index: false, follow: false },
};

export default async function CuponesPage() {
  const tenantId = await getTenantId();
  // TODO(agent-E): leer userId del session. Mock hasta integrar auth real.
  const userId = "user_me";

  const [available, history] = await Promise.all([
    CuponesDB.listAvailableForUser(tenantId, userId),
    CuponesDB.listUsedForUser(tenantId, userId),
  ]);

  return (
    <>
      <Header />
      <CuponesClient available={available} history={history} />
    </>
  );
}
