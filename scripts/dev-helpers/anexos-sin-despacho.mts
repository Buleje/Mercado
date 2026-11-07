/**
 * anexos-sin-despacho.mts (04-11-2026) — las guías que sólo viven como Anexo 04
 * guardado y todavía no están en el libro, en UNA tabla: para decidir guía por
 * guía antes de abrir «Guías sin registrar» (ADR-446).
 *
 * Por qué: en la noche del 04-11 se midió a mano (15 guías, 160,186 m³; con la
 * producción de hoy alcanzan 3) y el architect pidió no volver a armarlo cada
 * vez. Usa la MISMA simulación que la pantalla (`simularTanda` = sin escribir).
 *
 * Uso:   scripts/dev-helpers/tsx-servidor.sh scripts/dev-helpers/anexos-sin-despacho.mts <tenantId> [--json <archivo>]
 *        (--json escribe a un ARCHIVO: el logger del panel también imprime en la salida)
 * Blas:  scripts/dev-helpers/tsx-servidor.sh scripts/dev-helpers/anexos-sin-despacho.mts cmpxiv6p4000bohvzwl6bnfpv
 *
 * Solo lectura: nunca registra, marca ni contesta dudas.
 */
import { writeFileSync } from "node:fs";
import { ForestCtpGuiaDesdeAnexoDB } from "@/lib/db/forest-ctp-guia-desde-anexo.db";

const [tenantId, flag, salida] = process.argv.slice(2);
if (!tenantId) {
  console.error("Uso: tsx-servidor.sh scripts/dev-helpers/anexos-sin-despacho.mts <tenantId> [--json]");
  process.exit(2);
}

const m3 = (n: number) => n.toFixed(3);
const t0 = Date.now();
const r = await ForestCtpGuiaDesdeAnexoDB.pendientes(tenantId);

if (flag === "--json") {
  if (!salida) throw new Error("--json pide la ruta del archivo de salida");
  writeFileSync(salida, JSON.stringify(r, null, 2));
  console.log(`JSON en ${salida}`);
  process.exit(0);
}

/* Orden de la etiqueta: un bloqueo frena el alta; si no hay bloqueos pero sale
   madera sin corrida, igual falta que el dueño lo confirme (decisión 8). */
const estado = (g: (typeof r.tanda.guias)[number]) =>
  !g.registrable ? "bloqueada" : g.sinOrigenPorConfirmar ? "confirmar sin origen" : "sí";

const { guias, resumen } = r.tanda;
console.log(
  `\nGuías sin registrar: ${resumen.guias} · ${m3(resumen.totalM3)} m³ · alcanza la producción: ${m3(resumen.atribuidoM3)} m³ · ` +
    `sin origen: ${m3(resumen.sinAtribuirM3)} m³ · se registrarían ya: ${resumen.registrables}\n`,
);
console.table(
  guias.map((g) => ({
    GTF: g.gtf,
    anexo: g.numero,
    fecha: g.fecha.slice(0, 10),
    "m³": m3(g.totalM3),
    "con origen": m3(g.atribuidoM3),
    "sin origen": m3(g.sinOrigenM3),
    "% cubierto": g.totalM3 > 0 ? `${Math.round((g.atribuidoM3 / g.totalM3) * 100)} %` : "—",
    "¿se registra?": estado(g),
    "por qué": [...new Set(g.bloqueos.map((b) => b.codigo))].join(", ") || "—",
  })),
);

if (r.dudas.length) {
  console.log("\nPapeles en duda (esas guías no se registran hasta contestar):");
  for (const d of r.dudas) console.log(`  · ${d.gtfs.join(" / ")}: ${d.pregunta}${d.porQue ? ` (sugerido: ${d.porQue})` : ""}`);
}
if (r.huecos.length) {
  console.log("\nNúmeros que faltan en el talonario:");
  for (const h of r.huecos) console.log(`  · ${h.numero} (entre ${h.entre[0]} y ${h.entre[1]})${h.respuesta ? ` → ${h.respuesta}` : ""}`);
}
if (r.reemplazados.length) {
  console.log("\nAnexos reemplazados (no se borran):");
  for (const a of r.reemplazados) console.log(`  · ${a.gtf} anexo ${a.numero} → vale ${a.porNumero}${a.porGtf ? ` (guía ${a.porGtf})` : ""}`);
}
if (r.sinGuia.length) console.log(`\nAnexos sin número de guía: ${r.sinGuia.map((s) => `${s.numero} (${s.fecha.slice(0, 10)})`).join(", ")}`);
if (r.tanda.faltaProduccion.length) {
  console.log("\nProducción que el libro no tiene (para registrar todas):");
  console.table(r.tanda.faltaProduccion);
}
console.log(`\n(leído en ${((Date.now() - t0) / 1000).toFixed(1)} s · nada se escribió)`);
process.exit(0);
