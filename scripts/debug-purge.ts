import { PrismaClient } from '../lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const url = process.env.DATABASE_URL!;
  const isLocal = url.includes('localhost');
  const adapter = new PrismaPg({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false } });
  const p = new PrismaClient({ adapter });

  const count = await p.product.count();
  console.log('Product count BEFORE:', count);

  const deleted = await p.$executeRawUnsafe('DELETE FROM "Product"');
  console.log('Deleted products (raw):', deleted);

  const count2 = await p.product.count();
  console.log('Product count AFTER:', count2);

  await p.$disconnect();
}

main().catch(console.error);
