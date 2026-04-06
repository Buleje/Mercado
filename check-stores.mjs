import 'dotenv/config';
import { PrismaClient } from './lib/generated/prisma/client.ts';

const p = new PrismaClient();
try {
  const stores = await p.store.findMany({
    select: { id: true, slug: true, name: true, tenantId: true, isPublished: true, commission: true },
  });
  console.log('Stores:', JSON.stringify(stores, null, 2));

  const tenants = await p.tenant.findMany({
    select: { id: true, name: true, slug: true, active: true },
  });
  console.log('Tenants:', JSON.stringify(tenants, null, 2));

  const productCount = await p.product.count({ where: { tenantId: 'main', deletedAt: null } });
  console.log('Products (main tenant):', productCount);
} catch (e) {
  console.log('ERROR:', e.message);
} finally {
  await p.$disconnect();
}
