/**
 * Seed script — imports admin users from local-data/admin-users.json into
 * the Prisma AdminUser table. Safe to run multiple times (upsert).
 *
 * Usage: npx tsx scripts/seed-admin-users.ts
 */
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "../lib/prisma";

const ROOT = path.join(process.cwd());

async function main() {
  const filePath = path.join(ROOT, "local-data", "admin-users.json");
  const raw = await readFile(filePath, "utf-8");
  const users: Array<{ id: string; username: string; password: string; role: string; name: string }> = JSON.parse(raw);

  for (const u of users) {
    await prisma.adminUser.upsert({
      where: { id: u.id },
      create: {
        id: u.id,
        tenantId: "main",
        username: u.username,
        passwordHash: u.password,
        role: u.role,
        name: u.name ?? u.username,
        active: true,
      },
      update: {
        passwordHash: u.password,
        role: u.role,
        name: u.name ?? u.username,
        active: true,
      },
    });
    console.log(`Seeded: ${u.username} (${u.role})`);
  }

  await prisma.$disconnect();
  console.log("\nAdmin users seeded successfully.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
