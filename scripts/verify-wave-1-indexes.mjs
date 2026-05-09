import { lookup } from "node:dns/promises";
import pg from "pg";

const u = new URL(process.env.DATABASE_URL);
u.port = "5432";
const ip = (await lookup(u.hostname, { family: 4 })).address;
const c = new pg.Client({
  host: ip, port: 5432, database: u.pathname.slice(1),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  ssl: { rejectUnauthorized: false, servername: u.hostname },
});
await c.connect();
const r = await c.query(`
  SELECT indexname, tablename FROM pg_indexes
  WHERE indexname LIKE 'idx_%' AND indexname IN (
    'idx_order_tenant_created','idx_order_tenant_status','idx_orderitem_product',
    'idx_product_tenant_active','idx_product_tenant_category','idx_activitylog_tenant_entity_created',
    'idx_customer_tenant_phone','idx_loyaltytxn_tenant_customer_created','idx_sale_tenant_created',
    'idx_review_tenant_product_date','idx_settings_tenant','idx_roadmapstatus_item'
  )
  ORDER BY tablename, indexname
`);
console.log(`Indexes wave-1 confirmados: ${r.rowCount}/12`);
for (const row of r.rows) console.log(`  ✓ ${row.tablename.padEnd(20)} ${row.indexname}`);
await c.end();
