import type { Metadata } from "next";
import { GiftCardsDB } from "@/lib/db/gift-cards.db";
import { getTenantId } from "@/lib/tenant";
import { buildTenantTitle } from "@/lib/store-metadata";
import GiftCardsClient from "@/components/customer/gift-cards/GiftCardsClient";
import Header from "@/components/Header";

export async function generateMetadata(): Promise<Metadata> {
  return buildTenantTitle(
    "Mis tarjetas de regalo",
    "Tus tarjetas de regalo: recibidas, enviadas y uso. Sin vencimiento.",
    { index: false, follow: false },
  );
}

export default async function CuentaGiftCardsPage() {
  const tenantId = await getTenantId();
  // TODO(agent-E): leer userId del session. Mock hasta integrar auth real.
  const userId = "user_me";

  const [received, sent, usage] = await Promise.all([
    GiftCardsDB.listReceivedForUser(tenantId, userId),
    GiftCardsDB.listSentByUser(tenantId, userId),
    GiftCardsDB.listUsageForUser(tenantId, userId),
  ]);

  return (
    <>
      <Header />
      <GiftCardsClient received={received} sent={sent} usage={usage} />
    </>
  );
}
