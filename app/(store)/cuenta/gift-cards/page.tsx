import type { Metadata } from "next";
import { GiftCardsDB } from "@/lib/db/gift-cards.db";
import { getTenantId } from "@/lib/tenant";
import { getCustomerUserId } from "@/lib/auth/customer-server";
import { buildTenantTitle } from "@/lib/store-metadata";
import GiftCardsClient from "@/components/customer/gift-cards/GiftCardsClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildTenantTitle(
    "Mis tarjetas de regalo",
    "Tus tarjetas de regalo: recibidas, enviadas y uso. Sin vencimiento.",
    { index: false, follow: false },
  );
}

export default async function CuentaGiftCardsPage() {
  const tenantId = await getTenantId();
  const userId = await getCustomerUserId();

  // Sin sesión → sin datos (en vez del mock "user_me" anterior).
  // NOTA: la compra (app/api/gift-cards/purchase) aún no persiste senderUserId
  // desde la sesión — completar wiring de identidad end-to-end para que esto liste datos reales.
  const [received, sent, usage] = userId
    ? await Promise.all([
        GiftCardsDB.listReceivedForUser(tenantId, userId),
        GiftCardsDB.listSentByUser(tenantId, userId),
        GiftCardsDB.listUsageForUser(tenantId, userId),
      ])
    : [[], [], []];

  return (
    <>
      <GiftCardsClient received={received} sent={sent} usage={usage} />
    </>
  );
}
