import type { Metadata } from "next";
import { CuponesDB } from "@/lib/db/cupones.db";
import { getTenantId } from "@/lib/tenant";
import { getCustomerUserId } from "@/lib/auth/customer-server";
import { buildTenantTitle } from "@/lib/store-metadata";
import CuponesClient from "@/components/customer/cupones/CuponesClient";
import Header from "@/components/Header";

export async function generateMetadata(): Promise<Metadata> {
  return buildTenantTitle(
    "Mis cupones",
    "Tus cupones y descuentos. Aplica nuevos códigos y revisa tu historial.",
    { index: false, follow: false },
  );
}

export default async function CuponesPage() {
  const tenantId = await getTenantId();
  const userId = await getCustomerUserId();

  // Sin sesión → sin datos (en vez del mock "user_me" anterior).
  const [available, history] = userId
    ? await Promise.all([
        CuponesDB.listAvailableForUser(tenantId, userId),
        CuponesDB.listUsedForUser(tenantId, userId),
      ])
    : [[], []];

  return (
    <>
      <Header />
      <CuponesClient available={available} history={history} />
    </>
  );
}
