/**
 * qa-limpiar-censo — borra los árboles de censo creados para probar.
 *
 * Sólo toca códigos con el prefijo que se le pase (por defecto los `QA-`), y
 * enumera lo que queda: una limpieza que no muestra el estado final no es una
 * limpieza, es una esperanza.
 *
 * Uso: npx tsx scripts/qa-limpiar-censo.ts <planId> [prefijo…]
 */
/* El cliente del proyecto: Prisma 7 exige el adapter y la URL del pooler, que
   `lib/prisma` ya resuelve. Armar uno a mano acá lo duplicaría mal. */
import { prisma } from "@/lib/prisma";

async function main() {
  const [planId, ...prefijos] = process.argv.slice(2);
  if (!planId) {
    console.error("Falta el planId. Uso: npx tsx scripts/qa-limpiar-censo.ts <planId> [prefijo…]");
    process.exit(1);
  }
  const pre = prefijos.length > 0 ? prefijos : ["QA-BULK-", "QA-FAST-", "QA-T-"];
  const where = {
    tenantId: "main",
    planId,
    OR: pre.map((p) => ({ treeCode: { startsWith: p } })),
  };

  const antes = await prisma.forestCensusTree.count({ where: { tenantId: "main", planId, deletedAt: null } });
  const r = await prisma.forestCensusTree.deleteMany({ where });
  const quedan = await prisma.forestCensusTree.findMany({
    where: { tenantId: "main", planId, deletedAt: null },
    select: { treeCode: true, speciesCommon: true, estado: true },
    orderBy: { treeCode: "asc" },
  });
  console.log(JSON.stringify({ antes, borrados: r.count, quedan }, null, 2));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
