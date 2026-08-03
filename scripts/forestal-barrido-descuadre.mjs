/**
 * ¿Qué ingresos del libro CTP no cuadran con su propia lista de piezas?
 *
 * La pantalla lo avisa por fila; esto lo contesta de una para TODO el libro,
 * que es la pregunta antes de una fiscalización: "¿cuántos folios no coinciden
 * con el detalle que los ampara, y por cuánto?".
 *
 * Va POR LA API y no por Prisma directo, por dos razones: la conexión directa a
 * Supabase no resuelve desde cualquier red (el pooler del dev server sí), y
 * cruzar por el mismo endpoint que usa la tabla prueba de paso que el resumen
 * `trozasCount`/`trozasM3` que devuelve el listado es el correcto.
 *
 * Sólo LEE. Dice qué está mal y por qué camino se arregla; no toca nada.
 *
 *   node scripts/forestal-barrido-descuadre.mjs [tenantSlug]
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const TENANT = process.argv[2] ?? "main";
const USER = process.env.QA_USER ?? "qaadmin";
const PASS = process.env.QA_PASS ?? "Qa-admin-1234";

/** El redondeo de SERFOR (4 decimales), igual que `lib/forestal/cuadre-trozas.ts`. */
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
