import "dotenv/config";
import { JuntasDB } from "@/lib/db/juntas.db";

/** Seed de verificación visual: crea una junta demo (tenant `main`). Expira
 * sola en 24h vía el cron. Uso: npx tsx scripts/seed-junta-demo.ts */
async function main() {
  const j = await JuntasDB.create("main", {
    initiatorId: "999000111",
    zoneLabel: "Jr. Demo, Mz. F",
    productLabel: "Balón de gas 10kg",
    targetMembers: 6,
    windowEnd: new Date(Date.now() + 24 * 3600 * 1000),
  });
  console.log("SEEDED_CODE=" + j.code);
  console.log("URL=http://localhost:3000/junta/" + j.code);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
