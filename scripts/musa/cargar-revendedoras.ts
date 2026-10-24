/**
 * Carga en Musa (tenant `cmv1v4b8e0002rlvz6ibrullo`) las reglas de revendedoras
 * del manual v5 (ADR-507, Brandon 2026-10-20):
 *   §11 20 % sobre catálogo; 25 % si compra más de S/ 600 en el mes; pedido
 *       mínimo S/ 150; envío gratis desde S/ 300; sin crédito los 3 primeros
 *       meses; meta de 8 activas al mes 6.
 *   §10 ninguna venta deja menos de 30 % de ganancia; los descuentos no se
 *       suman (kits y ofertas van a su precio).
 *
 * IDEMPOTENTE: compara con lo guardado y sólo escribe si cambia (dos corridas =
 * 0 cambios). Por la clase `RevendedorasDB` (nada de prisma acá). No marca a
 * ninguna clienta: eso lo hace el negocio desde Clientes › Revendedoras.
 * Al final lista los precios por nivel para revisar el tope de ganancia.
 *
 * Uso (desde la raíz del repo):
 *   npx tsx -r ./scripts/musa/_preload.cjs -r dotenv/config \
 *     scripts/musa/cargar-revendedoras.ts dotenv_config_path=.env.local [--simulacro]
 */
import { RevendedorasDB } from "@/lib/db/revendedoras.db";
import { ConfigRevendedorasSchema, preciosPorNivel, type ConfigRevendedoras } from "@/lib/revendedoras/reglas";

const MUSA = "cmv1v4b8e0002rlvz6ibrullo";
const simulacro = process.argv.includes("--simulacro");

const DESEADO: ConfigRevendedoras = {
  activo: true,
  niveles: [
    { desde: 0, descuento: 20 },
    { desde: 600, descuento: 25 },
  ],
  pedidoMinimo: 150,
  envioGratisDesde: 300,
  margenMinimo: 30,
  categoriasSinDescuento: ["Kits y ofertas"],
  mesesSinCredito: 3,
  metaActivas: 8,
};

/** Comparación estable (el orden de las claves del JSON guardado puede variar). */
const firma = (c: ConfigRevendedoras) =>
  JSON.stringify({ ...c, niveles: c.niveles.map((n) => [n.desde, n.descuento]), categoriasSinDescuento: [...c.categoriasSinDescuento].sort() });

async function main() {
  const valida = ConfigRevendedorasSchema.safeParse(DESEADO);
  if (!valida.success) throw new Error(`Config inválida: ${valida.error.issues[0]?.message}`);

  const antes = await RevendedorasDB.configFresca(MUSA);
  const cambia = firma(antes) !== firma(valida.data);
  console.log(`Antes:   ${JSON.stringify(antes)}`);
  console.log(`Deseado: ${JSON.stringify(valida.data)}`);

  if (!cambia) console.log("Sin cambios: ya estaba cargado.");
  else if (simulacro) console.log("SIMULACRO: se escribiría la config de arriba.");
  else {
    try {
      await RevendedorasDB.guardarConfig(MUSA, valida.data);
    } catch (e) {
      // Fuera de Next, `revalidateTag` tira DESPUÉS de escribir: se comprueba leyendo.
      console.warn(`(aviso fuera de Next: ${e instanceof Error ? e.message : String(e)})`);
    }
    const despues = await RevendedorasDB.configFresca(MUSA);
    if (firma(despues) !== firma(valida.data)) throw new Error("La config no quedó guardada.");
    console.log("Guardado y releído: OK.");
  }

  const productos = await RevendedorasDB.productos(MUSA);
  const lista = preciosPorNivel(valida.data, productos);
  console.log(`\nPrecios por nivel (${lista.length} productos):`);
  for (const p of lista) {
    const niveles = p.porNivel.map((x) => `${x.precio.toFixed(2)}${x.motivo ? ` [${x.motivo}]` : ""}`).join(" | ");
    console.log(`  ${(p.codigo ?? "").padEnd(6)} ${p.nombre.slice(0, 38).padEnd(38)} ${p.precioCatalogo.toFixed(2).padStart(7)} → ${niveles}`);
  }
  const topados = lista.filter((p) => p.porNivel.some((x) => x.motivo === "margen" || x.motivo === "catalogo-bajo-margen")).length;
  const sinCosto = lista.filter((p) => p.costo == null).length;
  console.log(`\nTopados por la ganancia mínima: ${topados} · sin costo: ${sinCosto}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
