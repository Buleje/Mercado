#!/usr/bin/env node
/**
 * Crea el catálogo de «Buleje Beauty» en el negocio de PRUEBA por el MISMO
 * camino que el panel: login de QA → POST /api/v1/products (y PUT
 * /api/products/<id> para bajar el precio de los que están en oferta, así el
 * «antes» queda en el historial de precios). Idempotente: salta lo que ya
 * existe con el mismo nombre. No toca los productos que ya tenía el negocio.
 *
 * Correr con el .env de la base (para leer qué existe):
 *   node -r dotenv/config scripts/demo-salon/sembrar.mjs dotenv_config_path=.env.local            # crea
 *   … sembrar.mjs dotenv_config_path=.env.local --seco      # sólo cuenta lo que haría
 *   … sembrar.mjs dotenv_config_path=.env.local --nombre "Buleje Beauty" --descripcion "…"   # + nombre y descripción
 *
 * Env: QA_BASE (http://localhost:3000), QA_TENANT (main), QA_USER, QA_PASS.
 */
import pg from "pg";
import { CATEGORIA_SERVICIOS, LINEAS, PRODUCTOS, SERVICIOS } from "./catalogo.mjs";

const BASE = process.env.QA_BASE ?? "http://localhost:3000";
const TENANT = process.env.QA_TENANT ?? "main";
const USUARIO = process.env.QA_USER ?? "qaadmin";
const CLAVE = process.env.QA_PASS ?? "Qa-admin-1234";
const SECO = process.argv.includes("--seco");

const jar = new Map();
function guardar(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [par] = c.split(";");
    const i = par.indexOf("=");
    jar.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
  }
}
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
async function pedir(ruta, opciones = {}) {
  for (;;) {
    const r = await pedirUnaVez(ruta, opciones);
    // La API limita la tanda (429 con `retryAfter`): se espera y se reintenta, como haría una persona.
    if (r.status !== 429) return r;
    const espera = Math.min(300, Number(r.json?.retryAfter) || 60);
    console.log(`límite de pedidos: espero ${espera} s…`);
    await new Promise((ok) => setTimeout(ok, espera * 1000 + 500));
  }
}
async function pedirUnaVez(ruta, { metodo = "GET", cuerpo } = {}) {
  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    redirect: "manual",
    headers: {
      cookie: cookie(),
      "x-tenant-id": TENANT,
      "x-csrf-token": jar.get("csrf-token") ?? "",
      ...(cuerpo ? { "content-type": "application/json" } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  guardar(res);
  const texto = await res.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* no es JSON */ }
  return { status: res.status, json, texto };
}

// La cookie csrf-token la siembra cualquier GET de /api (no /admin/login ni /t/<negocio>).
await pedir("/api/health");
if (!jar.get("csrf-token")) throw new Error("sin cookie csrf-token: ¿está el dev server en " + BASE + "?");
const login = await pedir("/api/auth/login", { metodo: "POST", cuerpo: { username: USUARIO, password: CLAVE, tenantSlug: TENANT } });
if (login.status !== 200) throw new Error(`login ${login.status}: ${login.texto.slice(0, 200)}`);

// Lo que YA existe se lee de la base (sólo lectura), no de la API: la lista de
// la API sale de una caché que tras un alta sigue entregando la versión vieja
// varias veces (01-10: dos lecturas seguidas dijeron 77 con 89 creados → 12
// duplicados, ya borrados por el panel). Escribir, sí, sólo por la API.
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query("BEGIN READ ONLY");
const { rows } = await db.query(
  `SELECT p.name FROM "Product" p JOIN "Tenant" t ON t.id = p."tenantId"
   WHERE (t.slug = $1 OR t.id = $1) AND p."deletedAt" IS NULL`,
  [TENANT],
);
await db.query("COMMIT");
await db.end();
const existentes = new Set(rows.map((r) => r.name));
console.log(`negocio ${TENANT}: ${existentes.size} productos antes`);

const hechos = { creados: 0, saltados: 0, rebajados: 0, nombre: null, errores: [] };

async function crear(datos, rebajarA) {
  if (existentes.has(datos.name)) { hechos.saltados++; return; }
  if (SECO) { hechos.creados++; if (rebajarA) hechos.rebajados++; return; }
  const r = await pedir("/api/v1/products", { metodo: "POST", cuerpo: datos });
  if (r.status !== 200 || !r.json?.id) { hechos.errores.push(`${datos.name}: ${r.status} ${r.texto.slice(0, 160)}`); return; }
  // Defensa: lo creado tiene que ser del negocio de prueba.
  if (r.json.tenantId !== TENANT) throw new Error(`¡${datos.name} cayó en ${r.json.tenantId}, no en ${TENANT}! Parado.`);
  hechos.creados++;
  if (rebajarA) {
    const u = await pedir(`/api/products/${r.json.id}`, { metodo: "PUT", cuerpo: { price: rebajarA } });
    if (u.status === 200) hechos.rebajados++;
    else hechos.errores.push(`${datos.name} (rebaja): ${u.status} ${u.texto.slice(0, 160)}`);
  }
}

for (const p of PRODUCTOS) {
  await crear(
    {
      name: p.nombre,
      category: p.categoria,
      price: p.antes ?? p.precio,
      image: `/demo/salon/${p.slug}.svg`,
      unit: "und",
      ...(p.badge ? { badge: p.badge } : {}),
      description: p.descripcion,
      stock: p.stock,
      stockMin: 3,
      brand: LINEAS[p.linea].nombre,
      type: "product",
    },
    p.antes ? p.precio : undefined,
  );
}
for (const s of SERVICIOS) {
  await crear({
    name: s.nombre,
    category: CATEGORIA_SERVICIOS,
    price: s.precio,
    image: `/demo/salon/${s.slug}.svg`,
    unit: "servicio",
    description: s.descripcion,
    type: "service",
    durationLabel: s.duracion,
    pricingUnit: "fijo",
    notes: "Se reserva por WhatsApp. Llega 10 minutos antes.",
  });
}

// `--nombre "Buleje Beauty"` y `--descripcion "…"`: nombre y descripción visibles de la
// tienda, por el mismo PUT de Mi Tienda (sólo esas claves: el servidor las mezcla con el resto).
const valorDe = (bandera) => {
  const i = process.argv.indexOf(bandera);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const tema = { ...(valorDe("--nombre") ? { storeName: valorDe("--nombre") } : {}), ...(valorDe("--descripcion") ? { description: valorDe("--descripcion") } : {}) };
if (Object.keys(tema).length && !SECO) {
  const r = await pedir("/api/settings", { metodo: "PUT", cuerpo: { storeTheme: tema } });
  if (r.status === 200) hechos.nombre = tema;
  else hechos.errores.push(`nombre/descripción: ${r.status} ${r.texto.slice(0, 160)}`);
}

console.log(JSON.stringify({ seco: SECO, ...hechos }, null, 1));
process.exit(hechos.errores.length ? 1 : 0);
