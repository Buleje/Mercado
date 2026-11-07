/**
 * Carga en Musa (tenant `cmv1v4b8e0002rlvz6ibrullo`) el Semáforo del negocio y
 * los mensajes del seguimiento a clientas (ADR-508), tal como los escribe el
 * manual v5:
 *   §21 la tabla del semáforo (verde / amarillo / rojo y «si está en rojo…»);
 *   §22 la caja que baja de S/ 400 y la ganancia acumulada al 10 de enero
 *       (S/ 800 es el piso; §7 pide S/ 1.700 para seguir);
 *   §7  el seguimiento de los días 3, 15 y 30.
 * El lanzamiento es el 9 de noviembre: lo de antes (las 7 ventas de prueba)
 * sale marcado como «datos de prueba» y NO se borra.
 *
 * IDEMPOTENTE: compara con lo guardado y sólo escribe si cambia. Antes de
 * escribir deja una copia de `featureFlagsJson` en el tmp del sistema. Escribe
 * SÓLO las claves `semaforo` (por subclave, mezclando por indicador) y
 * `seguimientoClientas`: el resto de los flags no se toca.
 *
 * Uso (desde la raíz del repo):
 *   npx tsx -r ./scripts/musa/_preload.cjs -r dotenv/config \
 *     scripts/musa/cargar-semaforo.ts dotenv_config_path=.env.local [--simulacro]
 */
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SettingsDB } from "@/lib/db/settings.db";
import { SemaforoDB } from "@/lib/db/semaforo.db";
import { configSemaforoSchema, type ConfigSemaforoGuardada } from "@/lib/semaforo/config";
import { configSeguimientoSchema, type ConfigSeguimientoGuardada } from "@/lib/agenda/seguimiento-clientas";

const MUSA = "cmv1v4b8e0002rlvz6ibrullo";
const simulacro = process.argv.includes("--simulacro");

const SEMAFORO: ConfigSemaforoGuardada = {
  lanzamiento: "2026-11-09",
  decision: { fecha: "2027-01-10", verde: 1700, amarillo: 800, rojoSiRecompraMenorA: 10 },
  // Los 10 productos A del manual (código en `barcode`: el sku de Musa está vacío).
  productosA: ["MU001", "MU002", "MU005", "MU007", "MU009", "MU010", "MU011", "MU013", "MU016", "MU020"],
  indicadores: {
    pedidos_semana: {
      verde: 8,
      amarillo: 5,
      acciones: {
        amarillo: "Revisar fotos y anuncios esta semana.",
        rojo: "Revisar anuncios y fotos; más diagnóstico en el salón; activar referidas.",
      },
    },
    ticket_promedio: {
      verde: 100,
      amarillo: 80,
      acciones: { amarillo: "Ofrecer un kit al cerrar cada venta.", rojo: "Ofrecer kits siempre; envío gratis desde S/ 99." },
    },
    ganancia_neta: { verde: 38, amarillo: 30, acciones: { rojo: "Negociar costos, quitar descuentos, revisar precios." } },
    productos_a_agotados: { verde: 0, amarillo: 1, acciones: { rojo: "Recomprar con el sobre; subir el punto de recompra." } },
    vencidos_danados: { verde: 0, amarillo: 2, acciones: { rojo: "Revisar almacén y vencimientos al comprar." } },
    recompra: { verde: 25, amarillo: 15, acciones: { rojo: "Cumplir el seguimiento de los días 3, 15 y 30." } },
    costo_cliente_nuevo: { verde: 15, amarillo: 30, acciones: { rojo: "Cambiar el anuncio; apagar los que no traen mensajes." } },
    dias_stock: { verde: 30, verdeHasta: 45, amarillo: 60, acciones: { rojo: "Comprar menos de los lentos; moverlos en kits." } },
    sin_rotar: { acciones: { rojo: "No se recompra; va a un kit o promoción." } },
    caja: { verde: 400, amarillo: 400, acciones: { rojo: "Parar gastos no urgentes; solo recomprar productos A." } },
    ganancia_acumulada: {
      acciones: {
        verde: "Pasar a la siguiente etapa.",
        amarillo: "Corregir precios, fotos, anuncios y productos sin poner plata nueva.",
        rojo: "Parar compras y reunirse para decidir (criterios de la sección 7).",
      },
    },
  },
};

