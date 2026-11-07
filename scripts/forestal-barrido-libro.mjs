/**
 * Los dos cruces que hace un fiscalizador, sobre TODO el libro de una vez.
 *
 *   1. ENTRADA — ¿algún ingreso declara un volumen que no coincide con la lista
 *      de piezas que lo ampara?
 *   2. SALIDA  — ¿algún despacho sacó madera sin corrida de origen atribuida?
 *      Y de esos, ¿cuáles ya tienen GTF emitida? Un documento entregado que
 *      ampara madera sin origen es el que más caro sale.
 *
 * Las dos pantallas lo avisan por fila; esto lo contesta sin pasear por ellas.
 *
 * Va POR LA API y no por Prisma directo, por dos razones: la conexión directa a
 * Supabase no resuelve desde cualquier red (el pooler del dev server sí), y
 * cruzar por el mismo endpoint que usa la tabla prueba de paso que el resumen
 * `trozasCount`/`trozasM3` que devuelve el listado es el correcto.
 *
 * Sólo LEE. Dice qué está mal y por qué camino se arregla; no toca nada.
 *
 *   node scripts/forestal-barrido-libro.mjs [tenantSlug]
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const TENANT = process.argv[2] ?? "main";
const USER = process.env.QA_USER ?? "qaadmin";
const PASS = process.env.QA_PASS ?? "Qa-admin-1234";

/** El redondeo de SERFOR (4 decimales). Mismo número que los dos helpers del
 *  código (`cuadre-trozas.ts` y `atribucion-despacho.ts`). */
const TOLERANCIA_M3 = 0.001;
const PAGINA = 200;

const m3 = (n) => `${Number(n).toFixed(4)} m³`;

const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-tenant-id": TENANT },
  body: JSON.stringify({ username: USER, password: PASS, tenantSlug: TENANT }),
});
if (!login.ok) {
  console.error(`No se pudo entrar como ${USER} (${login.status}). ¿Está levantado el dev server?`);
  process.exit(1);
}
const cookie = (login.headers.getSetCookie?.() ?? [])
  .map((c) => c.split(";")[0])
  .join("; ");

/** Todas las páginas del listado: el endpoint corta en 500 por request. */
async function traerTodos() {
  const todos = [];
  for (let offset = 0; ; offset += PAGINA) {
    const r = await fetch(
      `${BASE}/api/admin/forestal/wood-entries?limit=${PAGINA}&offset=${offset}`,
      { headers: { cookie, "x-tenant-id": TENANT } },
    );
    if (!r.ok) throw new Error(`El listado devolvió ${r.status}`);
    const { entries = [], total = 0 } = await r.json();
    todos.push(...entries);
    if (todos.length >= total || entries.length === 0) return { entries: todos, total };
  }
}

const { entries, total } = await traerTodos();

const conLista = entries.filter((e) => (e.trozasCount ?? 0) > 0);
const sinVolumen = conLista.filter((e) => e.trozasM3 == null);

const descuadrados = conLista
  .filter((e) => e.trozasM3 != null && Number(e.volumeM3) > 0)
  .map((e) => ({ ...e, brecha: Number((Number(e.volumeM3) - Number(e.trozasM3)).toFixed(4)) }))
  .filter((e) => Math.abs(e.brecha) > TOLERANCIA_M3)
  .sort((a, b) => Math.abs(b.brecha) - Math.abs(a.brecha));

console.log(`\nTenant ${TENANT} · ${total} ingresos en el libro`);
console.log(`  · con lista de piezas: ${conLista.length}`);
console.log(`  · con lista pero sin volumen en ninguna pieza: ${sinVolumen.length}`);
console.log(`  · DESCUADRADOS: ${descuadrados.length}\n`);

if (descuadrados.length === 0) {
  console.log("Todos los ingresos con detalle cuadran con sus piezas.");
  process.exit(0);
}

