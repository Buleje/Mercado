/**
 * Carga en Musa (tenant `cmv1v4b8e0002rlvz6ibrullo`) las reglas de «Trae a una
 * amiga» del manual v5 (ADR-510, Brandon 2026-10-20):
 *   «S/ 10 para la que recomienda Y S/ 10 para la recomendada, con compra
 *   mínima de S/ 59» · «los descuentos no se suman».
 * La amiga recibe su cupón después de su primera compra (para la siguiente) y
 * cada cupón vale 60 días.
 *
 * IDEMPOTENTE: compara con lo guardado y sólo escribe si cambia (dos corridas =
 * 0 cambios). Por la clase `ReferralsDB` (nada de prisma acá). No anota a
 * ninguna clienta: eso lo hace el negocio desde Puntos › Más › Trae a una amiga.
 *
 * Uso (desde la raíz del repo):
 *   npx tsx -r ./scripts/musa/_preload.cjs -r dotenv/config \
 *     scripts/musa/cargar-referidas.ts dotenv_config_path=.env.local [--simulacro]
 */
import { ReferralsDB } from "@/lib/db/referrals.db";
import { ConfigReferidasSchema, resumenDelPrograma, type ConfigReferidas } from "@/lib/referidas/reglas";

const MUSA = "cmv1v4b8e0002rlvz6ibrullo";
const simulacro = process.argv.includes("--simulacro");

const DESEADO: ConfigReferidas = {
  activo: true,
  premioQuienRefiere: { tipo: "monto", valor: 10 },
  premioAmiga: { tipo: "monto", valor: 10 },
  amigaRecibe: "tras_primera_compra",
  compraMinima: 59,
  acumulable: false,
  vigenciaDias: 60,
};

/** Comparación estable (el orden de las claves del JSON guardado puede variar). */
const firma = (c: ConfigReferidas) =>
  JSON.stringify([c.activo, c.premioQuienRefiere.tipo, c.premioQuienRefiere.valor, c.premioAmiga.tipo, c.premioAmiga.valor, c.amigaRecibe, c.compraMinima, c.acumulable, c.vigenciaDias]);

async function main() {
  const valida = ConfigReferidasSchema.safeParse(DESEADO);
  if (!valida.success) throw new Error(`Config inválida: ${valida.error.issues[0]?.message}`);

  const antes = await ReferralsDB.configFresca(MUSA);
  const cambia = !antes.guardada || firma(antes.config) !== firma(valida.data);
  console.log(`Antes:   ${antes.guardada ? "guardada" : "SIN GUARDAR (valen los puntos de siempre)"} · ${resumenDelPrograma(antes.config)}`);
  console.log(`Deseado: ${resumenDelPrograma(valida.data)}`);

  if (!cambia) console.log("Sin cambios: ya estaba cargado.");
  else if (simulacro) console.log("SIMULACRO: se escribiría la config de arriba.");
  else {
    try {
      await ReferralsDB.guardarConfig(MUSA, valida.data);
    } catch (e) {
      // Fuera de Next, `revalidateTag` tira DESPUÉS de escribir: se comprueba leyendo.
      console.warn(`(aviso fuera de Next: ${e instanceof Error ? e.message : String(e)})`);
    }
    const despues = await ReferralsDB.configFresca(MUSA);
    if (!despues.guardada || firma(despues.config) !== firma(valida.data)) throw new Error("La config no quedó guardada.");
    console.log("Guardado y releído: OK.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
