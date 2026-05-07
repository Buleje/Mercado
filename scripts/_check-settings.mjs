import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const p = new PrismaClient();
const rows = await p.settings.findMany({ select: { id: true, tenantId: true, updatedAt: true, storeThemeJson: true }, orderBy: { updatedAt: 'desc' }, take: 20 });
for (const r of rows) {
  let theme = null;
  try { theme = JSON.parse(r.storeThemeJson || 'null'); } catch {}
  console.log(`id=${r.id} tenantId=${r.tenantId} primary=${theme?.primaryColor} secondary=${theme?.secondaryColor} accent=${theme?.accentColor} dark=${theme?.darkModeDefault} name="${theme?.storeName}" updated=${r.updatedAt?.toISOString?.()}`);
}
await p.$disconnect();
