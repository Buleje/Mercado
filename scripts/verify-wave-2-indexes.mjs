import { lookup } from "node:dns/promises";
import pg from "pg";

const u = new URL(process.env.DATABASE_URL);
u.port = "5432";
const ip = (await lookup(u.hostname, { family: 4 })).address;
const c = new pg.Client({
  host: ip,
  port: 5432,
  database: u.pathname.slice(1),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  ssl: { rejectUnauthorized: false, servername: u.hostname },
});
await c.connect();
const r = await c.query(`
  SELECT indexname, tablename FROM pg_indexes
  WHERE indexname LIKE 'idx_%' AND indexname IN (
    'idx_waconv_tenant_expires_phone','idx_waconv_tenant_state_lastmsg',
    'idx_orderitem_product_order','idx_customernotif_phone_read_created',
    'idx_customernotif_tenant_read_created','idx_notification_tenant_severity_read',
    'idx_stripequeue_pending_retry','idx_promotion_tenant_active_expires',
    'idx_coupon_tenant_active_expires','idx_review_tenant_status_date',
    'idx_saleitem_product'
  )
  ORDER BY tablename
`);
console.log(`Wave-2 confirmados: ${r.rowCount}/11`);
for (const row of r.rows) {
  console.log(`  ${row.tablename.padEnd(25)} ${row.indexname}`);
}
await c.end();
