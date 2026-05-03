import pg from "pg";
import bcrypt from "bcryptjs";

const PASS = "qaqa1234";  // simple, sin caps ni guiones

const { Client } = pg;
const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const hash = await bcrypt.hash(PASS, 10);
const result = await client.query(
  `update "AdminUser" set "passwordHash"=$1, active=true, role='admin'
   where "tenantId"='cmoevpwfk0000l4vzwq6revm5' and username='qaadmin'
   returning id, username`,
  [hash],
);

console.log(`Updated: ${result.rowCount} row(s)`);
console.log(`
=====================
LOGIN — MI POLLO (RESET)
=====================
  URL:      http://localhost:3000/t/mi-pollo/admin/login
  username: qaadmin
  password: ${PASS}
=====================

PASOS:
1. Borrá cookies del browser para localhost:3000
2. Pegá la URL de arriba
3. Esperá 1 segundo (que cargue la cookie active-tenant)
4. Username: qaadmin
5. Password: ${PASS}
`);

await client.end();
