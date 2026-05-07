// Reproduce la query del endpoint /api/delivery/assignments para diagnosticar 503
import pg from "pg";

const { Client } = pg;

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!url) throw new Error("No DATABASE_URL");

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log("=== Tenants disponibles ===");
  const { rows: tenants } = await client.query(
    `select id, slug, name from "Tenant" order by "createdAt" asc limit 10`,
  );
  console.table(tenants);

  console.log("\n=== Schema DeliveryAssignment ===");
  const { rows: cols } = await client.query(
    `select column_name, data_type, is_nullable
     from information_schema.columns
     where table_name = 'DeliveryAssignment' order by ordinal_position`,
  );
  console.table(cols);

  console.log("\n=== Conteo de assignments por tenant ===");
  const { rows: counts } = await client.query(
    `select "tenantId", count(*)::int as total
     from "DeliveryAssignment"
     group by "tenantId" order by total desc`,
  );
  console.table(counts);

  if (counts.length === 0) {
    console.log("⚠️  NO hay assignments. La query GET deberia devolver [] sin error.");
  }

  // Reproduce la query completa que falla
  const target = tenants.find((t) => t.slug === "main") ?? tenants[0];
  console.log("\n=== Query que ejecuta el endpoint para tenantId =", target.id, "===");

  try {
    const { rows: assignments } = await client.query(
      `select a.*,
              o.id as "order_id", o."customerName" as "order_customerName", o.total as "order_total",
              p.id as "partner_id", p.name as "partner_name", p.phone as "partner_phone"
       from "DeliveryAssignment" a
       left join "Order" o on o.id = a."orderId"
       left join "DeliveryPartner" p on p.id = a."partnerId"
       where a."tenantId" = $1
       order by a."createdAt" desc`,
      [target.id],
    );
    console.log(`✅ Query SQL OK — devolvió ${assignments.length} filas`);
    if (assignments.length > 0) {
      console.log("Primera fila:", assignments[0]);
    }
  } catch (err) {
    console.error("❌ ERROR en query SQL:", err.message);
  }

  // Reproducir Prisma include exacto (usa el cliente custom del proyecto)
  console.log("\n=== Test Prisma findMany con include ===");
  const { PrismaClient } = await import("../lib/generated/prisma/client/index.js");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const adapter = new PrismaPg({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const prisma = new PrismaClient({ adapter });
  try {
    const result = await prisma.deliveryAssignment.findMany({
      where: { tenantId: target.id },
      include: {
        order: { select: { id: true, customerName: true, total: true } },
        partner: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    console.log(`✅ Prisma OK — devolvió ${result.length} filas`);
    if (result.length > 0) {
      console.log("Primera fila:", JSON.stringify(result[0], null, 2));
    }
  } catch (err) {
    console.error("❌ ERROR Prisma:", err.message);
    console.error("Stack:", err.stack);
  }

  await client.end();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
