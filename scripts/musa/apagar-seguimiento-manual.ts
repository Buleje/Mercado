/**
 * Musa (20-10): «Seguimiento de clientas» se cargó como actividad manual de la
 * agenda antes de que existiera la fuente automática (ADR-508: a quién escribir
 * a los 3, 15 y 30 días). Con la fuente, la manual repite: se apaga (no se borra).
 * Uso: npx tsx -r ./scripts/musa/_preload.cjs -r dotenv/config scripts/musa/apagar-seguimiento-manual.ts dotenv_config_path=.env.local [--simulacro]
 */
import { AgendaDB } from "@/lib/db/agenda.db";

const TENANT = "cmv1v4b8e0002rlvz6ibrullo";
const SIMULACRO = process.argv.includes("--simulacro");

async function main() {
  const todas = await AgendaDB.listarActividades(TENANT, "admin");
  const manuales = todas.filter((a) => a.activo && a.regla === "manual" && /seguimiento/i.test(a.nombre));
  console.log(`Actividades manuales de seguimiento prendidas: ${manuales.length}`);
  for (const a of manuales) {
    console.log(`  ${SIMULACRO ? "[simulacro] " : ""}apagar «${a.nombre}» (${a.id})`);
    if (!SIMULACRO) {
      const r = await AgendaDB.editarActividad(TENANT, a.id, { activo: false, version: a.version }, "claude-20-10");
      if (!r.ok) console.log("   no se pudo:", JSON.stringify(r));
    }
  }
  process.exit(0);
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