const SEGUIMIENTO: ConfigSeguimientoGuardada = {
  activo: true,
  dias: [3, 15, 30],
  mensajes: {
    "3": "Hola, {nombre}. ¿Qué tal te fue con tu {producto}? Si te gustó, ¿me mandas una foto o un mensajito? Te dejo 10 % para tu próxima compra.",
    "15": "Hola, {nombre}. Ya van 2 semanas con tu {producto}: ¿cómo sientes tu cabello o tu piel? Mándame una foto y te digo si vamos bien.",
    "30": "Hola, {nombre}. Tu {producto} ya debe estar por acabarse. ¿Te separo otro? Esta semana te lo llevo con tu 10 %.",
  },
};

/** JSON con las claves ordenadas: el orden en que Postgres devuelve un jsonb no es el de la escritura. */
function estable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(estable).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${estable(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/** ¿Lo guardado ya trae todo lo deseado? (lo de más que haya puesto el dueño se respeta). */
function contiene(guardado: unknown, deseado: unknown): boolean {
  if (deseado && typeof deseado === "object" && !Array.isArray(deseado)) {
    if (!guardado || typeof guardado !== "object") return false;
    return Object.entries(deseado as Record<string, unknown>).every(([k, v]) => contiene((guardado as Record<string, unknown>)[k], v));
  }
  return estable(guardado) === estable(deseado);
}

async function main() {
  const sem = configSemaforoSchema.safeParse(SEMAFORO);
  if (!sem.success) throw new Error(`Semáforo inválido: ${sem.error.issues[0]?.path.join(".")} ${sem.error.issues[0]?.message}`);
  const seg = configSeguimientoSchema.safeParse(SEGUIMIENTO);
  if (!seg.success) throw new Error(`Seguimiento inválido: ${seg.error.issues[0]?.path.join(".")} ${seg.error.issues[0]?.message}`);

  const flags = await SettingsDB.getFeatureFlags(MUSA);
  const faltaSemaforo = !contiene(flags.semaforo, sem.data);
  const faltaSeguimiento = !contiene(flags.seguimientoClientas, seg.data);
  console.log(`Semáforo:    ${faltaSemaforo ? "por cargar" : "ya estaba"}`);
  console.log(`Seguimiento: ${faltaSeguimiento ? "por cargar" : "ya estaba"}`);
  if (!faltaSemaforo && !faltaSeguimiento) return console.log("Sin cambios.");
  if (simulacro) return console.log("SIMULACRO: no se escribió nada.");

  const respaldo = join(tmpdir(), `musa-flags-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(respaldo, JSON.stringify(flags, null, 2));
  console.log(`Copia de los flags de antes: ${respaldo}`);

  const avisoFueraDeNext = (e: unknown) => console.warn(`(aviso fuera de Next: ${e instanceof Error ? e.message : String(e)})`);
  if (faltaSemaforo) await SemaforoDB.guardarConfig(MUSA, sem.data).catch(avisoFueraDeNext);
  if (faltaSeguimiento) await SettingsDB.pisarClavesFlags(MUSA, { seguimientoClientas: seg.data }).catch(avisoFueraDeNext);

  // Fuera de Next la caché puede tirar DESPUÉS de escribir: se comprueba releyendo.
  const despues = await SettingsDB.getFeatureFlags(MUSA);
  if (!contiene(despues.semaforo, sem.data)) throw new Error("El semáforo no quedó guardado.");
  if (!contiene(despues.seguimientoClientas, seg.data)) throw new Error("El seguimiento no quedó guardado.");
  const otras = Object.keys(flags).filter((k) => k !== "semaforo" && k !== "seguimientoClientas");
  const tocadas = otras.filter((k) => estable(flags[k]) !== estable(despues[k]));
  console.log(`Guardado y releído: OK. Otras claves de los flags: ${otras.length}, cambiadas: ${tocadas.length}${tocadas.length ? ` (${tocadas.join(", ")})` : ""}.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
