import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { hash } from 'bcryptjs';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('Set DATABASE_URL'); process.exit(1); }

  const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
  const adapter = new PrismaPg({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false } });
  const p = new PrismaClient({ adapter });
  try {
    const h = await hash('Buleje2026', 10);
    const existing = await p.adminUser.findFirst({ where: { tenantId: 'main', username: 'superadmin' } });
    if (existing) {
      console.log('Admin user already exists:', existing.username, existing.id);
    } else {
      const user = await p.adminUser.create({
        data: { tenantId: 'main', username: 'superadmin', passwordHash: h, role: 'admin', name: 'Super Admin', active: true }
      });
      console.log('Admin user restored:', user.username, user.id);
    }
  } catch (e: unknown) {
    console.log('ERROR:', e instanceof Error ? e.message : String(e));
  } finally {
    await p.$disconnect();
  }
}

main().catch(console.error);
