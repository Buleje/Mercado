/**
 * scripts/seed-chat-demo.ts
 *
 * Seed del Bloque D2 del Marketplace — crea 3 hilos con 8 mensajes
 * reales para poder testear manualmente el ChatTab del admin.
 *
 * Uso:
 *   npx tsx scripts/seed-chat-demo.ts
 *   npx tsx scripts/seed-chat-demo.ts --tenant demo
 *
 * Requiere que ya exista al menos 1 Store del tenant destino.
 */

import { ChatThreadsDB, ChatMessagesDB } from "../lib/db/chat.db";
import { prisma } from "../lib/prisma";

const args = process.argv.slice(2);
const tenantArgIdx = args.indexOf("--tenant");
const TENANT_ID = tenantArgIdx >= 0 ? args[tenantArgIdx + 1] ?? "main" : "main";

const DEMO_CUSTOMERS = [
  {
    customerPhone: "+51987111222",
    customerName:  "María López",
    subject:       "Consulta de precio por mayor",
    messages: [
      { senderType: "buyer" as const,  body: "Buenas tardes, ¿tienen arroz costeño por kilo?" },
      { senderType: "seller" as const, body: "¡Hola María! Sí, tenemos. El kilo está a S/ 4.20." },
      { senderType: "buyer" as const,  body: "¿Y si me llevo una bolsa de 50 kg cuánto sale?" },
      { senderType: "seller" as const, body: "Por bolsa completa te lo dejo a S/ 195 (S/ 3.90 el kilo)." },
    ],
  },
  {
    customerPhone: "+51987333444",
    customerName:  "Carlos Ruiz Mendoza",
    subject:       "Pedido para retirar hoy",
    messages: [
      { senderType: "buyer" as const,  body: "Hola, quisiera 2 kg de fideos, 1 aceite 900ml y 5 atunes. ¿Está disponible?" },
      { senderType: "seller" as const, body: "Hola Carlos, todo disponible. Te lo preparo. ¿Retirás ahora o mandamos?" },
      { senderType: "buyer" as const,  body: "Retiro en 30 minutos, gracias" },
    ],
  },
  {
    customerPhone: "+51987555666",
    customerName:  "Ana Flores Vega",
    subject:       null,
    messages: [
      { senderType: "buyer" as const, body: "¿Tienen delivery a Yarinacocha?" },
    ],
  },
];

async function main() {
  console.log(`\n💬 Seed chat demo → tenant="${TENANT_ID}"\n`);

  const store = await prisma.store.findFirst({
    where: { tenantId: TENANT_ID },
    select: { id: true, name: true, slug: true },
  });
  if (!store) {
    console.error(`❌ No hay Store para tenantId="${TENANT_ID}". Corré primero npm run db:seed o registrá una tienda.`);
    process.exit(1);
  }
  console.log(`✅ Store: ${store.name} (${store.slug})`);

  for (const customer of DEMO_CUSTOMERS) {
    console.log(`\n👤 ${customer.customerName}`);

    // Abrir (o recuperar) thread
    const thread = await ChatThreadsDB.openOrGet({
      tenantId:      TENANT_ID,
      storeId:       store.id,
      customerPhone: customer.customerPhone,
      customerName:  customer.customerName,
      subject:       customer.subject ?? undefined,
    });
    console.log(`   ✓ Thread ${thread.id.slice(0, 8)}... (status=${thread.status})`);

    // Enviar los mensajes en orden
    for (const msg of customer.messages) {
      try {
        await ChatMessagesDB.send({
          tenantId:   TENANT_ID,
          threadId:   thread.id,
          senderType: msg.senderType,
          senderId:   msg.senderType === "seller" ? "demo-seller" : undefined,
          senderName: msg.senderType === "seller" ? "Tienda" : customer.customerName,
          body:       msg.body,
        });
        console.log(
          `   ${msg.senderType === "buyer" ? "←" : "→"} ${msg.body.substring(0, 60)}${
            msg.body.length > 60 ? "…" : ""
          }`,
        );
      } catch (err) {
        console.error(`   ⚠️  error enviando: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  console.log("\n✨ Seed completo.\n");
  console.log(`🔗 Abrí el panel admin → tab "Chat Clientes" para ver los 3 hilos.`);
  console.log(`🔗 API admin: GET /api/admin/chat/threads`);
  console.log(`🔗 API pública (con feature flag ON): POST /api/chat/public?action=open\n`);
}

main()
  .catch((err) => {
    console.error("\n❌ Error en seed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
