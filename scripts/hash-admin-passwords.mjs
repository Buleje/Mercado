/**
 * One-time script to hash plain-text passwords in admin-users.json.
 * Run once: node scripts/hash-admin-passwords.mjs
 */
import { hash } from "bcryptjs";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, "..", "local-data", "admin-users.json");

const SALT_ROUNDS = 12;

async function main() {
  const raw = await fs.readFile(FILE, "utf-8");
  const users = JSON.parse(raw);
  let changed = 0;

  for (const u of users) {
    // Skip already-hashed passwords
    if (u.password.startsWith("$2")) continue;
    u.password = await hash(u.password, SALT_ROUNDS);
    changed++;
    console.log(`  ✓ Hashed password for "${u.username}"`);
  }

  if (changed === 0) {
    console.log("All passwords are already hashed. Nothing to do.");
    return;
  }

  await fs.writeFile(FILE, JSON.stringify(users, null, 2), "utf-8");
  console.log(`\nDone — ${changed} password(s) hashed in ${FILE}`);
}

main().catch(console.error);
