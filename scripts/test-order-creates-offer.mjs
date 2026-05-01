/**
 * E2E: confirma que crear un order desde el marketplace dispara una
 * DeliveryOffer al partner más cercano.
 *
 * Pasos:
 *  1. Pre-condición: partner online en Pucallpa (seed-partner-online.mjs)
 *  2. POST a /api/marketplace/orders con productos reales
 *  3. Esperar 5s para que el trigger fire-and-forget complete (geocoding + create offer)
 *  4. Query DeliveryOffer table — debe existir 1 offer para el orderId
 *  5. Verificar partner queda con esa offer en su feed (GET /api/delivery/me/offers requeriría sesión, así que vamos a SQL directo)
 */
import pg from "pg";

const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
if (!url) {
  console.log("✗ No DATABASE_URL — corre con: node -r dotenv/config scripts/test-order-creates-offer.mjs dotenv_config_path=.env.local");
  process.exit(1);
}
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();

// 1. Fetch productos reales
console.log("→ Fetching productos reales de Mi Pollo");
const products = await fetch("http://localhost:3000/api/marketplace/catalog?storeSlug=mi-pollo&limit=2")
  .then((r) => r.json())
  .then((d) => d.data || []);
console.log(`  ${products.length} productos:`, products.map((p) => p.name).join(", "));

// 2. CSRF token (header obligatorio en Buleje)
console.log("→ Obteniendo CSRF token");
const csrfRes = await fetch("http://localhost:3000/marketplace");
const csrfMatch = csrfRes.headers.get("set-cookie")?.match(/csrf-token=([^;]+)/);
const csrfToken = csrfMatch?.[1] ?? "";
const cookieHeader = `csrf-token=${csrfToken}`;
console.log(`  csrf: ${csrfToken.slice(0, 16)}...`);

// 3. POST order
console.log("\n→ POST /api/marketplace/orders");
const body = {
  storeSlug: "mi-pollo",
  customerName: "Carlos Pérez Vargas",
  customerPhone: "999111222",
  customerAddress: "Jr. Progreso 245, Pucallpa",
  paymentMethod: "efectivo",
  items: products.map((p) => ({
    storeProductId: p.storeProductId,
    productId: p.productId,
    name: p.name,
    quantity: 1,
    retailPrice: Number(p.price),
    unit: p.unit ?? "uni",
  })),
};
const orderRes = await fetch("http://localhost:3000/api/marketplace/orders", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-csrf-token": csrfToken,
    Cookie: cookieHeader,
  },
  body: JSON.stringify(body),
});
const orderData = await orderRes.json();
console.log(`  status: ${orderRes.status}`);
const orderId = orderData?.data?.orderId;
console.log(`  orderId: ${orderId}`);
if (!orderId) {
  console.log("✗ no orderId. Body:", JSON.stringify(orderData).slice(0, 400));
  await db.end();
  process.exit(1);
}

// 4. Esperar 6s para que el trigger geocodifique + cree la offer
console.log("\n→ Esperando 6s para trigger fire-and-forget (geocoding + match)…");
await new Promise((r) => setTimeout(r, 6000));

// 5. Query DeliveryOffer table
const offers = await db.query(
  `SELECT id, "orderId", "partnerId", status, "distanceKm", "feeOffered", attempt, "expiresAt"
     FROM "DeliveryOffer"
    WHERE "orderId" = $1
    ORDER BY "offeredAt" DESC;`,
  [orderId],
);

console.log(`\n→ Offers encontradas para ${orderId}: ${offers.rowCount}`);
if (offers.rowCount === 0) {
  console.log("✗ FAIL — No se creó DeliveryOffer. El trigger NO funcionó.");
  await db.end();
  process.exit(1);
}

const offer = offers.rows[0];
console.log("✓ ✓ ✓ Offer creada:");
console.log(JSON.stringify(offer, null, 2));

// 6. Verificar partner correcto
const partner = await db.query(
  `SELECT id, name, phone, "isOnline", "currentOrderId" FROM "DeliveryPartner" WHERE id = $1;`,
  [offer.partnerId],
);
console.log("\n→ Partner asignado:");
console.log(JSON.stringify(partner.rows[0], null, 2));

console.log("\n✓ ✓ ✓ FLUJO COMPLETO: order → trigger → offer → partner");
console.log(`   El partner ${partner.rows[0].name} (${partner.rows[0].phone}) recibió la oferta.`);
console.log(`   En la app del repartidor (/delivery-app/oferta/${offer.id}) la verá con countdown 2min.`);

await db.end();