for (const d of descuadrados) {
  const folio = d.libroNro != null ? `N° ${d.libroNro}` : "(sin folio)";
  console.log(
    `${folio.padEnd(10)} ${String(d.gtfNumber).padEnd(22)} ${String(d.entryDate).slice(0, 10)}  ` +
      `${String(d.speciesCommonName).padEnd(14)} declara ${m3(d.volumeM3).padStart(13)} · ` +
      `${String(d.trozasCount).padStart(3)} piezas ${m3(d.trozasM3).padStart(13)} → ` +
      `${d.brecha > 0 ? "faltan" : "sobran"} ${m3(Math.abs(d.brecha))}  [${d.status}]`,
  );
}

// El estado decide el camino: un ingreso pendiente se corrige desde su detalle;
// uno ya validado entró al balance y sólo se arregla anulando con motivo.
const pendientes = descuadrados.filter((d) => d.status === "pendiente");
console.log(
  `\n${pendientes.length} se arreglan desde el detalle del ingreso (están pendientes).`,
);
if (descuadrados.length > pendientes.length) {
  console.log(
    `${descuadrados.length - pendientes.length} ya no son editables: para corregirlos hay que ` +
      `anular con motivo y volver a registrar.`,
  );
}
console.log(
  `\nBrecha total: ${m3(descuadrados.reduce((a, d) => a + Math.abs(d.brecha), 0))} en ${descuadrados.length} ingreso(s).`,
);

await barrerSalidas();

// ── 2. SALIDA: despachos sin origen declarado ────────────────────────────────

/**
 * La atribución parcial es legal (invariante I4) — lo que se reporta no es una
 * infracción, es lo que hay que poder EXPLICAR. Por eso se separan los que ya
 * tienen guía emitida: ahí el documento ya salió a la calle.
 */
async function barrerSalidas() {
  const r = await fetch(`${BASE}/api/admin/forestal/ctp?section=despacho`, {
    headers: { cookie, "x-tenant-id": TENANT },
  });
  if (!r.ok) {
    console.log(`\n── SALIDAS ──\nNo se pudo leer los despachos (${r.status}).`);
    return;
  }
  const { entries = [] } = await r.json();
  const vivos = entries.filter((e) => e.status === "registrado");

  const sinOrigen = vivos
    .filter((e) => Number(e.quantity ?? 0) > 0)
    .map((e) => ({ ...e, falta: Number((Number(e.quantity) - Number(e.atribuidoQty ?? 0)).toFixed(4)) }))
    .filter((e) => e.falta > TOLERANCIA_M3)
    .sort((a, b) => b.falta - a.falta);

  console.log(`\n── SALIDAS ──`);
  console.log(`Despachos vigentes: ${vivos.length}`);
  console.log(`  · con volumen sin corrida de origen: ${sinOrigen.length}\n`);

  if (sinOrigen.length === 0) {
    console.log("Todo lo despachado tiene su corrida de origen declarada.");
    return;
  }

  for (const d of sinOrigen) {
    const nada = Number(d.atribuidoQty ?? 0) <= TOLERANCIA_M3;
    console.log(
      `${String(`L${d.lineNo ?? "?"}`).padEnd(6)} ${String(d.gtfNumber ?? "(sin guía)").padEnd(22)} ` +
        `${String(d.entryDate).slice(0, 10)}  ${String(d.productType ?? "—").padEnd(18)} ` +
        `despacha ${String(Number(d.quantity).toFixed(4)).padStart(11)} ${(d.unit ?? "").padEnd(6)} · ` +
        `atribuido ${String(Number(d.atribuidoQty ?? 0).toFixed(4)).padStart(11)} → ` +
        `${nada ? "SIN ORIGEN" : `faltan ${d.falta.toFixed(4)}`}` +
        `${d.gtfNumber ? "  [guía emitida]" : ""}`,
    );
  }

  const conGuia = sinOrigen.filter((d) => (d.gtfNumber ?? "").trim());
  console.log(
    `\n${conGuia.length} de ${sinOrigen.length} ya tienen GTF emitida: el documento salió amparando ` +
      `madera cuyo origen todavía no está declarado. Son los primeros a completar.`,
  );
  console.log(
    `Volumen sin origen: ${sinOrigen.reduce((a, d) => a + d.falta, 0).toFixed(4)} (unidades mezcladas: ver cada línea).`,
  );
}
